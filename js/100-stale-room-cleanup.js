(() => {
  "use strict";

  if (window.__dalmutiSafeEnhancementLoaded) return;
  window.__dalmutiSafeEnhancementLoaded = true;

  function installStyle() {
    if (document.getElementById("dalmutiSafeEnhancementStyle")) return;
    const style = document.createElement("style");
    style.id = "dalmutiSafeEnhancementStyle";
    style.textContent = "@media(max-width:880px){body:has(#roomView.show) .action-row{position:relative!important;z-index:240!important}body:has(#roomView.show) .mobile-chat-btn{right:14px!important;bottom:58px!important;z-index:225!important}body:has(#roomView.show) .mobile-auto-btn{right:18px!important;bottom:112px!important;z-index:225!important}body.mobile-chat-open:has(#roomView.show) .mobile-chat-btn,body.mobile-chat-open:has(#roomView.show) .mobile-auto-btn{display:none!important}}";
    document.head.appendChild(style);
  }

  function closeRoomOverlays() {
    document.getElementById("gameModal")?.classList.remove("show");
    document.getElementById("rebellionModal")?.classList.remove("show");
    document.getElementById("directResultModal")?.classList.remove("show");
    document.body.classList.remove("mobile-menu-open", "mobile-chat-open");
  }

  function closeAllOverlays() {
    closeRoomOverlays();
    document.getElementById("createRoomModal")?.classList.remove("show");
  }

  function patchLeaveButtons() {
    ["leaveRoomBtn", "mobileLeaveRoomBtn"].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.safeLeaveFix === "1") return;
      btn.dataset.safeLeaveFix = "1";
      btn.addEventListener("click", closeAllOverlays, true);
    });
  }

  function init() {
    installStyle();
    patchLeaveButtons();
    setInterval(patchLeaveButtons, 1000);
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
