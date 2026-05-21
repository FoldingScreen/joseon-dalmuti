(() => {
  "use strict";

  function currentName() {
    return String(localStorage.getItem("partyAppUser") || localStorage.getItem("dalmutiGuestNickname") || "").trim();
  }

  function isInRoomView() {
    return document.getElementById("roomView")?.classList.contains("show");
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 12);
  }

  function changeNickname() {
    if (isInRoomView()) {
      alert("방 안에서는 닉네임을 바꿀 수 없습니다. 방에서 나온 뒤 변경해 주세요.");
      return;
    }

    const oldName = currentName();
    const next = normalizeName(window.prompt("새 닉네임을 입력하세요", oldName));

    if (!next) return;
    if (next === oldName) return;

    localStorage.setItem("partyAppUser", next);
    localStorage.setItem("dalmutiGuestNickname", next);
    localStorage.setItem("dalmutiGuestMode", "true");
    localStorage.removeItem("dalmutiCurrentRoomId");

    const nameEl = document.getElementById("myNickname");
    if (nameEl) nameEl.textContent = next;

    location.reload();
  }

  function injectStyle() {
    if (document.getElementById("dalmutiNicknameChangeCss")) return;
    const style = document.createElement("style");
    style.id = "dalmutiNicknameChangeCss";
    style.textContent = `
      .nickname-change-btn {
        margin-top: 8px;
        padding: 5px 9px;
        border: 1px solid rgba(243,210,129,.45);
        border-radius: 999px;
        background: rgba(243,210,129,.12);
        color: #f3d281;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .nickname-change-btn:hover {
        background: rgba(243,210,129,.22);
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyle();

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

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
