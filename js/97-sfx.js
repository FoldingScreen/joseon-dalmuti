(() => {
  "use strict";

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
    if (audio.state === "suspended") audio.resume().catch(() => null);
    unlocked = true;
  }

  function tone(freq, start, duration, gain, type = "sine", endFreq = null) {
    const audio = ensureAudio();
    if (!audio || isMuted()) return;

    const osc = audio.createOscillator();
    const g = audio.createGain();
    const t = audio.currentTime + start;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + duration);

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
    if (!audio || isMuted()) return;

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
    noise(start, duration, gain, { smooth, freq: 1600, q: 0.55, decay: 1.7 });
  }

  function thump(start, freq = 120, gain = 0.025) {
    tone(freq, start, 0.075, gain, "sine", freq * 0.75);
  }

  const SFX = {
    // 후보 1. 나무 버튼 톡
    click() {
      thump(0, 180, 0.025);
      noise(0.005, 0.035, 0.035, { freq: 900, smooth: 0.82 });
    },

    // 후보 5. 낮은 준비 완료음
    ready() {
      tone(330, 0, 0.08, 0.028, "sine");
      tone(495, 0.065, 0.09, 0.026, "sine");
    },

    // 후보 3. 가벼운 팡파르
    start() {
      tone(392, 0, 0.08, 0.035, "triangle");
      tone(587, 0.07, 0.08, 0.033, "triangle");
      tone(880, 0.14, 0.10, 0.032, "triangle");
    },

    // 현재 적용 유지
    select() {
      tone(480, 0, 0.035, 0.025, "triangle");
    },

    // 후보 5. 묵직한 카드 더미 탁
    play() {
      paper(0, 0.06, 0.08, 0.80);
      thump(0.018, 90, 0.04);
      noise(0.045, 0.08, 0.04, { freq: 900, smooth: 0.84 });
    },

    // 후보 3. 낮은 톡
    pass() {
      thump(0, 145, 0.030);
      noise(0.012, 0.045, 0.025, { freq: 750, smooth: 0.88 });
    },

    // 후보 4. 종이 두 장 이동
    tribute() {
      paper(0, 0.055, 0.045, 0.86);
      paper(0.045, 0.055, 0.045, 0.86);
      thump(0.10, 115, 0.020);
    },

    // 후보 2. 완료 종소리
    roundEnd() {
      tone(880, 0, 0.08, 0.03, "triangle");
      tone(660, 0.08, 0.08, 0.03, "triangle");
      tone(990, 0.16, 0.13, 0.025, "triangle");
    },

    // 민란은 임시 기존 유지
    rebellion() {
      noise(0, 0.22, 0.045, { freq: 1100, smooth: 0.72 });
      tone(160, 0, 0.28, 0.055, "sawtooth");
      tone(220, 0.08, 0.22, 0.045, "sawtooth");
      tone(330, 0.18, 0.24, 0.04, "square");
    },

    // 후보 3. 짧은 퇴장음
    kick() {
      tone(280, 0, 0.06, 0.035, "triangle");
      tone(180, 0.05, 0.08, 0.03, "sine");
    },

    // 후보 5. 불가 처리음
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
      if (!isMuted()) play("ready");
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
    const observer = new MutationObserver(() => {
      const message = document.getElementById("messageBar")?.textContent?.trim() || "";
      if (message && message !== lastMessageText) {
        lastMessageText = message;
        if (message.includes("상납")) play("tribute");
        else if (message.includes("내 차례")) play("ready");
      }

      const selected = document.getElementById("selectedSummary")?.textContent?.trim() || "";
      if (selected && selected !== lastSelectedText) {
        lastSelectedText = selected;
        if (selected.includes("낼 수") || selected.includes("선택해야")) play("error");
      }

      const chat = document.getElementById("chatList");
      const systemText = Array.from(chat?.querySelectorAll?.(".chat-msg.system") || [])
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .slice(-1)[0] || "";

      if (systemText && systemText !== lastSystemText) {
        lastSystemText = systemText;
        if (systemText.includes("민란")) play("rebellion");
        else if (systemText.includes("상납")) play("tribute");
        else if (systemText.includes("종료")) play("roundEnd");
        else if (systemText.includes("시작")) play("start");
        else if (systemText.includes("강퇴") || systemText.includes("나갔")) play("kick");
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
})();
