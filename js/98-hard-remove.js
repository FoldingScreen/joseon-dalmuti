(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) return;

  const db = firebase.firestore();
  const roomCol = () => db.collection("events").doc("dalmuti").collection("rooms");
  const cleanMap = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && typeof v === "object"));
  const countMap = obj => Object.values(cleanMap(obj)).length;
  const currentUser = () => String(localStorage.getItem("partyAppUser") || "").trim();
  const currentRoomId = () => String(localStorage.getItem("dalmutiCurrentRoomId") || "").trim();
  const serverNow = () => firebase.firestore.FieldValue.serverTimestamp();

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

  function removeFromRoomData(room, uid, options) {
    const players = cleanMap(room.players);
    const spectators = cleanMap(room.spectators);
    const kicked = cleanMap(room.kicked);
    const target = players[uid] || spectators[uid];

    if (!target) return null;

    delete players[uid];
    delete spectators[uid];

    if (options?.kick) {
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

    if (currentTurnUid === uid) currentTurnUid = nextAliveUid(players);

    if (currentSet?.uid === uid) {
      previousSet = currentSet;
      currentSet = null;
      currentTurnUid = nextAliveUid(players);
    }

    if (tribute?.pairs) {
      const pairs = tribute.pairs.filter(p => p.fromUid !== uid && p.toUid !== uid);
      tribute = pairs.length ? { ...tribute, pairs } : null;
    }

    const finishOrder = (room.finishOrder || []).filter(x => x.uid !== uid);
    const chatPreview = (room.chatPreview || []).slice(-11);

    if (options?.message) {
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

    return { update, target };
  }

  async function hardRemove(uid, options) {
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

  const leaveBtn = document.getElementById("leaveRoomBtn");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      hardLeave();
    }, true);
  }

  function patchKick() {
    if (!window.Dalmuti || window.Dalmuti.__hardKickPatched) return;

    const oldKick = window.Dalmuti.kick;
    window.Dalmuti.kick = async function (uid) {
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

  patchKick();
  setTimeout(patchKick, 0);
})();
