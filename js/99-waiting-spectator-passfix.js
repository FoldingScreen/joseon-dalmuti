(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) return;

  const style = document.createElement("style");
  style.textContent = `
    .watch-force-btn {
      position: absolute;
      right: 5px;
      top: 28px;
      border: 0;
      border-radius: 999px;
      background: rgba(45, 62, 98, .96);
      color: #fff;
      font-size: 10px;
      font-weight: 900;
      padding: 3px 6px;
      cursor: pointer;
      z-index: 3;
    }
  `;
  document.head.appendChild(style);

  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const roomCol = () => db.collection("events").doc("dalmuti").collection("rooms");
  const cleanMap = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && typeof v === "object"));
  const countMap = obj => Object.values(cleanMap(obj)).length;
  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const serverNow = () => FV.serverTimestamp();

  function roomRef(roomId) {
    return roomCol().doc(roomId);
  }

  function handRef(roomId, uid) {
    return roomRef(roomId).collection("hands").doc(uid);
  }

  async function forceSpectator(uid) {
    const roomId = currentRoomId();
    const me = currentUser();
    if (!roomId || !uid || uid === me) return;

    const ref = roomRef(roomId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const room = snap.data();
    if (!(room.hostUid === me || me === "병풍")) {
      alert("방장만 관전시킬 수 있습니다.");
      return;
    }

    if (room.status !== "waiting") {
      alert("대기 중에만 관전시킬 수 있습니다.");
      return;
    }

    const players = cleanMap(room.players);
    const spectators = cleanMap(room.spectators);
    const target = players[uid];
    if (!target) return alert("참가자 목록에 없는 대상입니다.");

    if (!confirm(`${target.nickname || uid}님을 관전자로 전환할까요?`)) return;

    delete players[uid];
    spectators[uid] = {
      uid,
      nickname: target.nickname || uid,
      type: "spectator",
      isAI: !!target.isAI,
      removedFromRoom: false
    };

    const chatPreview = (room.chatPreview || []).slice(-11);
    chatPreview.push({
      type: "system",
      uid: "system",
      nickname: "",
      text: `${target.nickname || uid}님이 관전자로 전환되었습니다.`,
      createdAt: Date.now()
    });

    const batch = db.batch();
    batch.update(ref, {
      players,
      spectators,
      playerCount: countMap(players),
      spectatorCount: countMap(spectators),
      chatPreview,
      updatedAt: serverNow()
    });
    batch.delete(handRef(roomId, uid));
    await batch.commit();
  }

  function patchDalmuti() {
    if (!window.Dalmuti) return;
    window.Dalmuti.forceSpectator = forceSpectator;
  }

  function addForceSpectatorButtons() {
    patchDalmuti();
    const me = currentUser();
    document.querySelectorAll(".player-box").forEach(box => {
      if (box.querySelector(".watch-force-btn")) return;
      const kick = box.querySelector(".kick-btn");
      if (!kick) return;
      const match = String(kick.getAttribute("onclick") || "").match(/Dalmuti\.kick\('([^']+)'\)/);
      const uid = match?.[1];
      if (!uid || uid === me) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "watch-force-btn";
      btn.textContent = "관전";
      btn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        forceSpectator(uid).catch(console.error);
      };
      box.appendChild(btn);
    });
  }

  patchDalmuti();
  setTimeout(addForceSpectatorButtons, 300);

  const area = document.getElementById("playersArea") || document.body;
  const observer = new MutationObserver(() => addForceSpectatorButtons());
  observer.observe(area, { childList: true, subtree: true });
})();
