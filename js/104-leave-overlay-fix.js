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

  function esc(value) {
    return String(value ?? "").replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  }

  function toMillis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
  }

  function chatTime(value) {
    const ms = toMillis(value);
    if (!ms) return "--:--";
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function renderChatWithTime(room) {
    const chatList = document.getElementById("chatList");
    if (!chatList || !room) return;

    const list = (room.chatPreview || []).slice(-80);
    chatList.innerHTML = list.length ? list.map(msg => {
      const t = `<span class="chat-time">${chatTime(msg.createdAt)}</span>`;
      if (msg.type === "system") return `<div class="chat-msg system">${t} ${esc(msg.text || "")}</div>`;
      return `<div class="chat-msg">${t} <span class="chat-name">${esc(msg.nickname || "-")}</span> ${esc(msg.text || "")}</div>`;
    }).join("") : `<div class="muted">채팅이 없습니다.</div>`;

    chatList.scrollTop = chatList.scrollHeight;
  }

  let chatRoomId = "";
  let chatUnsub = null;

  function watchChatRoom() {
    if (!window.firebase || !firebase.apps.length) return;
    const roomId = String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
    if (roomId === chatRoomId) return;

    if (chatUnsub) chatUnsub();
    chatUnsub = null;
    chatRoomId = roomId;
    if (!roomId) return;

    const db = firebase.firestore();
    chatUnsub = db.collection("events").doc("dalmuti").collection("rooms").doc(roomId).onSnapshot(snap => {
      if (!snap.exists) return;
      setTimeout(() => renderChatWithTime(snap.data()), 0);
      setTimeout(() => renderChatWithTime(snap.data()), 250);
    }, console.error);
  }

  function installChatTimeStyle() {
    if (document.getElementById("chatTimestampFixStyle")) return;
    const style = document.createElement("style");
    style.id = "chatTimestampFixStyle";
    style.textContent = `.chat-time{display:inline-block;margin-right:5px;font-size:11px;font-weight:700;opacity:.58;white-space:nowrap}.chat-msg.system .chat-time{opacity:.5}@media(max-width:880px){.chat-time{font-size:10px;margin-right:4px}}`;
    document.head.appendChild(style);
  }

  window.DalmutiCloseAllOverlays = closeAllOverlays;

  function init() {
    installChatTimeStyle();
    patchLeaveButtons();
    watchChatRoom();
    setInterval(() => {
      patchLeaveButtons();
      watchRoomExit();
      watchChatRoom();
    }, 500);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
