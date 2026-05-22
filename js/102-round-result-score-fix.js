(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();
  let unsub = null;
  let watchedRoomId = "";
  let latestRoom = null;

  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const roomRef = roomId => db.collection("events").doc("dalmuti").collection("rooms").doc(roomId);
  const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function cleanMap(obj) {
    return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value && typeof value === "object"));
  }

  function playersList(room) {
    return Object.values(cleanMap(room?.players))
      .filter(player => player && player.uid && !player.removedFromRoom)
      .slice()
      .sort((a, b) =>
        Number(a.lastRoundRank || a.finishedRank || 999) - Number(b.lastRoundRank || b.finishedRank || 999) ||
        Number(a.seatOrder ?? 999) - Number(b.seatOrder ?? 999) ||
        String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko")
      );
  }

  function ensureModal() {
    let modal = document.getElementById("roundScoreFixModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "roundScoreFixModal";
    modal.className = "game-modal round-score-fix-modal";
    modal.innerHTML = `<div class="modal-card round-score-fix-card"></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function resultRows(room, finalMode = false) {
    const standings = finalMode && room.finalGameResult?.standings?.length
      ? room.finalGameResult.standings.map(item => ({
          ...item,
          role: cleanMap(room.players)[item.uid]?.role || "-",
          lastRoundScore: cleanMap(room.players)[item.uid]?.lastRoundScore || 0,
          lastRoundRank: item.lastRoundRank || cleanMap(room.players)[item.uid]?.lastRoundRank || item.rank
        }))
      : playersList(room);

    const sorted = standings.slice().sort((a, b) => {
      if (finalMode) return Number(a.rank || 999) - Number(b.rank || 999);
      return Number(a.lastRoundRank || a.finishedRank || 999) - Number(b.lastRoundRank || b.finishedRank || 999);
    });

    return `
      <div class="modal-table round-score-table">
        <div class="modal-row header">
          <span>순위</span>
          <span>닉네임</span>
          <span>획득</span>
          <span>누적</span>
          <span>계급</span>
        </div>
        ${sorted.map((player, index) => {
          const rank = finalMode ? Number(player.rank || index + 1) : Number(player.lastRoundRank || player.finishedRank || index + 1);
          const gained = Number(player.lastRoundScore || 0);
          const total = Number(player.score || 0);
          return `
            <div class="modal-row">
              <span>${rank}등</span>
              <span>${esc(player.nickname || "-")}</span>
              <strong>${finalMode ? "-" : `+${gained}`}</strong>
              <strong>${total}</strong>
              <span>${esc(player.role || "-")}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function showScoreModal(room, finalMode = false) {
    if (!room) return;

    const modal = ensureModal();
    const card = modal.querySelector(".round-score-fix-card");
    const title = finalMode
      ? "최종 결과"
      : `${Number(room.lastRoundResult?.round || room.round || 0)}라운드 결과`;

    card.innerHTML = `
      <div class="modal-head"><h2>${title}</h2></div>
      ${resultRows(room, finalMode)}
      <div class="modal-actions">
        <button class="btn primary" type="button" id="roundScoreFixCloseBtn">확인</button>
      </div>
    `;

    modal.classList.add("show");
    const closeBtn = document.getElementById("roundScoreFixCloseBtn");
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove("show");
  }

  function markKey(key) {
    if (!key) return true;
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
    return false;
  }

  function maybeShowFinal(roomId, room) {
    if (!room?.finalGameResult) return;
    const endedAt = room.finalGameResult.endedAt?.seconds || room.finalGameResult.endedAt || room.updatedAt?.seconds || "x";
    const key = `dalmuti:${roomId}:scorefix:final:${room.finalGameResult.round || room.lastRoundResult?.round || 0}:${endedAt}`;
    if (markKey(key)) return;

    setTimeout(() => showScoreModal(room, true), 450);
  }

  function enhanceExistingRoundModal(room) {
    const card = document.getElementById("gameModalCard");
    const modal = document.getElementById("gameModal");
    if (!card || !modal?.classList.contains("show")) return;
    if (!/라운드 결과|처리 결과/.test(card.textContent || "")) return;
    if (card.querySelector(".round-score-table")) return;

    const table = card.querySelector(".modal-table");
    if (!table) return;
    table.outerHTML = resultRows(room, false);
  }

  function handleRoom(roomId, room) {
    latestRoom = room;

    if (room?.lastRoundResult && ["betweenRounds", "finished", "waiting"].includes(room.status)) {
      setTimeout(() => enhanceExistingRoundModal(room), 300);
      setTimeout(() => enhanceExistingRoundModal(room), 900);
    }

    maybeShowFinal(roomId, room);
  }

  function watchRoom() {
    const roomId = currentRoomId();
    if (roomId === watchedRoomId) return;

    if (unsub) unsub();
    unsub = null;
    watchedRoomId = roomId;
    latestRoom = null;

    if (!roomId) return;

    unsub = roomRef(roomId).onSnapshot(snapshot => {
      if (!snapshot.exists) return;
      handleRoom(roomId, snapshot.data());
    }, console.error);
  }

  const style = document.createElement("style");
  style.textContent = `
    .round-score-fix-card .modal-row{
      grid-template-columns:.7fr 1.4fr .8fr .8fr 1fr;
    }
    @media(max-width:880px){
      .round-score-fix-card{
        width:min(94vw,520px)!important;
        max-height:82vh!important;
        overflow:auto!important;
      }
      .round-score-fix-card .modal-row{
        grid-template-columns:.6fr 1.2fr .7fr .7fr .9fr;
        font-size:12px;
        gap:4px;
      }
    }
  `;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", () => {
    watchRoom();
    setInterval(() => {
      watchRoom();
      if (latestRoom) enhanceExistingRoundModal(latestRoom);
    }, 700);
  });
})();
