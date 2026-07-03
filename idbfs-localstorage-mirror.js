/*
  Unity IDBFS <-> localStorage mirror for Golf Orbit.
  This does not replace Unity PlayerPrefs. It copies Unity's IndexedDB save files
  into localStorage and restores them into IndexedDB before Unity starts.
*/
(function () {
  "use strict";

  var DB_NAME = "/idbfs";
  var DB_VERSION = 21;
  var STORE_NAME = "FILE_DATA";
  var LS_KEY = "GolfOrbit_IDBFS_LOCALSTORAGE_MIRROR_v1";
  var EXPORT_DELAY_MS = 2000;
  var exportTimer = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        var db = event.target.result;
        var tx = event.target.transaction;
        var store;
        if (db.objectStoreNames.contains(STORE_NAME)) {
          store = tx.objectStore(STORE_NAME);
        } else {
          store = db.createObjectStore(STORE_NAME);
        }
        if (!store.indexNames.contains("timestamp")) {
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("Could not open IndexedDB")); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB transaction failed")); };
      tx.onabort = function () { reject(tx.error || new Error("IndexedDB transaction aborted")); };
    });
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function packEntry(entry) {
    var packed = {
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : new Date(entry.timestamp || Date.now()).toISOString(),
      mode: entry.mode
    };
    if (entry.contents) packed.contents = bytesToBase64(entry.contents instanceof Uint8Array ? entry.contents : new Uint8Array(entry.contents));
    return packed;
  }

  function unpackEntry(entry) {
    var unpacked = {
      timestamp: new Date(entry.timestamp || Date.now()),
      mode: entry.mode
    };
    if (entry.contents) unpacked.contents = base64ToBytes(entry.contents);
    return unpacked;
  }

  async function exportToLocalStorage() {
    try {
      var db = await openDB();
      var tx = db.transaction([STORE_NAME], "readonly");
      var store = tx.objectStore(STORE_NAME);
      var req = store.openCursor();
      var files = {};
      await new Promise(function (resolve, reject) {
        req.onsuccess = function (event) {
          var cursor = event.target.result;
          if (!cursor) { resolve(); return; }
          files[cursor.key] = packEntry(cursor.value);
          cursor.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
      await txDone(tx).catch(function () {});
      db.close();
      var payload = JSON.stringify({ savedAt: new Date().toISOString(), files: files });
      localStorage.setItem(LS_KEY, payload);
      console.log("[GolfOrbitSaveMirror] Exported " + Object.keys(files).length + " IDBFS entries to localStorage.");
      return true;
    } catch (err) {
      console.warn("[GolfOrbitSaveMirror] Export failed:", err);
      return false;
    }
  }

  async function restoreFromLocalStorage() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var payload = JSON.parse(raw);
      if (!payload || !payload.files) return false;
      var db = await openDB();
      var tx = db.transaction([STORE_NAME], "readwrite");
      var store = tx.objectStore(STORE_NAME);
      Object.keys(payload.files).forEach(function (path) {
        store.put(unpackEntry(payload.files[path]), path);
      });
      await txDone(tx);
      db.close();
      console.log("[GolfOrbitSaveMirror] Restored " + Object.keys(payload.files).length + " localStorage entries into IDBFS.");
      return true;
    } catch (err) {
      console.warn("[GolfOrbitSaveMirror] Restore failed:", err);
      return false;
    }
  }

  function scheduleExport() {
    clearTimeout(exportTimer);
    exportTimer = setTimeout(exportToLocalStorage, EXPORT_DELAY_MS);
  }

  function startAutoExport() {
    setInterval(exportToLocalStorage, 10000);
    window.addEventListener("pagehide", exportToLocalStorage);
    window.addEventListener("beforeunload", exportToLocalStorage);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") exportToLocalStorage();
      else scheduleExport();
    });
    scheduleExport();
  }

  window.GolfOrbitSaveMirror = {
    restore: restoreFromLocalStorage,
    exportNow: exportToLocalStorage,
    startAutoExport: startAutoExport,
    localStorageKey: LS_KEY
  };
})();
