/* Comfortable life — Яндекс Умный дом.
   Человек входит в свой аккаунт Яндекса кнопкой, вручную токены не вводятся. Токен хранит сервер (server/Code.gs) у аккаунта,
   а сюда приходят только список устройств и их состояние. Какие устройства показывать, человек выбирает из списка.
   Управление: включить/выключить, яркость, температура, громкость (если устройство это умеет). */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var S = CL.store;
  var timers = {}, poll = null, busy = false;

  function t(k, v) { return CL.i18n.t(k, v); }
  function st() { return S.get(); }
  function acct() { return CL.sync && CL.sync.acct(); }
  function connected() { var a = acct(); return !!(a && a.ya); }
  function canon(o) { return JSON.stringify(o); }

  function mapType(yt) {
    yt = String(yt || '');
    if (/light/.test(yt)) return 'light';
    if (/thermostat|\.ac$|heater|humidifier|purifier|cooler/.test(yt)) return 'climate';
    if (/speaker|media_device|receiver/.test(yt)) return 'speaker';
    if (/lock/.test(yt)) return 'lock';
    return 'plug';
  }
  var PREFERRED = { light: 'brightness', climate: 'temperature', speaker: 'volume' };

  function mergeDevices(info) {
    var s = st(), roomOf = {};
    (info.rooms || []).forEach(function (rm) { (rm.devices || []).forEach(function (id) { roomOf[id] = rm.name; }); });
    var before = canon(s.devices.filter(function (d) { return d.src === 'yandex'; }));
    var seen = {}, pick = s.yaPick;
    (info.devices || []).forEach(function (yd) {
      if (!Array.isArray(pick) || pick.indexOf(yd.id) < 0) return;      // только выбранные человеком
      var caps = yd.capabilities || [];
      var onoff = caps.filter(function (c) { return c.type === 'devices.capabilities.on_off'; })[0];
      if (!onoff) return;
      var type = mapType(yd.type), id = 'ya_' + yd.id;
      seen[id] = 1;
      var d = CL.logic.find(s.devices, id);
      if (!d) {
        d = { id: id, name: yd.name, room: roomOf[yd.id] || 'room.other', type: type, eco: 'eco.yandex', src: 'yandex', ext: yd.id };
        s.devices.push(d);
      }
      d.on = !!(onoff.state && onoff.state.value);
      var inst = PREFERRED[type], rng = null;
      caps.forEach(function (c) {
        if (c.type === 'devices.capabilities.range' && c.parameters && c.parameters.instance === inst) rng = c;
      });
      if (rng) {
        d.yr = inst;
        var r = rng.parameters.range || {};
        if (r.min != null) d.rmin = r.min;
        if (r.max != null) d.rmax = r.max;
        if (r.precision) d.rstep = r.precision;
        if (rng.state && rng.state.value != null) d.level = rng.state.value;
        else if (d.level == null) d.level = r.min != null ? r.min : 0;
      } else { d.yr = ''; delete d.level; }
    });
    s.devices = s.devices.filter(function (d) { return d.src !== 'yandex' || seen[d.id]; });
    var after = canon(s.devices.filter(function (d) { return d.src === 'yandex'; }));
    if (before !== after) S.save();
  }

  /* ---------- подключение ---------- */
  /* уходим на вход в Яндекс; сервер сам получит токен и вернёт человека в приложение */
  function login() {
    if (!acct()) return Promise.reject({ error: 'off' });
    return CL.sync.call({ op: 'ya_start', ret: location.href.split('#')[0] }).then(function (r) {
      if (!r.ok) throw r;
      S.flush();
      location.href = r.url;
    });
  }
  function disconnect() {
    return CL.sync.call({ op: 'ya_clear' }).then(function (r) {
      if (!r.ok) throw r;
      acct().ya = false;
      var s = st(); s.devices = s.devices.filter(function (d) { return d.src !== 'yandex'; }); delete s.yaPick;
      S.save();
    });
  }
  var lastInfo = null;
  /* список устройств аккаунта Яндекса (для выбора) */
  function fetchInfo() {
    return CL.sync.call({ op: 'ya', method: 'GET', path: '/v1.0/user/info' }).then(function (r) {
      if (r && r.error === 'noyandex') { if (acct()) acct().ya = false; S.save(); }
      if (!r.ok || !r.data || r.data.status !== 'ok') throw r;
      lastInfo = r.data;
      return r.data;
    });
  }
  function refresh(quiet) {
    if (!connected() || busy) return Promise.resolve();
    busy = true;
    return fetchInfo().then(function (info) {
      if (Array.isArray(st().yaPick)) mergeDevices(info);
    }).catch(function (e) {
      if (!quiet) throw e;
    }).then(function () { busy = false; }, function (e) { busy = false; throw e; });
  }
  /* что можно выбрать: id, название, комната, тип */
  function choices() {
    var info = lastInfo || { devices: [], rooms: [] }, roomOf = {};
    (info.rooms || []).forEach(function (rm) { (rm.devices || []).forEach(function (id) { roomOf[id] = rm.name; }); });
    return (info.devices || []).filter(function (yd) {
      return (yd.capabilities || []).some(function (c) { return c.type === 'devices.capabilities.on_off'; });
    }).map(function (yd) { return { id: yd.id, name: yd.name, room: roomOf[yd.id] || '', type: mapType(yd.type) }; });
  }
  function setPick(ids) {
    st().yaPick = ids.slice();
    if (lastInfo) mergeDevices(lastInfo);
    S.save();
  }
  function count() { return st() ? st().devices.filter(function (d) { return d.src === 'yandex'; }).length : 0; }
  function needPick() { return connected() && !Array.isArray(st().yaPick); }

  /* ---------- команды ---------- */
  function send(d) {
    if (!d || d.src !== 'yandex' || !d.ext || !connected()) return;
    clearTimeout(timers[d.id]);
    timers[d.id] = setTimeout(function () {
      var actions = [{ type: 'devices.capabilities.on_off', state: { instance: 'on', value: !!d.on } }];
      if (d.on && d.yr && d.level != null) actions.push({ type: 'devices.capabilities.range', state: { instance: d.yr, value: Number(d.level) } });
      CL.sync.call({ op: 'ya', method: 'POST', path: '/v1.0/devices/actions', body: { devices: [{ id: d.ext, actions: actions }] } }).then(function (r) {
        if (!r.ok || !r.data || r.data.status !== 'ok') throw r;
      }).catch(function () {
        CL.ui.toast(t('ya.sendErr'));
        refresh(true);
      });
    }, 350);
  }

  function start() {
    stop();
    poll = setInterval(function () { if (!document.hidden && connected()) refresh(true); }, 30000);
  }
  function stop() { clearInterval(poll); poll = null; }

  CL.yandex = { login: login, disconnect: disconnect, refresh: refresh, fetchInfo: fetchInfo, choices: choices, setPick: setPick, needPick: needPick, connected: connected, send: send, count: count, start: start, stop: stop };
})();
