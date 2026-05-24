(() => {
  "use strict";

  const scripts = [
    "./js/00-config.js?v=20260524-dalmuti1",
    "./js/95-detach-branding.js?v=20260518-detach1",
    "./js/93-chat-ui.js?v=20260518-chatui1",
    "./js/92-presence-messages.js?v=20260518-presence1",
    "./js/89-ready-border.js?v=20260518-ready1",
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
