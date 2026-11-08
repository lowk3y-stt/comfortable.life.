/* Comfortable life — общие помощники интерфейса: элементы, иконки, окна, графики. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  CL.version = '0.6.0';
  CL.views = CL.views || {};
  CL.actions = CL.actions || {};

  function t(k, v) { return CL.i18n.t(k, v); }

  /* ---------- иконки (линейные, как на сайте) ---------- */
  var P = {
    today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
    notes: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    sport: 'M3 13h4l3-7 4 12 3-5h4',
    health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    family: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z|M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6|M16.5 11a3 3 0 1 0 0-6|M18.5 14.3c2.2.6 3.5 2.5 3.5 5.7',
    settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    pin: 'M9 3h6l-1 6 3 3H7l3-3zM12 12v9',
    lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    down: 'M6 9l6 6 6-6',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12l5 5 9-10',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    send: 'M4 12l16-8-6 16-3-7z',
    expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
    light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    climate: 'M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0zM12 9v8',
    speaker: 'M7 3h10v18H7zM12 7.5h.01M12 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
    water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    steps: 'M8 4c2 0 3 1.5 3 4s-1 3-1 5-1.5 3-3 3-2-1.5-2-3c0-3 0-9 3-9z|M16 8c2 0 3 1 3 3.5s-1 3-1 5.5-1 3-2.5 3S13 19 13 17c0-3 0-9 3-9z',
    face: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M9 10h.01M15 10h.01',
    mood1: 'M8 17c1-2 2.5-2.5 4-2.5s3 .5 4 2.5',
    mood2: 'M9 16.5c.9-.8 1.9-1.2 3-1.2s2.1.4 3 1.2',
    mood3: 'M9 15.5h6',
    mood4: 'M9 14.5c.9.8 1.9 1.2 3 1.2s2.1-.4 3-1.2',
    mood5: 'M8 14c1 2 2.5 2.7 4 2.7s3-.7 4-2.7'
  };
  var NS = 'http://www.w3.org/2000/svg';

  function icon(name, size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    var parts = (P[name] || '').split('|');
    if (name.indexOf('mood') === 0) parts = [P.face.split('|')[0], P.face.split('|')[1], P[name]];
    parts.forEach(function (d) {
      if (!d) return;
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }
  function leaf(size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'logo');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    var a = document.createElementNS(NS, 'path');
    a.setAttribute('d', 'M4 18C4 9 11 4 28 4c0 14-6 24-16 24-4 0-8-3-8-10z'); a.setAttribute('class', 'logo-a');
    var b = document.createElementNS(NS, 'path');
    b.setAttribute('d', 'M6 26C11 18 17 13 24 9'); b.setAttribute('class', 'logo-b');
    s.appendChild(a); s.appendChild(b);
    return s;
  }

  /* ---------- создание элементов (без innerHTML, данные пользователя только как текст) ---------- */
  function add(el, kids) {
    if (kids == null || kids === false) return;
    if (Array.isArray(kids)) { kids.forEach(function (c) { add(el, c); }); return; }
    if (kids.nodeType) { el.appendChild(kids); return; }
    el.appendChild(document.createTextNode(String(kids)));
  }
  /* атрибуты со значением false или null пропускаются; для aria-pressed и подобных передавайте строки 'true' / 'false' */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag), val;
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') val = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = true;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    add(el, kids);
    if (val !== undefined) el.value = val;
    return el;
  }
  function field(label, control, hint) {
    return h('label', { class: 'field' }, [h('span', { class: 'field-l', text: label }), control, hint ? h('span', { class: 'field-h', text: hint }) : null]);
  }
  function select(options, value) {
    var s = h('select', null, options.map(function (o) { return h('option', { value: o.v, text: o.l }); }));
    s.value = value;
    return s;
  }
  function btn(label, kind, onclick, ic) {
    return h('button', { type: 'button', class: 'btn ' + (kind || 'ghost'), onclick: onclick }, [ic ? icon(ic) : null, label ? h('span', { text: label }) : null]);
  }
  function iconBtn(ic, label, onclick, cls) {
    return h('button', { type: 'button', class: 'icon-btn' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label, onclick: onclick }, icon(ic));
  }
  function head(title, actions) {
    return h('div', { class: 'view-head' }, [h('h1', { text: title }), actions ? h('div', { class: 'view-actions' }, actions) : null]);
  }
  function empty(text, action) {
    return h('div', { class: 'empty' }, [h('span', { class: 'leaf-dot', 'aria-hidden': 'true' }), h('p', { text: text }), action || null]);
  }
  /* пометка «семейное» у заметки или события; у чужих записей — имя автора */
  function sharedChip(it) {
    if (!it || !it.shared) return null;
    var who = CL.logic.authorName(it);
    return h('span', { class: 'chip-fam', title: t('share.family') }, [icon('family', 14), h('span', { text: who || t('share.short') })]);
  }
  /* переключатель-галочка «Для семьи» для окон заметки и события; null, если аккаунта нет */
  function shareField(it) {
    if (!(CL.sync && CL.sync.cfg())) return { el: null, get: function () { return it ? !!it.shared : false; } };
    var box = h('input', { type: 'checkbox' });
    box.checked = !!(it && it.shared);
    var locked = !!(it && it.shared && !CL.logic.ownShared(it));
    box.disabled = locked;
    var el = h('label', { class: 'check' }, [box, h('span', { text: t('share.family') })]);
    return { el: [el, h('p', { class: 'muted small', text: locked ? t('share.lockedHint') : t('share.hint') })], get: function () { return locked ? undefined : box.checked; } };
  }
  /* «Минимум» для пункта здоровья или спорта: значение, кнопки − и +, по нажатию на число — ввод.
     o: key (ключ в goals), label, unit, step, min, max */
  function normControl(o) {
    var S = CL.store, st = S.get();
    function set(v) {
      v = Math.round(Math.max(o.min, Math.min(o.max, Number(v) || o.min)) * 100) / 100;
      st.goals[o.key] = v; S.save();
    }
    function ask() {
      var inp = h('input', { type: 'text', 'data-kb': 'num', inputmode: 'decimal', value: String(st.goals[o.key]), 'data-autofocus': true });
      modal({ title: o.label, body: [field(t('norm.min') + ', ' + o.unit, inp, o.min + '–' + o.max)], onSubmit: function () { set(String(inp.value).replace(',', '.')); } });
    }
    var cur = st.goals[o.key];
    return h('div', { class: 'norm' }, [
      h('span', { class: 'norm-l', text: t('norm.min') }),
      iconBtn('minus', t('health.minus'), function () { set(cur - o.step); }, 'quiet'),
      h('button', { type: 'button', class: 'norm-v', 'aria-label': o.label + ': ' + cur + ' ' + o.unit, onclick: ask, text: cur + ' ' + o.unit }),
      iconBtn('plus', t('health.plus'), function () { set(cur + o.step); }, 'quiet')
    ]);
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ---------- даты ---------- */
  function fmt(d, o) {
    try { return new Intl.DateTimeFormat(CL.i18n.locale(), o).format(d); } catch (e) { return String(d); }
  }
  function weekdays(style) {
    var base = new Date(2024, 0, 1), out = []; // понедельник
    for (var i = 0; i < 7; i++) out.push(fmt(CL.store.addDays(base, i), { weekday: style || 'short' }));
    return out;
  }

  /* ---------- уведомление ---------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  /* ---------- окно (нативный dialog: фокус, Esc и затемнение работают сами) ---------- */
  function modal(o) {
    var prev = document.activeElement;
    var dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'dlg-title' });
    var form = h('form', { class: 'sheet-form' });
    var closed = false;
    function close() { if (closed) return; closed = true; if (dlg.open) dlg.close(); else cleanup(); }
    function cleanup() {
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      if (o.onClose) o.onClose();
      if (prev && prev.focus && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
    }
    var top = h('div', { class: 'sheet-head' }, [
      h('h2', { id: 'dlg-title', text: o.title || '' }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.close'), title: t('common.close'), onclick: close }, icon('x'))
    ]);
    var body = h('div', { class: 'sheet-body' }, o.body);
    var foot = h('div', { class: 'sheet-foot' });
    (o.extra || []).forEach(function (a) {
      foot.appendChild(h('button', { type: 'button', class: 'btn ' + (a.kind || 'ghost'), onclick: function () { a.onClick(close); } }, a.label));
    });
    foot.appendChild(h('span', { class: 'grow' }));
    foot.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: close }, o.cancelLabel || t('common.cancel')));
    if (o.onSubmit) foot.appendChild(h('button', { type: 'submit', class: 'btn primary' }, o.submitLabel || t('common.save')));
    form.appendChild(top); form.appendChild(body); form.appendChild(foot);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = o.onSubmit ? o.onSubmit(close) : undefined;
      if (r !== false) close();
    });
    dlg.appendChild(form);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener('close', function () { closed = true; cleanup(); });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var f = body.querySelector('[data-autofocus]');
    if (f) { try { f.focus(); } catch (e) {} }
    return { close: close, el: dlg };
  }

  function confirmBox(msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var answered = false;
      modal({
        title: t('common.confirm'),
        body: h('p', { class: 'plain', text: msg }),
        submitLabel: okLabel || t('common.done'),
        onSubmit: function () { answered = true; resolve(true); },
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  }

  /* ---------- кольцо прогресса ---------- */
  function ring(pct, big, small) {
    var r = 40, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'ring'); svg.setAttribute('aria-hidden', 'true');
    var tr = document.createElementNS(NS, 'circle');
    tr.setAttribute('cx', 50); tr.setAttribute('cy', 50); tr.setAttribute('r', r); tr.setAttribute('class', 'ring-track');
    var fl = document.createElementNS(NS, 'circle');
    fl.setAttribute('cx', 50); fl.setAttribute('cy', 50); fl.setAttribute('r', r); fl.setAttribute('class', 'ring-fill');
    fl.setAttribute('stroke-dasharray', c.toFixed(2)); fl.setAttribute('stroke-dashoffset', (c * (1 - p)).toFixed(2));
    fl.setAttribute('transform', 'rotate(-90 50 50)');
    svg.appendChild(tr); svg.appendChild(fl);
    return h('div', { class: 'ring-wrap' }, [svg, h('div', { class: 'ring-text' }, [h('span', { class: 'big', text: big }), small ? h('span', { class: 'small', text: small }) : null])]);
  }

  /* ---------- столбики за 7 дней ---------- */
  function bars(o) {
    var vals = o.values, max = Math.max.apply(null, vals.concat([o.goal || 0, 1]));
    var box = h('div', { class: 'bars', role: 'img', 'aria-label': o.label + ': ' + vals.join(', ') });
    vals.forEach(function (v, i) {
      var track = h('div', { class: 'bar-track' }, [
        o.goal ? h('i', { class: 'bar-goal', style: 'bottom:' + (o.goal / max * 100).toFixed(1) + '%' }) : null,
        h('b', { class: 'bar-fill' + (i === vals.length - 1 ? ' today' : ''), style: 'height:' + (v / max * 100).toFixed(1) + '%', title: String(v) })
      ]);
      box.appendChild(h('div', { class: 'bar-col' }, [h('span', { class: 'bar-val', text: v ? (o.fmt ? o.fmt(v) : String(v)) : '' }), track, h('span', { class: 'bar-lab', text: o.labels[i] })]));
    });
    return box;
  }

  CL.ui = {
    t: t, h: h, icon: icon, leaf: leaf, field: field, select: select, btn: btn, iconBtn: iconBtn, head: head, empty: empty, cap: cap, sharedChip: sharedChip, normControl: normControl, shareField: shareField,
    fmt: fmt, weekdays: weekdays, toast: toast, modal: modal, confirm: confirmBox, ring: ring, bars: bars
  };
})();
