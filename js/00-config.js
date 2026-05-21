(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) {
    alert("Firebase 초기화가 필요합니다.");
    return;
  }

  try {
    firebase.firestore().settings({ experimentalForceLongPolling: true, useFetchStreams: false });
  } catch (err) {}

  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const CARD_BASE = "./cards/";
  const CARD_BACK = "./cards/99. back.png";
  const MAX_PLAYERS = 8;
  const MASTER = "병풍";
  const CHAT_LIMIT = 12;
  const AI_DELAY = 650;
  const TRIBUTE_ANIM_MS = 3000;

const RANKS = [
[1, "01", "임금", "01. king.png", 1],
[2, "02", "세자", "02. prince.png", 2],
[3, "03", "영의정", "03. yeonguijeong.png", 3],
[4, "04", "관찰사", "04. governor.png", 4],
[5, "05", "암행어사", "05. amhaeng.png", 5],
[6, "06", "사또", "06. satto.png", 6],
[7, "07", "이방", "07. ibang.png", 7],
[8, "08", "선비", "08. seonbi.png", 8],
[9, "09", "농민", "09. farmer.png", 9],
[10, "10", "상인", "10. merchant.png", 10],
[11, "11", "백정", "11. baekjeong.png", 11],
[12, "12", "노비", "12. nobi.png", 12],
[13, "J", "홍길동", "13. hong.png", 2]
].map(([rank, code, name, image, count]) => ({ rank, code, name, image, count, joker: rank === 13 }));

  const S = {
    user: "",
    roomId: localStorage.getItem("dalmutiCurrentRoomId") || "",
    room: null,
    hand: [],
    selected: new Map(),
    tributeReturnSelection: {
      key: "",
      required: 0,
      counts: new Map()
    },
    roomUnsub: null,
    handUnsub: null,
    seenStart: new Set(),
    seenResult: new Set(),
    seenRebellion: new Set(),
    aiLocks: new Set(),
    tributeAnimKeys: new Set(),
    actionBusy: false,
    hostAssigning: false,
    leavingByKick: false
  };

  const E = {};
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>\"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const ts = () => firebase.firestore.Timestamp.now();
  const serverNow = () => FV.serverTimestamp();
  const roomCol = () => db.collection("events").doc("dalmuti").collection("rooms");
  const roomRef = (id = S.roomId) => roomCol().doc(id);
  const handRef = (uid = S.user, id = S.roomId) => roomRef(id).collection("hands").doc(uid);

  const cleanMap = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && typeof v === "object"));
  const rankInfo = rank => RANKS.find(r => r.rank === Number(rank)) || RANKS[RANKS.length - 1];
  const cardImg = rank => CARD_BASE + rankInfo(rank).image;
  const playersMap = (room = S.room) => cleanMap(room?.players);
  const spectatorsMap = (room = S.room) => cleanMap(room?.spectators);
  const kickedMap = (room = S.room) => cleanMap(room?.kicked);
  const allPlayers = (room = S.room) => Object.values(playersMap(room)).filter(p => p && p.uid && !p.removedFromRoom).sort((a, b) => (a.seatOrder ?? 999) - (b.seatOrder ?? 999));
  const activePlayers = (room = S.room) => allPlayers(room).filter(p => !p.finished && !p.forfeited && !p.removedFromRoom);
  const spectators = (room = S.room) => Object.values(spectatorsMap(room)).filter(p => p && p.uid && !p.removedFromRoom).sort((a, b) => String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko"));
  const me = (room = S.room) => playersMap(room)[S.user] || spectatorsMap(room)[S.user] || null;
  const isHost = (room = S.room) => room?.hostUid === S.user;
  const isMaster = () => S.user === MASTER;
  const canAdmin = (room = S.room) => isHost(room) || isMaster();
  const countMap = obj => Object.values(cleanMap(obj)).length;

  function toast(text) {
    if (!E.toast) return alert(text);
    E.toast.textContent = text;
    E.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => E.toast.classList.remove("show"), 1800);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sortHand(hand = []) {
    return hand.slice().sort((a, b) => Number(a.rank) - Number(b.rank) || String(a.id).localeCompare(String(b.id)));
  }

  function groupHand(hand = []) {
    const map = new Map();
    sortHand(hand).forEach(card => {
      const rank = Number(card.rank);
      if (!map.has(rank)) map.set(rank, []);
      map.get(rank).push(card);
    });
    return [...map.entries()].map(([rank, items]) => ({ rank, items }));
  }

  function maxRankByPlayers(count) {
    if (count <= 3) return 8;
    if (count <= 5) return 10;
    return 12;
  }

  function makeDeck(playerCount) {
    const deck = [];
    RANKS.filter(r => r.rank <= maxRankByPlayers(playerCount)).forEach(r => {
      for (let i = 1; i <= r.count; i++) deck.push({ id: `r${r.rank}-${i}-${Math.random().toString(36).slice(2, 8)}`, rank: r.rank, name: r.name, joker: false });
    });
    for (let i = 1; i <= 2; i++) deck.push({ id: `j-${i}-${Math.random().toString(36).slice(2, 8)}`, rank: 13, name: "홍길동", joker: true });
    return shuffle(deck);
  }

  function roleByIndex(index, count) {
    const map = {
      2: ["임금", "노비"],
      3: ["임금", "백정", "노비"],
      4: ["임금", "세자", "백정", "노비"],
      5: ["임금", "세자", "사또", "백정", "노비"],
      6: ["임금", "세자", "암행어사", "사또", "백정", "노비"],
      7: ["임금", "세자", "관찰사", "암행어사", "사또", "백정", "노비"],
      8: ["임금", "세자", "영의정", "관찰사", "암행어사", "사또", "백정", "노비"]
    };
    return (map[count] || [])[index] || `${index + 1}등`;
  }

function roundOrderPlayers(round, players) {
  const list = (players || []).filter(p => p && p.uid);

  if (round <= 1) {
    return list
      .slice()
      .sort((a, b) =>
        (a.seatOrder ?? 999) - (b.seatOrder ?? 999) ||
        String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko")
      );
  }

  return list
    .slice()
    .sort((a, b) =>
      (a.lastRoundRank ?? 999) - (b.lastRoundRank ?? 999) ||
      (a.seatOrder ?? 999) - (b.seatOrder ?? 999) ||
      String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko")
    );
}
  
function nextAfter(room, uid) {
  const players = playersMap(room);

  const order = Array.isArray(room.turnOrder) && room.turnOrder.length
    ? room.turnOrder.filter(id => players[id])
    : allPlayers(room).map(p => p.uid);

  if (!order.length) return null;

  const idx = order.indexOf(uid);

  const isAlive = id => {
    const p = players[id];
    return p && !p.finished && !p.forfeited && !p.removedFromRoom;
  };

  if (idx < 0) {
    return order.find(isAlive) || null;
  }

  for (let i = 1; i <= order.length; i++) {
    const nextUid = order[(idx + i) % order.length];
    if (isAlive(nextUid)) return nextUid;
  }

  return null;
}

  function nextAfterKick(oldRoom, kickedUid, nextPlayers) {
    const oldList = allPlayers(oldRoom).filter(p => p && p.uid);
    const idx = oldList.findIndex(p => p.uid === kickedUid);
    if (idx >= 0) {
      for (let i = 1; i <= oldList.length; i++) {
        const cand = oldList[(idx + i) % oldList.length];
        const p = nextPlayers[cand.uid];
        if (p && !p.finished && !p.forfeited && !p.removedFromRoom) return cand.uid;
      }
    }
    const fallback = Object.values(nextPlayers).find(p => p && !p.finished && !p.forfeited && !p.removedFromRoom);
    return fallback?.uid || null;
  }

function hasHumanInRoom(players = {}, specs = {}) {
  const humanPlayers = Object.values(players).some(p => p && !p.isAI && !p.removedFromRoom);
  const humanSpectators = Object.values(specs).some(p => p && !p.isAI && !p.removedFromRoom);
  return humanPlayers || humanSpectators;
}  
function basePlayer(uid, nickname, seatOrder, isAI) {
  return {
    uid,
    nickname,
    type: "player",
    isReady: !!isAI,
    isAI: !!isAI,
    autoPlay: false,
    seatOrder,
    role: null,
    score: 0,
    lastRoundScore: 0,
    lastRoundRank: null,
    cardCount: 0,
    passed: false,
    finished: false,
    finishedRank: null,
    forfeited: false,
    removedFromRoom: false
  };
}

  const baseSpectator = (uid, nickname) => ({ uid, nickname, type: "spectator", isAI: false, removedFromRoom: false });

  function clearTributeReturnSelection() {
    S.tributeReturnSelection.key = "";
    S.tributeReturnSelection.required = 0;
    S.tributeReturnSelection.counts.clear();
  }

  function syncTributeReturnSelection() {
    if (S.room?.status !== "tributeReturn") {
      clearTributeReturnSelection();
      return null;
    }

    const pair = currentTributePairForMe();
    if (!pair) {
      clearTributeReturnSelection();
      return null;
    }

    const key = `${S.roomId}:${pair.id}`;
    const required = Number(pair.count || 0);

    if (S.tributeReturnSelection.key !== key) {
      S.tributeReturnSelection.key = key;
      S.tributeReturnSelection.required = required;
      S.tributeReturnSelection.counts.clear();
    } else {
      S.tributeReturnSelection.required = required;
    }

    const availableByRank = new Map(
      groupHand(S.hand).map(g => [Number(g.rank), Number(g.items.length || 0)])
    );

    Array.from(S.tributeReturnSelection.counts.keys()).forEach(rank => {
      const available = Number(availableByRank.get(Number(rank)) || 0);
      const current = Number(S.tributeReturnSelection.counts.get(Number(rank)) || 0);

      if (!available || current <= 0) {
        S.tributeReturnSelection.counts.delete(Number(rank));
      } else if (current > available) {
        S.tributeReturnSelection.counts.set(Number(rank), available);
      }
    });

    while (tributeReturnSelectedTotal() > required) {
      const entries = Array.from(S.tributeReturnSelection.counts.entries());
      const last = entries[entries.length - 1];
      if (!last) break;

      const [rank, count] = last;
      if (count > 1) S.tributeReturnSelection.counts.set(rank, count - 1);
      else S.tributeReturnSelection.counts.delete(rank);
    }

    return pair;
  }

  function tributeReturnSelectedTotal() {
    return Array.from(S.tributeReturnSelection.counts.values())
      .reduce((sum, count) => sum + Number(count || 0), 0);
  }

  function selectedReturnCards() {
    syncTributeReturnSelection();

    const grouped = new Map(
      groupHand(S.hand).map(g => [Number(g.rank), g.items])
    );

    const cards = [];

    S.tributeReturnSelection.counts.forEach((count, rank) => {
      const items = grouped.get(Number(rank)) || [];
      cards.push(...items.slice(0, Number(count || 0)));
    });

    return cards;
  }

  function selectedCards() {
    if (S.room?.status === "tributeReturn") {
      return selectedReturnCards();
    }

    const ids = new Set();
    S.selected.forEach(cards => cards.forEach(c => ids.add(c.id)));
    return S.hand.filter(c => ids.has(c.id));
  }

  function normalizeCombo(cards) {
    if (!cards.length) return { ok: false, reason: "카드를 선택하세요." };
    const normal = cards.filter(c => !(c.joker || Number(c.rank) === 13));
    const ranks = [...new Set(normal.map(c => Number(c.rank)))];
    if (ranks.length > 1) return { ok: false, reason: "같은 계급만 함께 낼 수 있습니다." };
    if (!normal.length) return { ok: true, effectiveRank: 13, effectiveName: "홍길동", count: cards.length, cards };
    return { ok: true, effectiveRank: ranks[0], effectiveName: rankInfo(ranks[0]).name, count: cards.length, cards };
  }

  function canPlayCombo(cards, room = S.room) {
    const combo = normalizeCombo(cards);
    if (!combo.ok) return combo;
    const current = room?.currentSet;
    if (!current) return combo;
    if (combo.count !== Number(current.count || 1)) return { ok: false, reason: `이번 판은 ${current.count}장씩 내야 합니다.` };
    if (combo.effectiveRank >= Number(current.effectiveRank)) return { ok: false, reason: "더 높은 계급만 낼 수 있습니다." };
    return combo;
  }

  function markSeen(set, key) {
    if (!key) return false;
    if (set.has(key) || sessionStorage.getItem(key)) return true;
    set.add(key);
    sessionStorage.setItem(key, "1");
    return false;
  }

  function collectElements() {
    ["lobbyView", "roomView", "myNickname", "roomTitleInput", "totalRoundsSelect", "turnLimitSelect", "roomList", "rankPreview", "roomStateText", "roomTitle", "turnBadge", "messageBar", "lobbyControls", "readyBtn", "watchBtn", "joinAsPlayerBtn", "startBtn", "betweenControls", "nextRoundBtn", "resetGameBtn", "playersArea", "centerPile", "handArea", "selectedSummary", "playControls", "playBtn", "passBtn", "scoreList", "chatList", "chatInput", "sendChatBtn", "toggleSpectatorChatBtn", "homeBtn", "leaveRoomBtn", "createRoomBtn", "refreshRoomsBtn", "toast"].forEach(id => { E[id] = $(id); });
  }

  function injectCss() {
    if ($("dalmutiSingleCss")) return;

    const link = document.createElement("link");
    link.id = "dalmutiSingleCss";
    link.rel = "stylesheet";
    link.href = "./js/00-style.css?v=20260520-office-manage2";
    
    document.head.appendChild(link);
  }

 function ensureModals() {
  if (!$("gameModal")) {
    const m = document.createElement("div");
    m.id = "gameModal";
    m.className = "game-modal";
    m.innerHTML = '<div id="gameModalCard" class="modal-card"></div>';
    document.body.appendChild(m);
  }

  if (!$("rebellionModal")) {
    const m = document.createElement("div");
    m.id = "rebellionModal";
    m.className = "game-modal";
    m.innerHTML = '<div id="rebellionModalCard" class="modal-card rebellion-card"></div>';
    document.body.appendChild(m);
  }

  if (!$("tributePanel")) {
    const p = document.createElement("div");
    p.id = "tributePanel";
    document.body.appendChild(p);
  }

  if (!$("createRoomModal")) {
    const m = document.createElement("div");
    m.id = "createRoomModal";
    m.className = "create-room-modal";
    m.innerHTML = `
      <div class="create-room-card">
        <h2>방 만들기</h2>
        <input id="modalRoomTitleInput" class="input" maxlength="24" placeholder="방 제목" value="달무티 in 조선">
        <select id="modalTotalRoundsSelect" class="input">
          <option value="3">3판</option>
          <option value="5" selected>5판</option>
          <option value="10">10판</option>
          <option value="0">무제한</option>
        </select>
        <div class="create-room-actions">
          <button id="modalCreateCancelBtn" class="btn ghost" type="button">취소</button>
          <button id="modalCreateRoomBtn" class="btn primary" type="button">생성</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
  }

  if (!$("autoPlayBtn") && $("selectedSummary")) {
    const btn = document.createElement("button");
    btn.id = "autoPlayBtn";
    btn.type = "button";
    btn.className = "btn ghost small hidden";
    btn.textContent = "자동 OFF";
    btn.style.marginLeft = "8px";
    $("selectedSummary").insertAdjacentElement("afterend", btn);
  }

  if (!$("mobileLeaveRoomBtn") && document.querySelector(".side-panel")) {
    const btn = document.createElement("button");
    btn.id = "mobileLeaveRoomBtn";
    btn.type = "button";
    btn.className = "btn danger mobile-leave-room-btn";
    btn.textContent = "방 나가기";
    document.querySelector(".side-panel").appendChild(btn);
  }   

  if (!$("officeModeBtn")) {
    const btn = document.createElement("button");
    btn.id = "officeModeBtn";
    btn.type = "button";
    btn.className = "btn ghost small office-mode-btn";
    btn.textContent = "눈치보기";

    const topbar = document.querySelector(".dalmuti-topbar");
    if (topbar) topbar.appendChild(btn);
    else document.body.appendChild(btn);
  }

  if (!$("mobileOfficeModeBtn") && document.querySelector(".side-panel")) {
    const btn = document.createElement("button");
    btn.id = "mobileOfficeModeBtn";
    btn.type = "button";
    btn.className = "btn ghost mobile-office-mode-btn";
    btn.textContent = "눈치보기";
    document.querySelector(".side-panel").appendChild(btn);
  }
   
  if (E.chatList?.closest("section")) {
    E.chatList.closest("section").classList.add("mobile-chat-section");
  }
  if (E.scoreList?.closest("section")) {
    E.scoreList.closest("section").classList.add("mobile-score-section");
  }

  if (!$("mobileMenuBtn") && document.querySelector(".room-head")) {
    const btn = document.createElement("button");
    btn.id = "mobileMenuBtn";
    btn.type = "button";
    btn.className = "mobile-menu-btn";
    btn.textContent = "☰";
    document.querySelector(".room-head").insertAdjacentElement("afterbegin", btn);
  }

  if (!$("mobileChatBtn")) {
    const btn = document.createElement("button");
    btn.id = "mobileChatBtn";
    btn.type = "button";
    btn.className = "mobile-chat-btn";
    btn.textContent = "💬";
    document.body.appendChild(btn);
  }

  if (!$("mobileAutoPlayBtn")) {
    const btn = document.createElement("button");
    btn.id = "mobileAutoPlayBtn";
    btn.type = "button";
    btn.className = "mobile-auto-btn hidden";
    btn.textContent = "AUTO";
    document.body.appendChild(btn);
  }

  if (!$("mobilePanelBackdrop")) {
    const bg = document.createElement("div");
    bg.id = "mobilePanelBackdrop";
    bg.className = "mobile-panel-backdrop";
    document.body.appendChild(bg);
  }

  if (!$("emojiPanel") && E.sendChatBtn?.parentElement) {
    const wrap = document.createElement("span");
    wrap.className = "emoji-wrap";

    const btn = document.createElement("button");
    btn.id = "emojiToggleBtn";
    btn.type = "button";
    btn.className = "btn ghost small";
    btn.textContent = "😊";

    const panel = document.createElement("div");
    panel.id = "emojiPanel";
    panel.className = "emoji-panel";

    const emojis = ["😏", "🙄", "🤡", "🫵", "😀", "😂", "👍", "👏", "🙏", "🎉", "😭", "😎", "🤔", "😡", "🔥", "💯", "❤️", "🤣", "😅", "🙌", "👀", "✅"];

    panel.innerHTML = emojis.map(e => `
      <button type="button" class="emoji-btn" data-emoji="${e}">${e}</button>
    `).join("");

    E.sendChatBtn.insertAdjacentElement("beforebegin", wrap);
    wrap.appendChild(btn);
    wrap.appendChild(panel);
  }
   
}
  
function setView(name) {
  E.lobbyView?.classList.toggle("show", name === "lobby");
  E.roomView?.classList.toggle("show", name === "room");
  E.leaveRoomBtn?.classList.toggle("hidden", name !== "room");

  if (name === "lobby") {
    clearTimeout(setView.lobbyRefreshTimer);
    setView.lobbyRefreshTimer = setTimeout(() => {
      loadRooms().catch(console.error);
    }, 100);
  }
}
  function safeRender(name, fn) {
    try { fn(); } catch (err) { console.error(`[dalmuti] ${name} render failed`, err); }
  }

  function renderEverything() {
    if (!S.room) return;
    if (S.room.status === "closed" || S.room.closed) {
      alert("방이 삭제되었습니다.");
      leaveLocal();
      return;
    }
    if (kickedMap()[S.user]) {
      handleKicked();
      return;
    }
    setView("room");
    safeRender("header", renderHeader);
    safeRender("players", renderPlayers);
    safeRender("pile", renderPile);
    safeRender("hand", renderHand);
    safeRender("controls", renderControls);
    safeRender("scores", renderScores);
    safeRender("chat", renderChat);
    safeRender("side", renderSide);
    safeRender("tribute", renderTribute);
    safeRender("rebellion", maybeRebellionModal);
    safeRender("startModal", maybeStartModal);
    safeRender("resultModal", maybeResultModal);
    maybeClientTasks().catch(console.error);
  }
function enhanceLobbyLayout() {
  if (!E.lobbyView || $("lobbyGrid")) return;

  // 기존 로비 패널들 숨김
  const createPanel = E.roomTitleInput?.closest(".panel");
  const rankPanel = E.rankPreview?.closest(".panel");
  const roomListPanel = E.roomList?.closest(".panel");

  if (createPanel) createPanel.classList.add("legacy-lobby-hidden");
  if (rankPanel) rankPanel.classList.add("legacy-lobby-hidden");
  if (roomListPanel) roomListPanel.classList.add("legacy-lobby-hidden");

  const grid = document.createElement("div");
  grid.id = "lobbyGrid";
  grid.className = "lobby-grid";

  const left = document.createElement("section");
  left.className = "panel lobby-left";
  left.innerHTML = `
    <div class="lobby-section-head">
      <h2 class="lobby-panel-title">대기방 목록</h2>
      <div id="lobbyToolbar" class="lobby-toolbar"></div>
    </div>
    <div id="lobbyRoomListMount"></div>
  `;

  const right = document.createElement("section");
  right.className = "panel lobby-right";
  right.innerHTML = `<div id="lobbyRuleMount"></div>`;

  grid.appendChild(left);
  grid.appendChild(right);

  const introPanel = E.lobbyView.querySelector(".panel");
  if (introPanel) {
    introPanel.insertAdjacentElement("afterend", grid);
  } else {
    E.lobbyView.appendChild(grid);
  }

  const toolbar = $("lobbyToolbar");

  if (E.createRoomBtn) {
    E.createRoomBtn.textContent = "방 만들기";
    toolbar.appendChild(E.createRoomBtn);
  }

  if (E.refreshRoomsBtn) {
    toolbar.appendChild(E.refreshRoomsBtn);
  }

  if (E.roomList) {
    $("lobbyRoomListMount").appendChild(E.roomList);
  }

  if (E.rankPreview) {
    $("lobbyRuleMount").appendChild(E.rankPreview);
  }
}
  
function renderRankPreview() {
  if (!E.rankPreview) return;

  const cards = RANKS.map(r => `
    <div class="rank-card-mini">
      <img src="${cardImg(r.rank)}" alt="${esc(r.name)}">
      <strong>${esc(r.code)}. ${esc(r.name)}</strong>
      <span>${r.rank === 13 ? "특수 카드" : `${r.count}장`}</span>
    </div>
  `).join("");

  E.rankPreview.innerHTML = `
    <div class="rule-card">
      <div class="rule-title">게임 방법</div>

      <div class="rule-two-col">
        <div class="rule-block">
          <strong>목표</strong>
          손패를 먼저 털수록 높은 순위를 얻고, 라운드마다 승점을 얻습니다.
        </div>
        <div class="rule-block">
          <strong>제출</strong>
          같은 계급 여러 장을 낼 수 있습니다. 이미 카드가 깔려 있으면 같은 장수이면서 더 높은 계급만 낼 수 있습니다.
        </div>
        <div class="rule-block">
          <strong>홍길동</strong>
          일반 카드와 함께 내면 그 계급 카드로 취급합니다. 홍길동만 내면 최약 카드로 취급합니다.
        </div>
        <div class="rule-block">
          <strong>상납</strong>
          2라운드부터 하위 계급자가 상위 계급자에게 좋은 카드를 자동 상납하고, 받은 사람은 같은 장수만큼 돌려줍니다.
        </div>
        <div class="rule-block">
          <strong>민란</strong>
          백정 또는 노비가 홍길동 2장을 들면 계급 순서가 뒤집힙니다.
        </div>
        <div class="rule-block">
          <strong>자동</strong>
          자동 ON 상태에서는 차례, 패스, 상납 반환을 AI가 대신 처리합니다.
        </div>
      </div>

      <div class="rule-title" style="margin-top:14px">카드 종류</div>
      <div class="rank-card-grid">
        ${cards}
      </div>
    </div>
  `;
}

async function loadRooms() {
  if (!E.roomList) return;

  const snap = await roomCol()
    .orderBy("updatedAt", "desc")
    .limit(30)
    .get()
    .catch(err => {
      console.error(err);
      toast("방 목록을 불러오지 못했습니다.");
      return null;
    });

  if (!snap) return;

  const visibleDocs = [];

  for (const d of snap.docs) {
    const r = d.data();

    if (r.closed || r.status === "closed") continue;

    const ps = playersMap(r);
    const sp = spectatorsMap(r);

    if (!hasHumanInRoom(ps, sp)) {
      await closeRoomIfNoHuman(d.id, ps, sp).catch(console.error);
      continue;
    }

    visibleDocs.push(d);
  }

  E.roomList.innerHTML = visibleDocs.length ? visibleDocs.map(d => {
    const r = d.data();
    const status = ({
      waiting: "대기 중",
      playing: "진행 중",
      tributeReturn: "상납 반환",
      betweenRounds: "라운드 종료",
      finished: "게임 종료"
    })[r.status] || r.status || "-";

    return `
      <div class="room-item">
        <div>
          <strong>${esc(r.title || "달무티 in 조선")}</strong>
          <div class="room-meta">
            ${status} · 플레이어 ${r.playerCount || 0}/${MAX_PLAYERS} · 관전자 ${r.spectatorCount || 0} · ${r.totalRounds ? `${r.totalRounds}판` : "무제한"}
          </div>
        </div>
        <button class="btn primary" type="button" onclick="Dalmuti.joinRoom('${d.id}')">입장</button>
      </div>
    `;
  }).join("") : `<div class="muted">생성된 방이 없습니다.</div>`;
}

function isOfficeMode() {
  return document.body.classList.contains("office-mode");
}

function officeRoleName(role) {
  const map = {
    "임금": "총괄",
    "세자": "부총괄",
    "영의정": "검토",
    "관찰사": "확인",
    "암행어사": "점검",
    "사또": "담당",
    "이방": "지원",
    "선비": "검토보조",
    "농민": "처리",
    "상인": "접수",
    "백정": "보류",
    "노비": "대기",
    "홍길동": "예외",
    "방장": "문서관리",
    "참가자": "참여자"
  };

  return map[role] || role || "참여자";
}

function officeCardSetLabel(cards = [], effectiveRank = null) {
  const list = Array.isArray(cards) ? cards : [];
  const jokerCount = list.filter(c => c?.joker || Number(c?.rank) === 13).length;

  const baseRank = effectiveRank || list.find(c => !(c?.joker || Number(c?.rank) === 13))?.rank || 13;
  const baseInfo = rankInfo(baseRank);

  const baseLabel = `${baseInfo.code}. ${officeRoleName(baseInfo.name)}`;

  if (Number(baseRank) === 13) {
    return "J. 예외";
  }

  if (jokerCount > 0) {
    return `${baseLabel} + 예외 ${jokerCount}건`;
  }

  return baseLabel;
}
  
function officeRoundText(room = S.room) {
  const roundNow = Number(room?.round || 0);
  const roundTotal = room?.totalRounds ? Number(room.totalRounds) : null;

  if (!roundNow) return "업무 대기";
  return roundTotal ? `Sheet ${roundNow} / ${roundTotal}` : `Sheet ${roundNow}`;
}

function officeStatusText(room = S.room) {
  if (!room) return "-";

  return ({
    waiting: "업무 대기",
    playing: officeRoundText(room),
    tributeReturn: "검토자료 반환",
    betweenRounds: "시트 검토 완료",
    finished: "최종 집계 완료"
  })[room.status] || room.status || "-";
}
  
  function renderHeader() {
    const room = S.room;
    const office = isOfficeMode();

    const roundNow = Number(room.round || 0);
    const roundTotal = room.totalRounds ? Number(room.totalRounds) : null;
    const roundText = roundNow
      ? (roundTotal ? `${roundNow}/${roundTotal} Round` : `${roundNow} Round`)
      : "대기 중";

    const statusText = office
      ? officeStatusText(room)
      : (({
          waiting: "대기 중",
          playing: roundText,
          tributeReturn: roundText,
          betweenRounds: "라운드 종료",
          finished: "게임 종료"
        })[room.status] || room.status || "-");

    const mobile = isMobileLayout();

    if (E.roomStateText) {
      E.roomStateText.textContent = mobile ? "" : statusText;
    }

if (E.roomTitle) {
  if (office) {
    E.roomTitle.textContent = mobile
      ? `업무 현황 관리표  ${statusText}`
      : `업무 현황 관리표 · ${statusText}`;
  } else {
    E.roomTitle.textContent = mobile
      ? `달무티 in 조선  ${statusText}`
      : (room.title || "달무티 in 조선");
  }
}
    const turnName = room.currentTurnUid
      ? (playersMap(room)[room.currentTurnUid]?.nickname || "-")
      : "-";

    if (E.turnBadge) {
      E.turnBadge.textContent = room.status === "playing"
        ? (office ? `처리중: ${turnName}` : `차례: ${turnName}`)
        : statusText;
    }

    if (E.messageBar) {
      if (office) {
        if (room.status === "waiting") {
          E.messageBar.textContent = "참여자는 확인을 완료해야 업무를 시작할 수 있습니다.";
        } else if (room.status === "tributeReturn") {
          E.messageBar.textContent = room.currentTurnUid
            ? `${turnName}님이 검토자료 반환을 처리할 차례입니다.`
            : "검토자료 반환 단계입니다.";
        } else if (room.status === "playing") {
          E.messageBar.textContent = room.currentTurnUid === S.user ? "내 처리 순서입니다." : `${turnName}님의 처리 순서입니다.`;
        } else if (room.status === "betweenRounds") {
          E.messageBar.textContent = "시트 검토가 완료되었습니다.";
        } else {
          E.messageBar.textContent = "최종 집계가 완료되었습니다.";
        }
        return;
      }

      if (room.status === "waiting") {
        E.messageBar.textContent = "참가자는 준비를 눌러야 게임을 시작할 수 있습니다.";
      } else if (room.status === "tributeReturn") {
        E.messageBar.textContent = room.currentTurnUid
          ? `${turnName}님이 상납받은 카드 수만큼 반환할 차례입니다.`
          : "상납받은 사람이 같은 장수만큼 카드를 돌려줘야 합니다.";
      } else if (room.status === "playing") {
        E.messageBar.textContent = room.currentTurnUid === S.user ? "내 차례입니다." : `${turnName}님의 차례입니다.`;
      } else if (room.status === "betweenRounds") {
        E.messageBar.textContent = "라운드가 종료되었습니다.";
      } else {
        E.messageBar.textContent = "게임이 종료되었습니다.";
      }
    }
  }

function isMobileLayout() {
  return window.matchMedia && window.matchMedia("(max-width: 880px)").matches;
}

function positionClassForSide(side, index, total) {
  if (total <= 1) return `seat-${side}-0`;
  if (total === 2) return index === 0 ? `seat-${side}-1` : `seat-${side}-2`;
  if (index === 0) return `seat-${side}-1`;
  if (index === 1) return `seat-${side}-0`;
  return `seat-${side}-2`;
}

function mobilePositions(ps, myIndex) {
  const isPlayerView = myIndex >= 0;

  /*
    관전자 배치:
    - 내 자리가 없으므로 하단 중앙 seat-bottom 미사용
    - 계급 순서 그대로 좌하단 → 좌중 → 좌상 → 상단 → 우상 → 우중 → 우하단
    - 상단은 3칸 구조:
      홀수면 seat-top-0 중앙
      짝수면 seat-top-1 / seat-top-2 좌우
  */
  if (!isPlayerView) {
    const spectatorSlotMapByCount = {
      1: ["seat-top-0"],
      2: ["seat-top-1", "seat-top-2"],
      3: ["seat-left-0", "seat-top-0", "seat-right-0"],
      4: ["seat-left-0", "seat-top-1", "seat-top-2", "seat-right-0"],
      5: ["seat-left-2", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-2"],
      6: ["seat-left-2", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-1", "seat-right-2"],
      7: ["seat-left-2", "seat-left-0", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-1", "seat-right-2"],
      8: ["seat-left-2", "seat-left-0", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-1", "seat-right-0", "seat-right-2"]
    };

    const slots = spectatorSlotMapByCount[ps.length] || spectatorSlotMapByCount[8];

    return ps
      .slice(0, slots.length)
      .map((p, i) => ({
        p,
        cls: slots[i]
      }))
      .filter(item => item && item.p && item.p.uid);
  }

  /*
    플레이어 배치:
    - 내 자리는 하단 손패 영역으로 빠짐
    - 상대만 배치
    - 내 다음 사람부터 왼쪽 아래 방향으로 회전
    - 상단은 3칸 구조:
      상대 수 홀수면 seat-top-0 중앙
      상대 수 짝수면 seat-top-1 / seat-top-2 좌우
  */
  const rotated = ps.length
    ? ps.slice(myIndex).concat(ps.slice(0, myIndex))
    : [];

  const opponents = rotated.filter(p => p.uid !== S.user);
  const opponentCount = opponents.length;

  const playerSlotMapByOpponentCount = {
    1: ["seat-top-0"],
    2: ["seat-top-1", "seat-top-2"],
    3: ["seat-left-0", "seat-top-0", "seat-right-0"],
    4: ["seat-left-0", "seat-top-1", "seat-top-2", "seat-right-0"],
    5: ["seat-left-2", "seat-left-1", "seat-top-0", "seat-right-1", "seat-right-2"],
    6: ["seat-left-2", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-1", "seat-right-2"],
    7: ["seat-left-2", "seat-left-0", "seat-left-1", "seat-top-0", "seat-right-1", "seat-right-0", "seat-right-2"]
  };

  const slots = playerSlotMapByOpponentCount[opponentCount] || playerSlotMapByOpponentCount[7];

  return opponents
    .slice(0, slots.length)
    .map((p, i) => ({
      p,
      cls: slots[i]
    }))
    .filter(item => item && item.p && item.p.uid);
}

function positions() {
  const ps = allPlayers().filter(p => p && p.uid);
const myIndexRaw = ps.findIndex(p => p.uid === S.user);
const myIndex = myIndexRaw >= 0 ? myIndexRaw : 0;

if (isMobileLayout()) {
  return mobilePositions(ps, myIndexRaw);
}

  const rotated = ps.length
    ? ps.slice(myIndex).concat(ps.slice(0, myIndex))
    : [];

  const count = rotated.length;
  const seatMapByCount = {
    1: ["seat-bottom"],
    2: ["seat-bottom", "seat-top-0"],
    3: ["seat-bottom", "seat-left-0", "seat-right-0"],
    4: ["seat-bottom", "seat-left-0", "seat-top-0", "seat-right-0"],
    5: ["seat-bottom", "seat-left-0", "seat-top-1", "seat-top-2", "seat-right-0"],
    6: ["seat-bottom", "seat-left-2", "seat-left-1", "seat-top-1", "seat-top-2", "seat-right-0"],
    7: ["seat-bottom", "seat-left-2", "seat-left-1", "seat-top-1", "seat-top-0", "seat-top-2", "seat-right-0"],
    8: ["seat-bottom", "seat-left-2", "seat-left-1", "seat-top-1", "seat-top-0", "seat-top-2", "seat-right-1", "seat-right-2"]
  };

  const seatMap = seatMapByCount[count] || seatMapByCount[8];

  return rotated
    .slice(0, seatMap.length)
    .map((p, i) => ({ p, cls: seatMap[i] }))
    .filter(item => item && item.p && item.p.uid);
}
  
  function renderPlayers() {
    if (!E.playersArea) return;

    const seated = positions();
    const playerList = allPlayers();

    if (!seated.length && !playerList.length) {
      E.playersArea.innerHTML = `<div class="muted" style="position:absolute;left:16px;top:16px">참가자 정보를 불러오는 중입니다.</div>`;
      return;
    }

    const officeRows = playerList.map((p, i) => {
      const submitted = S.room?.currentSet?.uid === p.uid;
      const isTurn = S.room?.currentTurnUid === p.uid;

      const status = p.finished
        ? `${p.finishedRank || ""}차 완료`
        : submitted
          ? "완료"
          : p.passed
            ? "보류"
            : isTurn
              ? "처리중"
              : p.isReady
                ? "확인"
                : "대기";

      const rowClass = [
        isTurn ? "current" : "",
        submitted ? "submitted" : "",
        p.passed ? "passed" : "",
        p.finished ? "finished" : ""
      ].filter(Boolean).join(" ");

      const roleText = officeRoleName(p.role || (p.uid === S.room?.hostUid ? "방장" : "참가자"));
      const officeNameText = `${p.nickname || p.uid}${(p.isAI || p.autoPlay) ? " (자동)" : ""}`;

const officeManageBtn = isHost() && p.uid !== S.user
  ? `
    <div class="office-manage-actions">
      ${S.room?.status === "waiting"
        ? `<button class="office-view-btn" type="button" onclick="Dalmuti.forceSpectator('${p.uid}')">보기</button>`
        : ""}
      <button class="office-kick-btn" type="button" onclick="Dalmuti.kick('${p.uid}')">제외</button>
    </div>
  `
  : "-";

return `
  <div class="office-player-row ${rowClass}">
    <span>${i + 1}</span>
    <span>${esc(officeNameText || p.nickname || p.uid)}</span>
    <span>${esc(roleText)}</span>
    <strong>${Number(p.cardCount || 0)}건</strong>
    <span>${esc(status)}</span>
    <span>${officeManageBtn}</span>
  </div>
`;
    }).join("");

    const officeTable = `
      <div class="office-player-table">
        <div class="office-player-caption">담당자별 처리 현황</div>
<div class="office-player-row header">
  <span>No.</span>
  <span>담당자</span>
  <span>역할</span>
  <span>잔여</span>
  <span>상태</span>
  <span>관리</span>
</div>
        ${officeRows || `<div class="office-player-empty">참가자 없음</div>`}
      </div>
    `;

    const playerBoxes = seated.map(({ p, cls }) => {
      const submitted = S.room?.currentSet?.uid === p.uid;
      const state = p.finished ? `${p.finishedRank || ""}등 완료` : p.passed ? "패스" : `${Number(p.cardCount || 0)}장`;

      let badge = p.isAI ? `<div class="badge ai">AI</div>` : "";
      if (p.autoPlay && !p.isAI) badge += `<div class="badge ai">자동</div>`;
      if (submitted) badge += `<div class="badge submit">제출</div>`;
      else if (p.passed) badge += `<div class="badge pass">패스</div>`;
      else if (S.room?.currentTurnUid === p.uid) badge += `<div class="badge turn">차례</div>`;

      const kick = isHost() && p.uid !== S.user
        ? `<button class="kick-btn" type="button" onclick="Dalmuti.kick('${p.uid}')">강퇴</button>`
        : "";

      const displayRole = p.uid === S.room?.hostUid && !p.role
        ? "방장"
        : (p.role || "참가자");

      return `
        <div class="player-box ${cls} ${p.uid === S.user ? "me" : ""} ${S.room?.currentTurnUid === p.uid ? "turn" : ""} ${p.passed ? "passed" : ""} ${p.finished ? "finished" : ""} ${submitted ? "submitted" : ""}">
          ${kick}
          <div class="player-role">${esc(displayRole)}</div>
          <div class="player-name">${esc(p.nickname || p.uid)}</div>
          <div class="player-meta">${state}${p.isReady ? " · 준비" : ""}</div>
          ${badge}
        </div>
      `;
    }).join("");

    E.playersArea.innerHTML = officeTable + playerBoxes;
  }

  function renderPile() {
    if (!E.centerPile) return;

    if (S.room?.status === "tributeReturn") {
      const pairs = S.room.tribute?.pairs || [];
      E.centerPile.innerHTML = `<div class="pile-title">상납 반환</div><div class="muted">상납 받은 사람이 같은 장수만큼 카드를 돌려줍니다.</div><div class="muted">${pairs.map(p => `${esc(p.fromNickname)} → ${esc(p.toNickname)} ${p.count}장 ${p.returned ? "완료" : "대기"}`).join("<br>")}</div>`;
      return;
    }

    const prev = S.room?.previousSet;
    const cur = S.room?.currentSet;

    if (!prev && !cur) {
      E.centerPile.innerHTML = `<div class="pile-board"><div class="pile-empty">새 판</div></div>`;
      return;
    }

    const prevCard = prev?.cards?.[0]
      ? `<img src="${cardImg(prev.cards[0].rank)}" alt="직전 카드">`
      : `<span class="muted">없음</span>`;

    const curList = cur?.cards || [];
    const mobilePileClass = !cur
      ? ""
      : curList.length >= 5
        ? "mobile-pile-count-many"
        : `mobile-pile-count-${curList.length || 1}`;

    const curCards = cur ? curList.map((c, i) => {
      const before = curList[i - 1];
      const isJoker = c.joker || Number(c.rank) === 13;
      const beforeIsJoker = before && (before.joker || Number(before.rank) === 13);
      const jokerGap = isJoker && before && !beforeIsJoker ? " mobile-joker-gap" : "";
      return `<img class="${jokerGap.trim()}" src="${cardImg(c.rank)}" alt="${esc(c.name)}">`;
    }).join("") : `<span class="muted">제출 대기</span>`;

    const officePileTable = cur
      ? `
        <div class="office-pile-table">
          <div class="office-pile-caption">현재 처리 항목</div>
          <div class="office-pile-row header">
            <span>담당자</span>
            <span>구분</span>
            <span>수량</span>
            <span>상태</span>
          </div>
          <div class="office-pile-row">
            <span>${esc(cur.nickname || "-")}</span>
            <span>${esc(officeCardSetLabel(cur.cards || [], cur.effectiveRank))}</span>
            <strong>${Number(cur.count || 0)}건</strong>
            <span>진행중</span>
          </div>
        </div>
      `
      : `
        <div class="office-pile-table">
          <div class="office-pile-caption">현재 처리 항목</div>
          <div class="office-pile-row header">
            <span>담당자</span>
            <span>구분</span>
            <span>수량</span>
            <span>상태</span>
          </div>
          <div class="office-pile-row">
            <span>-</span>
            <span>대기</span>
            <strong>0건</strong>
            <span>미처리</span>
          </div>
        </div>
      `;

    E.centerPile.innerHTML = `
      <div class="pile-board">
        <div class="prev-pile">
          <div class="prev-pile-title">직전 카드</div>
          ${prevCard}
        </div>
        <div class="cur-pile">
          <div class="cur-pile-title">${cur ? `${rankInfo(cur.effectiveRank).name} ${cur.count}장` : "없음"}</div>
          <div class="cur-cards ${mobilePileClass}">${curCards}</div>
          ${officePileTable}
        </div>
      </div>
    `;
  }

  function currentTributePairForMe() {
    return (S.room?.tribute?.pairs || []).find(p => p.toUid === S.user && !p.returned) || null;
  }

  function selectableGroup(group) {
    if (S.room?.status === "tributeReturn") return !!currentTributePairForMe();
    if (S.room?.status !== "playing" || S.room.currentTurnUid !== S.user) return false;
    if (!S.room.currentSet) return true;
    if (Number(group.rank) === 13) return false;
    const need = Number(S.room.currentSet.count || 1);
    const jokerCount = S.hand.filter(c => c.joker || Number(c.rank) === 13).length;
    return group.items.length + jokerCount >= need && Number(group.rank) < Number(S.room.currentSet.effectiveRank);
  }

  function renderHand() {
    if (!E.handArea) return;

    const mine = me();
    const handTitle = document.querySelector(".hand-header h3");

if (!mine || mine.type !== "player") {
  const office = isOfficeMode();
  const nicknameText = mine?.nickname || S.user || "관전자";

  if (handTitle) {
    handTitle.textContent = office
      ? `${nicknameText} · 보기 전용 · 미처리 항목 0건`
      : `${nicknameText} · 관전 중 · 손패 0장`;
  }

  E.handArea.innerHTML = office
    ? `<div class="muted">보기 전용 사용자는 미처리 항목이 없습니다.</div>`
    : `<div class="muted">관전자는 손패가 없습니다.</div>`;

  if (E.selectedSummary) {
    E.selectedSummary.textContent = office ? "선택 항목 없음" : "선택 없음";
  }

  return;
}

if (handTitle) {
  const office = isOfficeMode();
  const nicknameText = mine.nickname || S.user || "나";
  const roleText = mine.role || (S.room?.status === "waiting" ? "참가자" : "계급 없음");
  const cardCount = Array.isArray(S.hand) ? S.hand.length : 0;

  handTitle.textContent = office
    ? `${nicknameText} · ${officeRoleName(roleText)} · 미처리 항목 ${cardCount}건`
    : `${nicknameText} · ${roleText} · 내 손패 ${cardCount}장`;
}

    const groups = groupHand(S.hand);
    const tributePair = S.room?.status === "tributeReturn" ? syncTributeReturnSelection() : null;
    const selectedAll = tributePair ? [] : selectedCards();

    E.handArea.innerHTML = groups.length ? groups.map(g => {
      const rank = Number(g.rank);

      const selected = tributePair
        ? Number(S.tributeReturnSelection.counts.get(rank) || 0)
        : selectedAll.filter(c => Number(c.rank) === rank).length;

      const selectable = tributePair
        ? true
        : (selected > 0 || selectableGroup(g));

const info = rankInfo(rank);
const officeName = officeRoleName(info.name);
const officeStatus = selected
  ? `선택 ${selected}`
  : selectable
    ? "대기"
    : "제한";

      return `
        <div
          class="hand-stack${selected ? " selected" : ""}${selectable ? "" : " disabled"}"
          data-code="${esc(info.code)}"
          data-name="${esc(officeName)}"
          data-count="${g.items.length}"
          data-status="${esc(officeStatus)}"
          onclick="Dalmuti.toggleRank(${rank})"
        >
          ${selected ? `<span class="stack-selected">${selected}</span>` : ""}
          <span class="office-card-cell office-code">${esc(info.code)}</span>
          <span class="office-card-cell office-name">${esc(officeName)}</span>
          <span class="office-card-cell office-count">${g.items.length}</span>
          <span class="office-card-cell office-status">${esc(officeStatus)}</span>
          <img src="${cardImg(rank)}">
          <span class="stack-count">x${g.items.length}</span>
        </div>
      `;
    }).join("") : `<div class="muted">손패가 없습니다.</div>`;

    if (S.room?.status === "tributeReturn") {
      if (E.selectedSummary) {
const office = isOfficeMode();

E.selectedSummary.textContent = tributePair
  ? (
      office
        ? `${tributeReturnSelectedTotal()}/${Number(tributePair.count || 0)}건 반려 선택`
        : `${tributeReturnSelectedTotal()}/${Number(tributePair.count || 0)}장 반환 선택`
    )
  : (office ? "검토자료 반환 대기" : "상납 반환 대기");
      }
      return;
    }

    const cards = selectedCards();
    const combo = canPlayCombo(cards);

if (E.selectedSummary) {
  const office = isOfficeMode();

  E.selectedSummary.textContent = cards.length
    ? (
        combo.ok
          ? (
              office
                ? `${officeCardSetLabel(combo.cards || [], combo.effectiveRank)} ${combo.count}건 선택`
                : `${rankInfo(combo.effectiveRank).name} ${combo.count}장`
            )
          : combo.reason
      )
    : (office ? "선택 항목 없음" : "선택 없음");
}
  }

  function renderControls() {
    const mine = me();
    const office = isOfficeMode();

    const waiting = S.room?.status === "waiting";
    const between = S.room?.status === "betweenRounds" || S.room?.status === "finished";
    const playing = S.room?.status === "playing";
    const tribute = S.room?.status === "tributeReturn";

    const isPlayer = mine?.type === "player" && !mine.isAI;
    const myTurn = playing && S.room.currentTurnUid === S.user && mine?.type === "player" && !mine.finished && !mine.forfeited;
    const tributeTurn = tribute && !!currentTributePairForMe();

    E.lobbyControls?.classList.toggle("hidden", !waiting);
    E.betweenControls?.classList.toggle("hidden", !between);

    const showPlayControls = isPlayer && (playing || tribute);
    E.playControls?.classList.toggle("hidden", !showPlayControls);

    if (E.playBtn) {
      E.playBtn.textContent = office
        ? (tribute ? "반려 항목 제출" : "선택 항목 처리")
        : (tribute ? "반환 카드 주기" : "선택 카드 내기");

      E.playBtn.disabled = tribute ? !tributeTurn : !myTurn;
    }

    if (E.passBtn) {
      E.passBtn.textContent = office ? "보류" : "패스";
      E.passBtn.classList.remove("hidden");
      E.passBtn.disabled = !myTurn;
    }

    E.readyBtn?.classList.toggle("hidden", !(waiting && mine?.type === "player" && !mine.isAI && !isHost()));
    E.watchBtn?.classList.toggle("hidden", !(waiting && mine?.type === "player" && !mine.isAI));
    E.joinAsPlayerBtn?.classList.toggle("hidden", !(waiting && mine?.type === "spectator"));
    E.startBtn?.classList.toggle("hidden", !(waiting && isHost()));
    E.nextRoundBtn?.classList.toggle("hidden", !(S.room?.status === "betweenRounds" && isHost()));
    E.resetGameBtn?.classList.add("hidden");

    if (E.readyBtn) {
      E.readyBtn.textContent = mine?.isReady
        ? (office ? "확인 취소" : "준비 취소")
        : (office ? "확인" : "준비");
    }

    if (E.watchBtn) E.watchBtn.textContent = office ? "보기 전용" : "관전하기";
    if (E.joinAsPlayerBtn) E.joinAsPlayerBtn.textContent = office ? "편집 참여" : "참가하기";
    if (E.startBtn) E.startBtn.textContent = office ? "업무 시작" : "게임 시작";
    if (E.nextRoundBtn) E.nextRoundBtn.textContent = office ? "다음 시트 열기" : "다음 라운드 시작";
    if (E.leaveRoomBtn) E.leaveRoomBtn.textContent = office ? "문서 닫기" : "방 나가기";

    const mobileLeaveRoomBtn = $("mobileLeaveRoomBtn");
    if (mobileLeaveRoomBtn) mobileLeaveRoomBtn.textContent = office ? "문서 닫기" : "방 나가기";

    const showAuto = !!(mine?.type === "player" && !mine.isAI);

    const autoBtn = $("autoPlayBtn");
    if (autoBtn) {
      autoBtn.classList.toggle("hidden", !showAuto);
      autoBtn.textContent = mine?.autoPlay
        ? (office ? "자동 처리 ON" : "자동 ON")
        : (office ? "자동 처리 OFF" : "자동 OFF");
      autoBtn.classList.toggle("primary", !!mine?.autoPlay);
      autoBtn.classList.toggle("ghost", !mine?.autoPlay);
    }

    const mobileAutoBtn = $("mobileAutoPlayBtn");
    if (mobileAutoBtn) {
      mobileAutoBtn.classList.toggle("hidden", !showAuto);
      mobileAutoBtn.textContent = office ? "AUTO" : "AUTO";
      mobileAutoBtn.classList.toggle("primary", !!mine?.autoPlay);
    }
  }

  function renderScores() {
    if (E.scoreList) E.scoreList.innerHTML = "";
  }

function formatChatText(text) {
  const raw = String(text || "").trim();

  const emojiOnlyPattern = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u;

  if (raw && emojiOnlyPattern.test(raw)) {
    return `<span class="chat-emoji-big">${esc(raw)}</span>`;
  }

  return esc(text || "");
}

  function chatSeenKey() {
    return `dalmuti:${S.roomId || "no-room"}:chatSeenAt:${S.user || "no-user"}`;
  }

  function chatMessageTime(msg) {
    return Number(msg?.createdAt || 0);
  }

  function humanChatMessages() {
    return (S.room?.chatPreview || []).filter(msg =>
      msg &&
      msg.type !== "system" &&
      msg.uid !== "system" &&
      msg.uid !== S.user
    );
  }

  function latestHumanChatAt() {
    return humanChatMessages().reduce((max, msg) => {
      return Math.max(max, chatMessageTime(msg));
    }, 0);
  }

  function ensureChatSeenInitialized() {
    if (!S.roomId || !S.user) return;
    const key = chatSeenKey();
    if (localStorage.getItem(key) !== null) return;

    const latest = latestHumanChatAt();
    localStorage.setItem(key, String(latest || Date.now()));
  }

  function markChatSeen() {
    if (!S.roomId || !S.user) return;
    const latest = latestHumanChatAt();
    localStorage.setItem(chatSeenKey(), String(latest || Date.now()));
    updateMobileChatBadge();
  }

  function updateMobileChatBadge() {
    const btn = $("mobileChatBtn");
    if (!btn || !S.roomId || !S.user) return;

    ensureChatSeenInitialized();

    const seenAt = Number(localStorage.getItem(chatSeenKey()) || 0);
    const unread = humanChatMessages().filter(msg => chatMessageTime(msg) > seenAt).length;

    if (unread > 0 && !document.body.classList.contains("mobile-chat-open")) {
      btn.classList.add("has-unread");
      btn.dataset.unread = unread > 9 ? "9+" : String(unread);
      btn.setAttribute("aria-label", `새 채팅 ${unread}개`);
    } else {
      btn.classList.remove("has-unread");
      delete btn.dataset.unread;
      btn.setAttribute("aria-label", "채팅");
    }
  }
  
  function renderChat() {
    if (!E.chatList) return;

    const office = isOfficeMode();
    const chatSection = E.chatList.closest("section");
    const chatTitle = chatSection?.querySelector(".side-title, h2, h3, .panel-title");

    if (chatTitle) {
      chatTitle.textContent = office ? "검토 메모" : "채팅";
    }

    const list = (S.room?.chatPreview || []).slice(-CHAT_LIMIT);

    E.chatList.innerHTML = list.length
      ? list.map(m =>
          m.type === "system"
            ? `<div class="chat-msg system">${esc(m.text)}</div>`
            : `<div class="chat-msg"><span class="chat-name">${esc(m.nickname || "-")}</span> ${formatChatText(m.text || "")}</div>`
        ).join("")
      : `<div class="muted">${office ? "검토 메모가 없습니다." : "채팅이 없습니다."}</div>`;

    E.chatList.scrollTop = E.chatList.scrollHeight;

    if (document.body.classList.contains("mobile-chat-open")) {
      markChatSeen();
    } else {
      updateMobileChatBadge();
    }
  }

  function sideBox(id, anchor) {
    let box = $(id);
    if (!box) {
      box = document.createElement("section");
      box.id = id;
      box.className = "side-box";
      (anchor || document.querySelector(".side-panel")).insertAdjacentElement(anchor ? "afterend" : "afterbegin", box);
    }
    return box;
  }

  function resultRows(list, mode) {
    return `<div class="result-row header"><span>순위</span><span>닉네임</span><span>${mode === "final" ? "총점" : "획득"}</span><span>계급</span></div>` + list.map((p, i) => `<div class="result-row"><span>${mode === "final" ? i + 1 : (p.lastRoundRank || p.finishedRank || i + 1)}등</span><span>${esc(p.nickname || "-")}</span><strong>${mode === "final" ? Number(p.score || 0) : `+${Number(p.lastRoundScore || 0)}`}</strong><span>${esc(p.role || "-")}</span></div>`).join("");
  }

  function renderSide() {
    const side = document.querySelector(".side-panel");
    if (!side || !S.room) return;

    const office = isOfficeMode();

    const turn = S.room.currentTurnUid
      ? (playersMap()[S.room.currentTurnUid]?.nickname || "-")
      : "-";

    const status = office
      ? officeStatusText(S.room)
      : (({
          waiting: "대기 중",
          playing: `${S.room.round || 1}라운드`,
          tributeReturn: "상납 반환",
          betweenRounds: "라운드 종료",
          finished: "게임 종료"
        })[S.room.status] || S.room.status);

    sideBox("roomInfo").innerHTML = office
      ? `
        <div class="side-title">문서 정보</div>
        <div class="score-row compact"><span>문서명</span><strong>${esc(S.room.title || "업무 현황 관리표")}</strong></div>
        <div class="score-row compact"><span>상태</span><strong>${esc(status)}</strong></div>
        <div class="score-row compact"><span>처리자</span><strong>${esc(turn)}</strong></div>
      `
      : `
        <div class="side-title">방 정보</div>
        <div class="score-row compact"><span>방제</span><strong>${esc(S.room.title || "-")}</strong></div>
        <div class="score-row compact"><span>상태</span><strong>${esc(status)}</strong></div>
        <div class="score-row compact"><span>차례</span><strong>${esc(turn)}</strong></div>
      `;

    const settings = sideBox("roomSettings", $("roomInfo"));
    settings.style.display = isHost() && S.room.status === "waiting" ? "block" : "none";

    if (settings.style.display !== "none") {
      settings.innerHTML = office
        ? `
          <div class="side-title">문서 설정</div>
          <div class="room-setting-grid">
            <input id="setTitle" class="input" maxlength="24" value="${esc(S.room.title || "")}">
            <select id="setRounds" class="input">
              <option value="3">Sheet 3</option>
              <option value="5">Sheet 5</option>
              <option value="10">Sheet 10</option>
              <option value="0">계속</option>
            </select>
          </div>
          <div class="side-btns" style="margin-top:8px">
            <button class="btn primary small" onclick="Dalmuti.saveSettings()">저장</button>
            <button class="btn ghost small" onclick="Dalmuti.toggleSpectatorChat()">보기 전용 메모 ${S.room.spectatorChatEnabled === false ? "차단" : "허용"}</button>
          </div>
        `
        : `
          <div class="side-title">방 설정</div>
          <div class="room-setting-grid">
            <input id="setTitle" class="input" maxlength="24" value="${esc(S.room.title || "")}">
            <select id="setRounds" class="input">
              <option value="3">3판</option>
              <option value="5">5판</option>
              <option value="10">10판</option>
              <option value="0">무제한</option>
            </select>
          </div>
          <div class="side-btns" style="margin-top:8px">
            <button class="btn primary small" onclick="Dalmuti.saveSettings()">저장</button>
            <button class="btn ghost small" onclick="Dalmuti.toggleSpectatorChat()">관전자 채팅 ${S.room.spectatorChatEnabled === false ? "차단" : "허용"}</button>
          </div>
        `;

      if ($("setRounds")) $("setRounds").value = String(S.room.totalRounds || 0);
    }

    const spectatorPanel = sideBox("spectatorPanel", E.scoreList?.parentElement);
    const specList = spectators();

    spectatorPanel.innerHTML = office
      ? `
        <div class="side-title">보기 전용 사용자</div>
        ${specList.length ? specList.map(p => `<span class="chip">${esc(p.nickname)}</span>`).join(" ") : `<div class="muted">보기 전용 사용자가 없습니다.</div>`}
      `
      : `
        <div class="side-title">관전자</div>
        ${specList.length ? specList.map(p => `<span class="chip">${esc(p.nickname)}</span>`).join(" ") : `<div class="muted">관전자가 없습니다.</div>`}
      `;

    const roundPanel = sideBox("roundResultPanel", spectatorPanel);
    roundPanel.style.display = S.room.lastRoundResult && ["betweenRounds", "finished"].includes(S.room.status) ? "block" : "none";

    if (roundPanel.style.display !== "none") {
      roundPanel.innerHTML = office
        ? `<div class="result-title">시트 처리 결과</div>${resultRows(allPlayers().slice().sort((a, b) => (a.lastRoundRank ?? 999) - (b.lastRoundRank ?? 999)), "round")}`
        : `<div class="result-title">라운드 결과</div>${resultRows(allPlayers().slice().sort((a, b) => (a.lastRoundRank ?? 999) - (b.lastRoundRank ?? 999)), "round")}`;
    }

    const finalPanel = sideBox("finalResultPanel", roundPanel);
    finalPanel.style.display = S.room.status === "finished" ? "block" : "none";

    if (finalPanel.style.display !== "none") {
      finalPanel.innerHTML = office
        ? `<div class="result-title">최종 집계 결과</div>${resultRows(allPlayers().slice().sort((a, b) => (b.score || 0) - (a.score || 0)), "final")}`
        : `<div class="result-title">최종 결과</div>${resultRows(allPlayers().slice().sort((a, b) => (b.score || 0) - (a.score || 0)), "final")}`;
    }

    const finalScorePanel = sideBox("finalScorePanel", finalPanel);

    if (!S.room.finalGameResult) {
      finalScorePanel.style.display = "none";
      finalScorePanel.innerHTML = "";
    } else {
      finalScorePanel.style.display = "block";

      const standings = S.room.finalGameResult.standings || [];

      finalScorePanel.innerHTML = office
        ? `
          <div class="result-title">최종 집계표</div>
          <div class="result-row header">
            <span>순번</span>
            <span>담당자</span>
            <span>합계</span>
            <span>직전</span>
          </div>
          ${standings.map(p => `
            <div class="result-row">
              <span>${p.rank}</span>
              <span>${esc(p.nickname || "-")}</span>
              <strong>${Number(p.score || 0)}</strong>
              <span>${p.lastRoundRank ? `${p.lastRoundRank}` : "-"}</span>
            </div>
          `).join("")}
        `
        : `
          <div class="result-title">최종 점수</div>
          <div class="result-row header">
            <span>순위</span>
            <span>닉네임</span>
            <span>총점</span>
            <span>직전</span>
          </div>
          ${standings.map(p => `
            <div class="result-row">
              <span>${p.rank}등</span>
              <span>${esc(p.nickname || "-")}</span>
              <strong>${Number(p.score || 0)}</strong>
              <span>${p.lastRoundRank ? `${p.lastRoundRank}등` : "-"}</span>
            </div>
          `).join("")}
        `;
    }

    const admin = sideBox("adminPanel", finalPanel);

    const aiBtn = isHost() && S.room.status === "waiting"
      ? `<button class="btn ghost small" onclick="Dalmuti.addAI()">${office ? "자동 담당 추가" : "AI 추가"}</button>`
      : "";

    const forceBtn = isHost() && S.room.status === "betweenRounds"
      ? `<button class="btn ghost small" onclick="Dalmuti.forceRebellion()">${office ? "예외 강제 처리" : "민란 강제"}</button>`
      : "";

    const stopBtn = isHost() && S.room.status !== "waiting"
      ? `<button class="btn danger small" onclick="Dalmuti.stopGame()">${office ? "업무 중지" : "게임 중지"}</button>`
      : "";

    const delBtn = canAdmin()
      ? `<button class="btn danger small" onclick="Dalmuti.deleteRoom()">${office ? "문서 삭제" : "방 삭제"}</button>`
      : "";

    admin.innerHTML = office
      ? `<div class="side-title">문서 관리</div><div class="side-btns">${aiBtn}${forceBtn}${stopBtn}${delBtn}<button class="btn ghost small" onclick="Dalmuti.showHelp()">업무 기준</button></div>`
      : `<div class="side-title">관리</div><div class="side-btns">${aiBtn}${forceBtn}${stopBtn}${delBtn}<button class="btn ghost small" onclick="Dalmuti.showHelp()">게임 방법</button></div>`;
  }

  function renderTribute() {
    const panel = $("tributePanel");
    if (!panel) return;
    if (!S.room || S.room.status !== "tributeReturn" || !S.room.tribute) {
      panel.style.display = "none";
      return;
    }
    const pairs = S.room.tribute.pairs || [];
    const incoming = pairs.filter(p => p.toUid === S.user);
    const outgoing = pairs.filter(p => p.fromUid === S.user);
    if (!incoming.length && !outgoing.length) {
      panel.style.display = "none";
      return;
    }
    const list = [];
    outgoing.forEach(p => list.push(`<div><div class="tribute-title">내가 상납한 카드</div><div class="tribute-line">${esc(p.toNickname)}님에게 ${p.count}장 상납</div><div class="tribute-cards">${(p.cards || []).map(c => `<img src="${cardImg(c.rank)}">`).join("")}</div></div>`));
    incoming.forEach(p => list.push(`<div><div class="tribute-title">상납받은 카드</div><div class="tribute-line">${esc(p.fromNickname)}님에게서 ${p.count}장 받음 · ${p.returned ? "반환 완료" : "돌려줄 카드 선택"}</div><div class="tribute-cards">${(p.cards || []).map(c => `<img src="${cardImg(c.rank)}">`).join("")}</div></div>`));
    panel.innerHTML = list.join("");
    panel.style.display = "block";
    runTributeAnimations();
  }

  function playerBoxByUid(uid) {
    const p = playersMap()[uid];
    if (!p) return null;
    return Array.from(document.querySelectorAll(".player-box")).find(box => box.querySelector(".player-name")?.textContent.trim() === p.nickname);
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function flyCard(src, start, end, delay, faceUp) {
    const img = document.createElement("img");
    img.className = "tribute-fly-card";
    img.src = faceUp ? src : CARD_BACK;
    img.style.left = `${start.x - 27}px`;
    img.style.top = `${start.y - 40}px`;
    img.style.opacity = "1";
    document.body.appendChild(img);
    setTimeout(() => {
      img.style.transform = `translate(${end.x - start.x}px, ${end.y - start.y}px) rotate(${delay % 2 ? -8 : 8}deg) scale(.9)`;
      img.style.opacity = ".18";
    }, delay);
    setTimeout(() => img.remove(), delay + TRIBUTE_ANIM_MS + 150);
  }

  function runTributeAnimations() {
    if (!S.room || S.room.status !== "tributeReturn" || !S.room.tribute) return;
    const uid = S.user;
    const base = `${S.roomId}:${S.room.round || 0}`;
    (S.room.tribute.pairs || []).forEach(pair => {
      const shouldReveal = pair.fromUid === uid || pair.toUid === uid;
      const sendKey = `${base}:${pair.id}:send`;
      if (!S.tributeAnimKeys.has(sendKey)) {
        S.tributeAnimKeys.add(sendKey);
        const from = playerBoxByUid(pair.fromUid);
        const to = playerBoxByUid(pair.toUid);
        if (from && to) {
          const s = centerOf(from);
          const e = centerOf(to);
          (pair.cards || Array.from({ length: pair.count || 1 })).forEach((card, i) => flyCard(card?.rank ? cardImg(card.rank) : CARD_BACK, { x: s.x + i * 7, y: s.y + i * 4 }, { x: e.x + i * 5, y: e.y - i * 3 }, 250 + i * 300, shouldReveal));
        }
      }
      const returnKey = `${base}:${pair.id}:return`;
      if (pair.returned && !S.tributeAnimKeys.has(returnKey)) {
        S.tributeAnimKeys.add(returnKey);
        const from = playerBoxByUid(pair.toUid);
        const to = playerBoxByUid(pair.fromUid);
        if (from && to) {
          const s = centerOf(from);
          const e = centerOf(to);
          (pair.returnedCards || Array.from({ length: pair.count || 1 })).forEach((card, i) => flyCard(card?.rank ? cardImg(card.rank) : CARD_BACK, { x: s.x + i * 7, y: s.y }, { x: e.x + i * 5, y: e.y }, 180 + i * 300, shouldReveal));
        }
      }
    });
  }

  async function appendChat(msg) {
    if (!S.roomId || !S.room) return;
    const chat = (S.room.chatPreview || []).slice(-CHAT_LIMIT + 1);
    chat.push({ ...msg, uid: msg.uid || "system", nickname: msg.nickname || "", text: msg.text || "", createdAt: Date.now() });
    await roomRef().set({ chatPreview: chat, updatedAt: serverNow() }, { merge: true });
  }

  async function appendSystemFrom(room, text) {
    const chat = (room.chatPreview || []).slice(-CHAT_LIMIT + 1);
    chat.push({ type: "system", uid: "system", nickname: "", text, createdAt: Date.now() });
    await roomRef().set({ chatPreview: chat, updatedAt: serverNow() }, { merge: true });
  }

  const addSystem = text => appendChat({ type: "system", text });

function showCreateRoomModal() {
  const modal = $("createRoomModal");
  if (!modal) return;

  const titleInput = $("modalRoomTitleInput");
  const roundsSelect = $("modalTotalRoundsSelect");

  if (titleInput) titleInput.value = E.roomTitleInput?.value || "달무티 in 조선";
  if (roundsSelect) roundsSelect.value = E.totalRoundsSelect?.value || "5";

  modal.classList.add("show");
}

function closeCreateRoomModal() {
  $("createRoomModal")?.classList.remove("show");
}
  
  async function createRoom() {
const title = (($("modalRoomTitleInput")?.value || E.roomTitleInput?.value || "").trim()) || "달무티 in 조선";
const rawRounds = Number($("modalTotalRoundsSelect")?.value || E.totalRoundsSelect?.value || 5);
    const ref = roomCol().doc();
    const player = basePlayer(S.user, S.user, 0, false);
    await ref.set({ title, hostUid: S.user, hostNickname: S.user, status: "waiting", round: 0, totalRounds: rawRounds === 0 ? null : rawRounds, players: { [S.user]: player }, spectators: {}, kicked: {}, playerCount: 1, spectatorCount: 0, currentTurnUid: null, currentSet: null, previousSet: null, finishOrder: [], lastRoundResult: null, tribute: null, chatPreview: [], spectatorChatEnabled: true, rebellionNotice: null, closed: false, updatedAt: serverNow(), createdAt: serverNow() });
    await ref.collection("hands").doc(S.user).set({ hand: [] });
    closeCreateRoomModal();
    enterRoom(ref.id);
  }

  async function joinRoom(roomId) {
    if (S.roomId && S.roomId !== roomId) leaveSubscriptions();
    const snap = await roomRef(roomId).get();
    if (!snap.exists || snap.data().closed || snap.data().status === "closed") return toast("삭제된 방입니다.");
    const room = snap.data();
    const players = playersMap(room);
    const specs = spectatorsMap(room);
    const kicked = kickedMap(room);
    if (kicked[S.user]) delete kicked[S.user];
    if (!players[S.user] && !specs[S.user]) {
      if (room.status === "waiting" && countMap(players) < MAX_PLAYERS) {
        players[S.user] = basePlayer(S.user, S.user, countMap(players), false);
        await roomRef(roomId).set({ players, kicked, playerCount: countMap(players), updatedAt: serverNow() }, { merge: true });
        await handRef(S.user, roomId).set({ hand: [] }, { merge: true });
      } else {
        specs[S.user] = baseSpectator(S.user, S.user);
        await roomRef(roomId).set({ spectators: specs, kicked, spectatorCount: countMap(specs), updatedAt: serverNow() }, { merge: true });
      }
    } else if (room.kicked?.[S.user]) {
      await roomRef(roomId).set({ kicked, updatedAt: serverNow() }, { merge: true });
    }
    enterRoom(roomId);
  }

  function enterRoom(roomId) {
    leaveSubscriptions();
    S.roomId = roomId;
    localStorage.setItem("dalmutiCurrentRoomId", roomId);
    setView("room");
    S.roomUnsub = roomRef(roomId).onSnapshot(snap => {
      if (!snap.exists) {
        toast("방이 삭제되었습니다.");
        leaveLocal();
        return;
      }
      S.room = snap.data();
      if (kickedMap()[S.user]) {
        handleKicked();
        return;
      }
      renderEverything();
      ensureMyHandSubscription();
    }, err => { console.error(err); toast("방 정보를 읽지 못했습니다."); });
  }

  function handleKicked() {
    if (S.leavingByKick) return;
    S.leavingByKick = true;
    const roomId = S.roomId;
    leaveSubscriptions();
    S.room = null;
    S.hand = [];
    S.selected.clear();
    localStorage.removeItem("dalmutiCurrentRoomId");
    S.roomId = "";
    setView("lobby");
    loadRooms();
    alert("방장에 의해 방에서 내보내졌습니다. 로비에서 다시 입장할 수 있습니다.");
    setTimeout(() => { S.leavingByKick = false; }, 500);
  }

  function ensureMyHandSubscription() {
    const mine = me();
    const should = !!(S.roomId && mine?.type === "player");
    if (!should) {
      if (S.handUnsub) S.handUnsub();
      S.handUnsub = null;
      S.hand = [];
      renderHand();
      return;
    }
    const key = `${S.roomId}:${S.user}`;
    if (S.handUnsub && ensureMyHandSubscription.key === key) return;
    if (S.handUnsub) S.handUnsub();
    ensureMyHandSubscription.key = key;
    S.handUnsub = handRef().onSnapshot(snap => { S.hand = snap.exists ? sortHand(snap.data().hand || []) : []; renderHand(); renderTribute(); }, console.error);
  }

  function leaveSubscriptions() {
    if (S.roomUnsub) S.roomUnsub();
    if (S.handUnsub) S.handUnsub();
    S.roomUnsub = null;
    S.handUnsub = null;
  }

  function leaveLocal() {
    leaveSubscriptions();
    S.room = null;
    S.hand = [];
    S.roomId = "";
    S.selected.clear();
    localStorage.removeItem("dalmutiCurrentRoomId");
    setView("lobby");
    loadRooms();
  }

async function leaveRoom() {
  if (!S.roomId || !S.room) return leaveLocal();

  if (S.room.status !== "waiting") {
    toast("게임 중에는 화면에서만 나갑니다. 재참여는 제한될 수 있습니다.");
    leaveLocal();
    return;
  }

  const players = playersMap();
  const specs = spectatorsMap();

  if (players[S.user]) {
    delete players[S.user];
    await handRef().delete().catch(() => null);
  }

  if (specs[S.user]) {
    delete specs[S.user];
  }

  const update = {
    players,
    spectators: specs,
    playerCount: countMap(players),
    spectatorCount: countMap(specs),
    updatedAt: serverNow()
  };

if (!hasHumanInRoom(players, specs)) {
  await closeRoomIfNoHuman(S.roomId, players, specs);
  leaveLocal();
  return;
}
  
  if (S.room.hostUid === S.user) {
    const next =
  Object.values(players).find(p => p && !p.isAI && !p.removedFromRoom) ||
  Object.values(specs).find(p => p && !p.isAI && !p.removedFromRoom);

    if (next) {
      update.hostUid = next.uid;
      update.hostNickname = next.nickname;
    } else {
      update.closed = true;
      update.status = "closed";
    }
  }

  await roomRef().update(update);
  leaveLocal();
}

async function toggleReady() {
  if (!S.room || S.room.status !== "waiting") return;

  const players = playersMap();
  const player = players[S.user];

  if (!player) {
    toast("참가자 상태가 아닙니다. 관전 중이면 참가하기를 먼저 눌러주세요.");
    return;
  }

  if (player.isAI) return;

  players[S.user] = {
    ...player,
    uid: player.uid || S.user,
    nickname: player.nickname || S.user,
    type: "player",
    isReady: !player.isReady
  };

  await roomRef().set({
    players,
    updatedAt: serverNow()
  }, { merge: true });
}

async function toggleAutoPlay() {
  if (!S.room || !S.roomId) return;

  const players = playersMap();
  const player = players[S.user];

  if (!player || player.type !== "player" || player.isAI) {
    return toast("참가자만 자동 조작을 설정할 수 있습니다.");
  }

  const nextAuto = !player.autoPlay;

  players[S.user] = {
    ...player,
    autoPlay: nextAuto,
    // 자동 ON이면 대기방에서 레디도 자동 처리
    // 자동 OFF는 준비 상태를 임의로 취소하지 않음
    isReady: nextAuto && S.room.status === "waiting" ? true : player.isReady
  };

  await roomRef().set({
    players,
    updatedAt: serverNow()
  }, { merge: true });

  toast(nextAuto ? "자동 조작을 켰습니다. 준비도 완료했습니다." : "자동 조작을 껐습니다.");
}
  
async function becomeSpectator() {
  if (!S.room || S.room.status !== "waiting" || kickedMap()[S.user]) return;

  const players = playersMap();
  const specs = spectatorsMap();

  if (!players[S.user]) {
    if (!specs[S.user]) {
      specs[S.user] = baseSpectator(S.user, S.user);
    }

    await roomRef().update({
      players,
      spectators: specs,
      playerCount: countMap(players),
      spectatorCount: countMap(specs),
      updatedAt: serverNow()
    });

    return;
  }

  delete players[S.user];

  specs[S.user] = {
    ...baseSpectator(S.user, S.user),
    uid: S.user,
    nickname: S.user,
    type: "spectator"
  };

  await handRef().delete().catch(() => null);

  await roomRef().update({
    players,
    spectators: specs,
    playerCount: countMap(players),
    spectatorCount: countMap(specs),
    updatedAt: serverNow()
  });
}

async function forceSpectator(uid) {
  if (!isHost() || !S.room || S.room.status !== "waiting") {
    return toast("대기 중에만 보기 전용으로 전환할 수 있습니다.");
  }

  if (uid === S.user) {
    return toast("본인은 보기 전용 버튼을 사용하세요.");
  }

  const players = playersMap();
  const specs = spectatorsMap();
  const target = players[uid];

  if (!target) {
    return toast("참가자 목록에 없는 대상입니다.");
  }

  delete players[uid];

  specs[uid] = {
    ...baseSpectator(uid, target.nickname || uid),
    uid,
    nickname: target.nickname || uid,
    type: "spectator"
  };

  await handRef(uid).delete().catch(() => null);

  await roomRef().update({
    players,
    spectators: specs,
    playerCount: countMap(players),
    spectatorCount: countMap(specs),
    updatedAt: serverNow()
  });

  await addSystem(`${target.nickname || uid}님이 보기 전용으로 전환되었습니다.`);
}
  
async function becomePlayer() {
  if (!S.room || S.room.status !== "waiting") {
    return toast("대기 중에만 참가할 수 있습니다.");
  }

  if (kickedMap()[S.user]) {
    return toast("로비에서 다시 입장해 주세요.");
  }

  const players = playersMap();
  const specs = spectatorsMap();

  if (players[S.user]) return;

  if (countMap(players) >= MAX_PLAYERS) {
    return toast("최대 8명까지 참가할 수 있습니다.");
  }

  delete specs[S.user];

  players[S.user] = {
    ...basePlayer(S.user, S.user, countMap(players), false),
    uid: S.user,
    nickname: S.user,
    type: "player"
  };

  await roomRef().update({
    players,
    spectators: specs,
    playerCount: countMap(players),
    spectatorCount: countMap(specs),
    updatedAt: serverNow()
  });

  await handRef().set({ hand: [] }, { merge: true });
}

  async function addAI() {
    if (!isHost() || S.room?.status !== "waiting") return;
    const players = playersMap();
    if (countMap(players) >= MAX_PLAYERS) return toast("최대 8명까지 참가할 수 있습니다.");
    const n = Object.values(players).filter(p => p.isAI).length + 1;
    const uid = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    players[uid] = basePlayer(uid, `AI ${n}`, countMap(players), true);
    await roomRef().set({ players, playerCount: countMap(players), updatedAt: serverNow() }, { merge: true });
    await handRef(uid).set({ hand: [] });
  }

  function hasTwoHong(hand = []) { return hand.filter(c => c.joker || Number(c.rank) === 13).length >= 2; }

  function forceHongForRebellion(hands, uid) {
    let jokers = [];
    Object.keys(hands).forEach(owner => {
      const keep = [];
      hands[owner].forEach(card => { if ((card.joker || Number(card.rank) === 13) && jokers.length < 2) jokers.push(card); else keep.push(card); });
      hands[owner] = keep;
    });
    while (jokers.length < 2) jokers.push({ id: `j-force-${jokers.length}-${Math.random().toString(36).slice(2, 8)}`, rank: 13, name: "홍길동", joker: true });
    const takeOut = sortHand(hands[uid] || []).filter(c => !(c.joker || Number(c.rank) === 13)).slice(-2);
    const ids = new Set(takeOut.map(c => c.id));
    hands[uid] = (hands[uid] || []).filter(c => !ids.has(c.id)).concat(jokers.slice(0, 2));
    const donors = Object.keys(hands).filter(k => k !== uid);
    takeOut.forEach((card, i) => { const donor = donors[i % donors.length]; if (donor) hands[donor].push(card); });
    Object.keys(hands).forEach(owner => { hands[owner] = sortHand(hands[owner]); });
  }

  function bestTributeCards(hand, count) { return sortHand(hand).filter(c => !(c.joker || Number(c.rank) === 13)).slice(0, count); }

  function makeTributePairs(players, hands) {
    if (players.length < 3) return [];
    const specs = players.length === 3 ? [{ from: players[2], to: players[0], count: 1 }] : [{ from: players[players.length - 1], to: players[0], count: 2 }, { from: players[players.length - 2], to: players[1], count: 1 }];
    return specs.map((spec, i) => {
      const cards = bestTributeCards(hands[spec.from.uid] || [], spec.count);
      const ids = new Set(cards.map(c => c.id));
      hands[spec.from.uid] = sortHand((hands[spec.from.uid] || []).filter(c => !ids.has(c.id)));
      hands[spec.to.uid] = sortHand((hands[spec.to.uid] || []).concat(cards));
      return { id: `tribute-${i}`, fromUid: spec.from.uid, fromNickname: spec.from.nickname, toUid: spec.to.uid, toNickname: spec.to.nickname, count: cards.length, cards, returned: cards.length === 0, returnedCards: [] };
    }).filter(pair => pair.count > 0);
  }

  async function startGame() {
    if (!isHost() || S.room?.status !== "waiting") return;
    const ps = allPlayers();
    if (ps.length < 2) return toast("2명 이상 필요합니다.");
const notReady = ps.filter(p =>
  p.uid !== S.room.hostUid &&
  !p.isReady &&
  !p.isAI
);

if (notReady.length) {
  const names = notReady.map(p => p.nickname || p.uid).join(", ");
  await addSystem(`게임을 시작할 수 없습니다. 아직 준비하지 않은 인원: ${names}`);
  return toast("아직 준비하지 않은 인원이 있습니다.");
}
    await startRound(1, true, false);
  }

  async function startRound(round, resetScores, forceRebellion) {
    let ps = roundOrderPlayers(round, allPlayers());
    const deck = makeDeck(ps.length);
    const hands = Object.fromEntries(ps.map(p => [p.uid, []]));
    deck.forEach((card, i) => hands[ps[i % ps.length].uid].push(card));
    Object.keys(hands).forEach(uid => { hands[uid] = sortHand(hands[uid]); });
const lowUids = ps.length === 3
  ? [ps[1]?.uid, ps[2]?.uid]
  : [ps[ps.length - 2]?.uid, ps[ps.length - 1]?.uid];

const rebellionUid = round > 1
  ? (
      forceRebellion
        ? ps[ps.length - 1]?.uid
        : lowUids.find(uid => uid && hasTwoHong(hands[uid]))
    )
  : null;
    const rebellionPlayer = ps.find(p => p.uid === rebellionUid);
    if (rebellionUid) ps = ps.slice().reverse();
    const pairs = round > 1 ? makeTributePairs(ps, hands) : [];
    const hasTribute = pairs.some(p => !p.returned);
    const playerMap = {};
    ps.forEach((p, i) => {
      playerMap[p.uid] = { ...p, type: "player", seatOrder: i, role: roleByIndex(i, ps.length), score: resetScores ? 0 : (p.score || 0), lastRoundScore: 0, lastRoundRank: resetScores ? null : p.lastRoundRank, cardCount: hands[p.uid].length, isReady: !!p.isAI, passed: false, finished: false, finishedRank: null, forfeited: false, removedFromRoom: false };
    });
    const first = ps[0]?.uid || null;
    const batch = db.batch();
batch.set(roomRef(), {
  players: playerMap,
  playerCount: countMap(playerMap),
  status: hasTribute ? "tributeReturn" : "playing",
  round,
  roundKey: `${round}-${Date.now()}`,
  finalGameResult: null,
  currentTurnUid: hasTribute ? (pairs.find(p => !p.returned)?.toUid || null) : first,
  currentSet: null,
  previousSet: null,
  finishOrder: [],
  turnOrder: ps.map(p => p.uid),
  tribute: hasTribute ? { phase: "return", pairs, reversed: !!rebellionUid, returnStartedAt: ts() } : null,
  rebellionNotice: rebellionUid ? { uid: rebellionUid, nickname: rebellionPlayer?.nickname || "누군가", round, createdAt: ts() } : null,
  updatedAt: serverNow()
}, { merge: true });
    Object.keys(hands).forEach(uid => batch.set(handRef(uid), { hand: hands[uid] }));
    await batch.commit();
    await addSystem(rebellionUid ? `${rebellionPlayer?.nickname || "누군가"}님의 홍길동이 민란을 일으켰습니다.` : (hasTribute ? `${round}라운드 상납 반환을 시작합니다.` : `${round}라운드가 시작되었습니다.`));
  }

  async function nextRound(forceRebellion = false) {
    if (!isHost() || S.room?.status !== "betweenRounds") return;
    await startRound((S.room.round || 0) + 1, false, forceRebellion);
  }

  function toggleRank(rank) {
    const mine = me();
    if (!mine || mine.type !== "player") return;
    const group = groupHand(S.hand).find(g => Number(g.rank) === Number(rank));
    if (!group) return;
    if (S.room?.status === "tributeReturn") {
      const pair = syncTributeReturnSelection();

      if (!pair) {
        return toast("반환할 차례가 아닙니다.");
      }

      const rankNum = Number(group.rank);
      const required = Number(pair.count || 0);
      const current = Number(S.tributeReturnSelection.counts.get(rankNum) || 0);
      const total = tributeReturnSelectedTotal();
      const maxInStack = Number(group.items.length || 0);

      if (total < required && current < maxInStack) {
        S.tributeReturnSelection.counts.set(rankNum, current + 1);
      } else if (current > 0) {
        const next = current - 1;
        if (next > 0) S.tributeReturnSelection.counts.set(rankNum, next);
        else S.tributeReturnSelection.counts.delete(rankNum);
      } else {
        return toast(`${required}장만 선택할 수 있습니다.`);
      }

      renderHand();
      return;
    }
    if (S.room?.status !== "playing" || S.room.currentTurnUid !== S.user) return;
    if (S.room.currentSet) {
      if (!selectableGroup(group)) return toast("낼 수 없는 계급입니다.");
      S.selected.clear();
      const need = Number(S.room.currentSet.count || 1);
      const normal = group.items.filter(c => !(c.joker || Number(c.rank) === 13)).slice(0, need);
      const jokers = S.hand.filter(c => c.joker || Number(c.rank) === 13).slice(0, Math.max(0, need - normal.length));
      S.selected.set(group.rank, normal.concat(jokers));
      renderHand();
      return;
    }
const currentSelected = S.selected.get(group.rank) || [];

if (Number(group.rank) === 13) {
  if (!currentSelected.length) {
    S.selected.set(group.rank, group.items.slice());
  } else if (currentSelected.length > 1) {
    S.selected.set(group.rank, group.items.slice(0, currentSelected.length - 1));
  } else {
    S.selected.delete(group.rank);
  }

  renderHand();
  return;
}

const jokers = S.selected.get(13) || [];

if (!currentSelected.length) {
  S.selected.clear();
  S.selected.set(group.rank, group.items.slice());
  if (jokers.length) S.selected.set(13, jokers);
} else if (currentSelected.length > 1) {
  S.selected.set(group.rank, group.items.slice(0, currentSelected.length - 1));
} else {
  S.selected.delete(group.rank);
}

renderHand();
  }

  async function playSelected() {
    if (S.actionBusy) return;
    S.actionBusy = true;
    try {
      if (S.room?.status === "tributeReturn") await returnTribute(S.user, selectedCards(), S.hand);
      else if (S.room?.currentTurnUid === S.user) await applyPlay(S.user, selectedCards(), S.hand);
    } finally {
      S.actionBusy = false;
    }
  }

  async function applyPlay(uid, cards, hand) {
    const room = S.room;
    const player = playersMap(room)[uid];
    if (!room || !player || room.status !== "playing") return;
    const combo = canPlayCombo(cards, room);
    if (!combo.ok) { if (uid === S.user) toast(combo.reason); return; }
    const ids = new Set(cards.map(c => c.id));
    const newHand = sortHand((hand || []).filter(c => !ids.has(c.id)));
    const players = playersMap(room);
    const order = (room.finishOrder || []).slice();
    const finished = newHand.length === 0;
    let finishedRank = players[uid].finishedRank || null;
    if (finished && !players[uid].finished) {
      finishedRank = order.length + 1;
      order.push({ uid, nickname: players[uid].nickname, rank: finishedRank, finishedAt: ts() });
    }
    Object.keys(players).forEach(pid => { players[pid] = { ...players[pid], passed: false }; });
    players[uid] = { ...players[uid], cardCount: newHand.length, finished, finishedRank, passed: false };
    const set = { uid, nickname: player.nickname, effectiveRank: combo.effectiveRank, effectiveName: combo.effectiveName, count: combo.count, cards, createdAt: ts() };
    const activeCount = Object.values(players).filter(p => p && !p.finished && !p.forfeited).length;
    const batch = db.batch();
    batch.set(handRef(uid), { hand: newHand });
    if (activeCount <= 1) {
      const final = order.slice();
      const last = Object.values(players).find(p => p && !p.finished && !p.forfeited);
      if (last) final.push({ uid: last.uid, nickname: last.nickname, rank: final.length + 1, finishedAt: ts() });
      batch.set(roomRef(), finishRoundUpdate(room, players, final), { merge: true });
      if (uid === S.user) S.selected.clear();
      await batch.commit();
      await addSystem((room.totalRounds && room.round >= room.totalRounds) ? "최종라운드가 종료되었습니다. 최종 점수가 표시됩니다." : `${room.round}라운드가 종료되었습니다.`);
      return;
    }
    const next = nextAfter({ ...room, players }, uid);
    batch.set(roomRef(), { players, previousSet: room.currentSet || null, currentSet: set, currentTurnUid: next, finishOrder: order, updatedAt: serverNow() }, { merge: true });
    if (uid === S.user) S.selected.clear();
    await batch.commit();
  }

function finishRoundUpdate(room, players, final) {
  final.forEach((r, i) => {
    const score = Object.keys(players).length - i;

    if (players[r.uid]) {
      players[r.uid] = {
        ...players[r.uid],
        score: Number(players[r.uid].score || 0) + score,
        lastRoundScore: score,
        lastRoundRank: i + 1,
        seatOrder: i,
        role: roleByIndex(i, Object.keys(players).length),
        finished: true,
        finishedRank: i + 1,
        passed: false
      };
    }
  });

  const isFinalRound = !!(room.totalRounds && room.round >= room.totalRounds);

  const finalStandings = Object.values(players)
    .filter(p => p && p.uid && !p.removedFromRoom)
    .slice()
    .sort((a, b) =>
      Number(b.score || 0) - Number(a.score || 0) ||
      Number(a.lastRoundRank || 999) - Number(b.lastRoundRank || 999)
    )
    .map((p, i) => ({
      uid: p.uid,
      nickname: p.nickname,
      score: Number(p.score || 0),
      rank: i + 1,
      lastRoundRank: p.lastRoundRank || null
    }));

  if (isFinalRound) {
    Object.keys(players).forEach(uid => {
      players[uid] = {
        ...players[uid],
        isReady: !!players[uid].isAI,
        role: null,
        cardCount: 0,
        passed: false,
        finished: false,
        finishedRank: null,
        forfeited: false
      };
    });
  }

  return {
    players,
    status: isFinalRound ? "waiting" : "betweenRounds",
    currentTurnUid: null,
    previousSet: null,
    currentSet: null,
    tribute: null,
    finishOrder: final,
    lastRoundResult: {
      round: room.round,
      results: final,
      endedAt: ts()
    },
    finalGameResult: isFinalRound
      ? {
          round: room.round,
          standings: finalStandings,
          endedAt: ts()
        }
      : (room.finalGameResult || null),
    round: isFinalRound ? 0 : room.round,
    updatedAt: serverNow()
  };
}

  async function passTurn() { await passAs(S.user); }

  async function passAs(uid) {
    const room = S.room;
    if (!room || room.status !== "playing" || room.currentTurnUid !== uid || !room.currentSet) return;
    const players = playersMap(room);
    if (!players[uid]) return;
    players[uid] = { ...players[uid], passed: true };
    const owner = room.currentSet.uid;
    const active = Object.values(players).filter(p => p && !p.finished && !p.forfeited).map(p => p.uid);
    const opponents = active.filter(id => id !== owner);
    const passed = new Set(Object.values(players).filter(p => p && p.passed).map(p => p.uid));
    const everyoneElsePassed = opponents.every(id => passed.has(id));
    const next = everyoneElsePassed ? ((players[owner] && !players[owner].finished && !players[owner].forfeited) ? owner : nextAfter({ ...room, players }, owner)) : nextAfter({ ...room, players }, uid);
    if (everyoneElsePassed) Object.keys(players).forEach(pid => { players[pid] = { ...players[pid], passed: false }; });
    await roomRef().set({ players, currentTurnUid: next, previousSet: everyoneElsePassed ? room.currentSet : room.previousSet || null, currentSet: everyoneElsePassed ? null : room.currentSet, updatedAt: serverNow() }, { merge: true });
  }

async function returnTribute(uid, cards, hand) {
  const latestSnap = await roomRef().get();
  if (!latestSnap.exists) return;

  const room = latestSnap.data();
  if (!room || room.status !== "tributeReturn") return;

  const pair = (room.tribute?.pairs || []).find(p => p.toUid === uid && !p.returned);
  if (!pair) return;

  const selectedIds = new Set((cards || []).map(c => c.id));

  const toSnap = await handRef(uid).get();
  const toHand = sortHand(toSnap.exists ? (toSnap.data().hand || []) : []);

  const returnCards = toHand.filter(c => selectedIds.has(c.id));

  if (returnCards.length !== pair.count) {
    if (uid === S.user) {
      toast(`${pair.count}장을 선택해야 합니다.`);
    }
    return;
  }

  const fromSnap = await handRef(pair.fromUid).get();
  const fromHand = sortHand(fromSnap.exists ? (fromSnap.data().hand || []) : []);

  const returnIds = new Set(returnCards.map(c => c.id));
  const newToHand = sortHand(toHand.filter(c => !returnIds.has(c.id)));
  const newFromHand = sortHand(fromHand.concat(returnCards));

  const pairs = (room.tribute?.pairs || []).map(p => {
    if (p.id !== pair.id) return p;

    return {
      ...p,
      returned: true,
      returnedCards: returnCards
    };
  });

  const done = pairs.every(p => p.returned);
  const nextPair = pairs.find(p => !p.returned) || null;

  const players = playersMap(room);

  if (players[uid]) {
    players[uid] = {
      ...players[uid],
      cardCount: newToHand.length
    };
  }

  if (players[pair.fromUid]) {
    players[pair.fromUid] = {
      ...players[pair.fromUid],
      cardCount: newFromHand.length
    };
  }

  const first = allPlayers({ ...room, players })[0]?.uid || null;

  const batch = db.batch();

  batch.set(handRef(uid), {
    hand: newToHand
  });

  batch.set(handRef(pair.fromUid), {
    hand: newFromHand
  });

  batch.set(roomRef(), {
    players,
    tribute: {
      ...(room.tribute || {}),
      pairs
    },
    status: done ? "playing" : "tributeReturn",
    currentTurnUid: done ? first : nextPair.toUid,
    updatedAt: serverNow()
  }, { merge: true });

  if (uid === S.user) {
    S.selected.clear();
    clearTributeReturnSelection();
  }

  await batch.commit();

  if (done) {
    await addSystem(`${room.round}라운드가 시작되었습니다.`);
  }
}

  function weakestCards(hand, count) {
    const normal = sortHand(hand || []).filter(c => !(c.joker || Number(c.rank) === 13)).reverse();
    const jokers = sortHand(hand || []).filter(c => c.joker || Number(c.rank) === 13);
    return normal.concat(jokers).slice(0, count);
  }

  function chooseAiCards(room, hand) {
    hand = sortHand(hand || []);
    if (!hand.length) return [];

    const normalHand = hand.filter(c => !(c.joker || Number(c.rank) === 13));
    const jokers = hand.filter(c => c.joker || Number(c.rank) === 13);
    const groups = groupHand(normalHand);

    // 새 판을 여는 경우: 복수 카드 조합 우선
    if (!room.currentSet) {
      const multiGroups = groups
        .filter(g => g.items.length >= 2)
        .sort((a, b) =>
          b.items.length - a.items.length ||
          b.rank - a.rank
        );

      if (multiGroups.length) {
        const g = multiGroups[0];
        return g.items.slice();
      }

      const weakestNormal = normalHand.slice().sort((a, b) => Number(b.rank) - Number(a.rank))[0];
      if (weakestNormal) return [weakestNormal];

      return jokers.slice(0, 1);
    }

    const need = Number(room.currentSet.count || 1);
    const targetRank = Number(room.currentSet.effectiveRank);

    // 상대가 여러 장을 냈으면, 같은 장수로 이길 수 있는 조합을 찾음
    // 같은 장수 조건 안에서 가장 약하게 이기는 조합을 우선 사용
    const candidates = groups
      .filter(g => g.rank < targetRank && g.items.length + jokers.length >= need)
      .sort((a, b) => b.rank - a.rank);

    for (const g of candidates) {
      const normal = g.items.slice(0, Math.min(g.items.length, need));
      const extra = jokers.slice(0, Math.max(0, need - normal.length));
      return normal.concat(extra);
    }

    return [];
  }

  const chooseReturnCards = (hand, count) => {
  const sorted = sortHand(hand || []);
  const nonJokers = sorted.filter(c => !(c.joker || Number(c.rank) === 13));
  const jokers = sorted.filter(c => c.joker || Number(c.rank) === 13);

  return nonJokers.slice(-count).concat(jokers).slice(0, count);
};

async function maybeClientTasks() {
  await maybeAssignHostIfNeeded();

  // AI/자동 조작은 방장 클라이언트가 대신 처리
  if (!isHost() || S.actionBusy) return;

  await maybeAutoHostStart();
  maybeAiAction();
}

async function maybeAutoHostStart() {
  const room = S.room;
  if (!room || !isHost(room)) return;

  const host = playersMap(room)[room.hostUid];
  if (host?.isAI) return;
  if (!host?.autoPlay) return;

  // 대기방 자동 시작
  if (room.status === "waiting") {
    const ps = allPlayers(room);
    if (ps.length < 2) return;

    const allReady = ps.every(p =>
      p.uid === room.hostUid ||
      p.isReady ||
      p.isAI
    );

    if (!allReady) return;

    const key = `${S.roomId}:autostart:waiting:${room.updatedAt?.seconds || 0}_${room.updatedAt?.nanoseconds || 0}:${ps.length}`;
    if (S.aiLocks.has(key)) return;
    S.aiLocks.add(key);

    await startGame();
    return;
  }

  // 라운드 종료 후 자동 다음 라운드 시작
  if (room.status === "betweenRounds") {
    const key = `${S.roomId}:autostart:next:${room.round}:${room.updatedAt?.seconds || 0}_${room.updatedAt?.nanoseconds || 0}`;
    if (S.aiLocks.has(key)) return;
    S.aiLocks.add(key);

    await nextRound(false);
  }
}
  
  function maybeAiAction() {
    const room = S.room;
    if (!room || !isHost(room)) return;
    if (room.status === "tributeReturn") {
      const pair = (room.tribute?.pairs || []).find(p => {
        const target = playersMap(room)[p.toUid];
        return !p.returned && (target?.isAI || target?.autoPlay);
      });
      if (!pair) return;
      const key = `${S.roomId}:tribute:${room.round}:${pair.id}`;
      if (S.aiLocks.has(key)) return;
      S.aiLocks.add(key);
      setTimeout(async () => {
        const snap = await roomRef().get();
        if (!snap.exists) return;
        const latest = snap.data();
        const latestPair = (latest.tribute?.pairs || []).find(p => p.id === pair.id && !p.returned);
        if (!latestPair) return;
        const hs = await handRef(pair.toUid).get();
        const hand = hs.exists ? (hs.data().hand || []) : [];
        const old = S.room;
        S.room = latest;
        try { await returnTribute(pair.toUid, chooseReturnCards(hand, pair.count), hand); } finally { S.room = old; }
      }, AI_DELAY);
      return;
    }
    if (room.status !== "playing" || !room.currentTurnUid) return;
    const ai = playersMap(room)[room.currentTurnUid];
    if (!(ai?.isAI || ai?.autoPlay) || ai.finished || ai.forfeited) return;
    const stamp = room.updatedAt ? `${room.updatedAt.seconds || 0}_${room.updatedAt.nanoseconds || 0}` : Date.now();
    const key = `${S.roomId}:ai:${room.round}:${ai.uid}:${room.currentSet?.uid || "new"}:${stamp}`;
    if (S.aiLocks.has(key)) return;
    S.aiLocks.add(key);
    setTimeout(async () => {
      const snap = await roomRef().get();
      if (!snap.exists) return;
      const latest = snap.data();
      const latestAi = playersMap(latest)[ai.uid];
      if (latest.status !== "playing" || latest.currentTurnUid !== ai.uid || !(latestAi?.isAI || latestAi?.autoPlay)) return;
      const hs = await handRef(ai.uid).get();
      const hand = hs.exists ? (hs.data().hand || []) : [];
      const cards = chooseAiCards(latest, hand);
      const old = S.room;
      S.room = latest;
      try { if (cards.length) await applyPlay(ai.uid, cards, hand); else await passAs(ai.uid); } finally { S.room = old; }
    }, AI_DELAY);
  }

async function maybeAssignHostIfNeeded() {
  const room = S.room;
  if (!room || room.closed || S.hostAssigning) return;

  const currentHost =
    playersMap(room)[room.hostUid] ||
    spectatorsMap(room)[room.hostUid] ||
    null;

  // 사람 방장이 있으면 유지, AI 방장이면 재배정 대상으로 봄
  if (currentHost && !currentHost.isAI && !currentHost.removedFromRoom) return;

  S.hostAssigning = true;

  try {
    const latestSnap = await roomRef().get();
    if (!latestSnap.exists) return;

    const latest = latestSnap.data();
    const latestPlayers = playersMap(latest);
    const latestSpecs = spectatorsMap(latest);

    const latestHost =
      latestPlayers[latest.hostUid] ||
      latestSpecs[latest.hostUid] ||
      null;

    if (latestHost && !latestHost.isAI && !latestHost.removedFromRoom) return;

    if (!hasHumanInRoom(latestPlayers, latestSpecs)) {
      await closeRoomIfNoHuman(S.roomId, latestPlayers, latestSpecs);
      return;
    }

    const next =
      allPlayers(latest).find(p => p && !p.isAI && !p.removedFromRoom) ||
      spectators(latest).find(p => p && !p.isAI && !p.removedFromRoom);

    if (next) {
      await roomRef().set({
        hostUid: next.uid,
        hostNickname: next.nickname,
        updatedAt: serverNow()
      }, { merge: true });
    } else {
      await closeRoomIfNoHuman(S.roomId, latestPlayers, latestSpecs);
    }
  } finally {
    S.hostAssigning = false;
  }
}

  async function sendChat() {
    const text = (E.chatInput?.value || "").trim();
    if (!text || !S.roomId || !S.room) return;
    const mine = me();
    if (mine?.type === "spectator" && S.room.spectatorChatEnabled === false) return toast("관전자 채팅이 차단되어 있습니다.");
    E.chatInput.value = "";
    await appendChat({ type: "chat", uid: S.user, nickname: mine?.nickname || S.user, text });
  }

  async function saveSettings() {
    if (!isHost() || S.room?.status !== "waiting") return;
    const title = ($("setTitle")?.value || "달무티 in 조선").trim();
    const raw = Number($("setRounds")?.value || 5);
    await roomRef().set({ title, totalRounds: raw === 0 ? null : raw, updatedAt: serverNow() }, { merge: true });
    await addSystem("방 설정이 변경되었습니다.");
  }

  async function toggleSpectatorChat() {
    if (!isHost()) return;
    await roomRef().set({ spectatorChatEnabled: S.room?.spectatorChatEnabled === false, updatedAt: serverNow() }, { merge: true });
  }

  async function kick(uid) {
    if (uid === S.user || !S.roomId) return;
    const latestSnap = await roomRef().get();
    if (!latestSnap.exists) return toast("방 정보를 찾을 수 없습니다.");
    const room = latestSnap.data();
    if (!(room.hostUid === S.user || isMaster())) return toast("방장만 강퇴할 수 있습니다.");

    const players = playersMap(room);
    const specs = spectatorsMap(room);
    const kicked = kickedMap(room);
    const target = players[uid] || specs[uid];
    if (!target) return toast("이미 방에 없는 대상입니다.");
    if (!confirm(`${target.nickname || uid}님을 방에서 내보낼까요?`)) return;

    const oldRoom = { ...room, players: { ...players }, spectators: { ...specs } };
    if (players[uid]) delete players[uid];
    if (specs[uid]) delete specs[uid];
    kicked[uid] = { uid, nickname: target.nickname || uid, by: S.user, at: Date.now() };

    let currentTurnUid = room.currentTurnUid;
    let currentSet = room.currentSet || null;
    let previousSet = room.previousSet || null;
    let tribute = room.tribute || null;

    if (currentTurnUid === uid) currentTurnUid = nextAfterKick(oldRoom, uid, players);
    if (currentSet?.uid === uid) {
      previousSet = currentSet;
      currentSet = null;
      currentTurnUid = nextAfterKick(oldRoom, uid, players);
    }
    if (tribute?.pairs) {
      const pairs = tribute.pairs
        .filter(p => p.fromUid !== uid && p.toUid !== uid)
        .map(p => ({ ...p }));
      tribute = pairs.length ? { ...tribute, pairs } : null;
    }

    const finishOrder = (room.finishOrder || []).filter(x => x.uid !== uid);
    const update = { players, spectators: specs, kicked, playerCount: countMap(players), spectatorCount: countMap(specs), currentTurnUid, currentSet, previousSet, tribute, finishOrder, updatedAt: serverNow() };
    if (!hasHumanInRoom(players, specs)) {
  const batch = db.batch();
  batch.set(roomRef(), {
    closed: true,
    status: "closed",
    players: {},
    spectators: {},
    kicked,
    playerCount: 0,
    spectatorCount: 0,
    currentTurnUid: null,
    currentSet: null,
    previousSet: null,
    tribute: null,
    finishOrder: [],
    updatedAt: serverNow()
  }, { merge: true });
  batch.delete(handRef(uid));
  await batch.commit();
  await clearSubcollection(roomRef().collection("hands")).catch(() => null);
  return;
}
    const alive = Object.values(players).filter(p => p && !p.finished && !p.forfeited && !p.removedFromRoom);
    if (["playing", "tributeReturn"].includes(room.status) && alive.length <= 1) {
      const final = finishOrder.slice();
      if (alive[0]) final.push({ uid: alive[0].uid, nickname: alive[0].nickname, rank: final.length + 1, finishedAt: ts() });
      Object.assign(update, finishRoundUpdate({ ...room, tribute }, players, final));
    }

    const batch = db.batch();
    batch.set(roomRef(), update, { merge: true });
    batch.delete(handRef(uid));
    await batch.commit();
    await appendSystemFrom({ ...room, chatPreview: room.chatPreview || [] }, `${target.nickname || uid}님이 방장에 의해 강퇴되었습니다.`);
  }

async function closeRoomIfNoHuman(roomId = S.roomId, players = playersMap(), specs = spectatorsMap()) {
  if (!roomId) return false;
  if (hasHumanInRoom(players, specs)) return false;

  const ref = roomRef(roomId);

  await clearSubcollection(ref.collection("hands")).catch(() => null);

  await ref.set({
    closed: true,
    status: "closed",
    players: {},
    spectators: {},
    playerCount: 0,
    spectatorCount: 0,
    currentTurnUid: null,
    currentSet: null,
    previousSet: null,
    tribute: null,
    updatedAt: serverNow()
  }, { merge: true });

  return true;
}
  
  async function clearSubcollection(col) {
    while (true) {
      const snap = await col.limit(300).get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  async function deleteRoom() {
    if (!canAdmin()) return toast("방장 또는 병풍만 방을 삭제할 수 있습니다.");
    if (!confirm("방을 완전히 삭제할까요?")) return;
    const id = S.roomId;
    const ref = roomRef(id);
    await clearSubcollection(ref.collection("hands"));
    await ref.delete();
    alert("방이 완전히 삭제되었습니다.");
    leaveLocal();
  }

  async function stopGame() {
    if (!isHost()) return;
    if (!confirm("현재 게임을 중지할까요? 진행 중인 라운드, 손패, 점수, 계급 정보가 초기화되고 대기방으로 돌아갑니다.")) return;
    const players = {};
    allPlayers().forEach((p, i) => { players[p.uid] = { ...p, isReady: !!p.isAI, seatOrder: i, role: null, score: 0, lastRoundScore: 0, lastRoundRank: null, cardCount: 0, passed: false, finished: false, finishedRank: null, forfeited: false }; });
    const batch = db.batch();
    batch.set(roomRef(), { players, status: "waiting", round: 0, currentTurnUid: null, currentSet: null, previousSet: null, tribute: null, finishOrder: [], lastRoundResult: null, rebellionNotice: null, updatedAt: serverNow() }, { merge: true });
    Object.keys(players).forEach(uid => batch.set(handRef(uid), { hand: [] }));
    await batch.commit();
    await addSystem("방장이 게임을 중지했습니다.");
  }

  function showModal(
    title,
    body,
    actions = `<button class="btn primary" onclick="Dalmuti.closeModal()">확인</button>`,
    autoCloseMs = 0
  ) {
    const card = $("gameModalCard");
    const modal = $("gameModal");
    if (!card || !modal) return;

    clearTimeout(showModal.autoCloseTimer);

    card.innerHTML = `<div class="modal-head"><h2>${title}</h2></div>${body}<div class="modal-actions">${actions}</div>`;
    modal.classList.add("show");

    if (autoCloseMs > 0) {
      showModal.autoCloseTimer = setTimeout(() => {
        closeModal();
      }, autoCloseMs);
    }
  }

  function closeModal() {
    clearTimeout(showModal.autoCloseTimer);
    $("gameModal")?.classList.remove("show");
  }

  function modalRows(players, mode) {
    const office = isOfficeMode();

    const header = office
      ? `<div class="modal-row header"><span>순번</span><span>담당자</span><span>${mode === "start" ? "점수" : "처리"}</span><span>역할</span></div>`
      : `<div class="modal-row header"><span>순위</span><span>닉네임</span><span>${mode === "start" ? "점수" : "획득"}</span><span>계급</span></div>`;

    return `<div class="modal-table">${header}${players.map((p, i) => {
      const rankText = mode === "start" ? i + 1 : (p.lastRoundRank || i + 1);
      const pointText = mode === "start" ? (p.score || 0) : `+${p.lastRoundScore || 0}`;
      const roleText = office ? officeRoleName(p.role || "-") : (p.role || "-");

      return `
        <div class="modal-row">
          <span>${office ? rankText : `${rankText}등`}</span>
          <span>${esc(p.nickname)}</span>
          <strong>${pointText}</strong>
          <span>${esc(roleText)}</span>
        </div>
      `;
    }).join("")}</div>`;
  }

  function maybeStartModal() {
    const room = S.room;
    if (!room || !["playing", "tributeReturn"].includes(room.status) || !room.round) return;

    const key = `dalmuti:${S.roomId}:start:${room.roundKey || room.round}`;
    if (markSeen(S.seenStart, key)) return;

    const office = isOfficeMode();

    const show = () => showModal(
      office ? `${officeRoundText(room)} 시작 보고` : `${room.round}라운드 시작`,
      office
        ? `<p class="muted">이번 시트의 담당 역할과 현재 누적값입니다.</p>${modalRows(allPlayers(), "start")}${room.status === "tributeReturn" ? `<p class="muted">검토자료 반환 단계가 진행됩니다.</p>` : ""}`
        : `<p class="muted">이번 라운드 배정 계급과 현재 점수입니다.</p>${modalRows(allPlayers(), "start")}${room.status === "tributeReturn" ? `<p class="muted">상납 단계가 진행됩니다.</p>` : ""}`,
      undefined,
      10000
    );

    if (room.rebellionNotice?.round === room.round) setTimeout(show, 5100);
    else show();
  }

  function maybeResultModal() {
    const room = S.room;
    if (!room || !["betweenRounds", "finished"].includes(room.status) || !room.lastRoundResult) return;

    const key = `dalmuti:${S.roomId}:result:${room.lastRoundResult.round}`;
    if (markSeen(S.seenResult, key)) return;

    const office = isOfficeMode();

    const actions = isHost() && room.status === "betweenRounds"
      ? `<button class="btn primary" onclick="Dalmuti.nextRound()">${office ? "다음 시트 열기" : "다음 라운드 시작"}</button><button class="btn ghost" onclick="Dalmuti.closeModal()">닫기</button>`
      : `<button class="btn primary" onclick="Dalmuti.closeModal()">확인</button>`;

    showModal(
      office ? `${room.lastRoundResult.round}번 시트 처리 결과` : `${room.lastRoundResult.round}라운드 결과`,
      modalRows(allPlayers().slice().sort((a, b) => (a.lastRoundRank ?? 999) - (b.lastRoundRank ?? 999)), "result"),
      actions,
      10000
    );
  }

  function maybeRebellionModal() {
    const n = S.room?.rebellionNotice;
    if (!n) return;

    const key = `dalmuti:${S.roomId}:rebellion:${n.round}:${n.uid}`;
    if (markSeen(S.seenRebellion, key)) return;

    const card = $("rebellionModalCard");
    const modal = $("rebellionModal");
    if (!card || !modal) return;

    const office = isOfficeMode();

    card.innerHTML = office
      ? `<h2>예외 처리 발생</h2><p>${esc(n.nickname || "누군가")}님의 예외 항목이 감지되었습니다.</p><p>처리 우선순위가 재정렬됩니다.</p>`
      : `<img src="${cardImg(13)}"><h2>민란 발생</h2><p>${esc(n.nickname || "누군가")}님의 홍길동이 민란을 일으켰습니다</p><p>모든 계급이 반대로 뒤집힙니다.</p>`;

    modal.classList.add("show");
    setTimeout(() => modal.classList.remove("show"), 5000);
  }

  function showHelp() {
    if (isOfficeMode()) {
      showModal(
        "업무 기준",
        `<div class="help-section"><strong>목표</strong><br>미처리 항목을 먼저 정리할수록 높은 처리 순위를 얻습니다.</div>
        <div class="help-section"><strong>처리</strong><br>같은 구분의 항목을 여러 건 한 번에 처리할 수 있습니다. 이미 처리 항목이 올라와 있으면 같은 수량이면서 더 높은 우선순위 항목만 처리할 수 있습니다.</div>
        <div class="help-section"><strong>예외</strong><br>예외 항목은 일반 항목과 함께 처리될 수 있으며, 단독 처리 시 최저 우선순위로 취급됩니다.</div>
        <div class="help-section"><strong>검토자료 반환</strong><br>하위 담당자가 상위 담당자에게 자료를 이관하고, 받은 담당자는 같은 수량만큼 자료를 반환합니다.</div>`
      );
      return;
    }

    showModal(
      "게임 방법",
      `<div class="help-section"><strong>목표</strong><br>손패를 먼저 털수록 높은 순위를 얻고, 라운드마다 승점을 얻습니다.</div>
      <div class="help-section"><strong>제출</strong><br>같은 계급 여러 장을 낼 수 있습니다. 이미 카드가 깔려 있으면 같은 장수이면서 더 높은 계급만 낼 수 있습니다.</div>
      <div class="help-section"><strong>홍길동</strong><br>일반 카드와 함께 내면 그 계급 카드로 취급합니다. 홍길동만 내면 최약 카드 취급입니다.</div>
      <div class="help-section"><strong>상납</strong><br>2라운드부터 하위 계급자가 상위 계급자에게 좋은 카드를 자동 상납하고, 받은 사람은 같은 장수만큼 돌려줍니다.</div>
      <div class="help-section"><strong>민란</strong><br>백정 또는 노비가 홍길동 2장을 들면 계급 순서가 뒤집힙니다.</div>`
    );
  }


  function applyOfficeMode(enabled) {
    document.body.classList.toggle("office-mode", !!enabled);
    localStorage.setItem("dalmutiOfficeMode", enabled ? "1" : "0");

    const label = enabled ? "원래대로" : "눈치보기";
    const topbarTitle = document.querySelector(".dalmuti-topbar h1");
if (topbarTitle) {
  if (!topbarTitle.dataset.originalText) {
    topbarTitle.dataset.originalText = topbarTitle.textContent || "";
  }

  topbarTitle.textContent = enabled
    ? "업무 현황 관리표"
    : (topbarTitle.dataset.originalText || "달무티 in 조선");
}

    const officeBtn = $("officeModeBtn");
    if (officeBtn) officeBtn.textContent = label;

    const mobileOfficeBtn = $("mobileOfficeModeBtn");
    if (mobileOfficeBtn) mobileOfficeBtn.textContent = label;

    const mobileChatBtn = $("mobileChatBtn");
    if (mobileChatBtn) mobileChatBtn.textContent = enabled ? "📝" : "💬";

    if (S.room) {
      safeRender("header", renderHeader);
      safeRender("players", renderPlayers);
      safeRender("pile", renderPile);
      safeRender("hand", renderHand);
      safeRender("controls", renderControls);
      safeRender("chat", renderChat);
      safeRender("side", renderSide);
    }
  }

  function toggleOfficeMode() {
    applyOfficeMode(!document.body.classList.contains("office-mode"));
  }
  
  function closeMobilePanels() {
    document.body.classList.remove("mobile-menu-open", "mobile-chat-open");
  }

  function toggleMobileMenu() {
    const open = document.body.classList.contains("mobile-menu-open");
    closeMobilePanels();
    if (!open) document.body.classList.add("mobile-menu-open");
  }

  function toggleMobileChat() {
    const open = document.body.classList.contains("mobile-chat-open");
    closeMobilePanels();

    if (!open) {
      document.body.classList.add("mobile-chat-open");
      markChatSeen();
    } else {
      updateMobileChatBadge();
    }
  }

  function bindEvents() {
    if (E.leaveRoomBtn) E.leaveRoomBtn.onclick = leaveRoom;
    const mobileLeaveRoomBtn = $("mobileLeaveRoomBtn");
if (mobileLeaveRoomBtn) mobileLeaveRoomBtn.onclick = leaveRoom;
    if (E.createRoomBtn) E.createRoomBtn.onclick = showCreateRoomModal;
if ($("modalCreateRoomBtn")) $("modalCreateRoomBtn").onclick = createRoom;
if ($("modalCreateCancelBtn")) $("modalCreateCancelBtn").onclick = closeCreateRoomModal;
    if (E.refreshRoomsBtn) E.refreshRoomsBtn.onclick = loadRooms;
    if (E.readyBtn) E.readyBtn.onclick = toggleReady;
    if (E.watchBtn) E.watchBtn.onclick = becomeSpectator;
    if (E.joinAsPlayerBtn) E.joinAsPlayerBtn.onclick = becomePlayer;
    if (E.startBtn) E.startBtn.onclick = startGame;
    if (E.nextRoundBtn) E.nextRoundBtn.onclick = () => nextRound(false);
    if (E.resetGameBtn) E.resetGameBtn.onclick = stopGame;
if (E.playBtn) E.playBtn.onclick = playSelected;
if (E.passBtn) E.passBtn.onclick = passTurn;
const autoBtn = $("autoPlayBtn");
if (autoBtn) autoBtn.onclick = toggleAutoPlay;
const mobileAutoBtn = $("mobileAutoPlayBtn");
if (mobileAutoBtn) mobileAutoBtn.onclick = toggleAutoPlay;
const mobileMenuBtn = $("mobileMenuBtn");
if (mobileMenuBtn) mobileMenuBtn.onclick = toggleMobileMenu;
const mobileChatBtn = $("mobileChatBtn");
if (mobileChatBtn) mobileChatBtn.onclick = toggleMobileChat;
const mobilePanelBackdrop = $("mobilePanelBackdrop");
if (mobilePanelBackdrop) mobilePanelBackdrop.onclick = closeMobilePanels;

const officeModeBtn = $("officeModeBtn");
if (officeModeBtn) officeModeBtn.onclick = toggleOfficeMode;

const mobileOfficeModeBtn = $("mobileOfficeModeBtn");
if (mobileOfficeModeBtn) mobileOfficeModeBtn.onclick = toggleOfficeMode;
    
if (E.sendChatBtn) E.sendChatBtn.onclick = sendChat;
        const emojiToggleBtn = $("emojiToggleBtn");
    const emojiPanel = $("emojiPanel");

    if (emojiToggleBtn && emojiPanel) {
      emojiToggleBtn.onclick = () => {
        emojiPanel.classList.toggle("show");
      };

      emojiPanel.querySelectorAll(".emoji-btn").forEach(btn => {
        btn.onclick = () => {
          const emoji = btn.dataset.emoji || btn.textContent || "";

          if (E.chatInput) {
            E.chatInput.value += emoji;
            E.chatInput.focus();
          }

          emojiPanel.classList.remove("show");
        };
      });
    }
    if (E.chatInput) E.chatInput.onkeydown = e => { if (e.key === "Enter") sendChat(); };
    if (E.toggleSpectatorChatBtn) E.toggleSpectatorChatBtn.onclick = toggleSpectatorChat;
  }

  async function init() {
    injectCss();
    collectElements();
    ensureModals();
    S.user = String(localStorage.getItem("partyAppUser") || "").trim();
    if (!S.user) return alert("닉네임을 입력하세요.");
    if (E.myNickname) E.myNickname.textContent = S.user;
enhanceLobbyLayout();
renderRankPreview();
bindEvents();
applyOfficeMode(localStorage.getItem("dalmutiOfficeMode") === "1");
await loadRooms();
    if (S.roomId) {
      const snap = await roomRef(S.roomId).get().catch(() => null);
      const data = snap?.exists ? snap.data() : null;
      if (data && !data.closed && !kickedMap(data)[S.user] && (playersMap(data)[S.user] || spectatorsMap(data)[S.user])) enterRoom(S.roomId);
      else localStorage.removeItem("dalmutiCurrentRoomId");
    }
  }

  window.Dalmuti = {
  joinRoom,
  toggleRank,
  saveSettings,
  toggleSpectatorChat,
  kick,
  deleteRoom,
  stopGame,
  addAI,
  nextRound: () => nextRound(false),
  forceRebellion: () => nextRound(true),
  closeModal,
  showHelp,
  becomePlayer,
  forceSpectator
};

  window.addEventListener("DOMContentLoaded", init);
})();
