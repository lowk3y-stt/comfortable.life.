/* Comfortable life — хранилище данных.
   Данные лежат в localStorage на устройстве. Если включён PIN, они шифруются (AES-GCM, ключ из PIN через PBKDF2). */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});

  var KEY_DATA = 'cl_data_v1';
  var KEY_META = 'cl_meta_v1';
  var ITER = 250000;

  var state = null;       // расшифрованные данные в памяти
  var cryptoKey = null;   // ключ в памяти, пока приложение разблокировано
  var meta = loadMeta();
  var listeners = [];
  var saveTimer = null;
  var saveChain = Promise.resolve();

  /* ---------- утилиты ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { var x = new Date(d); var wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; }

  function b64(buf) { var s = ''; var a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s); var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

  function loadMeta() {
    try { var m = JSON.parse(localStorage.getItem(KEY_META)); if (m && typeof m === 'object') return m; } catch (e) {}
    return { pin: false, lang: 'auto', autolock: 1 };
  }
  function saveMeta() { try { localStorage.setItem(KEY_META, JSON.stringify(meta)); } catch (e) {} }

  function cryptoOk() { return !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false); }

  /* ---------- шифрование ---------- */
  function deriveKey(pin, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptJson(obj, key) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var data = new TextEncoder().encode(JSON.stringify(obj));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data).then(function (ct) {
      return { enc: 1, iv: b64(iv), ct: b64(ct) };
    });
  }
  function decryptJson(box, key) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)).then(function (pt) {
      return JSON.parse(new TextDecoder().decode(pt));
    });
  }

  /* ---------- данные по умолчанию ---------- */
  var TODAY_BLOCKS = ['agenda', 'health', 'meds', 'scenes', 'sport', 'notes'];
  var HEALTH_ITEMS = ['water', 'sleep', 'steps', 'mood', 'meds'];
  var TAB_ITEMS = ['today', 'home', 'notes', 'calendar', 'sport', 'health', 'family', 'settings'];

  function defaults() {
    return {
      v: 2,
      profile: { name: '', surname: '', birth: '', gender: '' },
      goals: { workouts: 3, water: 8, sleep: 8, steps: 8000 },
      today: { order: TODAY_BLOCKS.slice(), hidden: [] },
      tabs: TAB_ITEMS.slice(),
      hpref: { water: true, sleep: true, steps: true, mood: false, meds: false },
      devices: [], scenes: [],
      notes: [], events: [], workouts: [], meds: [], health: {}
    };
  }

  function normalize(d) {
    var base = defaults();
    if (!d || typeof d !== 'object') return base;
    ['profile', 'goals', 'hpref'].forEach(function (k) { d[k] = Object.assign({}, base[k], d[k] || {}); });
    ['devices', 'scenes', 'notes', 'events', 'workouts', 'meds'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    if (!d.health || typeof d.health !== 'object') d.health = {};

    /* версия 1 → 2: «Личное/Семья» заменены пометкой «семейное»; примеры устройств убраны; участники берутся с сервера */
    if (!d.v || d.v < 2) {
      ['notes', 'events'].forEach(function (k) {
        d[k].forEach(function (it) { if (it.space === 'family') it.shared = true; delete it.space; });
      });
      d.devices = d.devices.filter(function (x) { return !x.nameKey; });
      d.scenes = d.scenes.filter(function (x) { return !x.nameKey; });
      d.devices.concat(d.scenes).forEach(function (x) { delete x.space; });
      delete d.space; delete d.members;
    }
    delete d.members; delete d.space;

    /* порядок блоков «Сегодня»: известные блоки по сохранённому порядку, новые — в конец */
    var t = d.today && typeof d.today === 'object' ? d.today : {};
    var order = (Array.isArray(t.order) ? t.order : []).filter(function (k) { return TODAY_BLOCKS.indexOf(k) > -1; });
    TODAY_BLOCKS.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    d.today = { order: order, hidden: (Array.isArray(t.hidden) ? t.hidden : []).filter(function (k) { return TODAY_BLOCKS.indexOf(k) > -1; }) };
    /* разделы нижней панели: «Настройки» всегда на месте */
    var tabs = (Array.isArray(d.tabs) ? d.tabs : TAB_ITEMS).filter(function (k) { return TAB_ITEMS.indexOf(k) > -1; });
    if (tabs.indexOf('settings') < 0) tabs.push('settings');
    d.tabs = TAB_ITEMS.filter(function (k) { return tabs.indexOf(k) > -1; });
    d.v = 2;
    return d;
  }

  /* ---------- сохранение ---------- */
  function emit() { listeners.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } }); }

  function persistNow() {
    if (!state) return Promise.resolve();
    var snapshot = state;
    saveChain = saveChain.then(function () {
      if (meta.pin && cryptoKey) {
        return encryptJson(snapshot, cryptoKey).then(function (box) { localStorage.setItem(KEY_DATA, JSON.stringify(box)); });
      }
      if (!meta.pin) localStorage.setItem(KEY_DATA, JSON.stringify(snapshot));
    }).catch(function (e) { console.error('save failed', e); });
    return saveChain;
  }
  function save() {
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 150);
  }
  function flush() { clearTimeout(saveTimer); return persistNow(); }

  /* ---------- запуск, блокировка, PIN ---------- */
  function raw() { try { return JSON.parse(localStorage.getItem(KEY_DATA)); } catch (e) { return null; } }

  function init() {
    if (meta.pin) return Promise.resolve('locked');
    state = normalize(raw());
    return Promise.resolve('ready');
  }

  function failInfo() {
    var until = meta.lockUntil || 0;
    var left = Math.ceil((until - Date.now()) / 1000);
    return left > 0 ? left : 0;
  }

  function unlock(pin) {
    var wait = failInfo();
    if (wait) return Promise.reject({ code: 'wait', seconds: wait });
    var box = raw();
    if (!box || !box.enc) return Promise.reject({ code: 'nodata' });
    return deriveKey(pin, unb64(meta.salt), meta.iter || ITER).then(function (key) {
      return decryptJson(box, key).then(function (d) {
        cryptoKey = key; state = normalize(d);
        meta.fails = 0; meta.lockUntil = 0; saveMeta();
        return true;
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      meta.fails = (meta.fails || 0) + 1;
      if (meta.fails >= 5) { meta.lockUntil = Date.now() + 30000; meta.fails = 0; }
      saveMeta();
      var w = failInfo();
      throw w ? { code: 'wait', seconds: w } : { code: 'wrong' };
    });
  }

  function lock() {
    if (!meta.pin) return false;
    return flush().then(function () { state = null; cryptoKey = null; return true; });
  }

  function verify(pin) {
    return deriveKey(pin, unb64(meta.salt), meta.iter || ITER).then(function (key) {
      return decryptJson(raw(), key).then(function () { return key; });
    }).catch(function () { throw { code: 'wrong' }; });
  }

  function setPin(pin) {
    if (!cryptoOk()) return Promise.reject({ code: 'nocrypto' });
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return deriveKey(pin, salt, ITER).then(function (key) {
      return encryptJson(state, key).then(function (box) {
        localStorage.setItem(KEY_DATA, JSON.stringify(box));
        cryptoKey = key; meta.pin = true; meta.salt = b64(salt); meta.iter = ITER; meta.fails = 0; meta.lockUntil = 0;
        saveMeta();
      });
    });
  }
  function changePin(oldPin, newPin) {
    return verify(oldPin).then(function () { return setPin(newPin); });
  }
  function removePin(pin) {
    return verify(pin).then(function () {
      meta.pin = false; delete meta.salt; delete meta.iter; saveMeta();
      cryptoKey = null;
      localStorage.setItem(KEY_DATA, JSON.stringify(state));
    });
  }

  /* ---------- экспорт / импорт / сброс ---------- */
  /* копия без данных входа в аккаунт */
  function exportJson() { var c = Object.assign({}, state); delete c.sync; return JSON.stringify(c, null, 2); }
  function importJson(text) {
    var d = JSON.parse(text);
    if (!d || typeof d !== 'object' || !Array.isArray(d.notes) && !Array.isArray(d.events)) throw new Error('bad');
    var keep = state && state.sync;
    delete d.sync;
    state = normalize(d);
    if (keep) state.sync = keep;
    save();
    return flush();
  }
  function reset() {
    try { localStorage.removeItem(KEY_DATA); localStorage.removeItem(KEY_META); } catch (e) {}
    meta = { pin: false, lang: 'auto', autolock: 1 };
    state = normalize(null); cryptoKey = null;
    save();
    return flush();
  }

  /* ---------- доступ ---------- */
  function dayHealth(key) {
    key = key || dateKey();
    if (!state.health[key]) state.health[key] = { water: 0, sleep: 0, steps: 0, mood: 0 };
    if (!state.health[key].meds) state.health[key].meds = {};
    return state.health[key];
  }

  CL.store = {
    uid: uid, pad: pad, dateKey: dateKey, parseKey: parseKey, addDays: addDays, weekStart: weekStart,
    init: init, unlock: unlock, lock: lock, setPin: setPin, changePin: changePin, removePin: removePin,
    save: save, flush: flush, subscribe: function (f) { listeners.push(f); },
    get: function () { return state; },
    meta: function () { return meta; }, saveMeta: saveMeta,
    hasPin: function () { return !!meta.pin; }, cryptoOk: cryptoOk, failInfo: failInfo,
    TODAY_BLOCKS: TODAY_BLOCKS, TAB_ITEMS: TAB_ITEMS, HEALTH_ITEMS: HEALTH_ITEMS, dayHealth: dayHealth, exportJson: exportJson, importJson: importJson, reset: reset
  };
})();
