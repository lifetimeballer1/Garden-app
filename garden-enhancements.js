/* Garden AI — enhancements module (consolidated).
 * Single home for the Command Center: growth stages, fertilizer / soil /
 * pest / harvest logs, seed inventory, rain report, seasonal planner,
 * alerts, and backup export/import.
 * Supersedes garden-enhancements-v2.js and garden-enhancements-v3.js
 * (v3 remains only as a thin loader shim; v2 is deleted).
 * Safe to load twice: execution is idempotent via window.__gxLoaded.
 * Depends on index.html globals (S, save, render, open/close, toast,
 * plantScore, rainHistory) but degrades gracefully when any are missing.
 */
(function () {
'use strict';
if (window.__gxLoaded) return;
window.__gxLoaded = true;

/* ---------- storage (one key + migration from legacy keys) ---------- */
var STORE_KEY = 'garden-ai-enhancements-v1';
var LEGACY_KEYS = ['garden-ai-toolkit-v3', 'garden-ai-toolkit-v2'];

function baseState() {
  return { fertilizer: [], amendments: [], pests: [], harvest: [], seeds: [],
           reminders: [], photos: [], journal: [], plantsMeta: {} };
}
function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function arr(x) { return Array.isArray(x) ? x : []; }
/* Map a v2/v3 toolkit payload ({fertilizer,soil,pests,harvest,seeds,stages})
 * onto the consolidated schema. */
function fromLegacy(g) {
  var b = baseState();
  if (!isObj(g)) return b;
  b.fertilizer = arr(g.fertilizer);
  b.amendments = arr(g.amendments).concat(arr(g.soil));
  b.pests = arr(g.pests);
  b.harvest = arr(g.harvest);
  b.seeds = arr(g.seeds).map(function (s) {
    if (!isObj(s)) return s;
    if (s.note != null && s.notes == null) s.notes = s.note;
    return s;
  });
  var stages = isObj(g.stages) ? g.stages : (isObj(g.plantsMeta) ? g.plantsMeta : {});
  Object.keys(stages).forEach(function (id) {
    if (isObj(stages[id])) b.plantsMeta[id] = stages[id];
  });
  return b;
}
function isEmptyState(st) {
  if (!isObj(st)) return true;
  var keys = ['fertilizer', 'amendments', 'pests', 'harvest', 'seeds', 'reminders', 'photos', 'journal'];
  for (var i = 0; i < keys.length; i++) if (arr(st[keys[i]]).length) return false;
  return Object.keys(isObj(st.plantsMeta) ? st.plantsMeta : {}).length === 0;
}
function hasLegacyData(g) {
  return isObj(g) && (arr(g.harvest).length || arr(g.seeds).length ||
    arr(g.fertilizer).length || arr(g.pests).length || arr(g.soil).length ||
    arr(g.amendments).length || Object.keys(isObj(g.stages) ? g.stages : {}).length);
}
function adoptLegacy() {
  for (var i = 0; i < LEGACY_KEYS.length; i++) {
    try {
      var lg = JSON.parse(localStorage.getItem(LEGACY_KEYS[i]) || 'null');
      if (hasLegacyData(lg)) return fromLegacy(lg);
    } catch (e) { /* ignore corrupt legacy payloads */ }
  }
  return null;
}
function loadX() {
  var st = baseState();
  try {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw) {
      var parsed = JSON.parse(raw);
      if (isObj(parsed)) {
        Object.keys(st).forEach(function (k) {
          if (k === 'plantsMeta') {
            if (isObj(parsed[k])) st[k] = parsed[k];
          } else if (k in parsed) {
            st[k] = arr(parsed[k]);
          }
        });
      }
    }
    /* Adopt legacy v2/v3 payloads when consolidated state is empty. */
    if (isEmptyState(st)) {
      var mig = adoptLegacy();
      if (mig) st = mig;
      X = st;
      saveX();
    }
  } catch (e) { st = baseState(); }
  return st;
}
var X = loadX();
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(X)); } catch (e) { /* private mode / quota */ }
}
function saveX() {
  persist();
  LEGACY_KEYS.forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) { /* keep going */ }
  });
}

/* ---------- helpers ---------- */
function num(x, fb) {
  var n = Number(x);
  return Number.isFinite(n) ? n : (fb === undefined ? 0 : fb);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c;
  });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function S() { return (typeof window.S !== 'undefined' && isObj(window.S)) ? window.S : null; }
