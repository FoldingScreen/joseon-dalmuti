(() => {
  "use strict";
  const KEY = "dalmutiSfxMuted";
  let ctx, ok = false, ready = false, lastSubmit = "", lastPass = "", timer = null;
  const me = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const muted = () => localStorage.getItem(KEY) === "1";
  function audio(){ if(ctx) return ctx; const C = window.AudioContext || window.webkitAudioContext; ctx = C ? new C() : null; return ctx; }
  function unlock(){ const a = audio(); if(!a || ok) return; if(a.state === "suspended") a.resume().catch(()=>null); ok = true; }
  document.addEventListener("pointerdown", unlock, true);
  function tone(f,s,d,g){ const a=audio(); if(!a||muted()||!ok) return; const o=a.createOscillator(), n=a.createGain(), t=a.currentTime+s; o.frequency.value=f; n.gain.setValueAtTime(.0001,t); n.gain.exponentialRampToValueAtTime(g,t+.01); n.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(n).connect(a.destination); o.start(t); o.stop(t+d+.02); }
  function fxSubmit(){ tone(90,0,.09,.04); tone(650,.02,.05,.015); }
  function fxPass(){ tone(145,0,.075,.03); }
  function names(sel){ return Array.from(document.querySelectorAll(sel)).map(x=>x.querySelector(".player-name")?.textContent?.trim()||"").filter(Boolean).sort(); }
  function pile(){ const c=document.getElementById("centerPile"); const t=c?.querySelector?.(".cur-pile-title")?.textContent?.trim()||""; const imgs=Array.from(c?.querySelectorAll?.(".cur-cards img")||[]).map(i=>i.src).join("|"); return t&&imgs ? `${t}::${imgs}` : ""; }
  function check(){ const mine=me(); const sub=names(".player-box.submitted"); const pas=names(".player-box.passed"); const subSig=`${pile()}::${sub.join("|")}`; const pasSig=pas.join("|"); if(!ready){ lastSubmit=subSig; lastPass=pasSig; ready=true; return; } if(subSig && subSig!==lastSubmit && sub.some(n=>n!==mine)) fxSubmit(); if(pasSig!==lastPass){ const old=new Set(lastPass.split("|").filter(Boolean)); if(pas.some(n=>n!==mine && !old.has(n))) fxPass(); } lastSubmit=subSig; lastPass=pasSig; }
  function schedule(){ clearTimeout(timer); timer=setTimeout(check,50); }
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  setTimeout(check,300);
})();
