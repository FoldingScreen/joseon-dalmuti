(() => {
  "use strict";

  function addStyle(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  addStyle("dalmutiChatUiCss", `
    @media (min-width: 881px) {
      .room-shell { grid-template-columns: minmax(0, 1fr) 380px !important; }
      .side-panel { width: 380px !important; max-width: 380px !important; }
      #tributePanel { right: 406px !important; }
    }
    .chat-list { display: flex !important; flex-direction: column !important; gap: 4px !important; padding: 6px 4px !important; }
    .chat-msg { display: block !important; width: 100% !important; padding: 3px 2px !important; border-radius: 0 !important; background: transparent !important; border: 0 !important; color: #e7ecf6 !important; font-size: 13px !important; line-height: 1.45 !important; word-break: break-word !important; box-sizing: border-box !important; }
    .chat-msg .chat-name { display: inline-block !important; max-width: 150px !important; margin: 0 6px 0 0 !important; padding: 0 !important; border-radius: 0 !important; background: transparent !important; border: 0 !important; color: #f3d281 !important; font-weight: 900 !important; font-size: 12px !important; line-height: inherit !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; vertical-align: bottom !important; }
    .chat-msg .chat-name::before { content: "["; color: #8f98aa; font-weight: 700; }
    .chat-msg .chat-name::after { content: "]"; color: #8f98aa; font-weight: 700; }
    .chat-msg.system { text-align: center !important; color: #aeb8c9 !important; background: transparent !important; border: 0 !important; font-size: 12px !important; font-weight: 800 !important; opacity: .9 !important; }
    .chat-msg.system::before, .chat-msg.system::after { content: "─"; margin: 0 6px; color: #566174; font-weight: 400; }
    .chat-input-row { gap: 7px !important; }
    .chat-input-row .input { min-width: 0 !important; }
  `);

  addStyle("dalmutiReadyBorderCss", `
    .player-box.ready { border-color: #6fb3ff !important; box-shadow: 0 0 0 2px rgba(111, 179, 255, .55), 0 12px 24px rgba(0, 0, 0, .28) !important; }
    .player-box.ready .badge.ready { background: rgba(111, 179, 255, .16) !important; border: 1px solid rgba(111, 179, 255, .75) !important; color: #9fcaff !important; }
  `);

  function installNicknameChange() {
    const currentName = () => String(localStorage.getItem("partyAppUser") || localStorage.getItem("dalmutiGuestNickname") || "").trim();
    const isInRoomView = () => document.getElementById("roomView")?.classList.contains("show");
    const normalizeName = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 12);

    function changeNickname() {
      if (isInRoomView()) {
        alert("방 안에서는 닉네임을 바꿀 수 없습니다. 방에서 나온 뒤 변경해 주세요.");
        return;
      }

      const oldName = currentName();
      const next = normalizeName(window.prompt("새 닉네임을 입력하세요", oldName));
      if (!next || next === oldName) return;

      localStorage.setItem("partyAppUser", next);
      localStorage.setItem("dalmutiGuestNickname", next);
      localStorage.setItem("dalmutiGuestMode", "true");
      localStorage.removeItem("dalmutiCurrentRoomId");

      const nameEl = document.getElementById("myNickname");
      if (nameEl) nameEl.textContent = next;

      location.reload();
    }

    function init() {
      addStyle("dalmutiNicknameChangeCss", `
        .nickname-change-btn { margin-top: 8px; padding: 5px 9px; border: 1px solid rgba(243,210,129,.45); border-radius: 999px; background: rgba(243,210,129,.12); color: #f3d281; font-size: 12px; font-weight: 900; cursor: pointer; }
        .nickname-change-btn:hover { background: rgba(243,210,129,.22); }
      `);

      const box = document.querySelector(".profile-box");
      if (!box || document.getElementById("changeNicknameBtn")) return;

      const btn = document.createElement("button");
      btn.id = "changeNicknameBtn";
      btn.type = "button";
      btn.className = "nickname-change-btn";
      btn.textContent = "닉네임 변경";
      btn.addEventListener("click", changeNickname);
      box.appendChild(btn);
    }

    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
    else init();
  }

  function installDetachBranding() {
    function cleanTree(root = document.body) {
      if (!root) return;
      document.title = "달무티 in 조선";
      document.getElementById("homeBtn")?.remove();
    }

    function patchCreateRoomDefault() {
      const btn = document.getElementById("createRoomBtn");
      const input = document.getElementById("roomTitleInput");
      if (!btn || !input || btn.dataset.dalmutiBrandPatch === "1") return;
      btn.dataset.dalmutiBrandPatch = "1";
      btn.addEventListener("click", () => {
        if (!String(input.value || "").trim()) input.value = "달무티 in 조선";
      }, true);
    }

    function init() {
      cleanTree();
      patchCreateRoomDefault();
      setTimeout(() => {
        cleanTree();
        patchCreateRoomDefault();
      }, 700);
    }

    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
    else init();
  }

function installSharedActionSfx() {
  const KEY = "dalmutiSfxMuted";
  let ctx = null;
  let unlocked = false;
  let ready = false;
  let lastSubmit = "";
  let lastPass = "";
  let timer = null;

  const me = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const muted = () => localStorage.getItem(KEY) === "1";

  function audio() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = AudioCtx ? new AudioCtx() : null;
    return ctx;
  }

  function unlock() {
    const a = audio();
    if (!a || unlocked) return;
    if (a.state === "suspended") a.resume().catch(() => null);
    unlocked = true;
  }

  function tone(freq, start, duration, gain) {
    const a = audio();
    if (!a || muted() || !unlocked) return;

    const osc = a.createOscillator();
    const g = a.createGain();
    const t = a.currentTime + start;

    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(g);
    g.connect(a.destination);

    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function fxSubmit() {
    tone(90, 0, 0.09, 0.04);
    tone(650, 0.02, 0.05, 0.015);
  }

  function fxPass() {
    tone(145, 0, 0.075, 0.03);
  }

  function names(selector) {
    return Array.from(document.querySelectorAll(selector))
      .map(el => el.querySelector(".player-name")?.textContent?.trim() || "")
      .filter(Boolean)
      .sort();
  }

  function pile() {
    const center = document.getElementById("centerPile");
    const title = center?.querySelector?.(".cur-pile-title")?.textContent?.trim() || "";
    const imgs = Array.from(center?.querySelectorAll?.(".cur-cards img") || [])
      .map(img => img.src)
      .join("|");

    return title && imgs ? `${title}::${imgs}` : "";
  }

  function check() {
    const mine = me();
    const submitted = names(".player-box.submitted");
    const passed = names(".player-box.passed");

    const submitSig = `${pile()}::${submitted.join("|")}`;
    const passSig = passed.join("|");

    if (!ready) {
      lastSubmit = submitSig;
      lastPass = passSig;
      ready = true;
      return;
    }

    if (submitSig && submitSig !== lastSubmit && submitted.some(name => name !== mine)) {
      fxSubmit();
    }

    if (passSig !== lastPass) {
      const old = new Set(lastPass.split("|").filter(Boolean));
      if (passed.some(name => name !== mine && !old.has(name))) {
        fxPass();
      }
    }

    lastSubmit = submitSig;
    lastPass = passSig;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(check, 50);
  }

  function init() {
    document.addEventListener("pointerdown", unlock, true);

    const target = document.body;
    if (!target || target.dataset.sharedActionSfx === "1") return;

    target.dataset.sharedActionSfx = "1";

    new MutationObserver(schedule).observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    setTimeout(check, 300);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

function installMainSfx() {
  const STORAGE_KEY = "dalmutiSfxMuted";

  let ctx = null;
  let unlocked = false;
  let lastSystemText = "";
  let lastMessageText = "";
  let lastSelectedText = "";

  function isMuted() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  function setMuted(value) {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    updateButton();
  }

  function ensureAudio() {
    if (ctx) return ctx;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    ctx = new AudioCtx();
    return ctx;
  }

  function unlockAudio() {
    const audio = ensureAudio();
    if (!audio || unlocked) return;

    if (audio.state === "suspended") {
      audio.resume().catch(() => null);
    }

    unlocked = true;
  }

  function tone(freq, start, duration, gain, type = "sine", endFreq = null) {
    const audio = ensureAudio();
    if (!audio || isMuted() || !unlocked) return;

    const osc = audio.createOscillator();
    const g = audio.createGain();
    const t = audio.currentTime + start;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + duration);
    }

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(g);
    g.connect(audio.destination);

    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function play(name) {
    if (isMuted()) return;
    unlockAudio();
    if (!unlocked) return;

    if (name === "select") tone(480, 0, 0.035, 0.025, "triangle");
    else if (name === "pass") tone(145, 0, 0.075, 0.03);
    else if (name === "play") tone(90, 0, 0.09, 0.04);
    else if (name === "ready") {
      tone(330, 0, 0.08, 0.028);
      tone(495, 0.065, 0.09, 0.026);
    } else if (name === "start") {
      tone(392, 0, 0.08, 0.035, "triangle");
      tone(587, 0.07, 0.08, 0.033, "triangle");
      tone(880, 0.14, 0.10, 0.032, "triangle");
    } else if (name === "roundEnd") {
      tone(880, 0, 0.08, 0.03, "triangle");
      tone(660, 0.08, 0.08, 0.03, "triangle");
      tone(990, 0.16, 0.13, 0.025, "triangle");
    } else if (name === "kick") {
      tone(280, 0, 0.06, 0.035, "triangle");
      tone(180, 0.05, 0.08, 0.03);
    } else {
      tone(180, 0, 0.06, 0.025);
    }
  }

  function updateButton() {
    const btn = document.getElementById("sfxToggleBtn");
    if (!btn) return;

    btn.textContent = isMuted() ? "효과음 꺼짐" : "효과음 켜짐";
    btn.classList.toggle("danger", isMuted());
  }

  function ensureButton() {
    if (document.getElementById("sfxToggleBtn")) return;

    const target = document.querySelector(".top-actions");
    if (!target) return;

    const btn = document.createElement("button");
    btn.id = "sfxToggleBtn";
    btn.type = "button";
    btn.className = "btn ghost";

    btn.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      unlockAudio();
      setMuted(!isMuted());

      if (!isMuted()) {
        play("ready");
      }
    };

    target.insertBefore(btn, target.firstChild);
    updateButton();
  }

  function classifyButton(text) {
    if (!text) return "click";
    if (text.includes("준비")) return "ready";
    if (text.includes("게임 시작") || text.includes("다음 라운드")) return "start";
    if (text.includes("선택 카드") || text.includes("반환 카드")) return "play";
    if (text.includes("패스")) return "pass";
    if (text.includes("강퇴") || text.includes("방 나가기") || text.includes("방 삭제") || text.includes("게임 중지")) return "kick";
    if (text.includes("관전") || text.includes("참가")) return "ready";
    return "click";
  }

  function bindClickSounds() {
    if (document.body.dataset.mainSfxClickBound === "1") return;

    document.body.dataset.mainSfxClickBound = "1";

    document.addEventListener("pointerdown", event => {
      unlockAudio();

      const handCard = event.target.closest?.(".hand-stack");
      if (handCard) {
        play("select");
        return;
      }

      const btn = event.target.closest?.("button");
      if (!btn || btn.id === "sfxToggleBtn") return;

      play(classifyButton(btn.textContent.trim()));
    }, true);
  }

  function observeMessages() {
    if (document.body.dataset.mainSfxObserver === "1") return;

    document.body.dataset.mainSfxObserver = "1";

    const observer = new MutationObserver(() => {
      const message = document.getElementById("messageBar")?.textContent?.trim() || "";

      if (message && message !== lastMessageText) {
        lastMessageText = message;

        if (message.includes("상납")) {
          play("ready");
        } else if (message.includes("내 차례")) {
          play("ready");
        }
      }

      const selected = document.getElementById("selectedSummary")?.textContent?.trim() || "";

      if (selected && selected !== lastSelectedText) {
        lastSelectedText = selected;

        if (selected.includes("낼 수") || selected.includes("선택해야")) {
          play("kick");
        }
      }

      const chat = document.getElementById("chatList");
      const systemText = Array.from(chat?.querySelectorAll?.(".chat-msg.system") || [])
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .slice(-1)[0] || "";

      if (systemText && systemText !== lastSystemText) {
        lastSystemText = systemText;

        if (systemText.includes("종료")) {
          play("roundEnd");
        } else if (systemText.includes("시작")) {
          play("start");
        } else if (systemText.includes("강퇴") || systemText.includes("나갔")) {
          play("kick");
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function init() {
    ensureButton();
    bindClickSounds();
    observeMessages();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

function installWaitingSpectatorFix() {
  if (!window.firebase || !firebase.apps.length) return;

  addStyle("dalmutiWatchForceCss", `
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
  `);

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

    if (!target) {
      alert("참가자 목록에 없는 대상입니다.");
      return;
    }

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

  function init() {
    patchDalmuti();

    setTimeout(addForceSpectatorButtons, 300);

    const area = document.getElementById("playersArea") || document.body;

    if (area.dataset.watchForceObserver === "1") return;
    area.dataset.watchForceObserver = "1";

    new MutationObserver(addForceSpectatorButtons).observe(area, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

function installPassCountFix() {
  const lastCardCountByName = new Map();
  let scheduled = false;

  function cleanName(box) {
    return String(box.querySelector(".player-name")?.textContent || "").trim();
  }

  function metaText(box) {
    return String(box.querySelector(".player-meta")?.textContent || "").trim();
  }

  function rememberCounts() {
    document.querySelectorAll(".player-box").forEach(box => {
      const name = cleanName(box);
      const text = metaText(box);
      const match = text.match(/(\d+)장/);

      if (name && match) {
        lastCardCountByName.set(name, `${match[1]}장`);
      }
    });
  }

  function ensurePassBadge(box) {
    let badge = box.querySelector(".badge.pass");

    if (!badge) {
      badge = document.createElement("div");
      badge.className = "badge pass";
      badge.textContent = "패스";
      box.appendChild(badge);
    }

    badge.style.setProperty("display", "inline-block", "important");
    badge.style.setProperty("visibility", "visible", "important");
    badge.style.setProperty("opacity", "1", "important");
  }

  function patchOnce() {
    scheduled = false;
    rememberCounts();

    document.querySelectorAll(".player-box").forEach(box => {
      const text = metaText(box);
      const name = cleanName(box);
      const hasPassText = /^패스/.test(text);
      const hasPassClass = box.classList.contains("passed");
      const hasPassBadge = !!box.querySelector(".badge.pass");

      if (!hasPassText && !hasPassClass && !hasPassBadge) return;

      const meta = box.querySelector(".player-meta");
      if (!meta) return;

      ensurePassBadge(box);

      const countText = lastCardCountByName.get(name);

      if (countText && (hasPassText || !/(\d+)장/.test(text))) {
        meta.textContent = text.includes("준비")
          ? `${countText} · 준비`
          : countText;
      }
    });
  }

  function schedulePatch() {
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(patchOnce);
  }

  function init() {
    schedulePatch();

    const area = document.getElementById("playersArea");

    if (area && area.dataset.passCountFix !== "1") {
      area.dataset.passCountFix = "1";

      new MutationObserver(schedulePatch).observe(area, {
        childList: true,
        subtree: true
      });
    }

    document.addEventListener("click", event => {
      if (event.target.closest?.("#passBtn")) {
        setTimeout(schedulePatch, 120);
        setTimeout(schedulePatch, 500);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

function installPresenceMessages() {
  if (!window.firebase || !firebase.apps.length) return;

  const CHAT_LIMIT = 12;
  const EVENT_ID = "dalmuti";

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

    const chat = Array.isArray(room.chatPreview)
      ? room.chatPreview.slice(-CHAT_LIMIT + 1)
      : [];

    const last = chat[chat.length - 1];

    if (
      last?.type === "system" &&
      last?.text === text &&
      Date.now() - Number(last.createdAt || 0) < 3000
    ) {
      return;
    }

    chat.push({
      type: "system",
      uid: "system",
      nickname: "",
      text,
      createdAt: Date.now()
    });

    await ref.set({
      chatPreview: chat,
      updatedAt: FV.serverTimestamp()
    }, { merge: true }).catch(() => null);
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

    if (players[name]) {
      text = `${name}님이 입장했습니다.`;
    } else if (spectators[name]) {
      text = `${name}님이 관전자로 입장했습니다.`;
    } else {
      return;
    }

    await appendSystem(roomId, text, `join:${roomId}:${name}`);
  }

  function patchJoinRoom() {
    if (!window.Dalmuti?.joinRoom || window.Dalmuti.__presenceJoinPatched) return false;

    const original = window.Dalmuti.joinRoom;

    window.Dalmuti.joinRoom = async function patchedJoinRoom(roomId) {
      const result = await original.apply(this, arguments);

      setTimeout(() => {
        announceJoin(roomId);
      }, 450);

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

      if (roomId && name) {
        setTimeout(() => {
          appendSystem(
            roomId,
            `${name}님이 참가자로 전환했습니다.`,
            `player:${roomId}:${name}`
          );
        }, 350);
      }

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
          setTimeout(() => {
            appendSystem(
              roomId,
              `${name}님이 관전자로 전환했습니다.`,
              `spectator:${roomId}:${name}`
            );
          }, 350);
        }

        return;
      }

      const leaveBtn = event.target.closest?.("#leaveRoomBtn");

      if (leaveBtn) {
        const roomId = currentRoomId();
        const name = myName();

        if (roomId && name) {
          appendSystem(
            roomId,
            `${name}님이 나갔습니다.`,
            `leave:${roomId}:${name}`
          );
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

    if (
      tries > 30 ||
      (
        window.Dalmuti?.__presenceJoinPatched &&
        window.Dalmuti?.__presenceBecomePlayerPatched
      )
    ) {
      clearInterval(timer);
    }
  }, 200);
}

function installHardRemove() {
  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();

  const roomCol = () => db.collection("events").doc("dalmuti").collection("rooms");
  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const serverNow = () => firebase.firestore.FieldValue.serverTimestamp();

  const cleanMap = obj => Object.fromEntries(
    Object.entries(obj || {}).filter(([, value]) => value && typeof value === "object")
  );

  const countMap = obj => Object.values(cleanMap(obj)).length;

  function roomRef(roomId) {
    return roomCol().doc(roomId);
  }

  function handRef(roomId, uid) {
    return roomRef(roomId).collection("hands").doc(uid);
  }

  function nextAliveUid(players) {
    return Object.values(players)
      .filter(p => p && p.uid && !p.finished && !p.forfeited && !p.removedFromRoom)
      .sort((a, b) => (a.seatOrder ?? 999) - (b.seatOrder ?? 999))[0]?.uid || null;
  }

  function removeFromRoomData(room, uid, options = {}) {
    const players = cleanMap(room.players);
    const spectators = cleanMap(room.spectators);
    const kicked = cleanMap(room.kicked);

    const target = players[uid] || spectators[uid];

    if (!target) return null;

    delete players[uid];
    delete spectators[uid];

    if (options.kick) {
      kicked[uid] = {
        uid,
        nickname: target.nickname || uid,
        by: options.by || currentUser(),
        at: Date.now()
      };
    }

    let currentTurnUid = room.currentTurnUid || null;
    let currentSet = room.currentSet || null;
    let previousSet = room.previousSet || null;
    let tribute = room.tribute || null;

    if (currentTurnUid === uid) {
      currentTurnUid = nextAliveUid(players);
    }

    if (currentSet?.uid === uid) {
      previousSet = currentSet;
      currentSet = null;
      currentTurnUid = nextAliveUid(players);
    }

    if (tribute?.pairs) {
      const pairs = tribute.pairs.filter(pair => (
        pair.fromUid !== uid &&
        pair.toUid !== uid
      ));

      tribute = pairs.length ? { ...tribute, pairs } : null;
    }

    const finishOrder = (room.finishOrder || []).filter(item => item.uid !== uid);
    const chatPreview = (room.chatPreview || []).slice(-11);

    if (options.message) {
      chatPreview.push({
        type: "system",
        uid: "system",
        nickname: "",
        text: options.message(target),
        createdAt: Date.now()
      });
    }

    const update = {
      players,
      spectators,
      kicked,
      playerCount: countMap(players),
      spectatorCount: countMap(spectators),
      currentTurnUid,
      currentSet,
      previousSet,
      tribute,
      finishOrder,
      chatPreview,
      updatedAt: serverNow()
    };

    if (room.hostUid === uid) {
      const nextHost = Object.values(players)[0] || Object.values(spectators)[0];

      if (nextHost) {
        update.hostUid = nextHost.uid;
        update.hostNickname = nextHost.nickname || nextHost.uid;
      } else {
        update.closed = true;
        update.status = "closed";
      }
    }

    return {
      update,
      target
    };
  }

  async function hardRemove(uid, options = {}) {
    const roomId = currentRoomId();

    if (!roomId || !uid) return false;

    const ref = roomRef(roomId);
    const snap = await ref.get();

    if (!snap.exists) return false;

    const room = snap.data();
    const result = removeFromRoomData(room, uid, options);

    if (!result) return false;

    const batch = db.batch();

    batch.update(ref, result.update);
    batch.delete(handRef(roomId, uid));

    await batch.commit();

    return true;
  }

  async function hardLeave() {
    const uid = currentUser();

    await hardRemove(uid, {
      message: target => `${target.nickname || uid}님이 방에서 나갔습니다.`
    }).catch(console.error);

    localStorage.removeItem("dalmutiCurrentRoomId");
    location.reload();
  }

  function bindLeaveButton() {
    const leaveBtn = document.getElementById("leaveRoomBtn");

    if (!leaveBtn || leaveBtn.dataset.hardRemoveBound === "1") return;

    leaveBtn.dataset.hardRemoveBound = "1";

    leaveBtn.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      hardLeave();
    }, true);
  }

  function patchKick() {
    if (!window.Dalmuti || window.Dalmuti.__hardKickPatched) return;

    const oldKick = window.Dalmuti.kick;

    window.Dalmuti.kick = async function hardKick(uid) {
      const roomId = currentRoomId();
      const me = currentUser();

      if (!roomId || !uid || uid === me) return;

      const snap = await roomRef(roomId).get();

      if (!snap.exists) return;

      const room = snap.data();

      if (!(room.hostUid === me || me === "병풍")) {
        alert("방장만 강퇴할 수 있습니다.");
        return;
      }

      const target = cleanMap(room.players)[uid] || cleanMap(room.spectators)[uid];

      if (!target) {
        alert("이미 방에 없는 대상입니다.");
        return;
      }

      if (!confirm(`${target.nickname || uid}님을 방에서 내보낼까요?`)) return;

      await hardRemove(uid, {
        kick: true,
        by: me,
        message: targetData => `${targetData.nickname || uid}님이 방장에 의해 강퇴되었습니다.`
      }).catch(console.error);
    };

    window.Dalmuti.__hardKickPatched = true;
    window.Dalmuti.__oldKick = oldKick;
  }

  function init() {
    bindLeaveButton();
    patchKick();

    let tries = 0;

    const timer = setInterval(() => {
      tries += 1;
      bindLeaveButton();
      patchKick();

      if (tries > 30 || window.Dalmuti?.__hardKickPatched) {
        clearInterval(timer);
      }
    }, 200);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
  
installNicknameChange();
installDetachBranding();
installSharedActionSfx();
installMainSfx();
installWaitingSpectatorFix();
installPassCountFix();
installPresenceMessages();
installHardRemove();

  const scripts = [
    "./js/00-config.js?v=20260524-dalmuti5",
  ];

  document.write(
    scripts
      .map(src => `<script src="${src}"><\/script>`)
      .join("\n")
  );
})();