function plants() {
  var s = S();
  return s && Array.isArray(s.plants) ? s.plants : [];
}
function modal(html) {
  var m = document.getElementById('modal'), sh = document.getElementById('sheet');
  if (m && sh) { sh.innerHTML = html; m.classList.add('open'); }
}
function toastMsg(x) {
  if (typeof window.toast === 'function') window.toast(x);
}
function rerender() {
  if (typeof window.render === 'function') { try { window.render(); } catch (e) { /* host render failed */ } }
}
function saveHost() {
  if (typeof window.save === 'function') { try { window.save(); } catch (e) { /* ignore */ } }
}
function forecastRainIn() {
  if (typeof window.forecastRain === 'function') {
    try { return num(window.forecastRain(), 0); } catch (e) { return 0; }
  }
  try {
    var s = S();
    var r = s && s.weather && s.weather.daily && Array.isArray(s.weather.daily.rain)
      ? s.weather.daily.rain.slice(0, 7) : [];
    return r.reduce(function (a, x) { return a + num(x, 0); }, 0);
  } catch (e) { return 0; }
}
function plantScoreIn(p) {
  if (typeof window.plantScore === 'function') {
    try { return num(window.plantScore(p), 50); } catch (e) { return 50; }
  }
  return 50;
}

/* ---------- garden health (hardened) ---------- */
function health() {
  try {
    var ps = plants();
    if (!ps.length) return 0;
    var moisture = ps.reduce(function (a, p) {
      var m = num(p && p.moisture, 50);
      return a + (m >= 40 && m <= 80 ? 100 : m < 25 ? 20 : 65);
    }, 0) / ps.length;
    var waterQ = ps.reduce(function (a, p) {
      return a + Math.max(0, 100 - plantScoreIn(p));
    }, 0) / ps.length;
    var s = S() || {};
    var recent = Math.min(100,
      arr(s.rain).length * 6 + arr(s.water).length * 3 +
      arr(s.journal).length * 2 + X.harvest.length * 3 +
      X.pests.length * 2 + X.fertilizer.length * 2 + X.amendments.length * 2);
    return Math.max(0, Math.min(100, Math.round(moisture * 0.55 + waterQ * 0.25 + recent * 0.20)));
  } catch (e) { return 0; }
}

/* ---------- styles ---------- */
function addStyles() {
  if (document.getElementById('gxstyle')) return;
  var s = document.createElement('style');
  s.id = 'gxstyle';
  s.textContent = '.gxgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
    '.gxbtn{min-height:42px;padding:9px 11px;border:1px solid var(--line);background:var(--panel2);border-radius:11px;color:var(--text)}' +
    '.gxbtn.primary{background:#31552b;border-color:#527f48}' +
    '.gxstat{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:11px}' +
    '.gxstat b{display:block;font:700 21px Georgia,serif;margin-top:4px}' +
    '.gxlist>div{border-top:1px solid var(--line);padding:10px 0}' +
    '.gxlist>div:first-child{border-top:0}' +
    '.gxscore{font:700 28px Georgia,serif}' +
    '.gxwarn{color:var(--orange)}.gxgood{color:var(--green2)}.gxbad{color:var(--red)}';
  document.head.appendChild(s);
}

