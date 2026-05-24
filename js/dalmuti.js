(() => {
  "use strict";

  function addStyle(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  addStyle("dalmutiChatUiCss", `
    @media (min-width: 881px) {
      .room-shell { grid-template-columns: minmax(0, 1fr) 380px !important; }
      .side-panel { width: 380px !important; max-width: 380px !important; }
      #tributePanel { right: 406px !important; }
    }
    .chat-list { display: flex !important; flex-direction: column !important; gap: 4px !important; padding: 6px 4px !important; }
    .chat-msg { display: block !important; width: 100% !important; padding: 3px 2px !important; border-radius: 0 !important; background: transparent !important; border: 0 !important; color: #e7ecf6 !important; font-size: 13px !important; line-height: 1.45 !important; word-break: break-word !important; box-sizing: border-box !important; }
    .chat-msg .chat-name { display: inline-block !important; max-width: 150px !important; margin: 0 6px 0 0 !important; padding: 0 !important; border-radius: 0 !important; background: transparent !important; border: 0 !important; color: #f3d281 !important; font-weight: 900 !important; font-size: 12px !important; line-height: inherit !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; vertical-align: bottom !important; }
    .chat-msg .chat-name::before { content: "["; color: #8f98aa; font-weight: 700; }
    .chat-msg .chat-name::after { content: "]"; color: #8f98aa; font-weight: 700; }
    .chat-msg.system { text-align: center !important; color: #aeb8c9 !important; background: transparent !important; border: 0 !important; font-size: 12px !important; font-weight: 800 !important; opacity: .9 !important; }
    .chat-msg.system::before, .chat-msg.system::after { content: "─"; margin: 0 6px; color: #566174; font-weight: 400; }
    .chat-input-row { gap: 7px !important; }
    .chat-input-row .input { min-width: 0 !important; }
  `);

  addStyle("dalmutiReadyBorderCss", `
    .player-box.ready { border-color: #6fb3ff !important; box-shadow: 0 0 0 2px rgba(111, 179, 255, .55), 0 12px 24px rgba(0, 0, 0, .28) !important; }
    .player-box.ready .badge.ready { background: rgba(111, 179, 255, .16) !important; border: 1px solid rgba(111, 179, 255, .75) !important; color: #9fcaff !important; }
  `);

  const scripts = [
    "./js/00-config.js?v=20260524-dalmuti2",
    "./js/95-detach-branding.js?v=20260518-detach1",
    "./js/92-presence-messages.js?v=20260518-presence1",
    "./js/88-pass-count-fix.js?v=20260518-passcount1",
    "./js/83-nickname-change.js?v=20260518-nick1",
    "./js/97-sfx.js?v=20260517-sfx2",
    "./js/96-shared-action-sfx.js?v=20260517-sharedaction1",
    "./js/98-hard-remove.js?v=20260517-hardremove1",
    "./js/99-waiting-spectator-passfix.js?v=20260517-watchpass1"
  ];

  document.write(
    scripts
      .map(src => `<script src="${src}"><\/script>`)
      .join("\n")
  );
})();
