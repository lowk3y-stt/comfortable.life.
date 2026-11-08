/* Экран «Дом»: устройства и сценарии. */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, h = U.h, t = U.t;

  var ROOMS = ['room.living', 'room.kitchen', 'room.bedroom', 'room.hall', 'room.other'];

  function stateText(d) {
    if (d.type === 'lock') return t(d.on ? 'home.locked' : 'home.unlocked');
    return t(d.on ? 'home.on' : 'home.off');
  }

  function deviceCard(d) {
    var lv = L.range(d);
    var toggle = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': d.on ? 'true' : 'false', 'aria-label': L.nameOf(d) + ': ' + stateText(d), onclick: function () { L.setDevice(d.id, !d.on); } }, h('span', { class: 'knob' }));
    var card = h('article', { class: 'device' + (d.on ? ' on' : '') }, [
      h('div', { class: 'device-top' }, [
        h('span', { class: 'device-ic' }, U.icon(d.type)),
        h('div', { class: 'device-name' }, [h('b', { text: L.nameOf(d) }), h('small', { text: (d.eco ? t(d.eco) + ' · ' : '') + stateText(d) })]),
        toggle
      ])
    ]);
    if (lv && d.on) {
      var val = h('output', { text: d.level + lv.unit });
      var range = h('input', { type: 'range', min: lv.min, max: lv.max, step: lv.step, value: d.level, 'aria-label': L.nameOf(d) + ': ' + t('home.level') });
      range.addEventListener('input', function () { val.textContent = range.value + lv.unit; });
      range.addEventListener('change', function () { L.setLevel(d.id, range.value); });
      card.appendChild(h('div', { class: 'level' }, [range, val]));
    }
    return card;
  }

  function ecoRow(name, status, action) {
    return h('div', { class: 'row static eco-row' }, [h('span', { class: 'row-main' }, [h('b', { text: name }), h('small', { class: 'muted', text: status })]), action || null]);
  }

  function salutInfo() {
    U.modal({ title: t('salut.title'), body: [h('p', { class: 'plain', text: t('salut.text') })], cancelLabel: t('common.close') });
  }

  /* список экосистем: что подключено и что пока недоступно */
  function ecosystems() {
    var ya = CL.yandex.connected();
    var yaAct = U.btn(ya ? t('ya.refresh') : t('eco.setup'), 'soft', function (e) {
      if (!ya) { location.hash = '#/settings'; return; }
      if (CL.yandex.needPick()) { location.hash = '#/settings'; return; }
      var b = e.currentTarget; b.disabled = true;
      CL.yandex.refresh().then(function () { U.toast(t('ya.done', { n: CL.yandex.count() })); }, function () { U.toast(t('ya.err')); }).then(function () { b.disabled = false; });
    });
    return h('section', { class: 'block' }, [
      h('h2', { text: t('eco.title') }),
      h('div', { class: 'rows' }, [
        ecoRow(t('eco.yandex'), ya ? (CL.yandex.needPick() ? t('ya.needPick') : t('ya.connected', { n: CL.yandex.count() })) : t('eco.notConnected'), yaAct),
        ecoRow(t('eco.salut'), t('eco.salutStatus'), U.btn(t('eco.more'), 'ghost', salutInfo)),
        ecoRow(t('eco.tuya'), t('eco.soon')),
        ecoRow(t('eco.xiaomi'), t('eco.soon'))
      ])
    ]);
  }

  CL.views.home = function (root) {
    root.appendChild(U.head(t('home.title')));

    var devs = L.devices();
    if (!devs.length) root.appendChild(U.empty(t('home.empty')));
    else {
      var scenes = L.scenes();
      if (scenes.length) {
        var pills = h('div', { class: 'pills' });
        scenes.forEach(function (s) {
          pills.appendChild(h('button', { type: 'button', class: 'pill', onclick: function () { L.runScene(s.id); U.toast(t('home.ran', { n: L.nameOf(s) })); } }, [U.icon('sparkle'), h('span', { text: L.nameOf(s) })]));
        });
        root.appendChild(h('section', { class: 'block' }, [h('h2', { text: t('home.scenes') }), pills]));
      }
      var order = ROOMS.slice();
      devs.forEach(function (d) { if (order.indexOf(d.room) < 0) order.push(d.room); });
      order.forEach(function (room) {
        var group = devs.filter(function (d) { return d.room === room; });
        if (!group.length) return;
        var grid = h('div', { class: 'devices' });
        group.forEach(function (d) { grid.appendChild(deviceCard(d)); });
        root.appendChild(h('section', { class: 'block' }, [h('h2', { class: 'room', text: t(room) }), grid]));
      });
    }
    root.appendChild(ecosystems());
  };
})();
