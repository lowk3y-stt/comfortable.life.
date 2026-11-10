/* Comfortable life — синхронизация семьи.
   Общее (заметки и события с пометкой «семейное», устройства, сценарии) шифруется на телефоне
   ключом семьи (AES-GCM) и лежит на сервере. Ключ семьи создают телефоны, сервер хранит только его запертые копии (js/e2e.js).
   Слияние по меткам времени: у каждой записи своя метка, побеждает более поздняя; удаления помнятся.
   Вход в аккаунт и семьи: js/account.js. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var S = CL.store;
  var COLS = ['notes', 'events'];
  var status = { state: 'idle', error: '' };
  var listeners = [];
  var running = false, again = false, applying = false, timer = null, poll = null, lastMe = 0;

  function t(k, v) { return CL.i18n.t(k, v); }
  function st() { return S.get(); }
  /* вошли в аккаунт */
  function acct() { var s = st(); return s && s.sync && s.sync.token ? s.sync : null; }
  /* вошли и состоим в семье: только тогда данные синхронизируются */
  function cfg() { var a = acct(); return a && a.fid ? a : null; }
  /* адрес сервера: то, что владелец вписал в config.js, главнее старого адреса, сохранённого в телефоне */
  function serverUrl() {
    var c = window.CL_CONFIG && window.CL_CONFIG.serverUrl;
    if (c) return c;
    var s = st(), u = s && s.sync && s.sync.url;
    return u || '';
  }

  /* ---------- кодирование ---------- */
  function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }

  function canon(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}';
  }
  function hash(o) {
    var s = canon(o), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  /* ---------- шифрование ---------- */
  function encrypt(obj, key) { return CL.e2e.encJson(key, obj); }
  function decrypt(box, key) { return CL.e2e.decJson(key, box); }
  /* пароль на сервер не отправляется: уходит только результат PBKDF2 (см. js/e2e.js) */
  function passHash(email, password) { return CL.e2e.passHash(email, password); }

  /* прокси в Яндекс Облаке может вернуть ответ завёрнутым: {statusCode, headers, body} */
  function unwrap(d) {
    if (d && typeof d === 'object' && typeof d.statusCode === 'number' && typeof d.body === 'string') { try { return JSON.parse(d.body); } catch (e) { return null; } }
    return d;
  }
  /* ---------- связь с сервером ---------- */
  function call(body, ms) {
    var url = serverUrl();
    if (!url) return Promise.reject({ error: 'nourl' });
    var s = st(), a = s && s.sync;
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 25000);
    var payload = Object.assign({}, a && a.token ? { aid: a.aid, token: a.token } : {}, body);
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
      body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined
    }).then(function (r) { clearTimeout(to); return r.json(); }, function (e) { clearTimeout(to); throw e; }).then(unwrap).then(function (r) {
      if (r && r.error === 'session' && acct()) { signedOutLocally(); }
      return r;
    });
  }
  /* что именно не так, когда «нет связи»: сервер не отвечает, нет базы или нет таблиц */
  function ping() {
    var url = serverUrl(), ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch(url, { method: 'GET', signal: ctl ? ctl.signal : undefined }).then(function (r) { clearTimeout(to); return r.json(); }).then(unwrap).then(function (d) { return d || {}; }, function () { clearTimeout(to); return null; });
  }
  function explain(e) {
    var plain = !e || !(e.error || e.code);
    if (!plain || !serverUrl()) return Promise.resolve(message(e));
    var host = ''; try { host = new URL(serverUrl()).host; } catch (x) { host = serverUrl(); }
    return ping().then(function (d) {
      if (!d) return t('sync.diag.down', { h: host });
      if (d.db === false) return t('sync.diag.nodb');
      if (d.schema === false) return t('sync.diag.noschema');
      return t('sync.diag.up');
    });
  }
  /* проверка связи по кнопке: возвращает понятный текст */
  function check() {
    var host = ''; try { host = new URL(serverUrl()).host; } catch (x) { host = serverUrl() || ''; }
    if (!serverUrl()) return Promise.resolve(t('sync.diag.down', { h: '—' }));
    return ping().then(function (d) {
      if (!d) return t('sync.diag.down', { h: host });
      if (d.db === false) return t('sync.diag.nodb');
      if (d.schema === false) return t('sync.diag.noschema');
      return t('sync.diag.ok');
    });
  }
  /* запросы к данным семьи */
  function api(body) {
    var sy = cfg(); if (!sy) return Promise.reject({ error: 'off' });
    return call(Object.assign({ fid: sy.fid }, body));
  }
  /* сервер больше не признаёт вход: выходим на этом телефоне */
  function signedOutLocally() {
    var s = st(); if (!s || !s.sync) return;
    var url = s.sync.url;
    if (s.sync.aid && CL.e2e) CL.e2e.dropKeys(s.sync.aid);
    fkCache = null;
    s.sync = url ? { url: url } : {};
    s.devices = s.devices.filter(function (d) { return d.src !== 'yandex'; }); delete s.yaPick;
    stop(); setStatus('idle');
    S.save();
    if (CL.ui) CL.ui.toast(t('acc.err.session'));
  }

  /* ---------- что синхронизируется ---------- */
  function isShared(col, it) { return !!it.shared; }
  function strip(it) { return JSON.parse(JSON.stringify(it)); }
  function sharedItems() {
    var out = {};
    COLS.forEach(function (col) { st()[col].forEach(function (it) { if (isShared(col, it)) out[col + ':' + it.id] = it; }); });
    return out;
  }
  function stampLocal(sy) {
    var now = Date.now(), cur = sharedItems();
    sy.stamps = sy.stamps || {}; sy.tomb = sy.tomb || {};
    Object.keys(cur).forEach(function (k) {
      var h = hash(strip(cur[k])), e = sy.stamps[k];
      if (!e || e.h !== h) sy.stamps[k] = { h: h, u: now };
    });
    Object.keys(sy.stamps).forEach(function (k) {
      if (!cur[k]) { sy.tomb[k] = now; delete sy.stamps[k]; }
    });
    return cur;
  }
  /* отклики на заметку: у каждого участника остаётся его самый свежий */
  function joinResp(win, other) {
    var a = win.resp || [], b = other.resp || [];
    if (!a.length && !b.length) return win;
    var by = {};
    a.concat(b).forEach(function (r) { if (!by[r.by] || r.ts > by[r.by].ts) by[r.by] = r; });
    var out = JSON.parse(JSON.stringify(win));
    out.resp = Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return x.ts - y.ts; });
    return out;
  }
  var NOTIFY = false;
  var NOTIFY = false;
  function notifyChanges(old, items) {
    if (!NOTIFY) return;
    if (!NOTIFY) return;
    var me = (acct() || {}).aid, s = st(), fresh = [], horizon = Date.now() - 3 * 86400000;
    Object.keys(items).forEach(function (k) {
      var e = items[k], d = e.d, o = old[k];
      if (!d || e.u < horizon) return;
      var type = '', who = d.lu || d.by;
      if (!o) { type = 'new'; who = d.by || who; }
      else if (hash(strip(o)) !== hash(d)) {
        var oc = (o.resp || []).length, nc = (d.resp || []).length, last = (d.resp || []).slice().sort(function (x, y) { return y.ts - x.ts; })[0];
        if (nc > oc || (last && !(o.resp || []).some(function (r) { return r.by === last.by && r.text === last.text; }))) { type = 'resp'; who = last && last.by; }
        else type = 'edit';
      }
      if (!type || !who || who === me) return;
      fresh.push({ id: Math.random().toString(36).slice(2, 10), k: k, kind: k.indexOf('notes:') === 0 ? 'note' : 'event', type: type, by: who, title: d.title || (d.text || '').slice(0, 40), ts: Date.now(), read: false });
    });
    if (!fresh.length) return;
    s.notif = fresh.concat(s.notif || []).slice(0, 50);
    var L = CL.logic, T = CL.i18n.t;
    var msg = fresh.length === 1
      ? T('nt.' + fresh[0].kind + '.' + fresh[0].type, { n: L.memberName(fresh[0].by) || '?', t: fresh[0].title })
      : T('nt.many', { c: fresh.length });
    if (CL.ui) CL.ui.toast(msg);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) new Notification('Comfortable life', { body: msg, icon: 'icons/icon-192.png' });
    } catch (e) {}
  }
  function merge(cur, sy, remote) {
    var items = {}, tomb = {};
    Object.keys(cur).forEach(function (k) { items[k] = { u: sy.stamps[k].u, d: strip(cur[k]) }; });
    var ri = remote.items || {};
    Object.keys(ri).forEach(function (k) {
      var mine = items[k];
      if (!mine || ri[k].u > mine.u) {
        items[k] = ri[k];
        if (mine && mine.d && ri[k].d) items[k] = { u: ri[k].u, d: joinResp(ri[k].d, mine.d) };
      } else if (mine.d && ri[k].d) mine.d = joinResp(mine.d, ri[k].d);
    });
    [sy.tomb || {}, remote.tomb || {}].forEach(function (m) { Object.keys(m).forEach(function (k) { tomb[k] = Math.max(tomb[k] || 0, m[k]); }); });
    var cut = Date.now() - 90 * 86400000;
    Object.keys(tomb).forEach(function (k) {
      if (items[k] && items[k].u < tomb[k]) delete items[k];
      if (tomb[k] < cut) delete tomb[k];
    });
    return { items: items, tomb: tomb };
  }
  function snapshot() {
    var cur = sharedItems();
    return canon(Object.keys(cur).map(function (k) { return [k, strip(cur[k])]; }));
  }
  function apply(sy, m) {
    var s = st(), before = snapshot(), old = sharedItems(), oldCopy = {};
    Object.keys(old).forEach(function (k) { oldCopy[k] = strip(old[k]); });
    COLS.forEach(function (col) {
      var mine = s[col].filter(function (it) { return !isShared(col, it); });
      var list = [];
      Object.keys(m.items).forEach(function (k) { if (k.indexOf(col + ':') === 0) list.push(JSON.parse(JSON.stringify(m.items[k].d))); });
      s[col] = mine.concat(list);
    });
    sy.stamps = {};
    Object.keys(m.items).forEach(function (k) { sy.stamps[k] = { h: hash(m.items[k].d), u: m.items[k].u }; });
    sy.tomb = m.tomb;
    notifyChanges(oldCopy, m.items);
    return before !== snapshot();
  }

  /* ---------- люди семьи: профили лежат внутри шифрованного блока, сервер их не знает ---------- */
  function myPerson() { var p = st().profile || {}; return { name: p.name || '', surname: p.surname || '', birth: p.birth || '', gender: p.gender || '' }; }
  function overlay() {
    var sy = cfg(); if (!sy || !sy.fam) return;
    var people = sy.people || {};
    sy.fam.members.forEach(function (m) {
      var d = people[m.id] && people[m.id].d;
      if (d) { m.surname = d.surname || ''; m.birth = d.birth || ''; m.gender = d.gender || ''; if (d.name) m.name = d.name; }
      if (m.pub && !m.fp && !m._fp) { m._fp = true; CL.e2e.fingerprint(m.pub).then(function (f) { m.fp = f; notify(); }); }
    });
  }
  /* общий дом: главный аккаунт умного дома и список устройств лежат в шифрованном блоке семьи */
  function applyHome(sy) {
    var s = st(), hm = sy.home;
    if (!hm) { if (s.homeAid) { delete s.homeAid; } return; }
    s.homeAid = hm.aid;
    if (hm.aid !== sy.aid) {
      var np = Array.isArray(hm.pick) ? hm.pick.slice() : [], was = canon(s.yaPick || null);
      s.yaPick = np;
      if (was !== canon(np) && CL.yandex) setTimeout(function () { CL.yandex.refresh(true).catch(function () {}); }, 0);
    }
  }
  function setHome(obj) {
    var sy = cfg(); if (!sy) return;
    sy.home = obj ? { aid: sy.aid, pick: (obj.pick || []).slice(), u: Date.now() } : { aid: '', pick: [], off: true, u: Date.now() };
    if (!obj) delete st().homeAid; else st().homeAid = sy.aid;
    S.save(); run();
  }
  function homeAid() { var sy = cfg(); return sy && sy.home && sy.home.aid || ''; }
  function notify() { listeners.forEach(function (f) { try { f(status); } catch (e) {} }); }

  /* ---------- ключи семьи ---------- */
  var fkCache = null;                                   // { sig, raw, key } только в памяти
  function myKeys() { var a = acct(); return a ? CL.e2e.keys(a.aid) : null; }
  function famKey(sy, r) {
    var sig = r.kver + ':' + (r.wrap && r.wrap.ct || '').slice(0, 24);
    if (fkCache && fkCache.sig === sig) return Promise.resolve(fkCache);
    return CL.e2e.unwrap(myKeys().priv, r.wrap).then(function (raw) {
      return CL.e2e.aesFromRaw(raw).then(function (key) { fkCache = { sig: sig, raw: raw, key: key }; return fkCache; });
    });
  }
  function wrapForMembers(list, raw) {
    var out = {};
    return Promise.all(list.map(function (m) { return CL.e2e.wrapFor(m.pub, raw).then(function (w) { out[m.id] = w; }); })).then(function () { return out; });
  }

  /* ---------- один цикл: получить, слить, при необходимости отправить ---------- */
  function cycle(tries) {
    var sy = cfg();
    if (!myKeys()) return CL.e2e.loadKeys(sy.aid).then(function (k) { if (!k) { signedOutLocally(); throw { error: 'session' }; } return cycle(tries); });
    return api({ op: 'get' }).then(function (r) {
      if (!r.ok) throw r;
      sy.rev = r.rev; sy.kver = r.kver;
      if (sy.fam) {                                         // свежий список участников (с открытыми ключами)
        var old = {}; sy.fam.members.forEach(function (m) { old[m.id] = m; });
        sy.fam.members = r.members.map(function (m) { return Object.assign(old[m.id] || {}, m); });
        sy.fam.kver = r.kver;
      }
      var me = r.members.filter(function (m) { return m.id === sy.aid; })[0];
      /* у семьи ещё нет ключа: первый участник создаёт его */
      if (!r.kver) {
        if (me && !me.pending && tries < 2) {
          var raw0 = CL.e2e.newFamilyKey();
          return CL.e2e.wrapFor(myKeys().pub, raw0).then(function (w) {
            var o = {}; o[sy.aid] = w;
            return api({ op: 'keys', mode: 'init', wraps: o });
          }).then(function (kr) { if (!kr.ok) throw kr; return cycle(tries + 1); });
        }
        throw { error: 'waitkey' };
      }
      if (!r.wrap) throw { error: 'waitkey' };
      return famKey(sy, r).then(function (fk) {
        var p = r.ct ? decrypt({ iv: r.iv, ct: r.ct }, fk.key) : Promise.resolve(null);
        return p.then(function (rem) {
          var remote = { items: (rem && rem.items) || {}, tomb: (rem && rem.tomb) || {}, people: (rem && rem.people) || {}, home: (rem && rem.home) || null };
          var cur = stampLocal(sy);
          var m = merge(cur, sy, remote);
          var people = Object.assign({}, remote.people), mine = myPerson();
          if (!people[sy.aid] || canon(people[sy.aid].d) !== canon(mine)) people[sy.aid] = { u: Date.now(), d: mine };
          m.people = people;
          var home = (sy.home && (!remote.home || sy.home.u > remote.home.u)) ? sy.home : remote.home;
          m.home = home || null; sy.home = home || null;
          var changed = apply(sy, m);
          sy.people = people;
          overlay();
          applyHome(sy);
          var out = { items: m.items, tomb: m.tomb, people: people, home: m.home };
          var push = canon(out) !== canon({ items: remote.items, tomb: remote.tomb, people: remote.people, home: remote.home });
          var done = function () {
            if (changed) { applying = true; try { S.save(); } finally { applying = false; } } else S.flush();
          };
          var pend = r.members.filter(function (x) { return x.pending && x.pub; });
          /* принять новых участников: выдать им ключ семьи */
          var approve = function () {
            if (!pend.length) return Promise.resolve();
            return wrapForMembers(pend, fk.raw).then(function (wr) { return api({ op: 'keys', mode: 'approve', kver: r.kver, wraps: wr }); }).then(function () { again = true; });
          };
          /* кто-то ушёл: меняем ключ семьи, чтобы он больше ничего не прочёл */
          if (r.needRotate) {
            var members = r.members.filter(function (x) { return !x.pending; });
            if (members.some(function (x) { return !x.pub; })) throw { error: 'bad' };
            var raw2 = CL.e2e.newFamilyKey();
            return CL.e2e.aesFromRaw(raw2).then(function (k2) {
              return Promise.all([encrypt({ v: 1, items: out.items, tomb: out.tomb, people: out.people, home: out.home }, k2), wrapForMembers(members, raw2)]).then(function (z) {
                return api({ op: 'keys', mode: 'rotate', kver: r.kver + 1, rev: r.rev, iv: z[0].iv, ct: z[0].ct, wraps: z[1] }).then(function (kr) {
                  if (!kr.ok) { if (kr.error === 'conflict' && tries < 3) return cycle(tries + 1); throw kr; }
                  fkCache = null; sy.rev = r.rev + 1; sy.kver = r.kver + 1; done(); again = true;
                });
              });
            });
          }
          if (!push) { done(); return approve(); }
          return encrypt({ v: 1, items: out.items, tomb: out.tomb, people: out.people, home: out.home }, fk.key).then(function (box) {
            return api({ op: 'put', rev: r.rev, kver: r.kver, iv: box.iv, ct: box.ct }).then(function (pr) {
              if (pr.ok) { sy.rev = pr.rev; done(); return approve(); }
              if (pr.error === 'conflict' && tries < 3) return cycle(tries + 1);
              throw pr;
            });
          });
        });
      });
    });
  }

  function setStatus(state, error) {
    status.state = state; status.error = error || '';
    notify();
  }
  function message(e) {
    if (!e) return t('sync.err.net');
    if (e.code === 'url') return t('sync.err.url');
    if (e.code === 'crypto') return t('sync.err.crypto');
    if (e.code && /^(email|password|mismatch|self|profile|birth|gender)$/.test(e.code)) return t('acc.err.' + e.code);
    var known = /^(nomail|email|taken|login|locked|code|wait|mailquota|notfound|member|session|self|limit|owner|noinvite|auth|exists|profile|birth|gender|badcode|infam|noai|aiquota|noyandex|reckey|kver|big|bad)$/;
    if (e.error === 'mailsend') return t('acc.err.mailsend', { d: e.detail || '' });
    if (e.error === 'nourl') return t('sync.err.url');
    if (e.error === 'yandex') return t('ya.err');
    if (known.test(e.error || '')) return t('acc.err.' + e.error);
    if (e.error === 'server') return t('sync.err.server', { m: e.message || '' });
    if (e.error) return t('sync.err.server', { m: e.error });
    if (e.name === 'OperationError') return t('acc.err.auth');
    return t('sync.err.net');
  }

  var PING_FAMILY = 12000, PING_ALONE = 20000;
  function run() {
    if (!cfg() || !st()) return Promise.resolve();
    if (running) { again = true; return Promise.resolve(); }
    running = true; setStatus('busy');
    return cycle(0).then(function () {
      if (cfg()) cfg().last = Date.now();
      setStatus('ok');
    }, function (e) { if (e && e.error === 'waitkey') setStatus('wait'); else setStatus('error', message(e)); }).then(function () {
      running = false;
      if (st()) S.flush();
      if (again) { again = false; schedule(500); }
    });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(run, ms); }

  /* ---------- подключение семьи к этому телефону ---------- */
  /* joining = true: телефон входит в уже существующую семью, его старые записи уступают общим */
  function attachFamily(fid, joining) {
    var sy = acct(); if (!sy) return;
    fkCache = null; delete sy.people;
    sy.fid = fid; sy.key = ''; sy.tomb = {}; sy.stamps = {}; sy.last = 0;
    if (joining) {
      var cur = sharedItems();
      Object.keys(cur).forEach(function (k) { sy.stamps[k] = { h: hash(strip(cur[k])), u: 0 }; });
    }
  }
  /* телефон покидает семью: чужие общие записи убираем, свои остаются у вас */
  function detachFamily() {
    var sy = acct(); if (!sy) return;
    var me = sy.aid, s = st();
    ['fid', 'key', 'stamps', 'tomb', 'last', 'fam', 'people', 'rev', 'kver'].forEach(function (k) { delete sy[k]; });
    ['notes', 'events'].forEach(function (col) {
      s[col] = s[col].filter(function (it) { return !(it.shared && it.by && it.by !== me); });
    });
  }

  function start() {
    stop();
    if (!acct()) return;
    var go = function () {
      if (!acct()) return Promise.resolve();
      return (CL.account ? CL.account.refresh(true) : Promise.resolve()).then(function () { return run(); });
    };
    go();
    /* быстрый опрос: дешёвый запрос «изменилась ли версия?», полная синхронизация только если да */
    var lastPing = 0;
    poll = setInterval(function () {
      if (document.hidden || !acct()) return;
      var sy = cfg(), now = Date.now();
      var every = sy && sy.fam && sy.fam.members && sy.fam.members.length > 1 ? PING_FAMILY : PING_ALONE;
      if (sy && !running && now - lastPing >= every - 500) {
        lastPing = now;
        api({ op: 'rev' }).then(function (r) { var c = cfg(); if (r.ok && c && (r.rev !== c.rev || r.kver !== c.kver || r.pend > 0 || r.need || !r.wrap)) run(); }, function () {});
      }
      var gap = sy ? 300000 : 120000;
      if (CL.account && now - (CL.account.lastRefresh || 0) > gap) CL.account.refresh(true);
    }, 1000);
  }
  function stop() { clearInterval(poll); clearTimeout(timer); poll = null; timer = null; }

  S.subscribe(function () { if (!applying && cfg()) schedule(800); });
  document.addEventListener('visibilitychange', function () {
    if (!st() || !acct()) return;
    if (cfg()) run();
    if (CL.account && !document.hidden && Date.now() - (CL.account.lastRefresh || 0) > 60000) CL.account.refresh(true);
  });

  CL.sync = {
    acct: acct, cfg: cfg, call: call, ping: ping, check: check, setHome: setHome, homeAid: homeAid, explain: explain, api: api, serverUrl: serverUrl, message: message, passHash: passHash,
    attachFamily: attachFamily, detachFamily: detachFamily, signedOutLocally: signedOutLocally, overlay: overlay,
    start: start, stop: stop, run: run,
    status: function () { return status; },
    notify: notify,
    onChange: function (f) { listeners.push(f); },
    URL_OK: /^(https:\/\/script\.google(usercontent)?\.com\/.+\/exec|https:\/\/[a-z0-9.-]+\.(workers|pages)\.dev(\/.*)?|https:\/\/[a-z0-9.-]+\.yandexcloud\.net(\/.*)?|https:\/\/[a-z0-9.-]+\.apigw\.yandexcloud\.net(\/.*)?|http:\/\/localhost:\d+(\/.*)?)$/
  };
})();
