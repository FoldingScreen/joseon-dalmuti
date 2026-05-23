(() => {
  "use strict";

  function closeAllOverlays() {
    document.getElementById("gameModal")?.classList.remove("show");
    document.getElementById("rebellionModal")?.classList.remove("show");
    document.getElementById("createRoomModal")?.classList.remove("show");
    document.getElementById("directResultModal")?.classList.remove("show");
    document.getElementById("roundScoreFixModal")?.classList.remove("show");

    document.body.classList.remove(
      "mobile-menu-open",
      "mobile-chat-open"
    );
  }

  function patchLeaveButtons() {
    ["leaveRoomBtn", "mobileLeaveRoomBtn"].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.leaveOverlayFix === "1") return;

      btn.dataset.leaveOverlayFix = "1";
      btn.addEventListener("click", () => {
        closeAllOverlays();
      }, true);
    });
  }

  function watchRoomExit() {
    const hasRoom = !!String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
    const roomViewOpen = document.getElementById("roomView")?.classList.contains("show");
    const lobbyViewOpen = document.getElementById("lobbyView")?.classList.contains("show");

    if (!hasRoom && lobbyViewOpen && !roomViewOpen) {
      closeAllOverlays();
    }
  }

  window.DalmutiCloseAllOverlays = closeAllOverlays;

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      patchLeaveButtons();
      setInterval(() => {
        patchLeaveButtons();
        watchRoomExit();
      }, 500);
    }, { once: true });
  } else {
    patchLeaveButtons();
    setInterval(() => {
      patchLeaveButtons();
      watchRoomExit();
    }, 500);
  }
})();
