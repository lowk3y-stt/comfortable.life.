/* Comfortable life — оболочка приложения: запуск, навигация, экран PIN, знакомство, автоблокировка. */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, S = CL.store, h = U.h, t = U.t;

  var ROUTES = ['today', 'home', 'notes', 'calendar', 'sport', 'health', 'family', 'settings', 'more'];
  var ALL_TABS = ['today', 'home', 'notes', 'calendar', 'sport', 'health', 'family', 'settings'];
  var hiddenAt = 0, gateKind = null, waitTimer = null;

  function $(id) { return document.getElementById(id); }
  function route() { var m = /^#\/(\w+)/.exec(location.hash); return m && ROUTES.indexOf(m[1]) > -1 ? m[1] : 'today'; }

  function applyLang() {
    var l = S.meta().lang;
    CL.i18n.setLang(!l || l === 'auto' ? CL.i18n.detect() : l);
    document.title = 'Comfortable life';
  }

  /* ---------- оболочка: верх и нижняя панель (приложение рассчитано на телефон) ---------- */
  function brand(cls) {
    return h('a', { class: 'brand ' + (cls || ''), href: '#/today', 'aria-label': 'Comfortable life' }, [U.leaf(30), h('span', { translate: 'no', class: 'notranslate', lang: 'en', text: 'Comfortable life' })]);
  }
  function renderChrome(r) {
    /* вместо верхней панели: плавающие кнопки над нижней панелью */
    var top = $('top'); top.textContent = '';
    var fabs = h('div', { class: 'fabs' });
    if (S.hasPin()) fabs.appendChild(h('button', { type: 'button', class: 'fab fab-lock', 'aria-label': t('lock.now'), title: t('lock.now'), onclick: lockNow }, U.icon('lock')));
    fabs.appendChild(h('button', { type: 'button', class: 'fab ai-fab', 'aria-label': t('as.open'), title: t('as.open'), onclick: function (e) { CL.assistant.isOpen() ? CL.assistant.close() : CL.assistant.open(e.currentTarget); } }, U.icon('sparkle')));
    top.appendChild(fabs);

    var tabs = $('tabbar'); tabs.textContent = '';
    tabs.setAttribute('aria-label', t('nav.main'));
    var shown = S.get().tabs.slice(), hiddenSome = ALL_TABS.some(function (k) { return shown.indexOf(k) < 0; });
    var list = hiddenSome ? shown.concat(['more']) : shown;
    var curHidden = shown.indexOf(r) < 0;
    var cols = list.length <= 6 ? list.length : Math.ceil(list.length / 2), rows = list.length <= 6 ? 1 : 2;
    tabs.style.setProperty('--tab-cols', String(cols));
    document.documentElement.style.setProperty('--tab-h', (rows * 46 + 8 + (rows - 1) * 2) + 'px');
    list.forEach(function (k) {
      var active = k === 'more' ? curHidden : k === r;
      tabs.appendChild(h('a', { href: '#/' + k, class: 'tab' + (active ? ' active' : ''), 'aria-current': active ? 'page' : null }, [U.icon(k), h('span', { text: t('nav.' + k) })]));
    });
  }

  function render() {
    if (!S.get() || $('app').hidden) return;
    var r = route();
    renderChrome(r);
    var root = $('view');
    root.textContent = '';
    try { CL.views[r](root); }
    catch (e) { console.error(e); root.appendChild(h('p', { class: 'err', text: String(e && e.message || e) })); }
    CL.assistant.refresh();
  }

  function onRoute() {
    render();
    window.scrollTo(0, 0);
    var v = $('view'); if (v) { try { v.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- вход: PIN и знакомство ---------- */
  function gateShell(kind, title, content) {
    gateKind = kind;
    clearInterval(waitTimer);
    $('app').hidden = true;
    var g = $('gate'); g.hidden = false; g.textContent = '';
    var cur = CL.i18n.getLang();
    var langs = h('div', { class: 'seg gate-lang', role: 'group', 'aria-label': t('lang.switch') }, ['ru', 'en'].map(function (l) {
      return h('button', { type: 'button', 'aria-pressed': cur === l ? 'true' : 'false', onclick: function () { S.meta().lang = l; S.saveMeta(); applyLang(); (kind === 'lock' ? showLock : function () { showOnboarding(); })(); } }, l.toUpperCase());
    }));
    g.appendChild(h('div', { class: 'blob b1', 'aria-hidden': 'true' }));
    g.appendChild(h('div', { class: 'blob b2', 'aria-hidden': 'true' }));
    g.appendChild(langs);
    g.appendChild(h('main', { class: 'gate-card' }, [U.leaf(48), h('h1', { text: title }), content]));
    var f = g.querySelector('input'); if (f) f.focus();
  }

  function showLock() {
    var pin = h('input', { type: 'password', class: 'pin', autocomplete: 'current-password', placeholder: t('lock.placeholder'), 'aria-label': t('lock.placeholder') });
    var err = h('p', { class: 'err', role: 'alert' });
    var open = h('button', { type: 'submit', class: 'btn primary wide' }, t('lock.open'));
    function wait(n) {
      clearInterval(waitTimer);
      open.disabled = true;
      function tick() { if (n <= 0) { clearInterval(waitTimer); err.textContent = ''; open.disabled = false; return; } err.textContent = t('lock.wait', { n: n }); n--; }
      tick(); waitTimer = setInterval(tick, 1000);
    }
    var form = h('form', { class: 'gate-form', onsubmit: function (e) {
      e.preventDefault();
      if (!pin.value || open.disabled) return;
      open.disabled = true; err.textContent = '';
      S.unlock(pin.value).then(afterUnlock, function (e2) {
        pin.value = ''; open.disabled = false;
        if (e2 && e2.code === 'wait') wait(e2.seconds); else err.textContent = t('lock.wrong');
        pin.focus();
      });
    } }, [U.passWrap(pin), err, open]);
    var forgot = h('button', { type: 'button', class: 'link', onclick: function () {
      U.confirm(t('set.resetAsk'), t('set.reset')).then(function (ok) { if (ok) S.reset().then(function () { applyLang(); CL.assistant.reset(); afterUnlock(); }); });
    } }, t('lock.forgot'));
    gateShell('lock', t('lock.title'), h('div', null, [form, h('p', { class: 'muted', text: t('lock.hint') }), forgot]));
    var w = S.failInfo(); if (w) wait(w);
  }

  function showOnboarding(manual) {
    var st = S.get();
    function finish() { st.profile.done = true; S.save(); S.flush(); showApp(); }
    /* без аккаунта: только имя, всё хранится на телефоне */
    function nameForm() {
      var name = h('input', { type: 'text', maxlength: 40, autocomplete: 'given-name', 'aria-label': t('onb.name'), placeholder: t('onb.name') });
      return h('form', { class: 'gate-form', onsubmit: function (e) {
        e.preventDefault();
        CL.logic.setProfile({ name: name.value.trim() });
        finish();
      } }, [name, h('button', { type: 'submit', class: 'btn primary wide' }, t('onb.start'))]);
    }
    if (!CL.sync.serverUrl() || manual) {
      gateShell('onb', t('onb.title'), h('div', null, [h('p', { class: 'muted', text: t('onb.text') }), nameForm()]));
      return;
    }
    var holder = h('div', { class: 'auth-holder' });
    var skip = h('button', { type: 'button', class: 'link', onclick: function () { showOnboarding(true); } }, t('onb.skip'));
    gateShell('onb', t('onb.title'), h('div', null, [h('p', { class: 'muted', text: t('onb.textAcc') }), holder, skip]));
    CL.authUI.render(holder, { onDone: function () { st = S.get(); showApp(); } });
  }

  function afterUnlock() {
    var st = S.get();
    if (!st.profile.done) showOnboarding(); else showApp();
  }
  function showApp() {
    clearInterval(waitTimer);
    gateKind = null;
    $('gate').hidden = true;
    $('app').hidden = false;
    CL.assistant.init();
    render();
    if (CL.sync) CL.sync.start();
    if (CL.yandex) CL.yandex.start();
    maybeJoin();
    var v = $('view'); if (v) { try { v.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* человек открыл ссылку-приглашение */
  function maybeJoin() {
    var code = CL.account.pendingJoin();
    if (!code) return;
    if (!CL.sync.acct()) { if (CL.sync.serverUrl()) { location.hash = '#/family'; U.toast(t('join.pending')); } else CL.account.clearJoin(); return; }
    U.confirm(t('join.ask'), t('join.yes')).then(function (ok) {
      if (!ok) { CL.account.clearJoin(); return; }
      CL.account.join(code).then(function () { U.toast(t('join.done')); location.hash = '#/family'; render(); }, function (e) { CL.account.clearJoin(); U.toast(CL.sync.message(e)); });
    });
  }

  function lockNow() {
    if (!S.hasPin() || !S.get()) return;
    Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'), function (d) { try { d.close(); } catch (e) {} });
    CL.assistant.reset();
    if (CL.sync) CL.sync.stop();
    if (CL.yandex) CL.yandex.stop();
    S.lock().then(showLock);
  }

  /* блокировка после ухода из приложения */
  document.addEventListener('visibilitychange', function () {
    if (!S.get()) return;
    if (document.hidden) { hiddenAt = Date.now(); S.flush(); return; }
    if (S.hasPin() && hiddenAt && Date.now() - hiddenAt >= (S.meta().autolock || 1) * 60000) lockNow();
    hiddenAt = 0;
  });
  window.addEventListener('pagehide', function () { if (S.get()) S.flush(); });

  CL.app = {
    render: render, applyLang: applyLang,
    afterReset: function () { CL.assistant.reset(); location.hash = '#/today'; afterUnlock(); }
  };

  /* ---------- запуск ---------- */
  function boot() {
    applyLang();
    CL.account.captureLink();
    S.subscribe(function () { if (S.get() && !$('app').hidden) render(); });
    CL.sync.onChange(function () {
      var a = document.activeElement;
      if (S.get() && !$('app').hidden && (route() === 'settings' || route() === 'family') && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
    });
    window.addEventListener('hashchange', function () { if (S.get() && !$('app').hidden) onRoute(); });
    S.init().then(function (state) { if (state === 'locked') showLock(); else afterUnlock(); });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
