(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();
  const RESULT_LIMIT_MS = 25 * 1000;
  let unsub = null;
  let watchedRoomId = "";
  let pollTimer = null;

  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const roomRef = roomId => db.collection("events").doc("dalmuti").collection("rooms").doc(roomId);
  const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function cleanMap(obj) {
    return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value && typeof value === "object"));
  }

  function timeKey(value) {
    if (!value) return "x";
    if (typeof value === "number" || typeof value === "string") return String(value);
    if (typeof value.seconds === "number") return `${value.seconds}_${value.nanoseconds || 0}`;
    if (typeof value.toMillis === "function") return String(value.toMillis());
    return "x";
  }

  function isRecentlyEnded(value) {
    if (!value) return true;
    let ms = 0;
    if (typeof value === "number") ms = value;
    else if (typeof value === "string") ms = Date.parse(value) || 0;
    else if (typeof value.toMillis === "function") ms = value.toMillis();
    else if (typeof value.seconds === "number") ms = value.seconds * 1000;
    if (!ms) return true;
    return Date.now() - ms < RESULT_LIMIT_MS;
  }

  function resultSeenKey(roomId, type, round, endedAt) {
    return `dalmuti:${roomId}:directResult:${type}:${round}:${timeKey(endedAt)}`;
  }

  function hasSeen(key) {
    if (!key) return true;
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
    return false;
  }

  function playerMap(room) {
    return cleanMap(room?.players);
  }

  function roundPlayers(room) {
    return Object.values(playerMap(room))
      .filter(player => player && player.uid && !player.removedFromRoom)
      .slice()
      .sort((a, b) =>
        Number(a.lastRoundRank || a.finishedRank || 999) - Number(b.lastRoundRank || b.finishedRank || 999) ||
        Number(a.seatOrder ?? 999) - Number(b.seatOrder ?? 999) ||
        String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko")
      );
  }

  function finalPlayers(room) {
    const players = playerMap(room);
    const standings = room?.finalGameResult?.standings || [];
    if (standings.length) {
      return standings
        .map(item => ({
          ...item,
          role: players[item.uid]?.role || "-",
          lastRoundScore: players[item.uid]?.lastRoundScore || 0,
          lastRoundRank: item.lastRoundRank || players[item.uid]?.lastRoundRank || null
        }))
        .sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
    }

    return Object.values(players)
      .filter(player => player && player.uid && !player.removedFromRoom)
      .slice()
      .sort((a, b) =>
        Number(b.score || 0) - Number(a.score || 0) ||
        Number(a.lastRoundRank || 999) - Number(b.lastRoundRank || 999)
      )
      .map((player, index) => ({ ...player, rank: index + 1 }));
  }

  function ensureModal() {
    let modal = document.getElementById("directResultModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "directResultModal";
    modal.className = "game-modal direct-result-modal";
    modal.innerHTML = `<div id="directResultModalCard" class="modal-card direct-result-card"></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    document.getElementById("directResultModal")?.classList.remove("show");
  }

  function roundRows(room) {
    return `
      <div class="modal-table direct-result-table">
        <div class="modal-row header">
          <span>순위</span>
          <span>닉네임</span>
          <span>획득</span>
          <span>누적</span>
          <span>계급</span>
        </div>
        ${roundPlayers(room).map((player, index) => {
          const rank = Number(player.lastRoundRank || player.finishedRank || index + 1);
          const gained = Number(player.lastRoundScore || 0);
          const total = Number(player.score || 0);
          return `
            <div class="modal-row">
              <span>${rank}등</span>
              <span>${esc(player.nickname || "-")}</span>
              <strong>+${gained}</strong>
              <strong>${total}</strong>
              <span>${esc(player.role || "-")}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function finalRows(room) {
    return `
      <div class="modal-table direct-result-table final">
        <div class="modal-row header">
          <span>순위</span>
          <span>닉네임</span>
          <span>총점</span>
          <span>직전</span>
          <span>계급</span>
        </div>
        ${finalPlayers(room).map((player, index) => {
          const rank = Number(player.rank || index + 1);
          const total = Number(player.score || 0);
          const lastRank = player.lastRoundRank ? `${player.lastRoundRank}등` : "-";
          return `
            <div class="modal-row">
              <span>${rank}등</span>
              <span>${esc(player.nickname || "-")}</span>
              <strong>${total}</strong>
              <span>${esc(lastRank)}</span>
              <span>${esc(player.role || "-")}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function showResultModal(room, type) {
    const modal = ensureModal();
    const card = document.getElementById("directResultModalCard");
    if (!card) return;

    const user = currentUser();
    const isHost = !!user && room?.hostUid === user;
    const isFinal = type === "final";
    const round = isFinal
      ? Number(room?.finalGameResult?.round || room?.lastRoundResult?.round || 0)
      : Number(room?.lastRoundResult?.round || 0);

    const actions = isFinal
      ? `<button class="btn primary" type="button" id="directResultCloseBtn">확인</button>`
      : `${isHost && room.status === "betweenRounds" ? `<button class="btn primary" type="button" id="directResultNextBtn">다음 라운드 시작</button>` : ""}<button class="btn ghost" type="button" id="directResultCloseBtn">닫기</button>`;

    card.innerHTML = `
      <div class="modal-head"><h2>${isFinal ? "최종 결과" : `${round}라운드 결과`}</h2></div>
      ${isFinal ? finalRows(room) : roundRows(room)}
      <div class="modal-actions">${actions}</div>
    `;

    modal.classList.add("show");

    const closeBtn = document.getElementById("directResultCloseBtn");
    if (closeBtn) closeBtn.onclick = closeModal;

    const nextBtn = document.getElementById("directResultNextBtn");
    if (nextBtn) {
      nextBtn.onclick = () => {
        closeModal();
        window.Dalmuti?.nextRound?.();
      };
    }
  }

  function maybeShowRoundResult(roomId, room) {
    if (!room?.lastRoundResult) return;
    if (!["betweenRounds", "finished"].includes(room.status)) return;
    if (!isRecentlyEnded(room.lastRoundResult.endedAt)) return;

    const round = Number(room.lastRoundResult.round || 0);
    const key = resultSeenKey(roomId, "round", round, room.lastRoundResult.endedAt || room.updatedAt);
    if (hasSeen(key)) return;

    setTimeout(() => showResultModal(room, "round"), 250);
  }

  function maybeShowFinalResult(roomId, room) {
    if (!room?.finalGameResult) return;
    if (!isRecentlyEnded(room.finalGameResult.endedAt || room.lastRoundResult?.endedAt)) return;

    const round = Number(room.finalGameResult.round || room.lastRoundResult?.round || 0);
    const key = resultSeenKey(roomId, "final", round, room.finalGameResult.endedAt || room.lastRoundResult?.endedAt || room.updatedAt);
    if (hasSeen(key)) return;

    setTimeout(() => showResultModal(room, "final"), 450);
  }

  function handleRoom(roomId, room) {
    maybeShowFinalResult(roomId, room);
    if (!room?.finalGameResult) maybeShowRoundResult(roomId, room);
  }

  function watchRoom() {
    const roomId = currentRoomId();
    if (roomId === watchedRoomId) return;

    if (unsub) unsub();
    unsub = null;
    watchedRoomId = roomId;

    if (!roomId) return;

    unsub = roomRef(roomId).onSnapshot(snapshot => {
      if (!snapshot.exists) return;
      handleRoom(roomId, snapshot.data());
    }, console.error);
  }

  function init() {
    watchRoom();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(watchRoom, 700);
  }

  const style = document.createElement("style");
  style.textContent = `
    .direct-result-card .modal-row{
      grid-template-columns:.7fr 1.4fr .8fr .8fr 1fr;
    }
    .direct-result-card .modal-table{
      gap:6px;
    }
    @media(max-width:880px){
      .direct-result-card{
        width:min(94vw,520px)!important;
        max-height:82vh!important;
        overflow:auto!important;
      }
      .direct-result-card .modal-row{
        grid-template-columns:.6fr 1.2fr .7fr .7fr .9fr;
        font-size:12px;
        gap:4px;
      }
    }
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
