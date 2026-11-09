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
      U.btn(t('acc.recNew'), 'soft', recKeyDialog),
      U.btn(t('acc.signout'), 'ghost', function () {
        U.confirm(t('acc.signoutAsk'), t('acc.signout')).then(function (yes) { if (yes) CL.account.logout().then(function () { CL.app.render(); }); });
      })
    ]));
    return card;
  }

  /* новый ключ восстановления: по паролю, показывается один раз */
  function recKeyDialog() {
    var pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, 'data-autofocus': true });
    var err = h('p', { class: 'err', role: 'alert' });
    var m = U.modal({
      title: t('acc.recNew'), body: [h('p', { class: 'muted', text: t('acc.recNewText') }), U.field(t('acc.password'), pw), err], submitLabel: t('acc.recNew'),
      onSubmit: function () {
        err.textContent = '';
        CL.account.newRecoveryKey(pw.value).then(function (key) {
          m.close();
          var holder = h('div');
          var mm = U.modal({ title: t('acc.recTitle'), body: [holder], cancelLabel: t('common.close') });
          CL.authUI.keyStep(holder, { recoveryKey: key }, function () { mm.close(); });
        }, function (e) { err.textContent = CL.sync.message(e); });
        return false;
      }
    });
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
      rows.appendChild(h('label', { class: 'row static pick-row' }, [h('span', { class: 'row-main' }, [h('b', { text: d.name }), h('small', { class: 'muted', text: d.room })]), cb]));
    });
    U.modal({ title: t('ya.pick'), body: [h('p', { class: 'muted', text: t('ya.pickHint') }), rows], submitLabel: t('common.save'), onSubmit: function () {
      CL.yandex.setPick(list.filter(function (d) { return chosen[d.id]; }).map(function (d) { return d.id; }));
      if (done) done();
    } });
  }
  function yandexCard() {
    var a = CL.sync.acct(), card = h('section', { class: 'card c2' }, [h('h2', { text: t('ya.title') })]);
    var err = h('p', { class: 'err', role: 'alert' });
    if (!a) { card.appendChild(h('p', { class: 'muted', text: t('ya.need') })); return card; }
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
      card.appendChild(h('div', { class: 'btn-row' }, [pick, refresh, U.btn(t('ya.disconnect'), 'ghost', function () {
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

  CL.views.settings = function (root) {
    var st = S.get(), meta = S.meta();
    root.appendChild(U.head(t('set.title')));

    /* язык */
    var lang = U.select([{ v: 'auto', l: t('set.auto') }, { v: 'ru', l: 'Русский' }, { v: 'en', l: 'English' }], meta.lang || 'auto');
    lang.addEventListener('change', function () { meta.lang = lang.value; S.saveMeta(); CL.app.applyLang(); CL.app.render(); });
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

    var about = h('section', { class: 'card c5' }, [h('h2', { text: t('set.about') }), h('p', { class: 'muted', text: t('set.version', { v: CL.version }) })]);

    var salutCard = h('section', { class: 'card c3' }, [h('h2', { text: t('salut.title') }), h('p', { class: 'muted', text: t('salut.short') })]);
    var list = h('div', { class: 'folds' });
    [accountCard(), yandexCard(), salutCard, langCard, prot, tabsCard(), data, about].forEach(function (c) { list.appendChild(fold(c)); });
    root.appendChild(list);
  };
})();
