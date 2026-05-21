(() => {
  "use strict";

  if (document.getElementById("dalmutiReadyBorderCss")) return;

  const style = document.createElement("style");
  style.id = "dalmutiReadyBorderCss";
  style.textContent = `
    .player-box.ready {
      border-color: #6fb3ff !important;
      box-shadow: 0 0 0 2px rgba(111, 179, 255, .55), 0 12px 24px rgba(0, 0, 0, .28) !important;
    }

    .player-box.ready .badge.ready {
      background: rgba(111, 179, 255, .16) !important;
      border: 1px solid rgba(111, 179, 255, .75) !important;
      color: #9fcaff !important;
    }
  `;
  document.head.appendChild(style);
})();
