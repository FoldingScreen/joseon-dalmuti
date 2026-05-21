(() => {
  "use strict";

  const CHAT_LIMIT = 12;
  const EVENT_ID = "dalmuti";

  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const roomCol = () => db.collection("events").doc(EVENT_ID).collection("rooms");
  const myName = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();

  function seenRecently(key, ms = 2500) {
    const now = Date.now();
    const old = Number(sessionStorage.getItem(key) || 0);
    if (old && now - old < ms) return true;
    sessionStorage.setItem(key, String(now));
    return false;
  }

  async function appendSystem(roomId, text, dedupeKey) {
    if (!roomId || !text) return;
    if (dedupeKey && seenRecently(dedupeKey)) return;

    const ref = roomCol().doc(roomId);
    const snap = await ref.get().catch(() => null);
    if (!snap?.exists) return;

    const room = snap.data() || {};
    if (room.closed || room.status === "closed") return;

    const chat = Array.isArray(room.chatPreview) ? room.chatPreview.slice(-CHAT_LIMIT + 1) : [];
    const last = chat[chat.length - 1];
    if (last?.type === "system" && last?.text === text && Date.now() - Number(last.createdAt || 0) < 3000) return;

    chat.push({
      type: "system",
      uid: "system",
      nickname: "",
      text,
      createdAt: Date.now()
    });

    await ref.set({ chatPreview: chat, updatedAt: FV.serverTimestamp() }, { merge: true }).catch(() => null);
  }

  async function announceJoin(roomId) {
    const name = myName();
    if (!roomId || !name) return;

    const snap = await roomCol().doc(roomId).get().catch(() => null);
    if (!snap?.exists) return;

    const room = snap.data() || {};
    const players = room.players || {};
    const spectators = room.spectators || {};

    let text = "";
    if (players[name]) text = `${name}님이 입장했습니다.`;
    else if (spectators[name]) text = `${name}님이 관전자로 입장했습니다.`;
    else return;

    await appendSystem(roomId, text, `join:${roomId}:${name}`);
  }

  function patchJoinRoom() {
    if (!window.Dalmuti?.joinRoom || window.Dalmuti.__presenceJoinPatched) return false;

    const original = window.Dalmuti.joinRoom;
    window.Dalmuti.joinRoom = async function patchedJoinRoom(roomId) {
      const result = await original.apply(this, arguments);
      setTimeout(() => announceJoin(roomId), 450);
      return result;
    };

    window.Dalmuti.__presenceJoinPatched = true;
    return true;
  }

  function patchBecomePlayer() {
    if (!window.Dalmuti?.becomePlayer || window.Dalmuti.__presenceBecomePlayerPatched) return false;

    const original = window.Dalmuti.becomePlayer;
    window.Dalmuti.becomePlayer = async function patchedBecomePlayer() {
      const roomId = currentRoomId();
      const name = myName();
      const result = await original.apply(this, arguments);
      if (roomId && name) setTimeout(() => appendSystem(roomId, `${name}님이 참가자로 전환했습니다.`, `player:${roomId}:${name}`), 350);
      return result;
    };

    window.Dalmuti.__presenceBecomePlayerPatched = true;
    return true;
  }

  function bindButtons() {
    if (document.__dalmutiPresenceButtonsBound) return;
    document.__dalmutiPresenceButtonsBound = true;

    document.addEventListener("click", event => {
      const watchBtn = event.target.closest?.("#watchBtn");
      if (watchBtn) {
        const roomId = currentRoomId();
        const name = myName();
        if (roomId && name) {
          setTimeout(() => appendSystem(roomId, `${name}님이 관전자로 전환했습니다.`, `spectator:${roomId}:${name}`), 350);
        }
        return;
      }

      const leaveBtn = event.target.closest?.("#leaveRoomBtn");
      if (leaveBtn) {
        const roomId = currentRoomId();
        const name = myName();
        if (roomId && name) {
          appendSystem(roomId, `${name}님이 나갔습니다.`, `leave:${roomId}:${name}`);
        }
      }
    }, true);
  }

  function tryPatch() {
    patchJoinRoom();
    patchBecomePlayer();
    bindButtons();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", tryPatch);
  } else {
    tryPatch();
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    tryPatch();
    if (tries > 30 || (window.Dalmuti?.__presenceJoinPatched && window.Dalmuti?.__presenceBecomePlayerPatched)) {
      clearInterval(timer);
    }
  }, 200);
})();
