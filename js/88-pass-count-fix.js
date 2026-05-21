(() => {
  "use strict";

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
      if (name && match) lastCardCountByName.set(name, `${match[1]}장`);
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
        meta.textContent = text.includes("준비") ? `${countText} · 준비` : countText;
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

    // body 전체의 class/style 변경을 감시하면 우리가 넣은 배지가 다시 감지를 유발해서
    // 렌더 루프가 생길 수 있다. 플레이어 영역의 자식 교체만 느슨하게 감시한다.
    const area = document.getElementById("playersArea");
    if (area) {
      const observer = new MutationObserver(schedulePatch);
      observer.observe(area, { childList: true, subtree: true });
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
})();
