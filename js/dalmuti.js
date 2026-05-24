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

  function noise(start, duration, gain, opts = {}) {
    const audio = ensureAudio();
    if (!audio || isMuted() || !unlocked) return;

    const bufferSize = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
    const data = buffer.getChannelData(0);

    let prev = 0;
    let prev2 = 0;

    const smooth = opts.smooth ?? 0.78;
    const decay = opts.decay ?? 2.2;

    for (let i = 0; i < bufferSize; i++) {
      const x = i / bufferSize;
      const white = Math.random() * 2 - 1;
      const low = smooth * prev + (1 - smooth) * white;
      const hp = low - prev2 * (opts.hp ?? 0.72);

      prev = low;
      prev2 = low;

      data[i] = hp * Math.pow(1 - x, decay);
    }

    const src = audio.createBufferSource();
    const g = audio.createGain();
    const filter = audio.createBiquadFilter();
    const t = audio.currentTime + start;

    filter.type = opts.type || "bandpass";
    filter.frequency.value = opts.freq || 1200;
    filter.Q.value = opts.q || 0.7;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.buffer = buffer;
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.destination);

    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function paper(start, duration, gain = 0.04, smooth = 0.88) {
    noise(start, duration, gain, {
      smooth,
      freq: 1600,
      q: 0.55,
      decay: 1.7
    });
  }

  function thump(start, freq = 120, gain = 0.025) {
    tone(freq, start, 0.075, gain, "sine", freq * 0.75);
  }

  const SFX = {
    click() {
      thump(0, 180, 0.025);
      noise(0.005, 0.035, 0.035, {
        freq: 900,
        smooth: 0.82
      });
    },

    ready() {
      tone(330, 0, 0.08, 0.028, "sine");
      tone(495, 0.065, 0.09, 0.026, "sine");
    },

    start() {
      tone(392, 0, 0.08, 0.035, "triangle");
      tone(587, 0.07, 0.08, 0.033, "triangle");
      tone(880, 0.14, 0.10, 0.032, "triangle");
    },

    select() {
      tone(480, 0, 0.035, 0.025, "triangle");
    },

    play() {
      paper(0, 0.06, 0.08, 0.80);
      thump(0.018, 90, 0.04);
      noise(0.045, 0.08, 0.04, {
        freq: 900,
        smooth: 0.84
      });
    },

    pass() {
      thump(0, 145, 0.030);
      noise(0.012, 0.045, 0.025, {
        freq: 750,
        smooth: 0.88
      });
    },

    tribute() {
      paper(0, 0.055, 0.045, 0.86);
      paper(0.045, 0.055, 0.045, 0.86);
      thump(0.10, 115, 0.020);
    },

    roundEnd() {
      tone(880, 0, 0.08, 0.03, "triangle");
      tone(660, 0.08, 0.08, 0.03, "triangle");
      tone(990, 0.16, 0.13, 0.025, "triangle");
    },

    rebellion() {
      noise(0, 0.22, 0.045, {
        freq: 1100,
        smooth: 0.72
      });
      tone(160, 0, 0.28, 0.055, "sawtooth");
      tone(220, 0.08, 0.22, 0.045, "sawtooth");
      tone(330, 0.18, 0.24, 0.04, "square");
    },

    kick() {
      tone(280, 0, 0.06, 0.035, "triangle");
      tone(180, 0.05, 0.08, 0.03, "sine");
    },

    error() {
      tone(440, 0, 0.05, 0.020, "sine");
      tone(330, 0.04, 0.07, 0.018, "sine");
    }
  };

  function play(name) {
    if (isMuted()) return;

    unlockAudio();

    if (!unlocked) return;

    SFX[name]?.();
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
    if (text.includes("AI 추가") || text.includes("저장")) return "click";

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
          play("tribute");
        } else if (message.includes("내 차례")) {
          play("ready");
        }
      }

      const selected = document.getElementById("selectedSummary")?.textContent?.trim() || "";

      if (selected && selected !== lastSelectedText) {
        lastSelectedText = selected;

        if (selected.includes("낼 수") || selected.includes("선택해야")) {
          play("error");
        }
      }

      const chat = document.getElementById("chatList");

      const systemText = Array.from(chat?.querySelectorAll?.(".chat-msg.system") || [])
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .slice(-1)[0] || "";

      if (systemText && systemText !== lastSystemText) {
        lastSystemText = systemText;

        if (systemText.includes("민란")) {
          play("rebellion");
        } else if (systemText.includes("상납")) {
          play("tribute");
        } else if (systemText.includes("종료")) {
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
  
  function audio() {
    if (ctx) return ctx;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = AudioCtx ? new AudioCtx() : null;

    return ctx;
  }

  function unlock() {
    const a = audio();
    if (!a || unlocked) return;

    if (a.state === "suspended") {
      a.resume().catch(() => null);
    }

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
  
  installNicknameChange();
  installDetachBranding();
  installSharedActionSfx();
  installMainSfx();

  const scripts = [
    "./js/00-config.js?v=20260524-dalmuti5",
    "./js/92-presence-messages.js?v=20260518-presence1",
    "./js/88-pass-count-fix.js?v=20260518-passcount1",
    "./js/97-sfx.js?v=20260517-sfx2",
    "./js/98-hard-remove.js?v=20260517-hardremove1",
    "./js/99-waiting-spectator-passfix.js?v=20260517-watchpass1"
  ];

  document.write(
    scripts
      .map(src => `<script src="${src}"><\/script>`)
      .join("\n")
  );
})();
