/* Экран «Здоровье»: вода, сон, шаги, настроение. Личный дневник привычек. */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, S = CL.store, h = U.h, t = U.t;

  function editor() {
    var today = S.dateKey(), cur = L.readHealth(today);
    var sleep = h('input', { type: 'text', 'data-kb': 'num', inputmode: 'decimal', value: cur.sleep || '', 'data-autofocus': true });
    var steps = h('input', { type: 'text', 'data-kb': 'num', inputmode: 'numeric', value: cur.steps || '' });
    U.modal({
      title: t('health.edit'),
      body: [U.field(t('health.sleepField'), sleep), U.field(t('health.stepsField'), steps)],
      onSubmit: function () {
        L.setHealth(today, { sleep: L.clamp(String(sleep.value || 0).replace(',', '.'), 0, 24), steps: Math.round(L.clamp(steps.value || 0, 0, 200000)) });
      }
    });
  }

  function meter(iconName, label, value, goal, text) {
    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-top' }, [h('span', { class: 'meter-l' }, [U.icon(iconName), h('span', { text: label })]), h('b', { text: text })]),
      h('div', { class: 'meter-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(value, goal)), 'aria-label': label }, h('i', { style: 'width:' + Math.min(100, value / Math.max(1, goal) * 100).toFixed(1) + '%' }))
    ]);
  }

  /* выполнен ли минимум */
  function status(value, goal, unit) {
    if (value >= goal) return h('p', { class: 'muted ok-line', text: t('norm.ok') });
    var left = Math.round((goal - value) * 10) / 10;
    return h('p', { class: 'muted', text: t('norm.left', { n: left + (unit ? ' ' + unit : '') }) });
  }

  /* переключатель «показывать на экране Сегодня» у каждого пункта */
  function todayToggle(item) {
    var on = L.showOnToday(item);
    return h('div', { class: 'today-toggle' }, [
      h('span', { text: t('health.onToday') }),
      h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': t('health.onToday') + ': ' + t('health.item.' + item), onclick: function () { L.setShowOnToday(item, !on); } }, h('span', { class: 'knob' }))
    ]);
  }
  function cardHead(title, item, extra) {
    return h('div', { class: 'card-head' }, [h('h2', { text: title }), extra || null]);
  }

  /* лекарства */
  function medEditor(m) {
    var isNew = !m;
    var name = h('input', { type: 'text', maxlength: 60, required: true, value: m ? m.name : '', 'data-autofocus': true });
    var dose = h('input', { type: 'text', maxlength: 40, value: m ? m.dose : '', placeholder: t('med.doseHint') });
    var times = (m ? m.times : ['09:00']).slice();
    var list = h('div', { class: 'time-list' });
    function paint() {
      list.textContent = '';
      times.forEach(function (tm, i) {
        var inp = h('input', { type: 'time', value: tm, required: true, 'aria-label': t('med.time') + ' ' + (i + 1) });
        inp.addEventListener('change', function () { times[i] = inp.value; });
        list.appendChild(h('div', { class: 'time-row' }, [inp, times.length > 1 ? U.iconBtn('x', t('common.delete'), function () { times.splice(i, 1); paint(); }, 'quiet') : null]));
      });
      if (times.length < 6) list.appendChild(U.btn(t('med.addTime'), 'soft', function () { times.push('20:00'); paint(); }, 'plus'));
    }
    paint();
    U.modal({
      title: isNew ? t('med.new') : t('med.edit'),
      body: [U.field(t('med.name'), name), U.field(t('med.dose'), dose), h('div', { class: 'field' }, [h('span', { class: 'field-l', text: t('med.times') }), list])],
      extra: isNew ? [] : [{ label: t('common.delete'), kind: 'danger', onClick: function (close) {
        U.confirm(t('common.deleteAsk'), t('common.delete'), true).then(function (ok) { if (ok) { L.deleteMed(m.id); close(); } });
      } }],
      onSubmit: function () {
        var v = name.value.trim(); if (!v) return false;
        var o = { name: v, dose: dose.value.trim(), times: times };
        if (isNew) L.addMed(o); else L.updateMed(m.id, o);
      }
    });
  }

  function medsCard(today) {
    var card = h('section', { class: 'card c3' }, [cardHead(t('med.title'), 'meds', U.iconBtn('plus', t('med.new'), function () { medEditor(); }))]);
    var doses = L.medDoses(today);
    if (!doses.length) card.appendChild(U.empty(t('med.empty'), U.btn(t('med.new'), 'soft', function () { medEditor(); }, 'plus')));
    else {
      var st = CL.store.get();
      st.meds.forEach(function (m) {
        var chips = h('div', { class: 'dose-chips' });
        doses.filter(function (d) { return d.med.id === m.id; }).forEach(function (d) {
          chips.appendChild(h('button', { type: 'button', class: 'dose-chip' + (d.taken ? ' on' : ''), role: 'checkbox', 'aria-checked': d.taken ? 'true' : 'false',
            'aria-label': m.name + ' ' + d.time, onclick: function () { L.toggleDose(d.key, today); } }, [d.taken ? U.icon('check', 14) : null, h('span', { text: d.time })]));
        });
        card.appendChild(h('div', { class: 'med' }, [
          h('div', { class: 'med-top' }, [h('b', { text: m.name }), m.dose ? h('small', { text: m.dose }) : null, h('span', { class: 'grow' }), U.iconBtn('edit', t('common.edit') + ': ' + m.name, function () { medEditor(m); }, 'quiet')]),
          chips
        ]));
      });
      card.appendChild(h('p', { class: 'muted small', text: t('med.note') }));
    }
    card.appendChild(todayToggle('meds'));
    return card;
  }

  CL.views.health = function (root) {
    var st = S.get(), today = S.dateKey(), hd = L.readHealth(today), loc = CL.i18n.locale();
    root.appendChild(U.head(t('health.title'), [U.btn(t('health.edit'), 'soft', editor, 'edit')]));

    /* вода */
    var drops = h('div', { class: 'drops', role: 'group', 'aria-label': t('health.water') });
    var dropsN = Math.min(30, Math.max(st.goals.water, hd.water));
    for (var i = 0; i < dropsN; i++) {
      (function (i) {
        var filled = i < hd.water;
        drops.appendChild(h('button', {
          type: 'button', class: 'drop' + (filled ? ' on' : ''), 'aria-pressed': filled ? 'true' : 'false',
          'aria-label': t('health.water') + ' ' + (i + 1),
          onclick: function () { L.setHealth(today, { water: (hd.water === i + 1 ? i : i + 1) }); }
        }, U.icon('water')));
      })(i);
    }
    var waterCard = h('section', { class: 'card c1' }, [
      h('div', { class: 'card-head' }, [h('h2', { text: t('health.water') }), h('b', { class: 'big-n', text: hd.water + ' ' + t('today.waterOf', { n: st.goals.water }) })]),
      drops,
      h('div', { class: 'stepper' }, [U.iconBtn('minus', t('health.minus'), function () { L.addWater(-1); }), U.iconBtn('plus', t('health.plus'), function () { L.addWater(1); }, 'primary')]),
      status(hd.water, st.goals.water, ''),
      U.normControl({ key: 'water', label: t('health.water'), unit: t('norm.glasses'), step: 1, min: 1, max: 20 }),
      todayToggle('water')
    ]);

    /* сон и шаги: каждый пункт со своим переключателем */
    var sleepCard = h('section', { class: 'card c2' }, [
      cardHead(t('health.sleep'), 'sleep'),
      meter('moon', t('health.sleep'), hd.sleep, st.goals.sleep, (hd.sleep || 0) + ' ' + t('health.hours')),
      status(hd.sleep, st.goals.sleep, t('health.hours')),
      U.normControl({ key: 'sleep', label: t('health.sleep'), unit: t('health.hours'), step: 0.5, min: 1, max: 14 }),
      todayToggle('sleep')
    ]);
    var stepsCard = h('section', { class: 'card c4' }, [
      cardHead(t('health.steps'), 'steps'),
      meter('steps', t('health.steps'), hd.steps, st.goals.steps, hd.steps.toLocaleString(loc)),
      status(hd.steps, st.goals.steps, ''),
      U.normControl({ key: 'steps', label: t('health.steps'), unit: t('norm.steps'), step: 500, min: 500, max: 100000 }),
      todayToggle('steps')
    ]);

    /* настроение */
    var moods = h('div', { class: 'moods', role: 'group', 'aria-label': t('health.mood') });
    for (var m = 1; m <= 5; m++) {
      (function (m) {
        moods.appendChild(h('button', {
          type: 'button', class: 'mood m' + m + (hd.mood === m ? ' on' : ''), 'aria-pressed': hd.mood === m ? 'true' : 'false',
          onclick: function () { L.setHealth(today, { mood: hd.mood === m ? 0 : m }); }
        }, [U.icon('mood' + m, 30), h('span', { text: t('mood.' + m) })]));
      })(m);
    }
    var moodCard = h('section', { class: 'card c5' }, [cardHead(t('health.mood'), 'mood'), moods, todayToggle('mood')]);

    root.appendChild(h('div', { class: 'cards two' }, [waterCard, sleepCard, stepsCard, moodCard, medsCard(today)]));

    /* динамика */
    var labels = L.lastDays(7).map(function (d) { return U.fmt(d, { weekday: 'short' }); });
    var charts = h('div', { class: 'cards three' }, [
      h('section', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h2', { text: t('health.water') })]), U.bars({ values: L.healthSeries('water'), labels: labels, goal: st.goals.water, label: t('health.water') + ' — ' + t('health.chart') })]),
      h('section', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h2', { text: t('health.sleep') })]), U.bars({ values: L.healthSeries('sleep'), labels: labels, goal: st.goals.sleep, label: t('health.sleep') + ' — ' + t('health.chart') })]),
      h('section', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h2', { text: t('health.steps') })]), U.bars({ values: L.healthSeries('steps'), labels: labels, goal: st.goals.steps, label: t('health.steps') + ' — ' + t('health.chart'), fmt: function (v) { return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v); } })])
    ]);
    root.appendChild(h('h2', { class: 'section-title', text: t('health.chart') }));
    root.appendChild(charts);
    root.appendChild(h('p', { class: 'note', text: t('health.note') }));
  };
})();
