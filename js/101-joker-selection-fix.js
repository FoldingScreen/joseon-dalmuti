(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const CARD_RANK = 13;
  const ROOM_PATH = ["events", "dalmuti", "rooms"];

  const roomCol = () => db.collection(ROOM_PATH[0]).doc(ROOM_PATH[1]).collection(ROOM_PATH[2]);
  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const serverNow = () => FV.serverTimestamp();

  function isJoker(card) {
    return !!card && (card.joker || Number(card.rank) === CARD_RANK);
  }

  function sortHand(hand = []) {
    return hand.slice().sort((a, b) => Number(a.rank) - Number(b.rank) || String(a.id || "").localeCompare(String(b.id || "")));
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

  function selectedKey(roomId, user) {
    return `dalmuti:jokerSelection:${roomId}:${user}`;
  }

  function readSelection(roomId, user) {
    try {
      return JSON.parse(sessionStorage.getItem(selectedKey(roomId, user)) || "null") || null;
    } catch (err) {
      return null;
    }
  }

  function writeSelection(roomId, user, selection) {
    if (!roomId || !user || !selection) return;
    sessionStorage.setItem(selectedKey(roomId, user), JSON.stringify(selection));
  }

  function clearSelection(roomId, user) {
    if (!roomId || !user) return;
    sessionStorage.removeItem(selectedKey(roomId, user));
  }

  function selectionCards(hand, selection) {
    if (!selection || !Array.isArray(selection.ids)) return [];
    const ids = new Set(selection.ids);
    return sortHand(hand).filter(card => ids.has(card.id));
  }

  function canPlayCombo(cards, currentSet) {
    if (!cards.length) return false;
    const normal = cards.filter(card => !isJoker(card));
    const ranks = [...new Set(normal.map(card => Number(card.rank)))];
    if (ranks.length !== 1) return false;
    if (cards.length !== Number(currentSet?.count || 1)) return false;
    return Number(ranks[0]) < Number(currentSet?.effectiveRank);
  }

  function baseSelectionForRank(hand, rank, currentSet) {
    const need = Number(currentSet?.count || 1);
    const normalItems = sortHand(hand).filter(card => !isJoker(card) && Number(card.rank) === Number(rank));
    const jokerItems = sortHand(hand).filter(isJoker);
    const minJokers = Math.max(0, need - normalItems.length);
    const normalNeed = need - minJokers;
    const cards = normalItems.slice(0, normalNeed).concat(jokerItems.slice(0, minJokers));

    if (!canPlayCombo(cards, currentSet)) return null;

    return {
      rank: Number(rank),
      jokerCount: minJokers,
      ids: cards.map(card => card.id)
    };
  }

  function nextJokerSelection(hand, selection, currentSet) {
    if (!selection || !selection.rank || !currentSet) return null;

    const need = Number(currentSet.count || 1);
    const rank = Number(selection.rank);
    const normalItems = sortHand(hand).filter(card => !isJoker(card) && Number(card.rank) === rank);
    const jokerItems = sortHand(hand).filter(isJoker);

    const minJokers = Math.max(0, need - normalItems.length);
    const maxJokers = Math.min(jokerItems.length, need - 1);
    if (maxJokers < minJokers) return null;

    const current = Number(selection.jokerCount || 0);
    const nextJokers = current < maxJokers ? current + 1 : minJokers;
    const normalNeed = need - nextJokers;
    const cards = normalItems.slice(0, normalNeed).concat(jokerItems.slice(0, nextJokers));

    if (!canPlayCombo(cards, currentSet)) return null;

    return {
      rank,
      jokerCount: nextJokers,
      ids: cards.map(card => card.id)
    };
  }

  function refreshVisualSelection() {
    const roomId = currentRoomId();
    const user = currentUser();
    const selection = readSelection(roomId, user);
    const selectedIds = new Set(selection?.ids || []);

    document.querySelectorAll(".hand-stack").forEach(stack => {
      const clickText = String(stack.getAttribute("onclick") || "");
      const rankMatch = clickText.match(/toggleRank\((\d+)\)/);
      const rank = Number(rankMatch?.[1] || 0);
      if (!rank) return;

      const selectedInStack = Array.from(selectedIds).length && selection?.rank === rank
        ? (selection.ids || []).length - Number(selection.jokerCount || 0)
        : rank === CARD_RANK
          ? Number(selection?.jokerCount || 0)
          : 0;

      stack.classList.toggle("selected", selectedInStack > 0);
      if (rank === CARD_RANK && selection?.rank && Number(selection.jokerCount || 0) >= 0) {
        stack.classList.remove("disabled");
      }

      let badge = stack.querySelector(".stack-selected");
      if (selectedInStack > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "stack-selected";
          stack.insertAdjacentElement("afterbegin", badge);
        }
        badge.textContent = String(selectedInStack);
      } else if (badge) {
        badge.remove();
      }
    });

    const summary = document.getElementById("selectedSummary");
    if (summary && selection?.rank) {
      const normalCount = Number(selection.ids?.length || 0) - Number(selection.jokerCount || 0);
      const jokerCount = Number(selection.jokerCount || 0);
      const rankName = document.querySelector(`.hand-stack[onclick="Dalmuti.toggleRank(${selection.rank})"]`)?.dataset?.name || `${selection.rank}`;
      summary.textContent = jokerCount > 0
        ? `${rankName} ${normalCount}장 + 홍길동 ${jokerCount}장`
        : `${rankName} ${normalCount}장`;
    }
  }

  async function readRoomAndHand() {
    const roomId = currentRoomId();
    const user = currentUser();
    if (!roomId || !user) return null;

    const roomRef = roomCol().doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return null;

    const handSnap = await roomRef.collection("hands").doc(user).get();
    const hand = sortHand(handSnap.exists ? (handSnap.data().hand || []) : []);

    return {
      roomId,
      user,
      roomRef,
      room: roomSnap.data(),
      hand
    };
  }

  async function handleRankClick(rank) {
    const state = await readRoomAndHand();
    if (!state) return false;

    const { roomId, user, room, hand } = state;
    if (room.status !== "playing" || room.currentTurnUid !== user || !room.currentSet) return false;

    const rankNum = Number(rank);
    const currentSet = room.currentSet;

    if (rankNum === CARD_RANK) {
      const current = readSelection(roomId, user);
      if (!current?.rank) return false;

      const next = nextJokerSelection(hand, current, currentSet);
      if (!next) return false;

      writeSelection(roomId, user, next);
      refreshVisualSelection();
      return true;
    }

    const group = groupHand(hand).find(item => Number(item.rank) === rankNum);
    const jokerCount = hand.filter(isJoker).length;
    if (!group || group.items.length + jokerCount < Number(currentSet.count || 1)) return false;
    if (rankNum >= Number(currentSet.effectiveRank)) return false;

    const selection = baseSelectionForRank(hand, rankNum, currentSet);
    if (!selection) return false;

    writeSelection(roomId, user, selection);
    refreshVisualSelection();
    return true;
  }

  async function submitSelected() {
    const state = await readRoomAndHand();
    if (!state) return false;

    const { roomId, user, roomRef, room, hand } = state;
    if (room.status !== "playing" || room.currentTurnUid !== user || !room.currentSet) return false;

    const selection = readSelection(roomId, user);
    const cards = selectionCards(hand, selection);
    if (!canPlayCombo(cards, room.currentSet)) return false;

    const players = Object.fromEntries(Object.entries(room.players || {}).filter(([, v]) => v && typeof v === "object"));
    const player = players[user];
    if (!player) return false;

    const ids = new Set(cards.map(card => card.id));
    const newHand = sortHand(hand.filter(card => !ids.has(card.id)));
    const finishOrder = Array.isArray(room.finishOrder) ? room.finishOrder.slice() : [];
    const finished = newHand.length === 0;
    let finishedRank = player.finishedRank || null;

    if (finished && !player.finished) {
      finishedRank = finishOrder.length + 1;
      finishOrder.push({ uid: user, nickname: player.nickname || user, rank: finishedRank, finishedAt: firebase.firestore.Timestamp.now() });
    }

    Object.keys(players).forEach(uid => {
      players[uid] = { ...players[uid], passed: false };
    });

    players[user] = {
      ...players[user],
      cardCount: newHand.length,
      finished,
      finishedRank,
      passed: false
    };

    const normal = cards.filter(card => !isJoker(card));
    const effectiveRank = Number(normal[0]?.rank || CARD_RANK);
    const effectiveName = normal[0]?.name || "홍길동";
    const set = {
      uid: user,
      nickname: player.nickname || user,
      effectiveRank,
      effectiveName,
      count: cards.length,
      cards,
      createdAt: firebase.firestore.Timestamp.now()
    };

    const turnOrder = Array.isArray(room.turnOrder) && room.turnOrder.length
      ? room.turnOrder.filter(uid => players[uid])
      : Object.values(players)
          .filter(p => p && p.uid)
          .sort((a, b) => (a.seatOrder ?? 999) - (b.seatOrder ?? 999))
          .map(p => p.uid);

    const currentIndex = turnOrder.indexOf(user);
    let next = null;
    for (let i = 1; i <= turnOrder.length; i += 1) {
      const candidate = turnOrder[(currentIndex + i) % turnOrder.length];
      const p = players[candidate];
      if (p && !p.finished && !p.forfeited && !p.removedFromRoom) {
        next = candidate;
        break;
      }
    }

    const batch = db.batch();
    batch.set(roomRef.collection("hands").doc(user), { hand: newHand });
    batch.set(roomRef, {
      players,
      previousSet: room.currentSet || null,
      currentSet: set,
      currentTurnUid: next,
      finishOrder,
      updatedAt: serverNow()
    }, { merge: true });

    await batch.commit();
    clearSelection(roomId, user);
    return true;
  }

  function installClickInterceptor() {
    document.addEventListener("click", event => {
      const stack = event.target.closest?.(".hand-stack");
      if (!stack) return;
      const clickText = String(stack.getAttribute("onclick") || "");
      const match = clickText.match(/toggleRank\((\d+)\)/);
      if (!match) return;

      const rank = Number(match[1]);
      readRoomAndHand().then(state => {
        if (!state?.room?.currentSet || state.room.status !== "playing" || state.room.currentTurnUid !== state.user) return;
        return handleRankClick(rank);
      }).catch(console.error);
    }, true);
  }

  function installSubmitInterceptor() {
    document.addEventListener("click", event => {
      const button = event.target.closest?.("#playBtn");
      if (!button) return;

      readRoomAndHand().then(state => {
        if (!state?.room?.currentSet || state.room.status !== "playing" || state.room.currentTurnUid !== state.user) return;
        const selection = readSelection(state.roomId, state.user);
        if (!selection?.ids?.length) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        submitSelected().then(done => {
          if (!done) {
            if (window.Dalmuti?.toggleRank) clearSelection(state.roomId, state.user);
          }
        }).catch(console.error);
      }).catch(console.error);
    }, true);
  }

  const observer = new MutationObserver(() => refreshVisualSelection());

  window.addEventListener("DOMContentLoaded", () => {
    installClickInterceptor();
    installSubmitInterceptor();
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(refreshVisualSelection, 700);
  });
})();
