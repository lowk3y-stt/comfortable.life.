/* Экран «Дом» */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, h = U.h, t = U.t;

  var ROOMS = ['room.living', 'room.kitchen', 'room.bedroom', 'room.hall', 'room.other'];

  function stateText(d) {
    if (d.type === 'lock') return t(d.on ? 'home.locked' : 'home.unlocked');
    return t(d.on ? 'home.on' : 'home.off');
  }

  function yaBody(d) {
    var Y = CL.yandex, box = h('div', { class: 'yctl' });
    if (d.ys && d.ys.length) {
      box.appendChild(h('div', { class: 'ysens' }, d.ys.map(function (x) {
        var txt = x.ev != null ? Y.val(x.ev) : (Math.round(x.v * 10) / 10) + (x.u || '');
        return h('span', { class: 'chip' }, [h('small', { text: Y.lbl(x.i) }), h('b', { text: txt })]);
      })));
    }
    if (d.hasOn && !d.on) return box;
    (d.yc || []).forEach(function (c) {
      var name = Y.lbl(c.i);
      if (c.t === 'range' || c.t === 'ctemp') {
        var out = h('output', { text: c.v + (c.u || '') });
        var r = h('input', { type: 'range', min: c.min, max: c.max, step: c.step || 1, value: c.v, 'aria-label': name });
        r.addEventListener('input', function () { out.textContent = r.value + (c.u || ''); });
        r.addEventListener('change', function () { Y.act(d, c, r.value); });
        box.appendChild(h('div', { class: 'yrow' }, [h('span', { class: 'ylbl', text: name }), h('div', { class: 'level' }, [r, out])]));
      } else if (c.t === 'mode') {
        var sel = h('select', { class: 'dev-sel', 'aria-label': name }, (c.modes || []).map(function (m) { return h('option', { value: m, text: Y.val(m), selected: m === c.v }); }));
        sel.addEventListener('change', function () { Y.act(d, c, sel.value); });
        box.appendChild(h('div', { class: 'yrow' }, [h('span', { class: 'ylbl', text: name }), sel]));
      } else if (c.t === 'toggle') {
        var sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': c.v ? 'true' : 'false', 'aria-label': name }, h('span', { class: 'knob' }));
        sw.addEventListener('click', function () { c.v = !c.v; sw.setAttribute('aria-checked', c.v ? 'true' : 'false'); Y.act(d, c, c.v); });
        box.appendChild(h('div', { class: 'yrow yrow-sw' }, [h('span', { class: 'ylbl', text: name }), sw]));
      }
    });
    return box;
  }

  function deviceCard(d) {
    var lv = L.range(d);
    var toggle = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': d.on ? 'true' : 'false', 'aria-label': L.nameOf(d) + ': ' + stateText(d), onclick: function () { L.setDevice(d.id, !d.on); } }, h('span', { class: 'knob' }));
    var yan = d.src === 'yandex';
    var card = h('article', { class: 'device' + (d.on ? ' on' : '') }, [
      h('div', { class: 'device-top' }, [
        h('span', { class: 'device-ic' }, U.icon(d.type)),
        h('div', { class: 'device-name' }, [h('b', { text: L.nameOf(d) }), h('small', { text: (d.eco ? t(d.eco) + (yan && !d.hasOn ? '' : ' · ') : '') + (yan && !d.hasOn ? '' : stateText(d)) })]),
        yan && !d.hasOn ? null : toggle
      ])
    ]);
    if (yan) { card.appendChild(yaBody(d)); return card; }
    if (lv && d.on) {
      var val = h('output', { text: d.level + lv.unit });
      var range = h('input', { type: 'range', min: lv.min, max: lv.max, step: lv.step, value: d.level, 'aria-label': L.nameOf(d) + ': ' + t('home.level') });
      range.addEventListener('input', function () { val.textContent = range.value + lv.unit; });
      range.addEventListener('change', function () { L.setLevel(d.id, range.value); });
      card.appendChild(h('div', { class: 'level' }, [range, val]));
    }
    return card;
  }

  function sceneDialog(sc) {
    var devs = L.devices(), acts = {};
    if (sc) Object.keys(sc.actions || {}).forEach(function (k) { acts[k] = sc.actions[k]; });
    var name = h('input', { type: 'text', maxlength: 40, value: sc ? (sc.name || L.nameOf(sc)) : '', placeholder: t('home.sceneName'), 'data-autofocus': '1' });
    var rows = devs.map(function (d) {
      var sel = h('select', {}, [h('option', { value: '', text: '—' }), h('option', { value: 'on', text: t('home.on') }), h('option', { value: 'off', text: t('home.off') })]);
      sel.value = acts[d.id] || '';
      sel.addEventListener('change', function () { if (sel.value) acts[d.id] = sel.value; else delete acts[d.id]; });
      return h('label', { class: 'field' }, [h('span', { text: L.nameOf(d) }), sel]);
    });
    var body = [U.field(t('home.sceneName'), name), h('p', { class: 'muted', text: devs.length ? t('home.sceneHint') : t('home.sceneNoDev') })].concat(rows);
    U.modal({
      title: sc ? t('home.editScene') : t('home.addScene'), body: body, submitLabel: t('common.save'),
      extra: sc ? [{ label: t('common.delete'), kind: 'danger', onClick: function (close) { L.removeScene(sc.id); close(); CL.app.render(); } }] : [],
      onSubmit: function () { L.saveScene({ id: sc && sc.id, name: name.value, actions: acts }); CL.app.render(); }
    });
  }

  CL.views.home = function (root) {
    root.appendChild(U.head(t('home.title')));

    var devs = L.devices();
    var scenes = L.scenes();
    if (!devs.length) {
      root.appendChild(U.empty(t('home.empty')));
      root.appendChild(h('div', { class: 'btn-row' }, [U.btn(t('eco.setup'), 'primary', function () { location.hash = '#/settings'; })]));
    }
    var pills = h('div', { class: 'pills' });
    scenes.forEach(function (s) {
      pills.appendChild(h('button', { type: 'button', class: 'pill', onclick: function () { L.runScene(s.id); U.toast(t('home.ran', { n: L.nameOf(s) })); } }, [U.icon('sparkle'), h('span', { text: L.nameOf(s) })]));
      pills.appendChild(U.iconBtn('edit', t('home.editScene'), function () { sceneDialog(s); }, 'quiet'));
    });
    pills.appendChild(h('button', { type: 'button', class: 'pill', onclick: function () { sceneDialog(null); } }, [U.icon('plus'), h('span', { text: t('home.addScene') })]));
    root.appendChild(h('section', { class: 'block' }, [h('h2', { text: t('home.scenes') }), pills]));
    if (devs.length) {
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
  };
})();
