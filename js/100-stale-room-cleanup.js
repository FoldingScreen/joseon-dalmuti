(() => {
  "use strict";

  function loadCss(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    document.body.appendChild(script);
  }

  loadCss("mobileTouchFixCss", "./mobile-touch-fix.css?v=20260522-touch1");
  loadScript("staleRoomCleanupCore", "./js/100-stale-room-cleanup-core.js?v=20260522-stale-room-core1");
  loadScript("jokerSelectionFix", "./js/101-joker-selection-fix.js?v=20260522-joker1");
  loadScript("directResultModalFix", "./js/103-result-modal-direct-fix.js?v=20260523-result1");
  loadScript("leaveOverlayFix", "./js/104-leave-overlay-fix.js?v=20260523-chat-time1");
})();
