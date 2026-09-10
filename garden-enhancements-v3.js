/* Garden AI — v3 compatibility shim (thin loader, no logic).
 * The toolkit now lives in garden-enhancements.js. This file exists because
 * sw.js precaches ./garden-enhancements-v3.js and injects it into served
 * pages; it simply ensures the consolidated module is loaded exactly once.
 */
(function () {
'use strict';
if (window.__gxLoaded) return;
if (document.querySelector('script[src*="garden-enhancements.js"]')) return;
var s = document.createElement('script');
s.src = './garden-enhancements.js';
s.defer = true;
document.head.appendChild(s);
})();
