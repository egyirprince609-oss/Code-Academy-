/* Code Academy — early viewport measurement for games. Loaded in <head>. */
(function () {
  'use strict';
  const root = document.documentElement;
  let frame = 0;
  function measureViewport() {
    const vv = window.visualViewport;
    const width = Math.max(280, Math.round(vv && vv.width ? vv.width : window.innerWidth || 360));
    const height = Math.max(320, Math.round(vv && vv.height ? vv.height : window.innerHeight || 640));
    const device = width < 480 ? 'phone' : width < 900 ? 'tablet' : width < 1500 ? 'desktop' : 'wide';
    root.style.setProperty('--ca-viewport-width', width + 'px');
    root.style.setProperty('--ca-viewport-height', height + 'px');
    root.style.setProperty('--ca-ui-scale', width < 360 ? '0.92' : width < 480 ? '0.97' : width < 900 ? '1' : '1');
    root.dataset.deviceClass = device;
    root.classList.add('ca-viewport-ready');
  }
  function scheduleMeasure() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(function () { frame = 0; measureViewport(); });
  }
  measureViewport();
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  window.addEventListener('orientationchange', measureViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleMeasure, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleMeasure, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', measureViewport, { once: true });
  }
})();
