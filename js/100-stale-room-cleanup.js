(() => {
  "use strict";

  if (window.__dalmutiUnifiedEnhancementsLoaded) return;
  window.__dalmutiUnifiedEnhancementsLoaded = true;

  const WAITING_STALE_MS = 30 * 60 * 1000;
  const ACTIVE_STALE_MS = 2 * 60 * 60 * 1000;
  const RESULT_RECENT_MS = 25 * 1000;

  let staleTimer = null;
  let roomPollTimer = null;
  let chatUnsub = null;
  let resultUnsub = null;
  let watchedRoomId = "";

  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();

  function hasFirebase() {
    return !!(window.firebase && firebase.apps && firebase.apps.length);
  }

  function db() {
    return firebase.firestore();
  }

  function serverNow() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function roomCol() {
    return db().collection("events").doc("dalmuti").collection("rooms");
  }

  function roomRef(roomId) {
    return roomCol().doc(roomId || currentRoomId());
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  }

  function cleanMap(obj) {
    return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && typeof v === "object"));
  }

  function toMillis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
  }

  function timeKey(value) {
    if (!value) return "x";
    if (typeof value === "number" || typeof value === "string") return String(value);
    if (typeof value.seconds === "number") return `${value.seconds}_${value.nanoseconds || 0}`;
    if (typeof value.toMillis === "function") return String(value.toMillis());
    return "x";
  }

  function chatTime(value) {
    const ms = toMillis(value);
    if (!ms) return "--:--";
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function installStyle() {
    if (document.getElementById("dalmutiUnifiedEnhancementStyle")) return;
    const style = document.createElement("style");
    style.id = "dalmutiUnifiedEnhancementStyle";
    style.textContent = `
      .chat-time{display:inline-block;margin-right:5px;font-size:11px;font-weight:700;opacity:.58;white-space:nowrap}
      .direct-result-card .modal-row{grid-template-columns:.7fr 1.4fr .8fr .8fr 1fr}
      @media(max-width:880px){
        body:has(#roomView.show) .action-row{position:relative!important;z-index:240!important}
        body:has(#roomView.show) .mobile-chat-btn{right:14px!important;bottom:58px!important;z-index:225!important}
        body:has(#roomView.show) .mobile-auto-btn{right:18px!important;bottom:112px!important;z-index:225!important}
        body.mobile-chat-open:has(#roomView.show) .mobile-chat-btn,
        body.mobile-chat-open:has(#roomView.show) .mobile-auto-btn{display:none!important}
        .chat-time{font-size:10px;margin-right:4px}
        .direct-result-card{width:min(94vw,520px)!important;max-height:82vh!important;overflow:auto!important}
        .direct-result-card .modal-row{grid-template-columns:.6fr 1.2fr .7fr .7fr .9fr;font-size:12px;gap:4px}
      }
    `;
    document.head.appendChild(style);
  }

  function closeRoomOverlays() {
    document.getElementById("gameModal")?.classList.remove("show");
    document.getElementById("rebellionModal")?.classList.remove("show");
    document.getElementById("directResultModal")?.classList.remove("show");
    document.body.classList.remove("mobile-menu-open", "mobile-chat-open");
  }

  function closeAllOverlays() {
    closeRoomOverlays();
    document.getElementById("createRoomModal")?.classList.remove("show");
  }

  function patchLeaveButtons() {
    ["leaveRoomBtn", "mobileLeaveRoomBtn"].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.unifiedLeaveFix === "1") return;
      btn.dataset.unifiedLeaveFix = "1";
      btn.addEventListener("click", closeAllOverlays, true);
    });
  }

  function staleLimit(room) {
    return room?.status === "waiting" ? WAITING_STALE_MS : ACTIVE_STALE_MS;
  }

  function isStaleRoom(room) {
    if (!room || room.closed || room.status === "closed") return false;
    const lastActionAt = toMillis(room.updatedAt) || toMillis(room.createdAt);
    return !!lastActionAt && Date.now() - lastActionAt > staleLimit(room);
  }

  async function clearSubcollection(col) {
    while (true) {
      const snap = await col.limit(300).get();
      if (snap.empty) return;
      const batch = db().batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  async function closeStaleRoom(doc) {
    await clearSubcollection(doc.ref.collection("hands")).catch(() => null);
    await doc.ref.set({
      closed: true,
      status: "closed",
      closedReason: "stale",
      closedAt: serverNow(),
      currentTurnUid: null,
      currentSet: null,
      previousSet: null,
      tribute: null,
      updatedAt: serverNow()
    }, { merge: true });
  }

  async function cleanupStaleRooms(refresh = false) {
    if (!hasFirebase()) return 0;
    const snap = await roomCol().orderBy("updatedAt", "desc").limit(50).get().catch(err => {
      console.error("[dalmuti] stale cleanup failed", err);
      return null;
    });
    if (!snap) return 0;
    let closed = 0;
    for (const doc of snap.docs) {
      if (!isStaleRoom(doc.data())) continue;
      await closeStaleRoom(doc).catch(console.error);
      closed += 1;
    }
    if (closed > 0 && refresh) setTimeout(() => document.getElementById("refreshRoomsBtn")?.click(), 250);
    return closed;
  }

  function startStaleCleanup() {
    if (!hasFirebase() || staleTimer) return;
    setTimeout(() => cleanupStaleRooms(true), 1200);
    staleTimer = setInterval(() => {
      if (!document.hidden) cleanupStaleRooms(true);
    }, 5 * 60 * 1000);
    window.DalmutiStaleCleanup = { run: () => cleanupStaleRooms(true) };
  }

  function renderChatWithTime(room) {
    const chatList = document.getElementById("chatList");
    if (!chatList || !room) return;
    const list = (room.chatPreview || []).slice(-80);
    const office = document.body.classList.contains("office-mode");
    chatList.innerHTML = list.length ? list.map(msg => {
      const t = `<span class="chat-time">${chatTime(msg.createdAt)}</span>`;
      if (msg.type === "system") return `<div class="chat-msg system">${t} ${esc(msg.text || "")}</div>`;
      return `<div class="chat-msg">${t} <span class="chat-name">${esc(msg.nickname || "-")}</span> ${esc(msg.text || "")}</div>`;
    }).join("") : `<div class="muted">${office ? "검토 메모가 없습니다." : "채팅이 없습니다."}</div>`;
    chatList.scrollTop = chatList.scrollHeight;
  }

  function ensureResultModal() {
    let modal = document.getElementById("directResultModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "directResultModal";
    modal.className = "game-modal direct-result-modal";
    modal.innerHTML = `<div id="directResultModalCard" class="modal-card direct-result-card"></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function resultSeenKey(roomId, type, round, endedAt) {
    return `dalmuti:${roomId}:directResult:${type}:${round}:${timeKey(endedAt)}`;
  }

  function markResultSeen(key) {
    if (!key) return true;
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
    return false;
  }

  function isRecentResult(value) {
    const ms = toMillis(value);
    if (!ms) return true;
    return Date.now() - ms < RESULT_RECENT_MS;
  }

  function roundPlayers(room) {
    return Object.values(cleanMap(room?.players)).filter(p => p && p.uid && !p.removedFromRoom).sort((a, b) =>
      Number(a.lastRoundRank || a.finishedRank || 999) - Number(b.lastRoundRank || b.finishedRank || 999) ||
      Number(a.seatOrder ?? 999) - Number(b.seatOrder ?? 999)
    );
  }

  function finalPlayers(room) {
    const players = cleanMap(room?.players);
    const standings = room?.finalGameResult?.standings || [];
    if (standings.length) return standings.map(item => ({ ...item, role: players[item.uid]?.role || "-", lastRoundRank: item.lastRoundRank || players[item.uid]?.lastRoundRank || null })).sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
    return Object.values(players).filter(p => p && p.uid && !p.removedFromRoom).sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).map((p, i) => ({ ...p, rank: i + 1 }));
  }

  function roundRows(room) {
    return `<div class="modal-table direct-result-table"><div class="modal-row header"><span>순위</span><span>닉네임</span><span>획득</span><span>누적</span><span>계급</span></div>${roundPlayers(room).map((p, i) => `<div class="modal-row"><span>${Number(p.lastRoundRank || p.finishedRank || i + 1)}등</span><span>${esc(p.nickname || "-")}</span><strong>+${Number(p.lastRoundScore || 0)}</strong><strong>${Number(p.score || 0)}</strong><span>${esc(p.role || "-")}</span></div>`).join("")}</div>`;
  }

  function finalRows(room) {
    return `<div class="modal-table direct-result-table"><div class="modal-row header"><span>순위</span><span>닉네임</span><span>총점</span><span>직전</span><span>계급</span></div>${finalPlayers(room).map((p, i) => `<div class="modal-row"><span>${Number(p.rank || i + 1)}등</span><span>${esc(p.nickname || "-")}</span><strong>${Number(p.score || 0)}</strong><span>${p.lastRoundRank ? `${p.lastRoundRank}등` : "-"}</span><span>${esc(p.role || "-")}</span></div>`).join("")}</div>`;
  }

  function showResultModal(room, type) {
    const modal = ensureResultModal();
    const card = document.getElementById("directResultModalCard");
    if (!card) return;
    const isFinal = type === "final";
    const user = currentUser();
    const isHost = !!user && room?.hostUid === user;
    const round = isFinal ? Number(room?.finalGameResult?.round || room?.lastRoundResult?.round || 0) : Number(room?.lastRoundResult?.round || 0);
    const actions = isFinal ? `<button class="btn primary" id="directResultCloseBtn" type="button">확인</button>` : `${isHost && room.status === "betweenRounds" ? `<button class="btn primary" id="directResultNextBtn" type="button">다음 라운드 시작</button>` : ""}<button class="btn ghost" id="directResultCloseBtn" type="button">닫기</button>`;
    card.innerHTML = `<div class="modal-head"><h2>${isFinal ? "최종 결과" : `${round}라운드 결과`}</h2></div>${isFinal ? finalRows(room) : roundRows(room)}<div class="modal-actions">${actions}</div>`;
    modal.classList.add("show");
    document.getElementById("directResultCloseBtn")?.addEventListener("click", () => modal.classList.remove("show"), { once: true });
    document.getElementById("directResultNextBtn")?.addEventListener("click", () => {
      modal.classList.remove("show");
      window.Dalmuti?.nextRound?.();
    }, { once: true });
  }

  function handleResultRoom(roomId, room) {
    if (room?.finalGameResult && isRecentResult(room.finalGameResult.endedAt || room.lastRoundResult?.endedAt)) {
      const round = Number(room.finalGameResult.round || room.lastRoundResult?.round || 0);
      const key = resultSeenKey(roomId, "final", round, room.finalGameResult.endedAt || room.lastRoundResult?.endedAt || room.updatedAt);
      if (!markResultSeen(key)) setTimeout(() => showResultModal(room, "final"), 450);
      return;
    }
    if (!room?.lastRoundResult) return;
    if (!["betweenRounds", "finished"].includes(room.status)) return;
    if (!isRecentResult(room.lastRoundResult.endedAt)) return;
    const round = Number(room.lastRoundResult.round || 0);
    const key = resultSeenKey(roomId, "round", round, room.lastRoundResult.endedAt || room.updatedAt);
    if (!markResultSeen(key)) setTimeout(() => showResultModal(room, "round"), 250);
  }

  function watchCurrentRoom() {
    if (!hasFirebase()) return;
    const roomId = currentRoomId();
    if (roomId === watchedRoomId) return;
    if (chatUnsub) chatUnsub();
    if (resultUnsub) resultUnsub();
    chatUnsub = null;
    resultUnsub = null;
    watchedRoomId = roomId;
    if (!roomId) {
      closeRoomOverlays();
      return;
    }
    const ref = roomRef(roomId);
    chatUnsub = ref.onSnapshot(snap => {
      if (snap.exists) setTimeout(() => renderChatWithTime(snap.data()), 150);
    }, console.error);
    resultUnsub = ref.onSnapshot(snap => {
      if (snap.exists) handleResultRoom(roomId, snap.data());
    }, console.error);
  }

  function init() {
    installStyle();
    patchLeaveButtons();
    startStaleCleanup();
    watchCurrentRoom();
    roomPollTimer = setInterval(() => {
      patchLeaveButtons();
      watchCurrentRoom();
    }, 1000);
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
