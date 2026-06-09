(() => {
  "use strict";

  const EVENT_ID = "warmGangdong";
  const TARGET_COUNT = 1000;
  const ADMIN_ROOM_KEY = "warmGangdongRoomId";
  const PLAYER_ID_KEY = "warmGangdongPlayerId";
  const PLAYER_NAME_KEY = "warmGangdongNickname";

  const $ = id => document.getElementById(id);
  const isAdminPage = document.body.classList.contains("screen-page");
  const isPlayerPage = document.body.classList.contains("player-page");

  let db;
  let roomId = "";
  let myId = localStorage.getItem(PLAYER_ID_KEY) || "";
  let myCount = 0;
let roomUnsub = null;
let playersUnsub = null;
let playerPollTimer = null;

let successDismissed = false;
let pendingFans = 0;
let fanFlushTimer = null;
let fanFlushing = false;

  function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }

  function roomRef(id = roomId) {
    return db.collection("events").doc(EVENT_ID).collection("rooms").doc(id);
  }

  function playerRef(id = myId) {
    return roomRef().collection("players").doc(id);
  }

  function getJoinUrl(id) {
    const url = new URL("./index.html", location.href);
    url.searchParams.set("room", id);
    return url.toString();
  }

  function getRoomIdFromUrl() {
    return new URLSearchParams(location.search).get("room") || "";
  }

  function ensurePlayerId() {
    if (myId) return myId;
    myId = "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(PLAYER_ID_KEY, myId);
    return myId;
  }

function setProgress(total) {
  const percent = Math.min(100, Math.floor(Number(total || 0) / TARGET_COUNT * 100));

  if ($("thermoFill")) $("thermoFill").style.height = percent + "%";
  if ($("temperatureText")) $("temperatureText").textContent = percent + "%";
  if ($("totalFanText")) $("totalFanText").textContent = `전체 부채질 ${Number(total || 0).toLocaleString()}회`;
  if ($("miniProgressFill")) $("miniProgressFill").style.width = percent + "%";
  if ($("miniProgressText")) $("miniProgressText").textContent = percent + "%";
  if ($("fire")) $("fire").style.setProperty("--fire-scale", String(1 + percent / 120));

  const overlay = $("successOverlay");

  if (percent >= 100 && !successDismissed) {
    overlay?.classList.remove("hidden");
  } else {
    overlay?.classList.add("hidden");
  }

  if (percent < 100) {
    successDismissed = false;
  }
}

function popWind() {
  const layer = $("windLayer");
  if (!layer) return;

  const el = document.createElement("span");
  el.className = "wind";
  el.style.left = `${40 + Math.random() * 80}px`;
  el.style.top = `${120 + Math.random() * 90}px`;
  layer.appendChild(el);

  setTimeout(() => el.remove(), 800);
}

  function renderRanking(players) {
    const list = $("rankingList");
    if (!list) return;

    const rows = Object.values(players || {})
      .filter(p => p && p.nickname)
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
      .slice(0, 10);

    list.innerHTML = rows.length
      ? rows.map((p, i) => `<li><span>${i + 1}위 ${esc(p.nickname)}</span><strong>${Number(p.count || 0).toLocaleString()}회</strong></li>`).join("")
      : `<li><span>아직 참여자가 없습니다</span><strong>0회</strong></li>`;
  }

  function updateQr(id) {
    const img = $("qrImage");
    if (!img) return;

    const url = getJoinUrl(id);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  }

  async function createRoom() {
    const ref = db.collection("events").doc(EVENT_ID).collection("rooms").doc();

    await ref.set({
      code: makeCode(),
      totalCount: 0,
      targetCount: TARGET_COUNT,
      status: "playing",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    localStorage.setItem(ADMIN_ROOM_KEY, ref.id);
    subscribeRoom(ref.id);
  }

  async function resetRoom() {
    if (!roomId) return;
    if (!confirm("현재 행사를 0회로 초기화할까요?")) return;

    const players = await roomRef().collection("players").get();
    const batch = db.batch();

    players.docs.forEach(doc => batch.delete(doc.ref));
    batch.set(roomRef(), {
      totalCount: 0,
      status: "playing",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
  }

 function subscribeRoom(id) {
  roomId = id;

  if (roomUnsub) roomUnsub();
  if (playersUnsub) playersUnsub();
  if (playerPollTimer) clearInterval(playerPollTimer);

  roomUnsub = null;
  playersUnsub = null;
  playerPollTimer = null;

  // 행사장 화면만 실시간 구독
  if (isAdminPage) {
    roomUnsub = roomRef(id).onSnapshot(snap => {
      if (!snap.exists) return;

      const data = snap.data() || {};

      if ($("roomCodeText")) $("roomCodeText").textContent = data.code || "-----";

      updateQr(id);
      setProgress(data.totalCount || 0);
      popWind();
    });

    playersUnsub = roomRef(id).collection("players").onSnapshot(snap => {
      const players = {};
      snap.docs.forEach(doc => players[doc.id] = doc.data());
      renderRanking(players);
    });

    return;
  }

  // 참가자 화면은 실시간 구독하지 않고 3초마다 진행률만 확인
  async function pollRoom() {
    const snap = await roomRef(id).get().catch(() => null);
    if (!snap?.exists) return;

    const data = snap.data() || {};

    if ($("playerRoomText")) $("playerRoomText").textContent = `접속 코드 ${data.code || "-----"}`;
    setProgress(data.totalCount || 0);
  }

  pollRoom();
  playerPollTimer = setInterval(pollRoom, 5000);
}

async function saveMyName() {
  const input = $("nicknameInput");
  const nickname = String(input?.value || "").trim().slice(0, 12) || "참여자";

  localStorage.setItem(PLAYER_NAME_KEY, nickname);
  ensurePlayerId();

  await playerRef().set({
    nickname,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return nickname;
}

function scheduleFanFlush() {
  clearTimeout(fanFlushTimer);
  fanFlushTimer = setTimeout(flushFans, 5000);
}

async function flushFans() {
  if (fanFlushing || pendingFans <= 0 || !roomId) return;

  fanFlushing = true;

  const amount = pendingFans;
  pendingFans = 0;

  const input = $("nicknameInput");
  const nickname = String(input?.value || "").trim().slice(0, 12) || "참여자";

  localStorage.setItem(PLAYER_NAME_KEY, nickname);
  ensurePlayerId();

  try {
    const batch = db.batch();

    batch.set(roomRef(), {
      totalCount: firebase.firestore.FieldValue.increment(amount),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(playerRef(), {
      nickname,
      count: firebase.firestore.FieldValue.increment(amount),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    console.error(err);
    pendingFans += amount;
    setTimeout(flushFans, 1500);
  } finally {
    fanFlushing = false;

    if (pendingFans > 0) {
      scheduleFanFlush();
    }
  }
}

function fan() {
  if (!roomId) return;

  const input = $("nicknameInput");
  const nickname = String(input?.value || "").trim().slice(0, 12) || "참여자";

  myCount += 1;
  pendingFans += 1;

  if ($("myFanText")) $("myFanText").textContent = `${myCount.toLocaleString()}회`;
  if ($("playerStatusText")) $("playerStatusText").textContent = `${nickname}님의 따뜻한 마음이 전달됐습니다.`;

  popWind();
  scheduleFanFlush();
}

  function initAdmin() {
    $("createRoomBtn")?.addEventListener("click", createRoom);
    $("resetRoomBtn")?.addEventListener("click", resetRoom);

    const saved = localStorage.getItem(ADMIN_ROOM_KEY);
    if (saved) subscribeRoom(saved);
    else createRoom();
  }

  async function initPlayer() {
    roomId = getRoomIdFromUrl();

    if (!roomId) {
      if ($("playerStatusText")) $("playerStatusText").textContent = "QR을 다시 스캔해 주세요.";
      if ($("fanButton")) $("fanButton").disabled = true;
      return;
    }

    ensurePlayerId();

    const savedName = localStorage.getItem(PLAYER_NAME_KEY) || "";
    if ($("nicknameInput")) $("nicknameInput").value = savedName;

    subscribeRoom(roomId);

    const snap = await playerRef().get().catch(() => null);
    if (snap?.exists) {
      myCount = Number(snap.data().count || 0);
      if ($("myFanText")) $("myFanText").textContent = `${myCount.toLocaleString()}회`;
    }

    $("nicknameInput")?.addEventListener("change", () => saveMyName().catch(console.error));
    $("fanButton")?.addEventListener("click", fan);
  }

  function init() {
    if (!window.firebase || !firebase.apps.length) {
      alert("Firebase 초기화가 필요합니다.");
      return;
    }

    db = firebase.firestore();

    try {
      db.settings({ experimentalForceLongPolling: true, useFetchStreams: false });
    } catch (err) {}

$("successOverlay")?.addEventListener("click", () => {
  successDismissed = true;
  $("successOverlay")?.classList.add("hidden");
});
    
    if (isAdminPage) initAdmin();
    if (isPlayerPage) initPlayer();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
