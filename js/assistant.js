/* Comfortable life — встроенный помощник.
   Команды приложения (заметка, событие, вода, устройства…) выполняются на телефоне без интернета.
   Всё остальное («как дела», сочинение, любой вопрос) уходит на сервер и отвечает ИИ — для этого нужен аккаунт. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var U, L, S;
  var history = [];       // {from: 'me' | 'bot', text}
  var panel = null, opener = null, chipsOpen = true, full = false, waiting = false;
  U = CL.ui; L = CL.logic; S = CL.store;

  function t(k, v) { return CL.i18n.t(k, v); }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function words(s) { return norm(s).split(/[^a-zа-я0-9]+/).filter(Boolean); }
  function stem(w) { return w.slice(0, 4); }
  function has(s, re) { return re.test(s); }

  var FILLER = ['включи', 'выключи', 'погаси', 'отключи', 'зажги', 'закрой', 'открой', 'запусти', 'активируй', 'сцену', 'сцена', 'сценарий', 'сценарии',
    'turn', 'switch', 'run', 'start', 'activate', 'scene', 'the', 'my', 'off', 'all', 'please', 'пожалуйста', 'мне', 'наш', 'нашу', 'мой', 'мою', 'во', 'на', 'в', 'и', 'a', 'of', 'in', 'on', 'to', 'for', 'lock', 'unlock', 'open', 'enable', 'whole'];
  var SYN = { ламп: 'свет', lamp: 'light', bulb: 'light', освещ: 'свет', lights: 'light' };

  /* название на всех языках сразу, чтобы команды на русском и английском находили одно и то же устройство */
  function anyName(o) { return o.name || (o.nameKey ? CL.i18n.all(o.nameKey).join(' ') : ''); }

  /* поиск объекта по названию: считаем совпавшие основы слов */
  function bestMatch(text, items, nameFn, extraFn) {
    var q = words(text).filter(function (w) { return w.length > 1 && FILLER.indexOf(w) < 0; }).map(stem).map(function (s) { return SYN[s] || s; });
    if (!q.length) return [];
    var best = 0, out = [];
    items.forEach(function (it) {
      var toks = words(nameFn(it) + ' ' + (extraFn ? extraFn(it) : '')).map(stem);
      var score = 0;
      q.forEach(function (s) { if (toks.indexOf(s) > -1) score++; });
      if (score > best) { best = score; out = [it]; } else if (score === best && score > 0) out.push(it);
    });
    return best > 0 ? out : [];
  }

  function parseDate(raw) {
    var now = new Date(), s = norm(raw), d = null, hit = null, m;
    if ((m = /послезавтра|day after tomorrow/.exec(s))) { d = S.addDays(now, 2); hit = m[0]; }
    else if ((m = /завтра|tomorrow/.exec(s))) { d = S.addDays(now, 1); hit = m[0]; }
    else if ((m = /сегодня|today/.exec(s))) { d = now; hit = m[0]; }
    else if ((m = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(s))) {
      var y = m[3] ? Number(m[3]) : now.getFullYear(); if (y < 100) y += 2000;
      d = new Date(y, Number(m[2]) - 1, Number(m[1])); hit = m[0];
      if (!m[3] && d < S.parseKey(S.dateKey(now))) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    } else {
      var names = [['понедельн', 'monday'], ['вторник', 'tuesday'], ['сред', 'wednesday'], ['четверг', 'thursday'], ['пятниц', 'friday'], ['суббот', 'saturday'], ['воскресен', 'sunday']];
      for (var i = 0; i < names.length; i++) {
        var r = new RegExp('(?:^|\\s)(' + names[i][0] + '\\S*|' + names[i][1] + ')'); m = r.exec(s);
        if (m) {
          var target = (i + 1) % 7, diff = (target - now.getDay() + 7) % 7 || 7;
          d = S.addDays(now, diff); hit = m[1]; break;
        }
      }
    }
    return { date: d, hit: hit };
  }
  function parseTime(s) {
    var m = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(s);
    var h, min, hit;
    if (m) { h = Number(m[1]); min = Number(m[2]); hit = m[0]; if (m[3]) { var pm = /pm/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; } }
    else {
      m = /(?:^|\s)(?:в|at|к)\s*(\d{1,2})(?:\s*(?:ч|час\S*|h|am|pm|утра|вечера|дня))?(?=\s|$|[.,!?])/i.exec(s);
      if (!m) return null;
      h = Number(m[1]); min = 0; hit = m[0];
      if (/pm|вечера/i.test(m[0]) && h < 12) h += 12;
      else if (/дня/i.test(m[0]) && h < 12 && h > 0) h += 12;
    }
    if (h > 23 || min > 59) return null;
    return { time: S.pad(h) + ':' + S.pad(min), hit: hit };
  }

  function dayWord(key) {
    var today = S.dateKey(), tom = S.dateKey(S.addDays(new Date(), 1));
    if (key === today) return t('as.dayToday');
    if (key === tom) return t('as.dayTomorrow');
    return U.fmt(S.parseKey(key), { day: 'numeric', month: 'long' });
  }

  /* ---------- распознавание команд ---------- */
  function reply(text) {
    var raw = String(text).trim(), s = norm(raw), m;
    if (!raw) return '';
    var st = S.get();

    /* создание сценария */
    if ((m = /(?:^|\s)(?:создай|создать|добавь|сделай|create|make|add|new)\s+(?:новый\s+|новую\s+|new\s+)?(?:сценари\S*|сцену|scene)\s*(.*)$/i.exec(raw))) {
      var rest = m[1].trim(), vi = rest.search(/(?:^|[\s:,])(?:включ\S*|выключ\S*|отключ\S*|turn\s+(?:on|off)|switch\s+(?:on|off))/i);
      var sname = (vi > 0 ? rest.slice(0, vi) : '').replace(/^[\s«"“]+|[\s:,—\-»"”]+$/g, '').replace(/^(?:с названием|called|named)\s+/i, '');
      var acts = {}, body = vi >= 0 ? rest.slice(vi) : '';
      body.split(/\s*(?:,|;|\sи\s|\sand\s|\sthen\s|\sпотом\s)\s*/i).forEach(function (part) {
        var ps = norm(part), on = null;
        if (/(^|\s)(выключ|отключ)|turn\s+off|switch\s+off/.test(ps)) on = 'off';
        else if (/(^|\s)включ|turn\s+on|switch\s+on/.test(ps)) on = 'on';
        if (!on) return;
        var f = bestMatch(part, L.devices(), anyName);
        if (f.length) acts[f[0].id] = on;
      });
      if (!sname) return t('as.sceneCreateName');
      if (!Object.keys(acts).length) return t('as.sceneCreateNone');
      var sc = L.saveScene({ name: sname.charAt(0).toUpperCase() + sname.slice(1), actions: acts });
      return t('as.sceneCreated', { n: sc.name, c: Object.keys(acts).length });
    }

    /* время и дата */
    if (has(s, /(который час|сколько (?:сейчас )?времени|what time is it|what's the time|current time)/)) {
      return t('as.time', { n: U.fmt(new Date(), { hour: '2-digit', minute: '2-digit' }) });
    }
    if (has(s, /(какое (?:сегодня )?число|какой (?:сегодня )?день|какая (?:сегодня )?дата|what(?:'s| is) (?:the )?date|today's date|what day is it)/)) {
      return t('as.date', { n: U.cap(U.fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) });
    }

    /* вопросы: план и вода */
    if (has(s, /(что у меня|что сегодня|что завтра|план на|мои планы|что запланировано|что по плану|what do i have|what's on|whats on|my plans|my agenda|agenda|what is planned|what's planned)/)) {
      var key = has(s, /завтра|tomorrow/) ? S.dateKey(S.addDays(new Date(), 1)) : S.dateKey();
      var evs = L.eventsOn(key);
      if (!evs.length) return t('as.agendaEmpty', { d: dayWord(key) });
      return t('as.agenda', { d: dayWord(key) }) + '\n' + evs.map(function (e) { return '• ' + (L.timeText(e) ? L.timeText(e) + ' ' : '') + e.title; }).join('\n');
    }
    if (has(s, /(сколько воды|сколько я выпил|how much water)/)) {
      return t('as.waterQ', { n: L.readHealth().water, m: st.goals.water });
    }

    /* заметка */
    if ((m = /(?:заметк\S*|note)\s*[:\-—,]?\s*([\s\S]*)$/i.exec(raw)) || (m = /^(?:запомни|remember)\s*[:\-—,]?\s*([\s\S]+)$/i.exec(raw))) {
      var body = (m[1] || '').trim();
      if (!body) return t('as.noteNoText');
      L.addNote({ text: body });
      return t('as.noteAdded');
    }

    /* событие */
    if (has(s, /(событи\S*|встреч\S*|напомни\S*|запланируй|назначь|event|meeting|appointment|remind)/)) {
      var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var dt = parseDate(raw);
      var rest = dt.hit ? raw.replace(new RegExp(esc(dt.hit), 'i'), ' ') : raw;
      var tm = parseTime(rest);
      var date = dt.date || new Date();
      var title = tm ? rest.replace(new RegExp(esc(tm.hit), 'i'), ' ') : rest;
      title = title
        .replace(/^\s*(?:пожалуйста[,\s]*)?(?:добавь|создай|поставь|запиши|запланируй|назначь|напомни(?:\s+мне)?|add|create|set|schedule|remind\s+me(?:\s+to)?)\s+/i, ' ')
        .replace(/(?:^|\s)(?:событие|событию|встречу|встреча|event|meeting|appointment)(?=\s|$|[:,])/ig, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s:,.\-—]*(?:на|в|at|on|for|to|about)(?=\s)/i, '')
        .replace(/(?:^|\s)(?:на|в|at|on|for)\s*$/i, '')
        .replace(/^[\s:,.\-—]+|[\s:,.\-—]+$/g, '');
      if (!title) return t('as.eventNoTitle');
      var ev = L.addEvent({ title: title.charAt(0).toUpperCase() + title.slice(1), date: S.dateKey(date), time: tm ? tm.time : '' });
      var tmText = tm ? (CL.i18n.getLang() === 'ru' ? ' в ' : ' at ') + tm.time : '';
      return t('as.eventAdded', { t: ev.title, d: dayWord(ev.date), tm: tmText });
    }

    /* сценарий */
    var sceneWord = has(s, /(сцен\S*|сценари\S*|scene)/), runVerb = has(s, /(^|\s)(запусти\S*|активируй\S*|run|start|activate)/);
    if (sceneWord || runVerb) {
      var found = bestMatch(raw, L.scenes(), anyName);
      if (found.length) { L.runScene(found[0].id); return t('as.sceneRan', { n: L.nameOf(found[0]) }); }
      if (sceneWord) return t('as.sceneNone', { n: raw.replace(/^.*?(?:сцен\S*|сценари\S*|scene)\s*/i, '') || raw });
    }

    /* устройства */
    var off = has(s, /(^|\s)(выключи\S*|погаси\S*|отключи\S*|открой|разблокируй\S*|turn off|switch off|unlock|disable)/);
    var on = !off && has(s, /(^|\s)(включи\S*|зажги|закрой|заблокируй\S*|turn on|switch on|lock|enable)/);
    if (off || on) {
      var devs = bestMatch(raw, L.devices(), anyName, function (d) { return CL.i18n.all(d.room).join(' ') + ' ' + CL.i18n.all('type.' + d.type).join(' '); });
      if (!devs.length) return t('as.devNone', { n: raw.replace(/^\s*\S+\s*/, '') });
      devs.forEach(function (d) { L.setDevice(d.id, on); });
      var names = devs.map(L.nameOf).join(', ');
      if (devs.every(function (d) { return d.type === 'lock'; })) return U.cap(t(on ? 'home.locked' : 'home.unlocked')) + ': ' + names + '.';
      return t(on ? 'as.devOn' : 'as.devOff', { n: names });
    }

    /* вода, сон, шаги */
    if (has(s, /(выпил\S*|стакан\S*|drank|glass(?:es)? of water|water)/)) {
      var wn = /(\d+)\s*(?:стакан|glass)/.exec(s) || /(?:выпил\S*|drank)\s+(\d+)/.exec(s);
      var n = wn ? L.clamp(wn[1], 1, 10) : 1;
      var total = L.addWater(n);
      return t('as.water', { n: total, m: st.goals.water });
    }
    if ((m = /(?:спал\S*|сон|slept|sleep)\D{0,15}(\d+(?:[.,]\d+)?)/.exec(s))) {
      var hrs = L.clamp(m[1].replace(',', '.'), 0, 24);
      L.setHealth(S.dateKey(), { sleep: hrs });
      return t('as.sleep', { n: hrs });
    }
    if ((m = /(\d[\d\s]*)\s*(?:шаг\S*|steps)/.exec(s)) || (m = /(?:шаг\S*|steps)\D{0,10}(\d[\d\s]*)/.exec(s))) {
      var stp = Math.round(L.clamp(m[1].replace(/\s/g, ''), 0, 200000));
      L.setHealth(S.dateKey(), { steps: stp });
      return t('as.steps', { n: stp });
    }

    /* тренировка */
    if (has(s, /(тренировк\S*|потренировал\S*|workout|trained|пробежал\S*|побегал\S*|поплавал\S*|ran |swam|йог\S*|yoga)/)) {
      var mm = /(\d+(?:[.,]\d+)?)\s*(?:мин\S*|min\S*)/.exec(s), hh = /(\d+(?:[.,]\d+)?)\s*(?:час\S*|ч(?=\s|$)|hour\S*|h(?=\s|$))/.exec(s);
      var minutes = mm ? Number(mm[1].replace(',', '.')) : hh ? Number(hh[1].replace(',', '.')) * 60 : 0;
      if (!minutes) return t('as.workoutNoMin');
      var type = has(s, /бег|пробежал|побегал|run|ran/) ? 'run' : has(s, /ходьб|прогулк|walk/) ? 'walk' : has(s, /силов|зал|gym|strength/) ? 'gym'
        : has(s, /йог|yoga/) ? 'yoga' : has(s, /велос|bike|cycl/) ? 'bike' : has(s, /плав|swim|swam/) ? 'swim' : 'other';
      var w = L.addWorkout({ type: type, min: minutes });
      return t('as.workout', { t: t('sport.' + type), n: w.min });
    }

    return null;   // не команда приложения: пусть ответит ИИ
  }

  /* ---------- панель ---------- */
  function render() {
    if (!panel) return;
    var h = U.h;
    panel.textContent = '';
    var log = h('div', { class: 'ai-log', 'aria-live': 'polite' });
    log.appendChild(h('div', { class: 'msg bot', text: t('as.hello') }));
    history.forEach(function (m) { log.appendChild(h('div', { class: 'msg ' + m.from, text: m.text })); });
    if (waiting) log.appendChild(h('div', { class: 'msg bot typing', 'aria-label': t('as.thinking'), text: '…' }));

    var chips = h('div', { class: 'ai-chips', id: 'ai-chips' });
    ['as.c1', 'as.c2', 'as.c3', 'as.c4'].forEach(function (k) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { send(t(k)); } }, t(k)));
    });
    var hints = h('div', { class: 'ai-hints' + (chipsOpen ? '' : ' closed') }, [
      h('button', { type: 'button', class: 'hint-toggle', 'aria-expanded': chipsOpen ? 'true' : 'false', 'aria-controls': 'ai-chips', onclick: function () { chipsOpen = !chipsOpen; render(); focusInput(); } }, [U.icon('down'), h('span', { text: t('as.chips') })]),
      chips
    ]);

    var input = h('input', { type: 'text', id: 'ai-input', placeholder: t('as.placeholder'), 'aria-label': t('as.placeholder'), autocomplete: 'off', maxlength: 2000 });
    var form = h('form', { class: 'ai-form', onsubmit: function (e) { e.preventDefault(); var v = input.value; input.value = ''; send(v); } }, [
      input,
      h('button', { type: 'submit', 'aria-label': t('as.send') }, U.icon('send'))
    ]);

    panel.className = 'ai' + (full ? ' fs' : '');
    panel.appendChild(h('div', { class: 'ai-head' }, [
      h('div', null, [h('b', { id: 'ai-title', text: t('as.title') })]),
      h('div', { class: 'ai-head-btns' }, [
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': full ? t('as.shrink') : t('as.expand'), title: full ? t('as.shrink') : t('as.expand'), 'aria-pressed': full ? 'true' : 'false', onclick: function () { full = !full; render(); focusInput(); } }, U.icon(full ? 'shrink' : 'expand')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('as.close'), title: t('as.close'), onclick: close }, U.icon('x'))
      ])
    ]));
    panel.appendChild(log); panel.appendChild(hints); panel.appendChild(form);
    log.scrollTop = log.scrollHeight;
  }
  function focusInput() { var i = document.getElementById('ai-input'); if (i) i.focus(); }

  /* ответ ИИ через сервер */
  function askAI() {
    var a = CL.sync && CL.sync.acct();
    if (!a || !CL.sync.serverUrl()) return Promise.resolve(t('as.needAcc'));
    var msgs = history.slice(-12).map(function (m) { return { role: m.from === 'me' ? 'user' : 'assistant', content: m.text }; });
    return CL.sync.call({ op: 'ai', messages: msgs, lang: CL.i18n.getLang(), now: new Date().toString() }, 70000).then(function (r) {
      if (r && r.ok) return r.text;
      if (r && r.error === 'noai') return t('as.noai');
      if (r && r.error === 'aiquota') return t('as.quota');
      if (r && r.error === 'session') return t('acc.err.session');
      return t('as.aiErr');
    }, function () { return t('sync.err.net'); });
  }

  function send(text) {
    text = String(text).trim();
    if (!text || waiting) return;
    history.push({ from: 'me', text: text });
    chipsOpen = false;
    var ans = null;
    try { ans = CL.assistant.reply(text); } catch (e) { console.error(e); }
    if (ans) {
      history.push({ from: 'bot', text: ans });
      if (history.length > 60) history = history.slice(-60);
      render(); focusInput();
      return;
    }
    waiting = true; render();
    askAI().then(function (txt) {
      waiting = false;
      history.push({ from: 'bot', text: txt });
      if (history.length > 60) history = history.slice(-60);
      render(); focusInput();
    });
  }

  function open(btn) {
    if (!S.get()) return;
    opener = btn || document.activeElement;
    if (!panel) {
      panel = U.h('div', { class: 'ai', role: 'dialog', 'aria-labelledby': 'ai-title' });
      panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    render(); focusInput();
  }
  function close() {
    if (panel) panel.hidden = true;
    var o = opener && document.contains(opener) ? opener : document.querySelector('.ai-fab');
    if (o && o.focus) { try { o.focus(); } catch (e) {} }
  }
  function isOpen() { return !!panel && !panel.hidden; }
  /* язык сменился или приложение заблокировано */
  function refresh() { if (isOpen()) render(); }
  function reset() { history = []; chipsOpen = true; full = false; waiting = false; if (panel) panel.hidden = true; }

  CL.assistant = {
    init: function () { U = CL.ui; L = CL.logic; S = CL.store; },
    reply: reply, open: open, close: close, isOpen: isOpen, refresh: refresh, reset: reset
  };
})();
