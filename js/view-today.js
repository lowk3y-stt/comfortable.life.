/* Экран «Сегодня»: блоки можно переставлять и скрывать (кнопка «Настроить»). */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, S = CL.store, h = U.h, t = U.t;
  var editing = false, miniSel = null, miniCur = null;

  function eventRow(e) {
    return h('button', { type: 'button', class: 'row', onclick: function () { CL.actions.editEvent(e.id); } }, [
      h('span', { class: 'row-time', text: L.timeText(e) || t('cal.allDay') }),
      h('span', { class: 'row-main', text: e.title }),
      U.sharedChip(e)
    ]);
  }

  function head(title, extra) {
    return h('div', { class: 'card-head' }, [h('h2', { text: title }), extra || null]);
  }
  function more(route, label) { return h('a', { class: 'more-link', href: '#/' + route, 'aria-label': label }, U.icon('right')); }

  /* ---------- блоки (каждый возвращает карточку или null, если показывать нечего) ---------- */
  var BLOCKS = {
    /* календарь месяца слева, события выбранного дня справа */
    agenda: function (ctx) {
      var sel = miniSel || ctx.todayKey;
      if (!miniCur) { var p0 = S.parseKey(sel); miniCur = new Date(p0.getFullYear(), p0.getMonth(), 1); }
      var counts = {};
      L.events().forEach(function (e) { counts[e.date] = (counts[e.date] || 0) + 1; });
      var y = miniCur.getFullYear(), m = miniCur.getMonth();
      function go(d) { miniCur = new Date(y, m + d, 1); CL.app.render(); }

      var grid = h('div', { class: 'mini-grid', role: 'grid' });
      U.weekdays('narrow').forEach(function (w) { grid.appendChild(h('span', { class: 'mini-wd', role: 'columnheader', text: w })); });
      var offset = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      for (var i = 0; i < offset; i++) grid.appendChild(h('span', { 'aria-hidden': 'true' }));
      for (var d = 1; d <= days; d++) {
        (function (d) {
          var key = S.dateKey(new Date(y, m, d));
          grid.appendChild(h('button', {
            type: 'button', role: 'gridcell', class: 'mini-day' + (key === ctx.todayKey ? ' today' : '') + (key === sel ? ' sel' : ''),
            'aria-pressed': key === sel ? 'true' : 'false',
            'aria-label': U.fmt(new Date(y, m, d), { weekday: 'long', day: 'numeric', month: 'long' }) + (counts[key] ? ', ' + t('cal.hasEvents') : ''),
            onclick: function () { miniSel = key; CL.app.render(); }
          }, [h('span', { text: String(d) }), counts[key] ? h('i', { class: 'dot', 'aria-hidden': 'true' }) : null]));
        })(d);
      }

      var evs = L.eventsOn(sel);
      var side = evs.length ? h('div', { class: 'mini-side' }, [h('p', { class: 'mini-date', text: U.cap(U.fmt(S.parseKey(sel), { weekday: 'short', day: 'numeric', month: 'long' })) })]) : null;
      if (side) evs.forEach(function (e) {
        side.appendChild(h('button', { type: 'button', class: 'mini-ev', onclick: function () { CL.actions.editEvent(e.id); } }, [
          h('span', { class: 'mini-ev-t', text: L.timeText(e) || t('cal.allDay') }),
          h('span', { class: 'mini-ev-n', text: e.title }),
          e.shared ? U.icon('family', 13) : null
        ]));
      });

      return h('section', { class: 'card c1' }, [
        h('div', { class: 'card-head' }, [
          h('h2', { text: U.cap(U.fmt(miniCur, { month: 'long', year: 'numeric' })) }),
          h('div', { class: 'card-tools' }, [
            U.iconBtn('left', t('cal.prev'), function () { go(-1); }, 'quiet'),
            U.iconBtn('right', t('cal.next'), function () { go(1); }, 'quiet'),
            U.iconBtn('plus', t('today.addEvent'), function () { CL.actions.newEvent(sel); })
          ])
        ]),
        h('div', { class: 'mini-wrap' + (side ? '' : ' solo') }, [grid, side])
      ]);
    },

    health: function (ctx) {
      var st = ctx.st, hd = L.readHealth(ctx.todayKey), parts = [];
      if (L.showOnToday('water')) {
        parts.push(h('div', { class: 'health-quick' }, [
          U.ring(hd.water / st.goals.water, String(hd.water), t('today.waterOf', { n: st.goals.water })),
          h('div', { class: 'health-quick-side' }, [
            h('div', { class: 'stat' }, [U.icon('water'), h('span', { text: t('health.water') })]),
            h('div', { class: 'stepper' }, [
              U.iconBtn('minus', t('health.minus'), function () { L.addWater(-1); }),
              U.iconBtn('plus', t('health.plus'), function () { L.addWater(1); }, 'primary')
            ])
          ])
        ]));
      }
      var line = [];
      if (L.showOnToday('steps')) line.push(t('health.steps') + ': ' + hd.steps.toLocaleString(CL.i18n.locale()));
      if (L.showOnToday('sleep')) line.push(t('health.sleep') + ': ' + (hd.sleep || 0) + ' ' + t('health.hours'));
      if (line.length) parts.push(h('p', { class: 'muted', text: line.join(' · ') }));
      if (L.showOnToday('mood')) {
        var moods = h('div', { class: 'moods compact', role: 'group', 'aria-label': t('health.mood') });
        for (var m = 1; m <= 5; m++) {
          (function (m) {
            moods.appendChild(h('button', { type: 'button', class: 'mood m' + m + (hd.mood === m ? ' on' : ''), 'aria-pressed': hd.mood === m ? 'true' : 'false', 'aria-label': t('mood.' + m),
              onclick: function () { L.setHealth(ctx.todayKey, { mood: hd.mood === m ? 0 : m }); } }, U.icon('mood' + m, 28)));
          })(m);
        }
        parts.push(moods);
      }
      if (!parts.length) return null;
      return h('section', { class: 'card c2' }, [head(t('nav.health'), more('health', t('nav.health')))].concat(parts));
    },

    meds: function (ctx) {
      if (!L.showOnToday('meds')) return null;
      var doses = L.medDoses(ctx.todayKey);
      if (!doses.length) return null;
      var rows = h('div', { class: 'rows' });
      doses.forEach(function (d) {
        rows.appendChild(h('button', { type: 'button', class: 'row dose' + (d.taken ? ' done' : ''), role: 'checkbox', 'aria-checked': d.taken ? 'true' : 'false',
          onclick: function () { L.toggleDose(d.key, ctx.todayKey); } }, [
          h('span', { class: 'row-time', text: d.time }),
          h('span', { class: 'row-main', text: d.med.name + (d.med.dose ? ' · ' + d.med.dose : '') }),
          h('span', { class: 'tick' + (d.taken ? ' on' : ''), 'aria-hidden': 'true' }, d.taken ? U.icon('check', 16) : null)
        ]));
      });
      return h('section', { class: 'card c3' }, [head(t('med.title'), more('health', t('med.title'))), rows]);
    },

    scenes: function () {
      var scenes = L.scenes();
      if (!scenes.length) return null;
      var pills = h('div', { class: 'pills' });
      scenes.forEach(function (s) {
        pills.appendChild(h('button', { type: 'button', class: 'pill', onclick: function () { L.runScene(s.id); U.toast(t('home.ran', { n: L.nameOf(s) })); } }, [U.icon('sparkle'), h('span', { text: L.nameOf(s) })]));
      });
      return h('section', { class: 'card c3' }, [head(t('today.scenes'), more('home', t('nav.home'))), pills]);
    },

    sport: function (ctx) {
      var ws = L.weekStats(), st = ctx.st;
      return h('section', { class: 'card c4' }, [
        head(t('nav.sport'), more('sport', t('nav.sport'))),
        h('div', { class: 'sport-quick' }, [
          U.ring(ws.count / Math.max(1, st.goals.workouts), String(ws.count), t('today.waterOf', { n: st.goals.workouts })),
          h('p', { class: 'muted', text: t('today.weekGoal') + ' · ' + t('sport.minShort', { n: ws.minutes }) })
        ])
      ]);
    },

    notes: function () {
      var all = L.notes().filter(function (n) { return !n.done; }), notes = all.slice(0, 3);
      var card = h('section', { class: 'card c5' }, [head(t('nav.notes'), U.iconBtn('plus', t('today.addNote'), function () { CL.actions.newNote(); }))]);
      if (!notes.length) card.appendChild(U.empty(t('today.noNotes'), U.btn(t('today.addNote'), 'soft', function () { CL.actions.newNote(); }, 'plus')));
      else {
        var rows = h('div', { class: 'rows' });
        notes.forEach(function (n) {
          rows.appendChild(h('div', { class: 'row-split' }, [
            h('button', { type: 'button', class: 'tick-btn', role: 'checkbox', 'aria-checked': 'false', 'aria-label': t('notes.markDone'), onclick: function () { L.toggleNote(n.id); } }, h('span', { class: 'tick' })),
            h('button', { type: 'button', class: 'row', onclick: function () { CL.actions.editNote(n.id); } }, [
              n.pinned ? U.icon('pin') : null,
              h('span', { class: 'row-main', text: n.title || n.text.split('\n')[0] || t('notes.untitled') }),
              U.sharedChip(n)
            ])
          ]));
        });
        card.appendChild(rows);
      }
      return card;
    }
  };

  var NAMES = { agenda: 'nav.calendar', health: 'nav.health', meds: 'med.title', scenes: 'today.scenes', sport: 'nav.sport', notes: 'nav.notes' };

  /* режим настройки: порядок и видимость блоков */
  function editor(st) {
    var card = h('section', { class: 'card edit-blocks' }, [h('h2', { text: t('today.customize') }), h('p', { class: 'muted', text: t('today.customizeHint') })]);
    var list = h('div', { class: 'rows' });
    st.today.order.forEach(function (k, i) {
      var hidden = st.today.hidden.indexOf(k) > -1;
      var last = i === st.today.order.length - 1;
      var up = U.iconBtn('down', t('today.up') + ': ' + t(NAMES[k]), function () { L.moveBlock(k, -1); }, 'quiet flip'); up.disabled = i === 0;
      var dn = U.iconBtn('down', t('today.down') + ': ' + t(NAMES[k]), function () { L.moveBlock(k, 1); }, 'quiet'); dn.disabled = last;
      var sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': hidden ? 'false' : 'true', 'aria-label': t('today.show') + ': ' + t(NAMES[k]), onclick: function () { L.setBlockHidden(k, !hidden); } }, h('span', { class: 'knob' }));
      list.appendChild(h('div', { class: 'row static block-row' + (hidden ? ' off' : '') }, [h('span', { class: 'row-main', text: t(NAMES[k]) }), up, dn, sw]));
    });
    card.appendChild(list);
    card.appendChild(h('div', { class: 'btn-row' }, [U.btn(t('common.done'), 'primary', function () { editing = false; CL.app.render(); })]));
    return card;
  }

  CL.views.today = function (root) {
    var st = S.get(), now = new Date();
    var todayKey = S.dateKey(now), tomorrowKey = S.dateKey(S.addDays(now, 1));
    var hr = now.getHours();
    var g = hr < 5 ? 'night' : hr < 12 ? 'morning' : hr < 18 ? 'day' : 'evening';
    var name = st.profile.name;
    var evToday = L.eventsOn(todayKey), evTomorrow = L.eventsOn(tomorrowKey);
    var devs = L.devices();
    var lead = t('today.ev', { n: evToday.length }) + (devs.length ? ' · ' + t('today.dev', { n: devs.filter(function (d) { return d.on; }).length }) : '');

    root.appendChild(h('header', { class: 'hello' }, [
      h('div', { class: 'hello-top' }, [
        h('p', { class: 'eyebrow', text: U.cap(U.fmt(now, { weekday: 'long', day: 'numeric', month: 'long' })) }),
        editing ? null : U.iconBtn('settings', t('today.customize'), function () { editing = true; CL.app.render(); }, 'quiet')
      ]),
      h('h1', { text: t('greet.' + g) + (name ? ', ' + name : '') }),
      h('p', { class: 'lead', text: lead })
    ]));

    if (editing) { root.appendChild(editor(st)); return; }

    var ctx = { st: st, todayKey: todayKey, evToday: evToday, evTomorrow: evTomorrow };
    var grid = h('div', { class: 'cards today-grid' });
    st.today.order.forEach(function (k) {
      if (st.today.hidden.indexOf(k) > -1) return;
      var el = BLOCKS[k](ctx);
      if (el) grid.appendChild(el);
    });
    root.appendChild(grid);
    if (st.today.hidden.length) root.appendChild(h('p', { class: 'note' }, [t('today.hiddenN', { n: st.today.hidden.length }) + ' ', h('button', { type: 'button', class: 'link', onclick: function () { editing = true; CL.app.render(); } }, t('today.customize'))]));
  };
})();
