(() => {
  "use strict";

  if (!window.firebase || !firebase.apps.length) {
    console.warn("[dalmuti-stale-cleanup] Firebase 초기화 전입니다.");
    return;
  }

  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const WAITING_ROOM_STALE_MS = 30 * 60 * 1000;
  const ACTIVE_ROOM_STALE_MS = 2 * 60 * 60 * 1000;
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;

  const roomCol = () => db.collection("events").doc("dalmuti").collection("rooms");

  function serverNow() {
    return FV.serverTimestamp();
  }

  function timeToMillis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
  }

  function staleLimit(room) {
    return room?.status === "waiting" ? WAITING_ROOM_STALE_MS : ACTIVE_ROOM_STALE_MS;
  }

  function isStaleRoom(room) {
    if (!room || room.closed || room.status === "closed") return false;

    const lastActionAt = timeToMillis(room.updatedAt) || timeToMillis(room.createdAt);
    if (!lastActionAt) return false;

    return Date.now() - lastActionAt > staleLimit(room);
  }

  async function clearSubcollection(col) {
    while (true) {
      const snap = await col.limit(300).get();
      if (snap.empty) return;

      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  async function closeStaleRoom(doc) {
    const ref = doc.ref;

    await clearSubcollection(ref.collection("hands")).catch(err => {
      console.warn("[dalmuti-stale-cleanup] 손패 정리 실패", err);
    });

    await ref.set({
      closed: true,
      status: "closed",
      closedReason: "stale",
      closedAt: serverNow(),
      currentTurnUid: null,
      currentSet: null,
      previousSet: null,
      tribute: null,
      updatedAt: serverNow()
    }, { merge: true });
  }

  async function cleanupStaleRooms(options = {}) {
    const { refresh = false } = options;

    const snap = await roomCol()
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get()
      .catch(err => {
        console.error("[dalmuti-stale-cleanup] 방 정리 목록 조회 실패", err);
        return null;
      });

    if (!snap) return 0;

    let closedCount = 0;

    for (const doc of snap.docs) {
      const room = doc.data();
      if (!isStaleRoom(room)) continue;

      await closeStaleRoom(doc).catch(err => {
        console.error("[dalmuti-stale-cleanup] 오래된 방 종료 실패", doc.id, err);
      });
      closedCount += 1;
    }

    if (closedCount > 0 && refresh) {
      setTimeout(() => {
        const refreshBtn = document.getElementById("refreshRoomsBtn");
        if (refreshBtn) refreshBtn.click();
      }, 250);
    }

    return closedCount;
  }

  window.DalmutiStaleCleanup = {
    run: cleanupStaleRooms
  };

  window.addEventListener("load", () => {
    setTimeout(() => cleanupStaleRooms({ refresh: true }), 1200);
  });

  setInterval(() => {
    if (document.hidden) return;
    cleanupStaleRooms({ refresh: true });
  }, CHECK_INTERVAL_MS);
})();
