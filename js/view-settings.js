/* Экран «Настройки»: язык, защита, цели, данные. */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, S = CL.store, h = U.h, t = U.t;

  function pinError(code) {
    if (code && code.code === 'nocrypto') return t('set.noCrypto');
    return t('set.pinWrong');
  }

  /* окна для PIN: включить, сменить, выключить */
  function pinDialog(mode) {
    var cur = h('input', { type: 'password', autocomplete: 'current-password', required: true, 'data-autofocus': true });
    var nw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 4 });
    var rep = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 4 });
    var err = h('p', { class: 'err', role: 'alert' });
    var body = [];
    if (mode !== 'enable') body.push(U.field(t('set.pinCurrent'), cur));
    if (mode !== 'disable') {
      body.push(U.field(t('set.pinNew'), nw), U.field(t('set.pinRepeat'), rep));
      body.push(h('p', { class: 'muted', text: t('set.pinWarn') }));
    }
    body.push(err);
    if (mode === 'enable') nw.setAttribute('data-autofocus', 'true');
    var m = U.modal({
      title: mode === 'enable' ? t('set.pinEnable') : mode === 'change' ? t('set.pinChange') : t('set.pinDisable'),
      body: body,
      submitLabel: mode === 'enable' ? t('set.pinEnable') : mode === 'change' ? t('set.pinChange') : t('set.pinDisable'),
      onSubmit: function () {
        err.textContent = '';
        if (mode !== 'disable') {
          if (nw.value.length < 4) { err.textContent = t('set.pinShort'); return false; }
          if (nw.value !== rep.value) { err.textContent = t('set.pinMismatch'); return false; }
        }
        var job = mode === 'enable' ? S.setPin(nw.value) : mode === 'change' ? S.changePin(cur.value, nw.value) : S.removePin(cur.value);
        job.then(function () {
          U.toast(t(mode === 'enable' ? 'set.pinSaved' : mode === 'change' ? 'set.pinChanged' : 'set.pinRemoved'));
          m.close(); CL.app.render();
        }, function (e) { err.textContent = pinError(e); });
        return false; /* окно закроется само после успеха */
      }
    });
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ---------- аккаунт ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { U.toast(t('acc.copied')); });
    return Promise.resolve();
  }
  function busy(btn, job) {
    btn.disabled = true;
    return job().then(function (r) { btn.disabled = false; return r; }, function (e) { btn.disabled = false; throw e; });
  }

  function profileDialog() {
    var p = S.get().profile;
    var surname = h('input', { type: 'text', maxlength: 40, required: true, value: p.surname || '', 'data-autofocus': true });
    var name = h('input', { type: 'text', maxlength: 40, required: true, value: p.name || '' });
    var birth = h('input', { type: 'date', required: true, min: '1900-01-01', max: S.dateKey(), value: p.birth || '' });
    var gender = CL.authUI.genderSelect(p.gender);
    var err = h('p', { class: 'err', role: 'alert' });
    U.modal({
      title: t('acc.editProfile'),
      body: [U.field(t('acc.surname'), surname), U.field(t('acc.name'), name), U.field(t('acc.birth'), birth), U.field(t('acc.gender'), gender), err],
      onSubmit: function (close) {
        err.textContent = '';
        CL.account.setProfile({ surname: surname.value, name: name.value, birth: birth.value, gender: gender.value }).then(function () { close(); CL.app.render(); }, function (e) { err.textContent = CL.sync.message(e); });
        return false;
      }
    });
  }

  function accountCard() {
    var card = h('section', { class: 'card c1' }, [h('h2', { text: t('acc.title') })]);
    var a = CL.sync.acct(), p = S.get().profile;
    if (!CL.sync.serverUrl()) { card.appendChild(h('p', { class: 'muted', text: t('fam.noServer') })); return card; }
    if (!a) {
      var holder = h('div', { class: 'auth-holder' });
      card.appendChild(h('p', { class: 'muted', text: t('sync.off') }));
      card.appendChild(holder);
      CL.authUI.render(holder, { onDone: function () { CL.app.render(); } });
      return card;
    }
    var age = L.age(p.birth);
    card.appendChild(h('p', null, [h('b', { text: (p.name || '') + (p.surname ? ' ' + p.surname : '') })]));
    card.appendChild(h('p', { class: 'muted', text: [a.email, age != null ? t('acc.age', { n: age }) : '', p.gender ? t('acc.' + (p.gender === 'm' ? 'male' : 'female')) : ''].filter(Boolean).join(' · ') }));
    card.appendChild(h('div', { class: 'acc-id' }, [
      h('span', { class: 'field-l', text: t('acc.id') }),
      h('div', { class: 'acc-id-row' }, [h('b', { text: CL.account.pretty(a.aid) }), U.iconBtn('notes', t('acc.copy'), function () { copyText(CL.account.pretty(a.aid)); })]),
      h('span', { class: 'field-h', text: t('acc.idHint') })
    ]));
    card.appendChild(h('div', { class: 'btn-row' }, [
      U.btn(t('acc.editProfile'), 'soft', profileDialog, 'edit'),
      U.btn(t('acc.signout'), 'ghost', function () {
        U.confirm(t('acc.signoutAsk'), t('acc.signout')).then(function (yes) { if (yes) CL.account.logout().then(function () { CL.app.render(); }); });
      })
    ]));
    return card;
  }

  /* ---------- Яндекс ---------- */
  /* окно выбора устройств: человек сам отмечает, что показывать на этом телефоне */
  function pickDialog(done) {
    var list = CL.yandex.choices(), cur = S.get().yaPick, chosen = {};
    (Array.isArray(cur) ? cur : list.map(function (x) { return x.id; })).forEach(function (id) { chosen[id] = true; });
    var rows = h('div', { class: 'rows' });
    if (!list.length) rows.appendChild(h('p', { class: 'muted', text: t('ya.pickNone') }));
    list.forEach(function (d) {
      var cb = h('input', { type: 'checkbox', checked: !!chosen[d.id], 'data-native': '1', 'aria-label': d.name });
      cb.addEventListener('change', function () { chosen[d.id] = cb.checked; });
      rows.appendChild(h('label', { class: 'row static pick-row' }, [h('span', { class: 'row-main' }, [h('b', { text: d.name }), h('small', { class: 'muted', text: d.room + (d.view ? (d.room ? ' · ' : '') + t('ya.viewOnly') : '') })]), cb]));
    });
    U.modal({ title: t('ya.pick'), body: [h('p', { class: 'muted', text: t('ya.pickHint') }), rows], submitLabel: t('common.save'), onSubmit: function () {
      CL.yandex.setPick(list.filter(function (d) { return chosen[d.id]; }).map(function (d) { return d.id; }));
      if (done) done();
    } });
  }
  function rawDialog() {
    var rows = CL.yandex.raw().map(function (x) {
      return h('div', { class: 'raw-dev' }, [h('b', { text: x.name + ' (' + x.type + ')' }), h('small', { class: 'muted', text: 'cap: ' + (x.caps.join(', ') || '-') }), h('small', { class: 'muted', text: 'prop: ' + (x.props.join(', ') || '-') })]);
    });
    U.modal({ title: t('ya.raw'), body: [h('p', { class: 'muted', text: t('ya.rawHint') }), h('div', { class: 'raw-list' }, rows.length ? rows : [h('p', { text: t('ya.pickNone') })])], cancelLabel: t('common.close') });
  }
  function yandexCard() {
    var a = CL.sync.acct(), card = h('section', { class: 'card c2' }, [h('h2', { text: t('ya.title') })]);
    var err = h('p', { class: 'err', role: 'alert' });
    if (!a) { card.appendChild(h('p', { class: 'muted', text: t('ya.need') })); return card; }
    var vi = CL.yandex.via();
    if (vi) {
      var rf = U.btn(t('ya.refresh'), 'soft', function () {
        err.textContent = '';
        busy(rf, function () { return CL.yandex.refresh(); }).then(function () { U.toast(t('ya.done', { n: CL.yandex.count() })); CL.app.render(); }, function () { err.textContent = t('ya.err'); });
      });
      card.appendChild(h('p', { text: t('ya.viaText', { n: L.memberName(vi) || '?' }) }));
      card.appendChild(h('p', { class: 'muted small', text: t('ya.connected', { n: CL.yandex.count() }) }));
      card.appendChild(h('div', { class: 'btn-row' }, [rf, U.btn(t('ya.raw'), 'soft', function (e) { var b = e.currentTarget; busy(b, function () { return CL.yandex.fetchInfo(); }).then(rawDialog, function () { err.textContent = t('ya.err'); }); })]));
      card.appendChild(err);
      return card;
    }
    if (a.ya) {
      var pick = U.btn(t('ya.pick'), 'primary', function () {
        err.textContent = '';
        busy(pick, function () { return CL.yandex.fetchInfo(); }).then(function () { pickDialog(function () { CL.app.render(); }); }, function () { err.textContent = t('ya.err'); });
      });
      var refresh = U.btn(t('ya.refresh'), 'soft', function () {
        err.textContent = '';
        busy(refresh, function () { return CL.yandex.refresh(); }).then(function () { U.toast(t('ya.done', { n: CL.yandex.count() })); CL.app.render(); }, function () { err.textContent = t('ya.err'); });
      });
      card.appendChild(h('p', { text: CL.yandex.needPick() ? t('ya.needPick') : t('ya.connected', { n: CL.yandex.count() }) }));
      var fm = CL.sync.cfg() && CL.sync.cfg().fam;
      if (fm && fm.members.length > 1) {
        var shared = CL.sync.homeAid() === a.aid;
        var hsw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': shared ? 'true' : 'false', 'aria-label': t('ya.share'), onclick: function () {
          CL.sync.setHome(shared ? null : { pick: S.get().yaPick || [] }); CL.app.render();
        } }, h('span', { class: 'knob' }));
        card.appendChild(h('div', { class: 'row static' }, [h('span', { class: 'row-main', text: t('ya.share') }), hsw]));
        card.appendChild(h('p', { class: 'muted small', text: t('ya.shareHint') }));
      }
      card.appendChild(h('div', { class: 'btn-row' }, [pick, refresh, U.btn(t('ya.raw'), 'soft', function (e) { var b = e.currentTarget; busy(b, function () { return CL.yandex.fetchInfo(); }).then(rawDialog, function () { err.textContent = t('ya.err'); }); }), U.btn(t('ya.disconnect'), 'ghost', function () {
        U.confirm(t('ya.disconnectAsk'), t('ya.disconnect')).then(function (ok) { if (ok) CL.yandex.disconnect().then(function () { CL.app.render(); }, function () { err.textContent = t('ya.err'); }); });
      })]));
    } else {
      var login = U.btn(t('ya.login'), 'primary', function () {
        err.textContent = '';
        busy(login, function () { return CL.yandex.login(); }).catch(function (e) { err.textContent = CL.sync.message(e); });
      });
      card.appendChild(h('p', { class: 'muted', text: t('ya.text') }));
      card.appendChild(h('div', { class: 'btn-row' }, [login]));
    }
    card.appendChild(err);
    return card;
  }

  function ecoRow(name, status) {
    return h('div', { class: 'row static eco-row' }, [h('span', { class: 'row-main' }, [h('b', { text: name }), h('small', { class: 'muted', text: status })])]);
  }
  function ecoCard() {
    var card = h('section', { class: 'card c2' }, [h('h2', { text: t('eco.title') })]);
    var ya = yandexCard(); ya.className = 'eco-sub';
    var salut = h('div', { class: 'eco-sub' }, [h('h2', { text: t('salut.title') }), h('p', { class: 'muted', text: t('salut.short') })]);
    card.appendChild(ya); card.appendChild(salut);
    card.appendChild(h('div', { class: 'rows' }, [ecoRow(t('eco.tuya'), t('eco.soon')), ecoRow(t('eco.xiaomi'), t('eco.soon'))]));
    return card;
  }

  /* какие разделы показывать на нижней панели */
  function tabsCard() {
    var card = h('section', { class: 'card c4' }, [h('h2', { text: t('set.tabs') }), h('p', { class: 'muted', text: t('set.tabsHint') })]);
    var rows = h('div', { class: 'rows' });
    S.TAB_ITEMS.forEach(function (k) {
      var on = L.tabOn(k), locked = k === 'settings';
      var sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': t('nav.' + k), disabled: locked, onclick: function () { L.setTab(k, !on); } }, h('span', { class: 'knob' }));
      rows.appendChild(h('div', { class: 'row static' }, [U.icon(k), h('span', { class: 'row-main', text: t('nav.' + k) }), sw]));
    });
    card.appendChild(rows);
    return card;
  }

  /* своя клавиатура: включить или оставить системную */

  /* «Ещё»: разделы, которых нет на нижней панели */
  CL.views.more = function (root) {
    root.appendChild(U.head(t('nav.more')));
    var items = S.TAB_ITEMS.filter(function (k) { return !L.tabOn(k); });
    if (!items.length) { root.appendChild(U.empty(t('more.none'))); return; }
    var list = h('nav', { class: 'more-list', 'aria-label': t('nav.more') });
    items.forEach(function (k) {
      list.appendChild(h('a', { class: 'more-item', href: '#/' + k }, [
        h('span', { class: 'more-ic' }, U.icon(k)),
        h('span', { class: 'more-t' }, [h('b', { text: t('nav.' + k) }), h('small', { text: t('more.' + k) })]),
        U.icon('right')
      ]));
    });
    root.appendChild(list);
  };

  /* каждый пункт Настроек свёрнут: заголовок открывает содержимое; открытые остаются открытыми после перерисовки */
  var openFolds = {};
  function fold(card) {
    var head = card.querySelector(':scope > h2');
    if (!head) return card;
    var key = head.textContent, d = h('details', { class: card.className + ' fold' });
    if (openFolds[key]) d.setAttribute('open', '');
    var sum = h('summary', {}, [h('span', { class: 'fold-t', text: key }), U.icon('right')]);
    var body = h('div', { class: 'fold-body' });
    Array.prototype.slice.call(card.childNodes).forEach(function (n) { if (n !== head) body.appendChild(n); });
    d.appendChild(sum); d.appendChild(body);
    d.addEventListener('toggle', function () { if (d.open) openFolds[key] = true; else delete openFolds[key]; });
    return d;
  }

  function segControl(opts, cur, onPick, label) {
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': label }, []);
    opts.forEach(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': o.v === cur ? 'true' : 'false', onclick: function () { onPick(o.v); } }, o.l);
      seg.appendChild(b);
    });
    return seg;
  }
  function appearanceCard() {
    var cur = CL.theme.get().theme;
    var seg = segControl([{ v: 'auto', l: t('theme.auto') }, { v: 'light', l: t('theme.light') }, { v: 'dark', l: t('theme.dark') }], cur, function (v) { CL.theme.set('theme', v); CL.app.render(); }, t('set.theme'));
    return h('section', { class: 'card c4' }, [h('h2', { text: t('set.appearance') }), h('p', { class: 'muted', text: t('set.themeHint') }), seg]);
  }
  function a11yCard() {
    var v = CL.theme.get();
    var sel = U.select([{ v: 'none', l: t('a11y.none') }, { v: 'cb', l: t('a11y.cb') }, { v: 'contrast', l: t('a11y.contrast') }], v.a11y);
    sel.addEventListener('change', function () { CL.theme.set('a11y', sel.value); CL.app.render(); });
    var on = v.text === 'large';
    var sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': t('a11y.large'), onclick: function () { CL.theme.set('text', on ? 'normal' : 'large'); CL.app.render(); } }, h('span', { class: 'knob' }));
    return h('section', { class: 'card c3' }, [
      h('h2', { text: t('set.a11y') }), h('p', { class: 'muted', text: t('a11y.hint') }),
      U.field(t('a11y.colors'), sel),
      h('div', { class: 'row static' }, [h('span', { class: 'row-main', text: t('a11y.large') }), sw])
    ]);
  }

  CL.views.settings = function (root) {
    var st = S.get(), meta = S.meta();
    root.appendChild(U.head(t('set.title')));

    /* язык */
    var lang = U.select([{ v: 'auto', l: t('set.auto') }].concat(CL.i18n.LANGS.map(function (o) { return { v: o.code, l: o.name }; })), meta.lang || 'auto');
    lang.addEventListener('change', function () { U.keepFields('#view', function () { meta.lang = lang.value; S.saveMeta(); CL.app.applyLang(); CL.app.render(); }); });
    var langCard = h('section', { class: 'card c1' }, [h('h2', { text: t('set.language') }), U.field(t('set.language'), lang)]);

    /* защита */
    var prot = h('section', { class: 'card c2' }, [h('h2', { text: t('set.protection') })]);
    if (S.hasPin()) {
      var al = U.select([1, 5, 15, 30].map(function (n) { return { v: String(n), l: t('set.minutes', { n: n }) }; }), String(meta.autolock || 1));
      al.addEventListener('change', function () { meta.autolock = Number(al.value); S.saveMeta(); });
      prot.appendChild(h('p', { text: t('set.pinOn') }));
      prot.appendChild(U.field(t('set.autolock'), al));
      prot.appendChild(h('div', { class: 'btn-row' }, [U.btn(t('set.pinChange'), 'soft', function () { pinDialog('change'); }), U.btn(t('set.pinDisable'), 'ghost', function () { pinDialog('disable'); })]));
    } else {
      prot.appendChild(h('p', { text: t('set.pinOff') }));
      if (!S.cryptoOk()) prot.appendChild(h('p', { class: 'err', text: t('set.noCrypto') }));
      prot.appendChild(h('div', { class: 'btn-row' }, [U.btn(t('set.pinEnable'), 'primary', function () { pinDialog('enable'); }, 'lock')]));
    }

    /* данные */
    var file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        U.confirm(t('set.importAsk'), t('set.import')).then(function (ok) {
          if (!ok) return;
          try { S.importJson(String(r.result)).then(function () { U.toast(t('set.importOk')); }); }
          catch (e) { U.toast(t('set.importBad')); }
        });
      };
      r.onerror = function () { U.toast(t('set.importBad')); };
      r.readAsText(f);
      file.value = '';
    });
    var data = h('section', { class: 'card c4' }, [
      h('h2', { text: t('set.data') }),
      h('p', { class: 'muted', text: t('set.dataNote') }),
      h('div', { class: 'btn-row' }, [
        U.btn(t('set.export'), 'soft', function () { download('comfortable-life-' + S.dateKey() + '.json', S.exportJson()); U.toast(t('set.exported')); }),
        U.btn(t('set.import'), 'soft', function () { file.click(); }),
        U.btn(t('set.reset'), 'danger', function () {
          U.confirm(t('set.resetAsk'), t('set.reset'), true).then(function (ok) {
            if (!ok) return;
            S.reset().then(function () { CL.app.applyLang(); CL.app.afterReset(); });
          });
        })
      ]),
      file
    ]);

    var about = h('section', { class: 'card c5' }, [h('h2', { text: t('set.about') }), h('p', { class: 'muted', text: t('set.version', { v: CL.version }) }), h('p', {}, [h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', text: t('set.privacy') })])]);

    var list = h('div', { class: 'folds' });
    [accountCard(), ecoCard(), appearanceCard(), a11yCard(), langCard, prot, tabsCard(), data, about].forEach(function (c) { list.appendChild(fold(c)); });
    root.appendChild(list);
  };
})();
