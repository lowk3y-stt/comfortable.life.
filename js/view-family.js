/* Экран «Семья»: участники (только зарегистрированные), приглашение по ссылке, 6-значному коду или ID. */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, h = U.h, t = U.t;
  var COLORS = ['#6E8F5E', '#3F6B4A', '#9BB3C1', '#3C5C70', '#C9A66B', '#B87C5A', '#8C6F9C', '#D08A8A'];

  function colorOf(id) { var n = 0; String(id).split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) >>> 0; }); return COLORS[n % COLORS.length]; }
  function show(err, e) { err.textContent = CL.sync.message(e); }
  function busy(btn, job) {
    btn.disabled = true;
    return job().then(function (r) { btn.disabled = false; return r; }, function (e) { btn.disabled = false; throw e; });
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { U.toast(t('acc.copied')); }, function () { U.toast(text); });
    U.toast(text); return Promise.resolve();
  }
  function timeText(ts) { return ts ? U.fmt(new Date(ts), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('sync.never'); }

  function memberRow(m, a, fam, err) {
    var mine = m.id === a.aid, owner = fam.owner === m.id;
    var age = L.age(m.birth);
    var sub = [age != null ? t('acc.age', { n: age }) : '', m.gender ? t('acc.' + (m.gender === 'm' ? 'male' : 'female')) : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'member static' }, [
      h('span', { class: 'avatar', style: 'background:' + colorOf(m.id), 'aria-hidden': 'true', text: (m.name || '?').charAt(0).toUpperCase() }),
      h('span', { class: 'member-name' }, [
        h('b', { text: (m.name || '?') + (m.surname ? ' ' + m.surname : '') }),
        sub ? h('small', { class: 'muted', text: sub }) : null,
        m.fp ? h('small', { class: 'muted fp', title: t('fam.fpHint'), text: t('fam.fp', { f: m.fp }) }) : null
      ]),
      m.pending ? h('span', { class: 'badge', text: t('fam.pending') }) : null,
      mine ? h('span', { class: 'badge', text: t('family.you') }) : null,
      owner ? h('span', { class: 'badge', text: t('acc.owner') }) : null,
      (fam.owner === a.aid && !mine) ? U.iconBtn('trash', t('acc.remove'), function () {
        U.confirm(t('acc.removeAsk', { n: m.name }), t('acc.remove')).then(function (yes) { if (yes) CL.account.removeMember(m.id).then(function () { CL.app.render(); }, function (e) { show(err, e); }); });
      }, 'quiet') : null
    ]);
  }

  function invitesCard(a, err) {
    if (!(a.invites || []).length) return null;
    var card = h('section', { class: 'card c3' }, [h('h2', { text: t('acc.invites') })]);
    a.invites.forEach(function (inv) {
      card.appendChild(h('div', { class: 'invite' }, [
        h('p', { text: t('acc.inviteFrom', { n: inv.fromName || '?' }) }),
        h('div', { class: 'btn-row' }, [
          U.btn(t('acc.accept'), 'primary', function () { CL.account.accept(inv.fid).then(function () { CL.app.render(); }, function (e) { show(err, e); }); }),
          U.btn(t('acc.decline'), 'ghost', function () { CL.account.decline(inv.fid).then(function () { CL.app.render(); }, function (e) { show(err, e); }); })
        ])
      ]));
    });
    return card;
  }

  /* способы добавить человека: ссылка, код, ID */
  function addCard(a, fam, err) {
    var card = h('section', { class: 'card c2' }, [h('h2', { text: t('fam.addTitle') }), h('p', { class: 'muted', text: t('fam.addText') })]);
    if (fam.code) {
      var link = CL.account.linkFor(fam.code);
      var share = U.btn(t('fam.shareLink'), 'primary', function () {
        if (navigator.share) navigator.share({ title: 'Comfortable life', text: t('fam.shareText'), url: link }).catch(function () {});
        else copy(link);
      }, 'family');
      card.appendChild(h('div', { class: 'btn-row' }, [share, U.btn(t('acc.copy'), 'soft', function () { copy(link); })]));
      card.appendChild(h('div', { class: 'join-code' }, [
        h('span', { class: 'field-l', text: t('fam.code') }),
        h('b', { class: 'code-big', text: fam.code.slice(0, 3) + ' ' + fam.code.slice(3) }),
        h('span', { class: 'field-h', text: t('fam.codeUntil', { t: timeText(fam.codeExp) }) })
      ]));
      var renew = U.btn(t('fam.newCode'), 'ghost', function () { busy(renew, function () { return CL.account.newCode(); }).then(function () { CL.app.render(); }, function (e) { show(err, e); }); });
      card.appendChild(h('div', { class: 'btn-row' }, [U.btn(t('fam.copyCode'), 'soft', function () { copy(fam.code); }), renew]));
    }
    var idIn = h('input', { type: 'text', placeholder: 'CL-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    var add = U.btn(t('acc.add'), 'soft', function () {
      err.textContent = '';
      if (!idIn.value.trim()) return;
      busy(add, function () { return CL.account.find(idIn.value); }).then(function (f) {
        if (f.id === a.aid) { err.textContent = t('acc.err.self'); return; }
        U.confirm(t('acc.addAsk', { n: f.name, id: CL.account.pretty(f.id), m: f.mail }), t('acc.add')).then(function (yes) {
          if (!yes) return;
          CL.account.invite(f.id).then(function () { idIn.value = ''; U.toast(t('acc.invited', { n: f.name })); }, function (e) { show(err, e); });
        });
      }, function (e) { show(err, e); });
    });
    card.appendChild(U.field(t('acc.addById'), idIn));
    card.appendChild(h('div', { class: 'btn-row' }, [add]));
    return card;
  }

  /* ввести 6-значный код вручную */
  function joinCard(err) {
    var code = h('input', { type: 'text', inputmode: 'numeric', maxlength: 7, placeholder: '000 000', autocomplete: 'off' });
    var go = U.btn(t('fam.join'), 'soft', function () {
      err.textContent = '';
      busy(go, function () { return CL.account.join(code.value); }).then(function () { U.toast(t('join.done')); CL.app.render(); }, function (e) { show(err, e); });
    });
    return h('section', { class: 'card c4' }, [h('h2', { text: t('fam.joinTitle') }), h('p', { class: 'muted', text: t('fam.joinText') }), U.field(t('fam.code'), code), h('div', { class: 'btn-row' }, [go])]);
  }

  CL.views.family = function (root) {
    root.appendChild(U.head(t('family.title')));
    var a = CL.sync.acct();

    if (!CL.sync.serverUrl()) { root.appendChild(U.empty(t('fam.noServer'))); return; }

    if (!a) {
      var holder = h('div', { class: 'auth-holder' });
      root.appendChild(h('section', { class: 'card c1' }, [h('h2', { text: t('fam.needAcc') }), h('p', { class: 'muted', text: t('fam.needAccText') }), holder]));
      CL.authUI.render(holder, { onDone: function () { CL.app.render(); } });
      return;
    }

    var err = h('p', { class: 'err', role: 'alert' });
    var sy = CL.sync.cfg(), fam = sy && sy.fam;
    var inv = invitesCard(a, err);
    if (inv) root.appendChild(inv);
    if (!fam) { root.appendChild(h('p', { class: 'muted', text: t('sync.st.busy') })); root.appendChild(err); return; }

    var list = h('div', { class: 'members' });
    fam.members.forEach(function (m) { list.appendChild(memberRow(m, a, fam, err)); });
    root.appendChild(h('section', { class: 'block' }, [h('h2', { text: t('family.members') + ' · ' + fam.members.length }), list]));
    if (fam.members.length === 1) root.appendChild(h('p', { class: 'muted', text: t('fam.alone') }));

    root.appendChild(h('div', { class: 'cards two' }, [addCard(a, fam, err), joinCard(err)]));

    var stt = CL.sync.status();
    var line = stt.state === 'busy' ? t('sync.st.busy') : stt.state === 'wait' ? t('sync.waitKey') : stt.state === 'error' ? t('sync.st.err') + ': ' + stt.error : t('sync.on');
    var now = U.btn(t('sync.now'), 'soft', function () { busy(now, function () { return CL.sync.run(); }).then(function () { CL.app.render(); }); });
    var row = [now];
    if (fam.members.length > 1) row.push(U.btn(t('acc.leaveFamily'), 'ghost', function () {
      U.confirm(t('acc.leaveAsk'), t('acc.leaveFamily')).then(function (yes) { if (yes) CL.account.leaveFamily().then(function () { CL.app.render(); }, function (e) { show(err, e); }); });
    }));
    root.appendChild(h('section', { class: 'card c5' }, [
      h('h2', { text: t('fam.sync') }),
      h('p', { class: stt.state === 'error' ? 'err' : '', text: line + ' · ' + t('sync.last', { t: timeText(sy.last) }) }),
      h('div', { class: 'btn-row' }, row),
      h('p', { class: 'muted small', text: t('sync.how') }),
      h('p', { class: 'muted small', text: t('acc.keyNote') })
    ]));
    root.appendChild(err);
  };
})();
