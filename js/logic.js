/* Comfortable life — действия над данными. Ими пользуются и экраны, и ассистент. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});

  function st() { return CL.store.get(); }
  function save() { CL.store.save(); }
  function t(k, v) { return CL.i18n.t(k, v); }
  function uid() { return CL.store.uid(); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function remove(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) { list.splice(i, 1); return true; } return false; }
  function clamp(n, a, b) { n = Number(n); if (!isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }
  function nameOf(o) { return (o && (o.name || (o.nameKey ? t(o.nameKey) : ''))) || ''; }

  /* Кто автор записи: ID аккаунта (пустая строка, если аккаунта нет) */
  function myId() { var a = CL.sync && CL.sync.acct(); return a ? a.aid : ''; }
  /* члены семьи (с сервера) и имя автора записи; для своих записей пусто */
  function members() { var sy = CL.sync && CL.sync.cfg(); return (sy && sy.fam && sy.fam.members) || []; }
  function memberName(id) { var m = members().filter(function (x) { return x.id === id; })[0]; return m ? m.name : ''; }
  function authorName(it) { return it.shared && it.by && it.by !== myId() ? (memberName(it.by) || '') : ''; }
  /* можно ли менять пометку «семейное»: только автору (или если автор неизвестен) */
  function ownShared(it) { return !it.by || it.by === myId(); }

  /* ---------- дом (устройства приходят из подключённых экосистем) ---------- */
  var LEVEL = {
    light: { min: 0, max: 100, step: 5, unit: '%', def: 70 },
    speaker: { min: 0, max: 100, step: 5, unit: '%', def: 30 },
    climate: { min: 16, max: 30, step: 1, unit: '°', def: 22 }
  };
  function devices() { return st().devices; }
  function scenes() { return st().scenes; }
  function setDevice(id, on) { var d = find(st().devices, id); if (!d) return null; d.on = !!on; save(); remote(d); return d; }
  /* диапазон ползунка: у устройств Яндекса берётся из самого устройства */
  function range(d) {
    var base = LEVEL[d.type];
    if (!base) return null;
    if (d.src === 'yandex') {
      if (!d.yr) return null;
      return { min: d.rmin != null ? d.rmin : base.min, max: d.rmax != null ? d.rmax : base.max, step: d.rstep || base.step, unit: base.unit };
    }
    return base;
  }
  function remote(d) { if (d && d.src === 'yandex' && CL.yandex) CL.yandex.send(d); }
  function setLevel(id, v) {
    var d = find(st().devices, id), r = d && range(d);
    if (!d || !r) return null;
    d.level = clamp(v, r.min, r.max); save(); remote(d); return d;
  }
  function runScene(id) {
    var s = find(st().scenes, id); if (!s) return null;
    var touched = [];
    Object.keys(s.actions || {}).forEach(function (did) {
      var d = find(st().devices, did);
      if (d) { d.on = s.actions[did] === 'on'; touched.push(d); }
    });
    save(); touched.forEach(remote); return s;
  }

  /* ---------- заметки ---------- */
  function notes() {
    return st().notes.slice().sort(function (a, b) {
      return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0);
    });
  }
  function addNote(o) {
    var n = { id: uid(), title: o.title || '', text: o.text || '', pinned: !!o.pinned, done: false, ts: Date.now() };
    if (o.shared) { n.shared = true; n.by = myId(); }
    st().notes.push(n); save(); return n;
  }
  function updateNote(id, o) {
    var n = find(st().notes, id); if (!n) return;
    n.title = o.title; n.text = o.text; n.pinned = !!o.pinned; n.ts = Date.now();
    if (o.shared !== undefined && ownShared(n)) { if (o.shared) { n.shared = true; n.by = n.by || myId(); } else { delete n.shared; delete n.by; } }
    save();
  }
  function toggleNote(id) { var n = find(st().notes, id); if (!n) return; n.done = !n.done; n.ts = Date.now(); save(); return n; }
  function deleteNote(id) { remove(st().notes, id); save(); }

  /* ---------- календарь ---------- */
  function events() { return st().events; }
  function eventsOn(key) {
    return events().filter(function (e) { return e.date === key; }).sort(function (a, b) {
      return (a.time || '').localeCompare(b.time || '') || (a.end || '').localeCompare(b.end || '');
    });
  }
  /* «09:00–10:30», «09:00» или пусто (весь день) */
  function timeText(e) { return e.time ? (e.end ? e.time + '–' + e.end : e.time) : ''; }
  function addEvent(o) {
    var e = { id: uid(), title: o.title, date: o.date, time: o.time || '', end: o.time && o.end ? o.end : '' };
    if (o.shared) { e.shared = true; e.by = myId(); }
    st().events.push(e); save(); return e;
  }
  function updateEvent(id, o) {
    var e = find(st().events, id); if (!e) return;
    e.title = o.title; e.date = o.date; e.time = o.time || ''; e.end = o.time && o.end ? o.end : '';
    if (o.shared !== undefined && ownShared(e)) { if (o.shared) { e.shared = true; e.by = e.by || myId(); } else { delete e.shared; delete e.by; } }
    save();
  }
  function deleteEvent(id) { remove(st().events, id); save(); }

  /* ---------- спорт ---------- */
  function addWorkout(o) {
    var w = { id: uid(), type: o.type, min: Math.round(clamp(o.min, 1, 1440)), kcal: o.kcal ? Math.round(clamp(o.kcal, 0, 20000)) : 0, date: o.date || CL.store.dateKey(), ts: Date.now() };
    st().workouts.push(w); save(); return w;
  }
  function deleteWorkout(id) { remove(st().workouts, id); save(); }
  function lastDays(n) {
    var out = [], today = new Date();
    for (var i = n - 1; i >= 0; i--) out.push(CL.store.addDays(today, -i));
    return out;
  }
  function weekStats() {
    var S = CL.store, start = S.weekStart(new Date()), keys = [];
    for (var i = 0; i < 7; i++) keys.push(S.dateKey(S.addDays(start, i)));
    var r = { count: 0, minutes: 0, kcal: 0 };
    st().workouts.forEach(function (w) {
      if (keys.indexOf(w.date) > -1) { r.count++; r.minutes += w.min || 0; r.kcal += w.kcal || 0; }
    });
    return r;
  }
  function minutesPerDay() {
    return lastDays(7).map(function (d) {
      var key = CL.store.dateKey(d), m = 0;
      st().workouts.forEach(function (w) { if (w.date === key) m += w.min || 0; });
      return m;
    });
  }

  /* ---------- здоровье ---------- */
  function readHealth(key) {
    var h = st().health[key || CL.store.dateKey()] || {};
    return { water: h.water || 0, sleep: h.sleep || 0, steps: h.steps || 0, mood: h.mood || 0, meds: h.meds || {} };
  }
  function setHealth(key, patch) {
    var h = CL.store.dayHealth(key);
    Object.keys(patch).forEach(function (k) { h[k] = patch[k]; });
    save();
  }
  function addWater(delta, key) {
    key = key || CL.store.dateKey();
    var h = CL.store.dayHealth(key);
    h.water = clamp((h.water || 0) + delta, 0, 30); save();
    return h.water;
  }
  function healthSeries(field) {
    return lastDays(7).map(function (d) { return readHealth(CL.store.dateKey(d))[field]; });
  }
  /* какие пункты здоровья показывать на экране «Сегодня» */
  function showOnToday(item) { return !!st().hpref[item]; }
  function setShowOnToday(item, on) { st().hpref[item] = !!on; save(); }

  /* лекарства: у каждого свои времена приёма; отметки по дням лежат в health[день].meds */
  function cleanTimes(times) {
    var out = [];
    (times || []).forEach(function (x) { if (/^\d{2}:\d{2}$/.test(x) && out.indexOf(x) < 0) out.push(x); });
    return out.sort();
  }
  function addMed(o) {
    var m = { id: uid(), name: o.name, dose: o.dose || '', times: cleanTimes(o.times) };
    if (!m.times.length) m.times = ['09:00'];
    st().meds.push(m); save(); return m;
  }
  function updateMed(id, o) {
    var m = find(st().meds, id); if (!m) return;
    m.name = o.name; m.dose = o.dose || ''; m.times = cleanTimes(o.times); if (!m.times.length) m.times = ['09:00'];
    save();
  }
  function deleteMed(id) { remove(st().meds, id); save(); }
  /* приёмы на день по времени */
  function medDoses(key) {
    key = key || CL.store.dateKey();
    var taken = readHealth(key).meds, out = [];
    st().meds.forEach(function (m) {
      m.times.forEach(function (tm) { out.push({ med: m, time: tm, key: m.id + '|' + tm, taken: !!taken[m.id + '|' + tm] }); });
    });
    return out.sort(function (a, b) { return a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name); });
  }
  function toggleDose(doseKey, key) {
    key = key || CL.store.dateKey();
    var h = CL.store.dayHealth(key);
    if (h.meds[doseKey]) delete h.meds[doseKey]; else h.meds[doseKey] = true;
    save();
  }

  /* ---------- профиль ---------- */
  function age(birth) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || ''); if (!m) return null;
    var now = new Date(), a = now.getFullYear() - Number(m[1]);
    if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
    return a >= 0 && a < 150 ? a : null;
  }
  function setProfile(p) { Object.assign(st().profile, p); save(); }

  /* ---------- нижняя панель ---------- */
  function tabOn(k) { return st().tabs.indexOf(k) > -1; }
  function setTab(k, on) {
    if (k === 'settings') return;
    var all = CL.store.TAB_ITEMS, cur = st().tabs.filter(function (x) { return x !== k; });
    if (on) cur.push(k);
    st().tabs = all.filter(function (x) { return cur.indexOf(x) > -1; });
    save();
  }

  /* ---------- порядок блоков «Сегодня» ---------- */
  function moveBlock(key, delta) {
    var o = st().today.order, i = o.indexOf(key), j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, key); save();
  }
  function setBlockHidden(key, hide) {
    var hd = st().today.hidden, i = hd.indexOf(key);
    if (hide && i < 0) hd.push(key); else if (!hide && i > -1) hd.splice(i, 1);
    save();
  }

  CL.logic = {
    find: find, remove: remove, clamp: clamp, nameOf: nameOf, myId: myId, members: members, memberName: memberName, authorName: authorName, ownShared: ownShared, LEVEL: LEVEL, range: range,
    devices: devices, scenes: scenes, setDevice: setDevice, setLevel: setLevel, runScene: runScene,
    notes: notes, addNote: addNote, updateNote: updateNote, toggleNote: toggleNote, deleteNote: deleteNote,
    events: events, eventsOn: eventsOn, timeText: timeText, addEvent: addEvent, updateEvent: updateEvent, deleteEvent: deleteEvent,
    addWorkout: addWorkout, deleteWorkout: deleteWorkout, weekStats: weekStats, minutesPerDay: minutesPerDay, lastDays: lastDays,
    readHealth: readHealth, setHealth: setHealth, addWater: addWater, healthSeries: healthSeries,
    showOnToday: showOnToday, setShowOnToday: setShowOnToday,
    addMed: addMed, updateMed: updateMed, deleteMed: deleteMed, medDoses: medDoses, toggleDose: toggleDose,
    age: age, setProfile: setProfile, tabOn: tabOn, setTab: setTab, moveBlock: moveBlock, setBlockHidden: setBlockHidden
  };
})();
