/* Экран «Календарь». */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, S = CL.store, h = U.h, t = U.t;
  var cur = null;   // первое число показанного месяца
  var sel = null;   // выбранный день (ключ ГГГГ-ММ-ДД)

  function addHour(tm) { var p = tm.split(':'), hh = Math.min(23, Number(p[0]) + 1); return S.pad(hh) + ':' + p[1]; }

  function editor(ev, dateKey) {
    var isNew = !ev;
    var title = h('input', { type: 'text', maxlength: 120, required: true, value: ev ? ev.title : '', 'data-autofocus': true });
    var date = h('input', { type: 'date', required: true, value: ev ? ev.date : dateKey });
    var start = ev && ev.time ? ev.time : '09:00';
    var from = h('input', { type: 'time', value: start });
    var to = h('input', { type: 'time', value: ev && ev.end ? ev.end : addHour(start) });
    var all = h('input', { type: 'checkbox' });
    all.checked = !!(ev && !ev.time);
    var times = h('div', { class: 'fields-2' }, [U.field(t('cal.from'), from), U.field(t('cal.to'), to)]);
    var err = h('p', { class: 'err', role: 'alert' });
    function sync() { from.disabled = to.disabled = all.checked; times.classList.toggle('off', all.checked); }
    sync();
    all.addEventListener('change', sync);
    /* сдвинули начало — конец едет следом, пока он не раньше начала */
    from.addEventListener('change', function () { if (from.value && (!to.value || to.value <= from.value)) to.value = addHour(from.value); });
    var share = U.shareField(ev);
    U.modal({
      title: isNew ? t('cal.newEvent') : t('cal.editEvent'),
      body: [
        U.field(t('cal.evTitle'), title),
        U.field(t('cal.date'), date),
        h('label', { class: 'check' }, [all, h('span', { text: t('cal.allDay') })]),
        times,
        share.el,
        err
      ],
      extra: isNew ? [] : [{ label: t('common.delete'), kind: 'danger', onClick: function (close) {
        U.confirm(t('common.deleteAsk'), t('common.delete'), true).then(function (ok) { if (ok) { L.deleteEvent(ev.id); close(); } });
      } }],
      onSubmit: function () {
        var v = title.value.trim();
        if (!v || !date.value) return false;
        err.textContent = '';
        if (!all.checked) {
          if (!from.value) { err.textContent = t('cal.errFrom'); return false; }
          if (to.value && to.value <= from.value) { err.textContent = t('cal.errOrder'); return false; }
        }
        var o = { title: v, date: date.value, time: all.checked ? '' : from.value, end: all.checked ? '' : (to.value || ''), shared: share.get() };
        if (isNew) L.addEvent(o); else L.updateEvent(ev.id, o);
        sel = o.date; var p = S.parseKey(sel); cur = new Date(p.getFullYear(), p.getMonth(), 1);
      }
    });
  }

  CL.actions.newEvent = function (key) { editor(null, key || S.dateKey()); };
  CL.actions.editEvent = function (id) { var e = L.find(S.get().events, id); if (e) editor(e); };

  CL.views.calendar = function (root) {
    var todayKey = S.dateKey();
    if (!sel) sel = todayKey;
    if (!cur) { var p = S.parseKey(sel); cur = new Date(p.getFullYear(), p.getMonth(), 1); }

    function go(delta) { cur = new Date(cur.getFullYear(), cur.getMonth() + delta, 1); draw(); }
    function pick(key) { sel = key; draw(); }

    function draw() {
      root.textContent = '';
      root.appendChild(U.head(t('cal.title'), [U.btn(t('cal.newEvent'), 'primary', function () { editor(null, sel); }, 'plus')]));

      var counts = {};
      L.events().forEach(function (e) { counts[e.date] = (counts[e.date] || 0) + 1; });

      var nav = h('div', { class: 'cal-nav' }, [
        U.iconBtn('left', t('cal.prev'), function () { go(-1); }),
        h('h2', { class: 'cal-month', 'aria-live': 'polite', text: U.cap(U.fmt(cur, { month: 'long', year: 'numeric' })) }),
        U.iconBtn('right', t('cal.next'), function () { go(1); }),
        U.btn(t('nav.today'), 'soft', function () { var n = new Date(); cur = new Date(n.getFullYear(), n.getMonth(), 1); sel = todayKey; draw(); })
      ]);

      var grid = h('div', { class: 'cal-grid', role: 'grid' });
      U.weekdays('short').forEach(function (w) { grid.appendChild(h('span', { class: 'cal-wd', role: 'columnheader', text: w })); });
      var y = cur.getFullYear(), m = cur.getMonth();
      var offset = (new Date(y, m, 1).getDay() + 6) % 7;
      var days = new Date(y, m + 1, 0).getDate();
      for (var i = 0; i < offset; i++) grid.appendChild(h('span', { class: 'cal-blank', 'aria-hidden': 'true' }));
      for (var d = 1; d <= days; d++) {
        (function (d) {
          var key = S.dateKey(new Date(y, m, d));
          var label = U.fmt(new Date(y, m, d), { weekday: 'long', day: 'numeric', month: 'long' }) + (counts[key] ? ', ' + t('cal.hasEvents') : '');
          grid.appendChild(h('button', {
            type: 'button', role: 'gridcell',
            class: 'cal-day' + (key === todayKey ? ' today' : '') + (key === sel ? ' sel' : ''),
            'aria-label': label, 'aria-pressed': key === sel ? 'true' : 'false',
            onclick: function () { pick(key); }
          }, [h('span', { text: String(d) }), counts[key] ? h('i', { class: 'dot', 'aria-hidden': 'true' }) : null]));
        })(d);
      }

      var evs = L.eventsOn(sel);
      var panel = h('section', { class: 'card day-panel' }, [
        h('div', { class: 'card-head' }, [
          h('h2', { text: U.cap(U.fmt(S.parseKey(sel), { weekday: 'long', day: 'numeric', month: 'long' })) }),
          U.iconBtn('plus', t('cal.newEvent'), function () { editor(null, sel); })
        ])
      ]);
      if (!evs.length) panel.appendChild(U.empty(t('cal.noEvents')));
      else {
        var rows = h('div', { class: 'rows' });
        evs.forEach(function (e) {
          rows.appendChild(h('button', { type: 'button', class: 'row', onclick: function () { editor(e); } }, [
            h('span', { class: 'row-time', text: L.timeText(e) || t('cal.allDay') }),
            h('span', { class: 'row-main', text: e.title }),
            U.sharedChip(e)
          ]));
        });
        panel.appendChild(rows);
      }

      root.appendChild(h('div', { class: 'cal-layout' }, [h('section', { class: 'card cal-card' }, [nav, grid]), panel]));
    }
    draw();
  };
})();
