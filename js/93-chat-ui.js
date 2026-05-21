(() => {
  "use strict";

  if (document.getElementById("dalmutiChatUiCss")) return;

  const style = document.createElement("style");
  style.id = "dalmutiChatUiCss";
  style.textContent = `
    @media (min-width: 881px) {
      .room-shell {
        grid-template-columns: minmax(0, 1fr) 380px !important;
      }

      .side-panel {
        width: 380px !important;
        max-width: 380px !important;
      }

      #tributePanel {
        right: 406px !important;
      }
    }

    .chat-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      padding: 6px 4px !important;
    }

    .chat-msg {
      display: block !important;
      width: 100% !important;
      padding: 3px 2px !important;
      border-radius: 0 !important;
      background: transparent !important;
      border: 0 !important;
      color: #e7ecf6 !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      word-break: break-word !important;
      box-sizing: border-box !important;
    }

    .chat-msg .chat-name {
      display: inline-block !important;
      max-width: 150px !important;
      margin: 0 6px 0 0 !important;
      padding: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      border: 0 !important;
      color: #f3d281 !important;
      font-weight: 900 !important;
      font-size: 12px !important;
      line-height: inherit !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      vertical-align: bottom !important;
    }

    .chat-msg .chat-name::before {
      content: "[";
      color: #8f98aa;
      font-weight: 700;
    }

    .chat-msg .chat-name::after {
      content: "]";
      color: #8f98aa;
      font-weight: 700;
    }

    .chat-msg.system {
      text-align: center !important;
      color: #aeb8c9 !important;
      background: transparent !important;
      border: 0 !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      opacity: .9 !important;
    }

    .chat-msg.system::before,
    .chat-msg.system::after {
      content: "─";
      margin: 0 6px;
      color: #566174;
      font-weight: 400;
    }

    .chat-input-row {
      gap: 7px !important;
    }

    .chat-input-row .input {
      min-width: 0 !important;
    }
  `;
  document.head.appendChild(style);
})();
