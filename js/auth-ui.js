/* Comfortable life — формы регистрации и входа (общие для первого экрана и настроек). */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var U = CL.ui, h = U.h;
  function t(k, v) { return CL.i18n.t(k, v); }

  var mode = 'up';                       // up — регистрация, in — вход, code — ввод кода из письма, key — ключ восстановления
  var pending = { email: '', prof: null };

  function show(err, e) { err.textContent = CL.sync.message(e); }
  function busy(btn, job) {
    btn.disabled = true;
    return job().then(function (r) { btn.disabled = false; return r; }, function (e) { btn.disabled = false; throw e; });
  }
  function genderSelect(value) {
    return U.select([{ v: '', l: t('acc.pick') }, { v: 'm', l: t('acc.male') }, { v: 'f', l: t('acc.female') }], value || '');
  }

  /* окно «Забыли пароль»: почта + ключ восстановления + новый пароль (письма не нужны) */
  function resetDialog(startEmail) {
    var email = h('input', { type: 'email', autocomplete: 'email', required: true, value: startEmail || '', 'data-autofocus': true });
    var key = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true, placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX' });
    var pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    var err = h('p', { class: 'err', role: 'alert' });
    var m = U.modal({
      title: t('acc.reset'),
      body: [h('p', { class: 'muted', text: t('acc.resetText') }), U.field(t('acc.email'), email), U.field(t('acc.recKey'), key), U.field(t('acc.newPass'), pw), err],
      submitLabel: t('acc.recoverBtn'),
      onSubmit: function () {
        err.textContent = '';
        CL.account.recover(email.value, key.value, pw.value).then(function () { U.toast(t('acc.resetDone')); m.close(); }, function (e) { show(err, e); });
        return false;
      }
    });
  }

  /* показ ключа восстановления: один раз, дальше не продолжить без отметки «сохранил(а)» */
  function keyStep(container, o, next) {
    var saved = h('input', { type: 'checkbox', 'data-native': '1' });
    var go = h('button', { type: 'submit', class: 'btn primary wide', disabled: true }, t('acc.recContinue'));
    saved.addEventListener('change', function () { go.disabled = !saved.checked; });
    var shown = h('p', { class: 'rec-key', translate: 'no', text: o.recoveryKey });
    var copy = h('button', { type: 'button', class: 'btn soft', onclick: function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(o.recoveryKey).then(function () { U.toast(t('acc.copied')); }, function () { U.toast(o.recoveryKey); });
      else U.toast(o.recoveryKey);
    } }, t('acc.recCopy'));
    container.textContent = '';
    container.appendChild(h('form', { class: 'auth-form', onsubmit: function (e) { e.preventDefault(); next(); } }, [
      h('h3', { text: t('acc.recTitle') }),
      h('p', { class: 'muted', text: t('acc.recText') }),
      shown,
      h('div', { class: 'btn-row' }, [copy]),
      h('label', { class: 'check' }, [saved, h('span', { text: t('acc.recSaved') })]),
      go
    ]));
  }

  /* container — куда рисовать; opts.onDone() вызывается после успешного входа */
  function render(container, opts) {
    opts = opts || {};
    container.textContent = '';
    var err = h('p', { class: 'err', role: 'alert' });
    var form;

    if (CL.account.pendingJoin()) container.appendChild(h('p', { class: 'banner', text: t('join.pending') }));

    function done() { mode = 'up'; pending = { email: '', prof: null }; if (opts.onDone) opts.onDone(); }

    if (mode === 'code') {
      var code = h('input', { type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', 'data-autofocus': true, 'aria-label': t('acc.code') });
      var ok = h('button', { type: 'submit', class: 'btn primary wide' }, t('acc.confirm'));
      form = h('form', { class: 'auth-form', onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        busy(ok, function () { return CL.account.verify(pending.email, code.value); }).then(done, function (e2) { show(err, e2); });
      } }, [
        h('p', { text: t('acc.codeSent', { e: pending.email }) }),
        U.field(t('acc.code'), code),
        h('div', { class: 'btn-row' }, [ok, h('button', { type: 'button', class: 'btn ghost', onclick: function () { mode = 'up'; render(container, opts); } }, t('common.cancel'))]),
        err
      ]);
      container.appendChild(form);
      setTimeout(function () { try { code.focus(); } catch (e) {} }, 0);
      return;
    }

    var seg = h('div', { class: 'seg', role: 'group' }, [
      h('button', { type: 'button', 'aria-pressed': mode === 'up' ? 'true' : 'false', onclick: function () { mode = 'up'; render(container, opts); } }, t('acc.signup')),
      h('button', { type: 'button', 'aria-pressed': mode === 'in' ? 'true' : 'false', onclick: function () { mode = 'in'; render(container, opts); } }, t('acc.signin'))
    ]);
    container.appendChild(seg);

    var email = h('input', { type: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', required: true, value: pending.email });
    var pw = h('input', { type: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password', required: true });

    if (mode === 'in') {
      var go = h('button', { type: 'submit', class: 'btn primary wide' }, t('acc.signin'));
      form = h('form', { class: 'auth-form', onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        busy(go, function () { return CL.account.login(email.value, pw.value); }).then(done, function (e2) { show(err, e2); });
      } }, [
        U.field(t('acc.email'), email), U.field(t('acc.password'), pw),
        go,
        h('button', { type: 'button', class: 'link', onclick: function () { resetDialog(email.value); } }, t('acc.forgot')),
        err
      ]);
    } else {
      var p = pending.prof || {};
      var surname = h('input', { type: 'text', maxlength: 40, autocomplete: 'family-name', required: true, value: p.surname || '' });
      var name = h('input', { type: 'text', maxlength: 40, autocomplete: 'given-name', required: true, value: p.name || '' });
      var today = CL.store.dateKey();
      var birth = h('input', { type: 'date', autocomplete: 'bday', required: true, min: '1900-01-01', max: today, value: p.birth || '' });
      var gender = genderSelect(p.gender); gender.required = true;
      var pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
      var up = h('button', { type: 'submit', class: 'btn primary wide' }, t('acc.signup'));
      form = h('form', { class: 'auth-form', onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        if (pw.value !== pw2.value) { err.textContent = t('acc.err.mismatch'); return; }
        var prof = { surname: surname.value, name: name.value, birth: birth.value, gender: gender.value };
        busy(up, function () { return CL.account.register(prof, email.value, pw.value); }).then(function (r) {
          pending = { email: email.value.trim().toLowerCase(), prof: prof };
          keyStep(container, r, function () { if (r.needCode) { mode = 'code'; render(container, opts); } else done(); });
        }, function (e2) { show(err, e2); });
      } }, [
        h('div', { class: 'fields-2' }, [U.field(t('acc.surname'), surname), U.field(t('acc.name'), name)]),
        h('div', { class: 'fields-2' }, [U.field(t('acc.birth'), birth), U.field(t('acc.gender'), gender)]),
        U.field(t('acc.email'), email),
        U.field(t('acc.password'), pw, t('acc.err.password')),
        U.field(t('acc.password2'), pw2),
        up,
        h('p', { class: 'muted small', text: t('acc.profileNote') }),
        err
      ]);
    }
    container.appendChild(form);
  }

  CL.authUI = { render: render, resetDialog: resetDialog, genderSelect: genderSelect, keyStep: keyStep };
})();
