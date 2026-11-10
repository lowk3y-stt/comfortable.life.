/* Аккаунт: регистрация и вход по почте, профиль, семья (ссылка и код), смена пароля по коду из письма. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var S = CL.store;
  var JOIN_KEY = 'cl_join';

  function st() { return S.get(); }
  function box() { var s = st(); if (!s.sync) s.sync = {}; return s.sync; }
  function sync() { return CL.sync; }
  function t(k, v) { return CL.i18n.t(k, v); }
  function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()); }
  function needCrypto() { return window.crypto && crypto.subtle ? null : { code: 'crypto' }; }
  function pretty(id) { id = String(id || ''); return id.indexOf('CL') === 0 && id.length === 10 ? 'CL-' + id.slice(2, 6) + '-' + id.slice(6) : id; }

  /* ---------- ссылка-приглашение: ждёт, пока человек войдёт или зарегистрируется ---------- */
  function readJoin() { try { return localStorage.getItem(JOIN_KEY) || ''; } catch (e) { return ''; } }
  function setJoin(code) { try { if (code) localStorage.setItem(JOIN_KEY, code); else localStorage.removeItem(JOIN_KEY); } catch (e) {} }
  /* вызывается один раз при запуске: достаёт код из адреса #/join/123456 и убирает его из адресной строки */
  function captureLink() {
    var m = /^#\/join\/(\d{6})$/.exec(location.hash);
    if (m) { setJoin(m[1]); try { history.replaceState(null, '', location.pathname + location.search + '#/today'); } catch (e) { location.hash = '#/today'; } }
    return readJoin();
  }
  function linkFor(code) { return location.href.split('#')[0] + '#/join/' + code; }

  function profileBody(p) {
    return { surname: String(p.surname || '').trim(), name: String(p.name || '').trim(), birth: String(p.birth || ''), gender: String(p.gender || '') };
  }
  function checkProfile(p) {
    if (!p.surname || !p.name) return { code: 'profile' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birth) || new Date(p.birth) > new Date() || p.birth < '1900-01-01') return { code: 'birth' };
    if (p.gender !== 'm' && p.gender !== 'f') return { code: 'gender' };
    return null;
  }

  /* вход выполнен: запоминаем ключи на устройстве, профиль, запускаем синхронизацию */
  function takeSession(r, email, local, profile) {
    var b = box();
    b.aid = r.aid; b.token = r.token; b.email = email || r.email; b.name = r.name;
    b.invites = r.invites || []; b.ya = !!r.ya; b.pub = local.pub;
    delete b.fid; delete b.key; delete b.fam; delete b.people;
    CL.logic.setProfile(profile);
    st().profile.done = true;
    return CL.e2e.saveKeys(r.aid, local).then(function () {
      S.save();
      return refresh(true).then(function () { sync().start(); return afterSignIn(); });
    });
  }

  /* регистрация: ключи создаются на телефоне. Возвращает ключ восстановления (показывается один раз) */
  var pendingReg = null;
  function register(p, email, pw) {
    email = String(email).trim().toLowerCase();
    p = profileBody(p);
    var bad = checkProfile(p); if (bad) return Promise.reject(bad);
    if (!emailOk(email)) return Promise.reject({ code: 'email' });
    if (String(pw).length < 8) return Promise.reject({ code: 'password' });
    var nc = needCrypto(); if (nc) return Promise.reject(nc);
    return CL.e2e.createAccount(email, pw, p).then(function (m) {
      return sync().call(Object.assign({ op: 'register', email: email, name: p.name }, m.payload)).then(function (r) {
        if (!r.ok) throw r;
        if (r.needCode) { pendingReg = { email: email, local: m.local, profile: p }; return { needCode: true }; }
        return takeSession(r, email, m.local, p).then(function () { return { needCode: false }; });
      });
    });
  }
  function verify(email, code) {
    email = String(email).trim().toLowerCase();
    return sync().call({ op: 'verify', email: email, code: String(code).trim() }).then(function (r) {
      if (!r.ok) throw r;
      if (pendingReg && pendingReg.email === email) {
        var pr = pendingReg; pendingReg = null;
        return takeSession(r, email, pr.local, pr.profile);
      }
      throw { error: 'bad' };           // страница перезагружена между шагами: войдите с паролем
    });
  }
  function login(email, pw) {
    email = String(email).trim().toLowerCase();
    if (!emailOk(email)) return Promise.reject({ code: 'email' });
    var nc = needCrypto(); if (nc) return Promise.reject(nc);
    return CL.e2e.passHash(email, pw).then(function (ph) { return sync().call({ op: 'login', email: email, ph: ph }); }).then(function (r) {
      if (!r.ok) throw r;
      return CL.e2e.openAccount(email, pw, r.mat).then(function (o) { return takeSession(r, email, o.local, o.profile); });
    });
  }
  /* забытый пароль: 1) код на почту, 2) код + новый пароль; ключи создаются заново на этом телефоне */
  function resetStart(email) {
    email = String(email).trim().toLowerCase();
    if (!emailOk(email)) return Promise.reject({ code: 'email' });
    return sync().call({ op: 'reset_code', email: email }).then(function (r) { if (!r.ok) throw r; return r; });
  }
  function resetFinish(email, code, pw) {
    email = String(email).trim().toLowerCase();
    if (!emailOk(email)) return Promise.reject({ code: 'email' });
    if (String(pw).length < 8) return Promise.reject({ code: 'password' });
    var nc = needCrypto(); if (nc) return Promise.reject(nc);
    var old = st().profile || {}, p = { surname: old.surname || '', name: old.name || '', birth: old.birth || '', gender: old.gender || '' };
    return CL.e2e.createAccount(email, pw, p).then(function (m) {
      var pl = m.payload;
      return sync().call({ op: 'reset_do', email: email, code: String(code).trim(), ph: pl.ph, pub: pl.pub, wPw: pl.wPw, wPriv: pl.wPriv, prof: pl.prof }).then(function (r) {
        if (!r.ok) throw r;
        return takeSession(r, email, m.local, p);
      });
    });
  }
  function logout() {
    var aid = box().aid;
    var done = function () {
      sync().stop();
      sync().detachFamily();
      if (aid) CL.e2e.dropKeys(aid);
      st().sync = {};
      S.save();
    };
    return sync().call({ op: 'logout' }).then(done, done);
  }
  function setProfile(p) {
    p = profileBody(p);
    var bad = checkProfile(p); if (bad) return Promise.reject(bad);
    var keys = CL.e2e.keys(box().aid);
    if (!keys) return Promise.reject({ error: 'session' });
    return CL.e2e.encProfile(keys, p).then(function (enc) {
      return sync().call({ op: 'set_profile', name: p.name, prof: enc });
    }).then(function (r) {
      if (!r.ok) throw r;
      CL.logic.setProfile(p);
      return refresh(true).then(function () { sync().run(); });
    });
  }

  /* обновить сведения об аккаунте и семье; вызывается при запуске и по таймеру */
  function refresh(quiet) {
    var a = sync().acct();
    if (!a) return Promise.resolve();
    return sync().call({ op: 'me' }).then(function (r) {
      if (!r.ok) throw r;
      var b = box();
      b.email = r.email; b.invites = r.invites || []; b.ya = !!r.ya;
      if (r.fam) { var prev = {}; ((b.fam && b.fam.members) || []).forEach(function (m) { prev[m.id] = m; }); r.fam.members = r.fam.members.map(function (m) { return Object.assign(prev[m.id] || {}, m); }); b.fam = r.fam; }
      if (r.fid && b.fid !== r.fid) {            // семья сменилась: вступили на другом телефоне или нас убрали
        if (b.fid) sync().detachFamily();
        sync().attachFamily(r.fid, true);
        b.fam = r.fam;
      }
      sync().overlay();
      if (b.invites.length > (b.noticed || 0) && CL.ui) CL.ui.toast(t('acc.invitedToast'));
      b.noticed = b.invites.length;
      CL.account.lastRefresh = Date.now();
      S.save();
      sync().notify();
    }).catch(function (e) { if (!quiet) throw e; });
  }

  /* ---------- семья ---------- */
  function afterJoin(r) {
    var b = box();
    if (b.fid) sync().detachFamily();
    sync().attachFamily(r.fid, true);
    S.save();
    return refresh(true).then(function () { return sync().run(); });
  }
  /* вступить по коду или по ссылке */
  function join(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 6) return Promise.reject({ error: 'badcode' });
    return sync().call({ op: 'join', code: code }).then(function (r) {
      if (!r.ok) throw r;
      setJoin('');
      return afterJoin(r);
    });
  }
  /* после входа: если человек пришёл по ссылке, сразу вступаем в семью */
  function afterSignIn() {
    var code = readJoin();
    if (!code || !sync().acct()) return Promise.resolve(false);
    return join(code).then(function () {
      if (CL.ui) CL.ui.toast(t('join.done'));
      return true;
    }, function (e) {
      setJoin('');
      if (CL.ui) CL.ui.toast(sync().message(e));
      return false;
    });
  }
  function newCode() {
    return sync().api({ op: 'code_new' }).then(function (r) {
      if (!r.ok) throw r;
      var b = box(); if (b.fam) { b.fam.code = r.code; b.fam.codeExp = r.exp; }
      S.save();
      return r;
    });
  }
  function find(id) {
    return sync().call({ op: 'find', id: id }).then(function (r) { if (!r.ok) throw r; return r; });
  }
  function invite(id) {
    return sync().api({ op: 'invite', id: id }).then(function (r) { if (!r.ok) throw r; return r; });
  }
  function accept(fid) {
    return sync().call({ op: 'invite_accept', fid: fid }).then(function (r) {
      if (!r.ok) throw r;
      return afterJoin(r);
    });
  }
  function decline(fid) {
    return sync().call({ op: 'invite_decline', fid: fid }).then(function (r) { if (!r.ok) throw r; return refresh(true); });
  }
  function leaveFamily() {
    return sync().api({ op: 'fam_leave' }).then(function (r) {
      if (!r.ok) throw r;
      return afterJoin(r);
    });
  }
  function removeMember(id) {
    return sync().api({ op: 'fam_remove', id: id }).then(function (r) { if (!r.ok) throw r; return refresh(true); });
  }

  CL.account = {
    pretty: pretty, register: register, verify: verify, login: login, logout: logout, setProfile: setProfile,
    resetStart: resetStart, resetFinish: resetFinish, refresh: refresh,
    captureLink: captureLink, pendingJoin: readJoin, clearJoin: function () { setJoin(''); }, linkFor: linkFor, afterSignIn: afterSignIn,
    join: join, newCode: newCode, find: find, invite: invite, accept: accept, decline: decline, leaveFamily: leaveFamily, removeMember: removeMember,
    info: function () { return sync().acct(); }, lastRefresh: 0
  };
})();
