/* Comfortable life — Яндекс Умный дом.
   Человек входит в свой аккаунт Яндекса кнопкой, вручную токены не вводятся. Токен хранит сервер (server/Code.gs) у аккаунта,
   а сюда приходят только список устройств и их состояние. Какие устройства показывать, человек выбирает из списка.
   Управление строится по возможностям самого устройства: вкл/выкл, ползунки, режимы, переключатели; показания датчиков. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var S = CL.store;
  var timers = {}, poll = null, busy = false;

  function t(k, v) { return CL.i18n.t(k, v); }
  function st() { return S.get(); }
  function acct() { return CL.sync && CL.sync.acct(); }
  function via() { var a = acct(), h = CL.sync && CL.sync.homeAid && CL.sync.homeAid(); return a && h && h !== a.aid ? h : ''; }
  function isAdmin() { var a = acct(), h = CL.sync && CL.sync.homeAid && CL.sync.homeAid(); return !!(a && a.ya && (!h || h === a.aid)); }
  function connected() { var a = acct(); return !!(a && (a.ya || via())); }
  function ya(body) { var v = via(); return CL.sync.call(Object.assign({ op: 'ya' }, v ? { via: v } : {}, body)); }
  function canon(o) { return JSON.stringify(o); }

  function mapType(yt) {
    yt = String(yt || '');
    if (/light/.test(yt)) return 'light';
    if (/thermostat|\.ac$|heater|humidifier|purifier|cooler|fan/.test(yt)) return 'climate';
    if (/speaker|media_device|receiver|tv/.test(yt)) return 'speaker';
    if (/lock/.test(yt)) return 'lock';
    if (/sensor/.test(yt)) return 'sensor';
    return 'plug';
  }

  var LBL = {
    ru: {
      brightness: 'Яркость', temperature: 'Температура', volume: 'Громкость', channel: 'Канал', humidity: 'Влажность', open: 'Открытие',
      thermostat: 'Режим', fan_speed: 'Скорость вентилятора', swing: 'Направление воздуха', program: 'Программа', work_speed: 'Скорость', cleanup_mode: 'Уборка', heat: 'Нагрев',
      input_source: 'Источник', dishwashing: 'Мойка', tea_mode: 'Чай', coffee_mode: 'Кофе', mute: 'Без звука', pause: 'Пауза', oscillation: 'Вращение', backlight: 'Подсветка',
      ionization: 'Ионизация', keep_warm: 'Подогрев', controls_locked: 'Блокировка', color_temp: 'Цветовая температура', battery_level: 'Заряд', pressure: 'Давление',
      illumination: 'Освещённость', co2_level: 'CO₂', water_level: 'Уровень воды', power: 'Мощность', voltage: 'Напряжение', amperage: 'Ток', motion: 'Движение', button: 'Кнопка',
      water_leak: 'Протечка', smoke: 'Дым', gas: 'Газ', vibration: 'Вибрация', battery: 'Батарея', food_level: 'Корм', pm1_density: 'PM1', pm2_5_density: 'PM2.5', pm10_density: 'PM10', tvoc: 'ЛОС'
    },
    en: {
      brightness: 'Brightness', temperature: 'Temperature', volume: 'Volume', channel: 'Channel', humidity: 'Humidity', open: 'Open',
      thermostat: 'Mode', fan_speed: 'Fan speed', swing: 'Air direction', program: 'Program', work_speed: 'Speed', cleanup_mode: 'Cleaning', heat: 'Heat',
      input_source: 'Source', mute: 'Mute', pause: 'Pause', oscillation: 'Oscillation', backlight: 'Backlight', ionization: 'Ionization', keep_warm: 'Keep warm',
      controls_locked: 'Child lock', color_temp: 'Color temperature', battery_level: 'Battery', pressure: 'Pressure', illumination: 'Illuminance', co2_level: 'CO₂',
      water_level: 'Water level', power: 'Power', voltage: 'Voltage', amperage: 'Current', motion: 'Motion', button: 'Button', water_leak: 'Leak', smoke: 'Smoke', gas: 'Gas',
      vibration: 'Vibration', battery: 'Battery'
    }
  };
  var VAL = {
    ru: {
      cool: 'Охлаждение', heat: 'Нагрев', auto: 'Авто', eco: 'Эко', dry: 'Осушение', fan_only: 'Вентиляция', low: 'Низкая', medium: 'Средняя', high: 'Высокая',
      quiet: 'Тихая', turbo: 'Турбо', max: 'Максимум', min: 'Минимум', normal: 'Обычная', horizontal: 'Горизонтально', vertical: 'Вертикально', stationary: 'Фиксировано',
      one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
      opened: 'открыто', closed: 'закрыто', detected: 'есть', not_detected: 'нет', leak: 'протечка', dry_ev: 'сухо', click: 'нажатие', double_click: 'двойное', long_press: 'долгое',
      low_ev: 'низкий', normal_ev: 'нормальный', high_ev: 'высокий'
    },
    en: {
      cool: 'Cool', heat: 'Heat', auto: 'Auto', eco: 'Eco', dry: 'Dry', fan_only: 'Fan only', low: 'Low', medium: 'Medium', high: 'High', quiet: 'Quiet', turbo: 'Turbo',
      max: 'Max', min: 'Min', normal: 'Normal', horizontal: 'Horizontal', vertical: 'Vertical', stationary: 'Fixed',
      opened: 'open', closed: 'closed', detected: 'detected', not_detected: 'none', leak: 'leak', click: 'click', double_click: 'double', long_press: 'long'
    }
  };
  function lang() { return CL.i18n.getLang() === 'ru' ? 'ru' : 'en'; }
  function lbl(i) { return LBL[lang()][i] || String(i || '').replace(/_/g, ' '); }
  function val(v) { return VAL[lang()][v] || String(v == null ? '' : v).replace(/_/g, ' '); }
  function unitOf(u) {
    u = String(u || '');
    if (/celsius/.test(u)) return '°C';
    if (/percent/.test(u)) return '%';
    if (/kelvin/.test(u)) return ' K';
    if (/pressure\.(mmhg)/.test(u)) return ' мм рт. ст.';
    if (/pressure\.pascal/.test(u)) return ' Па';
    if (/illumination/.test(u)) return ' лк';
    if (/watt/.test(u)) return ' Вт';
    if (/volt/.test(u)) return ' В';
    if (/ampere/.test(u)) return ' А';
    if (/ppm/.test(u)) return ' ppm';
    if (/density/.test(u)) return ' мкг/м³';
    return '';
  }

  /* из возможностей устройства Яндекса строим список элементов управления и показаний датчиков */
  function controlsOf(yd) {
    var out = [], hasOn = false, onVal = false;
    (yd.capabilities || []).forEach(function (c) {
      var p = c.parameters || {}, stt = c.state || {}, T = c.type || '';
      if (T === 'devices.capabilities.on_off') { hasOn = true; onVal = !!stt.value; return; }
      if (T === 'devices.capabilities.range' && p.instance) {
        var r = p.range || {};
        out.push({ t: 'range', i: p.instance, min: r.min != null ? r.min : 0, max: r.max != null ? r.max : 100, step: r.precision || 1, u: unitOf(p.unit), v: stt.value != null ? stt.value : (r.min != null ? r.min : 0) });
      } else if (T === 'devices.capabilities.mode' && p.instance) {
        out.push({ t: 'mode', i: p.instance, modes: (p.modes || []).map(function (m) { return m.value; }), v: stt.value });
      } else if (T === 'devices.capabilities.toggle' && p.instance) {
        out.push({ t: 'toggle', i: p.instance, v: !!stt.value });
      } else if (T === 'devices.capabilities.color_setting' && p.temperature_k) {
        out.push({ t: 'ctemp', i: 'temperature_k', min: p.temperature_k.min || 2700, max: p.temperature_k.max || 6500, step: 100, u: ' K', v: stt.instance === 'temperature_k' && stt.value != null ? stt.value : (p.temperature_k.min || 2700) });
      }
    });
    var sens = [];
    (yd.properties || []).forEach(function (pr) {
      var p = pr.parameters || {}, stt = pr.state;
      if (!stt || stt.value == null) return;
      var i = p.instance || stt.instance;
      if (pr.type === 'devices.properties.float') sens.push({ i: i, v: stt.value, u: unitOf(p.unit) });
      else if (pr.type === 'devices.properties.event') sens.push({ i: i, ev: stt.value });
    });
    return { hasOn: hasOn, on: onVal, ctl: out, sens: sens };
  }

  function mergeDevices(info) {
    var s = st(), roomOf = {};
    (info.rooms || []).forEach(function (rm) { (rm.devices || []).forEach(function (id) { roomOf[id] = rm.name; }); });
    var before = canon(s.devices.filter(function (d) { return d.src === 'yandex'; }));
    var seen = {}, pick = s.yaPick;
    (info.devices || []).forEach(function (yd) {
      if (!Array.isArray(pick) || pick.indexOf(yd.id) < 0) return;      // только выбранные человеком
      var cc = controlsOf(yd), type = mapType(yd.type), id = 'ya_' + yd.id;
      seen[id] = 1;
      var d = CL.logic.find(s.devices, id);
      if (!d) {
        d = { id: id, name: yd.name, room: roomOf[yd.id] || 'room.other', type: type, eco: 'eco.yandex', src: 'yandex', ext: yd.id };
        s.devices.push(d);
      }
      d.hasOn = cc.hasOn; d.on = cc.hasOn ? cc.on : true;
      d.yc = cc.ctl; d.ys = cc.sens; d.yr = ''; delete d.level;
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
      if (CL.sync.homeAid() === acct().aid) CL.sync.setHome(null);
      acct().ya = false;
      var s = st(); s.devices = s.devices.filter(function (d) { return d.src !== 'yandex'; }); delete s.yaPick;
      S.save();
    });
  }
  var lastInfo = null;
  /* список устройств аккаунта Яндекса (для выбора) */
  function fetchInfo() {
    return ya({ method: 'GET', path: '/v1.0/user/info' }).then(function (r) {
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
    return (info.devices || []).map(function (yd) {
      var cc = controlsOf(yd);
      return { id: yd.id, name: yd.name, room: roomOf[yd.id] || '', type: mapType(yd.type), view: !cc.hasOn && !cc.ctl.length };
    });
  }
  function setPick(ids) {
    st().yaPick = ids.slice();
    var hm = CL.sync.cfg() && CL.sync.cfg().home;
    if (hm && hm.aid === acct().aid) CL.sync.setHome({ pick: ids });
    if (lastInfo) mergeDevices(lastInfo);
    S.save();
  }
  function count() { return st() ? st().devices.filter(function (d) { return d.src === 'yandex'; }).length : 0; }
  function needPick() { return connected() && !via() && !Array.isArray(st().yaPick); }

  /* ---------- команды ---------- */
  function post(d, actions) {
    return ya({ method: 'POST', path: '/v1.0/devices/actions', body: { devices: [{ id: d.ext, actions: actions }] } }).then(function (r) {
      if (!r.ok || !r.data || r.data.status !== 'ok') throw r;
    }).catch(function () {
      CL.ui.toast(t('ya.sendErr'));
      refresh(true);
    });
  }
  function send(d) {
    if (!d || d.src !== 'yandex' || !d.ext || !connected() || !d.hasOn) return;
    clearTimeout(timers[d.id + ':on']);
    timers[d.id + ':on'] = setTimeout(function () {
      post(d, [{ type: 'devices.capabilities.on_off', state: { instance: 'on', value: !!d.on } }]);
    }, 350);
  }
  /* одно действие: ползунок, режим или переключатель */
  var CAPT = { range: 'range', mode: 'mode', toggle: 'toggle', ctemp: 'color_setting' };
  function act(d, c, v) {
    if (!d || d.src !== 'yandex' || !d.ext || !connected()) return;
    c.v = v; S.save();
    var key = d.id + ':' + c.i;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      post(d, [{ type: 'devices.capabilities.' + CAPT[c.t], state: { instance: c.i, value: c.t === 'range' || c.t === 'ctemp' ? Number(v) : v } }]);
    }, 350);
  }
  /* что именно возвращает Яндекс: для проверки, почему устройства нет или оно урезано */
  function meta() {
    var i = lastInfo || {}, n = function (a) { return Array.isArray(a) ? a.length : 0; };
    var hh = (i.households || []).map(function (x) { return x.name + ' (' + n(x.devices || []) + ')'; }).join(', ');
    return 'devices: ' + n(i.devices) + '; rooms: ' + n(i.rooms) + '; groups: ' + n(i.groups) + '; scenarios: ' + n(i.scenarios) + '; households: ' + (hh || n(i.households)) + '; keys: ' + Object.keys(i).join(',');
  }
  function raw() {
    var info = lastInfo || { devices: [] };
    return (info.devices || []).map(function (yd) {
      return {
        name: yd.name, type: String(yd.type || '').replace('devices.types.', ''),
        caps: (yd.capabilities || []).map(function (c) { var p = c.parameters || {}; return String(c.type || '').replace('devices.capabilities.', '') + (p.instance ? ':' + p.instance : ''); }),
        props: (yd.properties || []).map(function (c) { var p = c.parameters || {}; return String(c.type || '').replace('devices.properties.', '') + (p.instance ? ':' + p.instance : ''); })
      };
    });
  }

  function start() {
    stop();
    poll = setInterval(function () { if (!document.hidden && connected()) refresh(true); }, 30000);
  }
  function stop() { clearInterval(poll); poll = null; }

  CL.yandex = { login: login, disconnect: disconnect, refresh: refresh, fetchInfo: fetchInfo, choices: choices, setPick: setPick, act: act, raw: raw, meta: meta, lbl: lbl, val: val, needPick: needPick, connected: connected, via: via, isAdmin: isAdmin, send: send, count: count, start: start, stop: stop };
})();
