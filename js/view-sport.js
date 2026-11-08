/* Экран «Спорт». */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, S = CL.store, h = U.h, t = U.t;
  var TYPES = ['run', 'walk', 'gym', 'yoga', 'bike', 'swim', 'other'];

  function editor() {
    var type = U.select(TYPES.map(function (k) { return { v: k, l: t('sport.' + k) }; }), 'run');
    var min = h('input', { type: 'text', 'data-kb': 'num', inputmode: 'numeric', required: true, value: '30', 'data-autofocus': true });
    var kcal = h('input', { type: 'text', 'data-kb': 'num', inputmode: 'numeric' });
    var date = h('input', { type: 'date', required: true, value: S.dateKey() });
    U.modal({
      title: t('sport.add'),
      body: [U.field(t('sport.type'), type), U.field(t('sport.min'), min), U.field(t('sport.kcalField'), kcal), U.field(t('sport.date'), date)],
      onSubmit: function () {
        if (!(Number(min.value) >= 1) || !date.value) return false;
        L.addWorkout({ type: type.value, min: min.value, kcal: kcal.value, date: date.value });
      }
    });
  }
  CL.actions.newWorkout = editor;

  CL.views.sport = function (root) {
    var st = S.get(), ws = L.weekStats();
    root.appendChild(U.head(t('sport.title'), [U.btn(t('sport.add'), 'primary', editor, 'plus')]));

    var week = h('section', { class: 'card c1' }, [
      h('div', { class: 'card-head' }, [h('h2', { text: t('sport.week') })]),
      h('div', { class: 'sport-week' }, [
        U.ring(ws.count / Math.max(1, st.goals.workouts), String(ws.count), t('today.waterOf', { n: st.goals.workouts })),
        h('div', { class: 'stats' }, [
          h('div', null, [h('b', { text: String(ws.count) }), h('span', { text: t('sport.workouts') })]),
          h('div', null, [h('b', { text: String(ws.minutes) }), h('span', { text: t('sport.minutes') })]),
          h('div', null, [h('b', { text: String(ws.kcal) }), h('span', { text: t('sport.kcal') })])
        ])
      ]),
      ws.count >= st.goals.workouts ? h('p', { class: 'muted ok-line', text: t('norm.ok') }) : h('p', { class: 'muted', text: t('norm.left', { n: st.goals.workouts - ws.count }) }),
      U.normControl({ key: 'workouts', label: t('sport.workouts'), unit: t('norm.perWeek'), step: 1, min: 1, max: 14 })
    ]);
    var labels = L.lastDays(7).map(function (d) { return U.fmt(d, { weekday: 'short' }); });
    var chart = h('section', { class: 'card c2' }, [
      h('div', { class: 'card-head' }, [h('h2', { text: t('sport.chart') })]),
      U.bars({ values: L.minutesPerDay(), labels: labels, label: t('sport.chart') })
    ]);
    root.appendChild(h('div', { class: 'cards two' }, [week, chart]));

    var recent = st.workouts.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0); }).slice(0, 12);
    var list = h('section', { class: 'block' }, [h('h2', { text: t('sport.recent') })]);
    if (!recent.length) list.appendChild(U.empty(t('sport.empty'), U.btn(t('sport.add'), 'primary', editor, 'plus')));
    else {
      var rows = h('div', { class: 'rows boxed' });
      recent.forEach(function (w) {
        rows.appendChild(h('div', { class: 'row static' }, [
          h('span', { class: 'row-time', text: U.fmt(S.parseKey(w.date), { day: 'numeric', month: 'short' }) }),
          h('span', { class: 'row-main', text: t('sport.' + w.type) + ' · ' + t('sport.minShort', { n: w.min }) + (w.kcal ? ' · ' + w.kcal + ' ' + t('sport.kcal').split(' ')[0] : '') }),
          U.iconBtn('trash', t('common.delete'), function () {
            U.confirm(t('common.deleteAsk'), t('common.delete'), true).then(function (ok) { if (ok) L.deleteWorkout(w.id); });
          }, 'quiet')
        ]));
      });
      list.appendChild(rows);
    }
    root.appendChild(list);
  };
})();
