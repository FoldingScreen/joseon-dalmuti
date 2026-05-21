(() => {
  "use strict";

  const REPLACEMENTS = [
    [/970KOR MINI GAME/g, "DALMUTI"],
    [/970KOR/g, ""],
    [/사바나 달무티/g, "달무티"],
    [/사바나/g, "임금"]
  ];

  function replaceText(value) {
    let next = String(value ?? "");
    REPLACEMENTS.forEach(([from, to]) => {
      next = next.replace(from, to);
    });
    return next.replace(/\s{2,}/g, " ").trim();
  }

  function cleanTextNode(node) {
    const next = replaceText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function cleanAttributes(el) {
    ["title", "placeholder", "alt", "aria-label"].forEach(attr => {
      if (!el.hasAttribute?.(attr)) return;
      const oldValue = el.getAttribute(attr);
      const next = replaceText(oldValue);
      if (next !== oldValue) el.setAttribute(attr, next);
    });
  }

  function cleanTree(root = document.body) {
    if (!root) return;
    document.title = "달무티";

    const homeBtn = document.getElementById("homeBtn");
    if (homeBtn) homeBtn.remove();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(cleanTextNode);

    root.querySelectorAll?.("*").forEach(cleanAttributes);
  }

  function patchCreateRoomDefault() {
    const btn = document.getElementById("createRoomBtn");
    const input = document.getElementById("roomTitleInput");
    if (!btn || !input || btn.__dalmutiBrandPatch) return;

    btn.__dalmutiBrandPatch = true;
    btn.addEventListener("click", () => {
      if (!String(input.value || "").trim()) input.value = "달무티";
    }, true);
  }

  function init() {
    cleanTree();
    patchCreateRoomDefault();

    // 예전 버전은 MutationObserver로 body 전체를 계속 스캔했음.
    // 채팅/플레이어 렌더마다 전체 텍스트를 다시 훑으면서 멈춤이 생길 수 있어
    // 이제는 초기 1회와 아주 짧은 지연 1회만 보정한다.
    setTimeout(() => {
      cleanTree();
      patchCreateRoomDefault();
    }, 700);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