/* ---------- growth stages ---------- */
function stageOf(p) {
  return (X.plantsMeta[p.id] && X.plantsMeta[p.id].stage) || p.stage || 'Growing';
}
function plantTimeline() {
  var ps = plants();
  if (!ps.length) { modal('<h3>🌱 Growth & Care Timeline</h3><div class="empty">No crops tracked yet.</div><div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>'); return; }
  modal('<h3>🌱 Growth & Care Timeline</h3><p class="small">Track where each crop is and what should happen next. This is your season-long memory, not just today\'s checklist.</p><div class="gxlist">' +
    ps.map(function (p) {
      var m = X.plantsMeta[p.id] || {};
      return '<div><div class="row"><b>' + esc(p.emoji) + ' ' + esc(p.name) + '</b><span class="' +
        (num(p.moisture, 50) < 40 ? 'gxwarn' : 'gxgood') + '">' + num(p.moisture, 50) + '% moisture</span></div>' +
        '<div class="field"><label>Growth stage</label><select id="gxstage-' + esc(p.id) + '">' +
        ['Seedling', 'Transplant', 'Vegetative', 'Flowering', 'Fruit set', 'Harvest', 'Finished'].map(function (o) {
          return '<option' + (stageOf(p) === o ? ' selected' : '') + '>' + o + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Expected first harvest</label><input id="gxharv-' + esc(p.id) + '" type="date" value="' + esc(m.harvest || '') + '"></div>' +
        '<button class="gxbtn primary" onclick="gxSaveStage(\'' + esc(p.id) + '\')">Save ' + esc(p.name) + '</button></div>';
    }).join('') + '</div><div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxSaveStage = function (id) {
  var s = S();
  var p = plants().find(function (x) { return x.id === id; });
  if (!p) return;
  var stEl = document.getElementById('gxstage-' + id);
  var hvEl = document.getElementById('gxharv-' + id);
  X.plantsMeta[id] = Object.assign({}, X.plantsMeta[id],
    { stage: stEl ? stEl.value : 'Growing', harvest: hvEl ? hvEl.value : '' });
  p.stage = X.plantsMeta[id].stage;
  saveX(); saveHost();
  if (typeof window.close === 'function') window.close();
  toastMsg('Growth stage saved');
  rerender();
};

/* ---------- log forms (fertilizer / amendments / pests / harvest) ---------- */
var LOG_CFG = {
  fertilizer: ['🧪 Fertilizer', 'Product or material', 'Amount / strength', 'Why you applied it'],
  amendments: ['🌿 Soil Amendment', 'Material (compost, manure, coffee grounds, etc.)', 'Amount', 'Where / why'],
  pests: ['🐛 Pest & Disease Log', 'Pest or symptom', 'Severity (1–5)', 'What you did'],
  harvest: ['🧺 Harvest Log', 'Crop', 'Amount', 'Notes']
};
function logForm(kind) {
  var c = LOG_CFG[kind];
  if (!c) return;
  modal('<h3>' + c[0] + '</h3><div class="field"><label>' + esc(c[1]) + '</label><input id="gx1"></div>' +
    '<div class="field"><label>' + esc(c[2]) + '</label><input id="gx2"></div>' +
    '<div class="field"><label>' + esc(c[3]) + '</label><textarea id="gx3"></textarea></div>' +
    '<div class="field"><label>Date</label><input id="gxdate" type="date" value="' + todayStr() + '"></div>' +
    '<div class="actions"><button class="gxbtn primary" onclick="gxSaveLog(\'' + kind + '\')">Save</button>' +
    '<button class="gxbtn" onclick="close()">Cancel</button></div>');
}
window.gxSaveLog = function (kind) {
  if (!LOG_CFG[kind] || !Array.isArray(X[kind])) return;
  var a = document.getElementById('gx1'), b = document.getElementById('gx2'),
      c = document.getElementById('gx3'), d = document.getElementById('gxdate');
  var v = a ? a.value.trim() : '';
  if (!v) { toastMsg('Enter the main detail first'); return; }
  X[kind].push({ ts: Date.now(), date: d && d.value ? d.value : todayStr(),
    a: v.slice(0, 500), b: b ? b.value.slice(0, 500) : '', c: c ? c.value.slice(0, 2000) : '' });
  saveX();
  if (typeof window.close === 'function') window.close();
  toastMsg('Garden record saved');
  rerender();
};
function records(kind, title, emoji) {
  var list = arr(X[kind]).slice().sort(function (a, b) { return num(b && b.ts) - num(a && a.ts); });
  modal('<h3>' + emoji + ' ' + esc(title) + '</h3><div class="actions">' +
    '<button class="gxbtn primary" onclick="gxForm(\'' + kind + '\')">＋ Add record</button></div>' +
    '<div class="gxlist" style="margin-top:10px">' + (list.length ? list.map(function (x, i) {
      return '<div><div class="row"><b>' + esc(x.a) + '</b><span class="small">' + esc(x.date) + '</span></div>' +
        '<div class="small">' + esc(x.b || '') + (x.c ? ' · ' + esc(x.c) : '') + '</div>' +
        '<button class="gxbtn" style="margin-top:7px" onclick="gxDelete(\'' + kind + '\',' + i + ')">Delete</button></div>';
    }).join('') : '<div class="empty">No records yet.</div>') + '</div>' +
    '<div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxForm = function (k) {
  if (typeof window.close === 'function') window.close();
  setTimeout(function () { logForm(k); }, 0);
};
window.gxDelete = function (k, i) {
  if (!Array.isArray(X[k])) return;
  var sorted = X[k].slice().sort(function (a, b) { return num(b && b.ts) - num(a && a.ts); });
  var target = sorted[i];
  X[k] = X[k].filter(function (x) { return x !== target; });
  saveX();
  toastMsg('Record deleted');
  records(k, k, '📋');
};

/* ---------- seed inventory ---------- */
function seedInventory() {
  modal('<h3>🌰 Seed Inventory</h3><p class="small">Track what you have before buying more.</p>' +
    '<div class="actions"><button class="gxbtn primary" onclick="gxSeedAdd()">＋ Add seed</button></div>' +
    '<div class="gxlist">' + (X.seeds.length ? X.seeds.map(function (x, i) {
      return '<div><div class="row"><b>' + esc(x.name) + '</b><span>' + esc(x.qty || '') + '</span></div>' +
        '<div class="small">' + esc(x.year || '') + ' · ' + esc(x.notes || '') + '</div>' +
        '<button class="gxbtn" onclick="gxSeedDel(' + i + ')">Delete</button></div>';
    }).join('') : '<div class="empty">No seeds tracked.</div>') + '</div>' +
    '<div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxSeeds = seedInventory;
window.gxSeedAdd = function () {
  if (typeof window.close === 'function') window.close();
  setTimeout(function () {
    modal('<h3>Add seed</h3><div class="field"><label>Crop / variety</label><input id="sn"></div>' +
      '<div class="field"><label>Quantity</label><input id="sq"></div>' +
      '<div class="field"><label>Seed year</label><input id="sy" type="number" value="' + new Date().getFullYear() + '"></div>' +
      '<div class="field"><label>Notes</label><textarea id="sx"></textarea></div>' +
      '<div class="actions"><button class="gxbtn primary" onclick="gxSeedSave()">Save</button>' +
      '<button class="gxbtn" onclick="close()">Cancel</button></div>');
  }, 0);
};
window.gxSeedSave = function () {
  var nEl = document.getElementById('sn');
  var name = nEl ? nEl.value.trim() : '';
  if (!name) { toastMsg('Enter a crop or variety'); return; }
  var q = document.getElementById('sq'), y = document.getElementById('sy'), x = document.getElementById('sx');
  X.seeds.push({ name: name.slice(0, 200), qty: q ? q.value.slice(0, 100) : '',
    year: y ? y.value.slice(0, 10) : '', notes: x ? x.value.slice(0, 1000) : '' });
  saveX();
  if (typeof window.close === 'function') window.close();
  toastMsg('Seed added');
  rerender();
};
window.gxSeedDel = function (i) {
  X.seeds.splice(i, 1);
  saveX();
  seedInventory();
};

/* ---------- rain report / season / alerts ---------- */
function rainReport() {
  var s = S() || {};
  function tot(n) {
    var cut = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    return arr(s.rain).filter(function (x) { return x && x.date >= cut; })
      .reduce(function (a, x) { return a + num(x.amount, 0); }, 0);
  }
  modal('<h3>🌧️ Rain & Water Report</h3><div class="gxgrid">' +
    '<div class="gxstat"><span class="label">7-day logged</span><b class="blue">' + tot(7).toFixed(2) + '”</b></div>' +
    '<div class="gxstat"><span class="label">30-day logged</span><b class="blue">' + tot(30).toFixed(2) + '”</b></div>' +
    '<div class="gxstat"><span class="label">Waterings logged</span><b>' + arr(s.water).length + '</b></div>' +
    '<div class="gxstat"><span class="label">Forecast 7-day</span><b class="blue">' + forecastRainIn().toFixed(2) + '”</b></div></div>' +
    '<p class="small">Use this as a water-balance record. Forecast ET₀ is also available when weather data supplies it; ET₀ is a reference estimate, not a command to irrigate.</p>' +
    '<div class="actions"><button class="gxbtn primary" onclick="rainHistory()">Open rain history</button>' +
    '<button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxRain = rainReport;
function season() {
  var month = new Date().getMonth() + 1;
  var rows = [['Jan', 'Plan seeds, inspect tools, amend beds'],
    ['Feb', 'Start cool-season planning and seed inventory'],
    ['Mar', 'Warm-season bed prep; watch late cold'],
    ['Apr', 'Transplant warm crops as conditions allow'],
    ['May', 'Mulch, train vines, monitor pests'],
    ['Jun', 'Deep-water during dry spells; harvest often'],
    ['Jul', 'Heat management, mulch, pest scouting'],
    ['Aug', 'Fall crop planning and seed saving'],
    ['Sep', 'Fall planting and cleanup of finished crops'],
    ['Oct', 'Cool-season harvest and soil building'],
    ['Nov', 'Compost, cover crops, protect perennials'],
    ['Dec', 'Review journal and plan next season']];
  modal('<h3>📅 Seasonal Planner</h3><p class="small">General planning guide. Actual planting should follow local weather and soil conditions.</p><div class="gxlist">' +
    rows.map(function (x, i) {
      return '<div class="row"><b>' + x[0] + '</b><span class="small" style="max-width:78%;text-align:right">' + x[1] +
        ((i + 1 === month) ? ' · <b class="gold">THIS MONTH</b>' : '') + '</span></div>';
    }).join('') + '</div><div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxSeason = season;
function alerts() {
  var list = [];
  var s = S();
  var w = s && s.weather && s.weather.daily;
  if (w) {
    var hi = num(w.hi && w.hi[0], NaN);
    if (Number.isFinite(hi) && hi >= 95) list.push('🔥 Extreme heat: check moisture more often and protect plants from heat stress.');
    if (Number.isFinite(hi) && hi <= 35) list.push('🥶 Cold risk: protect sensitive warm-season crops if your local forecast warrants it.');
    if (forecastRainIn() >= 2) list.push('🌧️ Heavy rain potential: improve drainage and avoid adding irrigation before rain.');
  }
  plants().forEach(function (p) {
    var m = num(p.moisture, 50);
    if (m < 30) list.push('💧 ' + p.name + ' is very dry in the recorded soil estimate — verify the root zone.');
    if (m > 85) list.push('🌊 ' + p.name + ' is very wet in the recorded estimate — avoid adding water.');
  });
  modal('<h3>🚨 Garden Alerts</h3>' + (list.length
    ? list.map(function (x) { return '<div class="card">' + esc(x) + '</div>'; }).join('')
    : '<div class="empty">No major alerts from the data currently available.</div>') +
    '<div class="actions"><button class="gxbtn" onclick="close()">Close</button></div>');
}
window.gxAlerts = alerts;

/* ---------- dashboard ---------- */
function dashboard() {
  var h = health(), s = S() || {};
  modal('<h3>🧠 Garden Command Center</h3><div class="gxgrid">' +
    '<div class="gxstat"><span class="label">Garden health</span><b class="' +
    (h >= 75 ? 'gxgood' : h >= 50 ? 'gxwarn' : 'gxbad') + '">' + h + '/100</b></div>' +
    '<div class="gxstat"><span class="label">Crops</span><b>' + plants().length + '</b></div>' +
    '<div class="gxstat"><span class="label">Harvest records</span><b>' + X.harvest.length + '</b></div>' +
    '<div class="gxstat"><span class="label">Pest records</span><b>' + X.pests.length + '</b></div>' +
    '<div class="gxstat"><span class="label">Fertilizer records</span><b>' + X.fertilizer.length + '</b></div>' +
    '<div class="gxstat"><span class="label">Soil amendments</span><b>' + X.amendments.length + '</b></div></div>' +
    '<div class="section">Management</div><div class="actions">' +
    '<button class="gxbtn primary" onclick="plantTimeline()">🌱 Growth</button>' +
    '<button class="gxbtn" onclick="records(\'fertilizer\',\'Fertilizer Log\',\'🧪\')">🧪 Fertilizer</button>' +
    '<button class="gxbtn" onclick="records(\'amendments\',\'Soil Log\',\'🌿\')">🌿 Soil</button>' +
    '<button class="gxbtn" onclick="records(\'pests\',\'Pest & Disease\',\'🐛\')">🐛 Pests</button>' +
    '<button class="gxbtn" onclick="records(\'harvest\',\'Harvest\',\'🧺\')">🧺 Harvest</button>' +
    '<button class="gxbtn" onclick="gxSeeds()">🌰 Seeds</button>' +
    '<button class="gxbtn" onclick="gxRain()">🌧️ Rain</button>' +
    '<button class="gxbtn" onclick="gxSeason()">📅 Season</button>' +
    '<button class="gxbtn" onclick="gxAlerts()">🚨 Alerts</button></div>' +
    '<div class="section">Data</div><div class="actions">' +
    '<button class="gxbtn primary" onclick="gxExport()">⬇️ Export backup</button>' +
    '<button class="gxbtn" onclick="gxImport()">⬆️ Import backup</button></div>' +
    '<div class="actions" style="margin-top:12px"><button class="gxbtn" onclick="close()">Close</button></div>');
}

/* Export/import (records() intentionally global: dashboard buttons call it). */
window.records = records;
window.plantTimeline = plantTimeline;
window.gxCenter = dashboard;
window.dashboard = window.dashboard || dashboard;

window.gxExport = function () {
  try {
    var payload = { version: 4, exported: new Date().toISOString(), garden: S(), enhancements: X };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'garden-ai-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toastMsg('Backup exported');
  } catch (e) { toastMsg('Backup export failed'); }
};
window.gxImport = function () {
  var i = document.createElement('input');
  i.type = 'file';
  i.accept = 'application/json';
  i.onchange = function () {
    try {
      var f = i.files && i.files[0];
      if (!f) return;
      f.text().then(function (t) {
        try {
          var j = JSON.parse(t);
          if (isObj(j)) {
            if (isObj(j.enhancements) || isObj(j.toolkit)) {
              X = fromLegacy(j.enhancements || j.toolkit);
              var cur = loadX();
              Object.keys(X).forEach(function (k) { cur[k] = X[k]; });
              X = cur;
              saveX();
            }
            if (isObj(j.garden) && typeof window.deepMerge === 'function' && window.S) {
              window.S = window.deepMerge(window.S, j.garden);
              saveHost();
            }
            toastMsg('Backup imported');
            rerender();
          } else { toastMsg('Invalid backup file'); }
        } catch (e) { toastMsg('Invalid backup file'); }
      });
    } catch (e) { toastMsg('Invalid backup file'); }
  };
  i.click();
};

/* ---------- inject cards + wrap render ---------- */
function inject() {
  try {
    addStyles();
    var more = document.getElementById('more');
    if (more && !document.getElementById('gx-command')) {
      var box = document.createElement('div');
      box.id = 'gx-command';
      box.className = 'card';
      box.innerHTML = '<div class="label">Advanced garden tools</div>' +
        '<p class="small">Your garden is more than a watering timer. Track the whole season and keep a record of what actually happened.</p>' +
        '<div class="actions"><button class="gxbtn primary" onclick="gxCenter()">🧠 Command Center</button>' +
        '<button class="gxbtn" onclick="gxAlerts()">🚨 Alerts</button>' +
        '<button class="gxbtn" onclick="plantTimeline()">🌱 Growth</button>' +
        '<button class="gxbtn" onclick="gxRain()">🌧️ Rain report</button></div>';
      more.prepend(box);
    }
    var t = document.getElementById('today');
    if (t && !document.getElementById('gx-today')) {
      var b = document.createElement('div');
      b.id = 'gx-today';
      b.className = 'card';
      b.innerHTML = '<div class="row"><div><div class="label">Garden health</div>' +
        '<div class="gxscore" id="gx-health">' + health() + '/100</div>' +
        '<div class="small">Based on recorded plant moisture, care activity and garden records.</div></div>' +
        '<button class="gxbtn primary" onclick="gxCenter()">Open center</button></div>';
      t.insertBefore(b, t.children[1] || null);
    }
  } catch (e) { /* never break host render */ }
}

function wrapRender() {
  if (typeof window.render !== 'function' || window.__gxRenderWrapped) return;
  window.__gxRenderWrapped = true;
  var oldRender = window.render;
  window.render = function () {
    try { oldRender(); } catch (e) { /* host render threw; still inject */ }
    setTimeout(inject, 0);
  };
}

wrapRender();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { wrapRender(); setTimeout(inject, 50); });
} else {
  setTimeout(inject, 50);
}
window.addEventListener('load', function () { wrapRender(); setTimeout(inject, 50); });
setInterval(function () {
  try {
    var h = document.getElementById('gx-health');
    if (h) h.textContent = health() + '/100';
  } catch (e) { /* ignore */ }
}, 5000);
})();
