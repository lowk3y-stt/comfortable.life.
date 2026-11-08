/**
 * Comfortable life: свой сервер на Cloudflare Workers + база D1 (бесплатно).
 *
 * Что делает:
 *  1) аккаунты: регистрация по почте и паролю, личный ID CL-XXXX-XXXX, вход, выход, восстановление по ключу;
 *  2) семья: создаётся сама, вступление по ссылке/6-значному коду или приглашением по ID;
 *  3) общие данные семьи хранятся ТОЛЬКО в зашифрованном виде. Сервер не знает ни пароля, ни ключа семьи:
 *     ключи создаются на телефонах, сюда приходят лишь «запертые» копии (wrap) и шифртекст;
 *  4) вход в Яндекс (OAuth) и команды в Яндекс Умный дом, токен хранится здесь у аккаунта;
 *  5) ответы ИИ (GigaChat или Claude), ключи в секретах Cloudflare.
 *
 * Что сервер видит: почту (для входа), ID, имя (для приглашений), публичный ключ, зашифрованные блоки.
 * Чего НЕ видит: пароль, фамилию, дату рождения, пол, заметки, события, ключ семьи.
 *
 * Привязки (Settings → Bindings): DB (D1). Необязательные секреты: SECRET, BREVO_KEY, MAIL_FROM, ANTHROPIC_API_KEY,
 * AI_MODEL, GIGACHAT_AUTH, GIGACHAT_SCOPE, GIGACHAT_URL, GIGACHAT_MODEL, YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, YANDEX_REDIRECT.
 */
const APP_NAME = 'Comfortable life';
const MAX_CT = 900000;                 // символов шифртекста (в D1 строка до 2 МБ)
const SESSION_DAYS = 90;
const CODE_MINUTES = 15;
const MAX_CODE_TRIES = 5;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const MAIL_GAP_SEC = 60;
const JOIN_DAYS = 7;
const JOIN_MAX_FAILS = 10;
const MAX_MEMBERS = 10;
const AI_DAILY = 40;
const AI_MAX_TOKENS = 2000;
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const YA_BASE = 'https://api.iot.yandex.net';
const YA_AUTH = 'https://oauth.yandex.ru';
const GIGA_OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGA_API = 'https://gigachat.devices.sberbank.ru/api/v1';
const YA_ALLOW = /^\/v1\.0\/(user\/info|devices\/actions|scenarios\/[A-Za-z0-9._-]+\/actions)$/;

class Fail extends Error { constructor(code, until) { super(code); this.fail = code; this.until = until; } }
const fail = (code, until) => { throw new Fail(code, until); };

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method === 'GET') {
      const p = url.searchParams;
      if (p.get('state') && (p.get('code') || p.get('error'))) return yaCallback(env, req, p);
      return json({ ok: true, app: 'comfortable-life-server', v: 5, mail: mailOn(env) });
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'bad' }, 405);
    try {
      const text = await req.text();
      if (text.length > MAX_CT + 20000) fail('big');
      const b = JSON.parse(text);
      const h = HANDLERS[String(b.op || '')];
      if (!h) return json({ ok: false, error: 'bad' });
      b._ip = req.headers.get('CF-Connecting-IP') || 'local';
      b._url = url;
      return json(await h(b, env));
    } catch (e) {
      if (e && e.fail) return json({ ok: false, error: e.fail, until: e.until });
      return json({ ok: false, error: 'server', message: String(e && e.message || e).slice(0, 200) });
    }
  }
};

/* ================= база ================= */
const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results || [];
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const stmt = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);

/* ================= криптография сервера ================= */
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(String(s))));
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const same = (a, b) => {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};
const randInt = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };

/* шифрование «в покое» токенов Яндекса ключом из секрета SECRET (если задан) */
async function atRest(env) {
  if (!env.SECRET) return null;
  const base = await crypto.subtle.importKey('raw', enc.encode(env.SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cl-rest'), info: enc.encode('ya') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) {
  const k = await atRest(env), s = JSON.stringify(obj);
  if (!k) return 'p:' + s;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(s));
  return 'e:' + hex(iv) + ':' + hex(ct);
}
async function unseal(env, s) {
  if (!s) return null;
  if (s.startsWith('p:')) return JSON.parse(s.slice(2));
  const k = await atRest(env); if (!k) return null;
  const [, iv, ct] = s.split(':');
  const un = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un(iv) }, k, un(ct)))); } catch (e) { return null; }
}

/* ================= проверки ввода ================= */
const email_ = (s) => { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120 ? s : ''; };
const mask_ = (e) => { const p = e.split('@'); return p[0].charAt(0) + '***@' + p[1]; };
const hex64 = (s) => /^[a-f0-9]{64}$/.test(String(s || ''));
const normId = (s) => {
  s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.indexOf('CL') === 0) s = s.slice(2);
  return /^[A-Z0-9]{8}$/.test(s) ? 'CL' + s : '';
};
const nm_ = (s) => String(s || '').trim().slice(0, 40);
/* блок материала (шифртекст/ключ): только строка или объект ограниченного размера */
function blob_(v, max) {
  if (v == null) fail('bad');
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (!s || s.length > (max || 6000)) fail('bad');
  return s;
}
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

async function limit(env, key, max, windowSec) {
  const now = Date.now(), r = await first(env, 'SELECT n, t FROM rl WHERE k=?', key);
  if (!r || now - r.t > windowSec * 1000) { await run(env, 'INSERT OR REPLACE INTO rl(k,n,t) VALUES(?,?,?)', key, 1, now); return; }
  if (r.n >= max) fail('wait');
  await run(env, 'UPDATE rl SET n=n+1 WHERE k=?', key);
}

/* ================= обработчики ================= */
const HANDLERS = {

  /* ---- аккаунт ---- */
  async register(b, env) {
    const email = email_(b.email);
    if (!email) fail('email');
    if (!hex64(b.ph) || !hex64(b.recAuth)) fail('bad');
    const name = nm_(b.name); if (!name) fail('profile');
    const pub = blob_(b.pub, 600), wPw = blob_(b.wPw), wRec = blob_(b.wRec), wPriv = blob_(b.wPriv), prof = blob_(b.prof);
    await limit(env, 'reg:' + b._ip, 20, 3600);
    const now = Date.now();
    let a = await first(env, 'SELECT * FROM acc WHERE email=?', email);
    if (a && a.verified) fail('taken');
    if (a && now - (a.last_mail || 0) < MAIL_GAP_SEC * 1000) fail('wait');
    const needCode = mailOn(env);
    const salt = rnd(16), recSalt = rnd(16);
    const ph = await sha(salt + b.ph), recH = await sha(recSalt + b.recAuth);
    let id;
    if (a) {                                              // регистрация не была подтверждена: заменяем данные
      id = a.id;
      await run(env, 'UPDATE acc SET name=?, salt=?, ph=?, rec_salt=?, rec_h=?, pub=?, w_pw=?, w_rec=?, w_priv=?, prof=? WHERE id=?', name, salt, ph, recSalt, recH, pub, wPw, wRec, wPriv, prof, id);
    } else {
      id = await newId(env);
      await run(env, 'INSERT INTO acc(id,email,name,salt,ph,rec_salt,rec_h,pub,w_pw,w_rec,w_priv,prof,verified,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, email, name, salt, ph, recSalt, recH, pub, wPw, wRec, wPriv, prof, needCode ? 0 : 1, now);
      await createFam(env, id);
    }
    if (needCode) {
      const code = code6();
      await run(env, 'UPDATE acc SET code_h=?, code_exp=?, code_tries=0, last_mail=? WHERE id=?', await sha(code + id), now + CODE_MINUTES * 60000, now, id);
      await mail(env, email, code);
      return { ok: true, needCode: true };
    }
    const acc = await first(env, 'SELECT * FROM acc WHERE id=?', id);
    return { ok: true, needCode: false, ...(await sessionReply(env, acc, await newSession(env, id), true)) };
  },

  async verify(b, env) {
    const a = await first(env, 'SELECT * FROM acc WHERE email=?', email_(b.email));
    if (!a || !a.code_h) fail('code');
    await checkCode(env, a, b.code);
    await run(env, 'UPDATE acc SET verified=1 WHERE id=?', a.id);
    return sessionReply(env, { ...a, verified: 1 }, await newSession(env, a.id), true);
  },

  async login(b, env) {
    const a = await first(env, 'SELECT * FROM acc WHERE email=?', email_(b.email)), now = Date.now();
    await limit(env, 'log:' + b._ip, 60, 600);
    if (!a || !a.verified || !hex64(b.ph)) fail('login');
    if (a.lock_until > now) fail('locked', a.lock_until);
    if (!same(a.ph, await sha(a.salt + b.ph))) {
      const f = (a.fails || 0) + 1;
      if (f >= MAX_FAILS) await run(env, 'UPDATE acc SET fails=0, lock_until=? WHERE id=?', now + LOCK_MINUTES * 60000, a.id);
      else await run(env, 'UPDATE acc SET fails=? WHERE id=?', f, a.id);
      fail('login');
    }
    await run(env, 'UPDATE acc SET fails=0, lock_until=0 WHERE id=?', a.id);
    await ensureFam(env, a);
    return sessionReply(env, await first(env, 'SELECT * FROM acc WHERE id=?', a.id), await newSession(env, a.id), true);
  },

  /* восстановление по ключу восстановления: сначала отдаём «запертый» главный ключ, затем принимаем новый пароль */
  async rec_get(b, env) {
    const a = await recAuth(env, b);
    return { ok: true, wRec: parse(a.w_rec) };
  },
  async rec_set(b, env) {
    const a = await recAuth(env, b);
    if (!hex64(b.ph)) fail('bad');
    const wPw = blob_(b.wPw), salt = rnd(16);
    await run(env, 'UPDATE acc SET salt=?, ph=?, w_pw=?, fails=0, lock_until=0 WHERE id=?', salt, await sha(salt + b.ph), wPw, a.id);
    await run(env, 'DELETE FROM sess WHERE aid=?', a.id);
    return { ok: true };
  },

  /* новый ключ восстановления (пользователь подтвердил паролем на телефоне) */
  async rec_new(b, env) {
    const a = await auth(env, b);
    if (!hex64(b.recAuth)) fail('bad');
    const recSalt = rnd(16);
    await run(env, 'UPDATE acc SET rec_salt=?, rec_h=?, w_rec=? WHERE id=?', recSalt, await sha(recSalt + b.recAuth), blob_(b.wRec), a.id);
    return { ok: true };
  },

  async logout(b, env) {
    await auth(env, b);
    await run(env, 'DELETE FROM sess WHERE h=?', await sha(String(b.token)));
    return { ok: true };
  },

  async me(b, env) {
    let a = await auth(env, b);
    if (await ensureFam(env, a)) a = await first(env, 'SELECT * FROM acc WHERE id=?', a.id);
    await ensureCode(env, a.fid);
    return { ok: true, ...(await sessionReply(env, a, null, false)), fam: await famInfo(env, a.fid) };
  },

  async set_profile(b, env) {
    const a = await auth(env, b), name = nm_(b.name);
    if (!name) fail('profile');
    await run(env, 'UPDATE acc SET name=?, prof=? WHERE id=?', name, blob_(b.prof), a.id);
    return { ok: true };
  },

  async find(b, env) {
    await auth(env, b);
    const t = await first(env, 'SELECT id, name, email, verified FROM acc WHERE id=?', normId(b.id));
    if (!t || !t.verified) fail('notfound');
    return { ok: true, id: t.id, name: t.name, mail: mask_(t.email) };
  },

  /* ---- семья ---- */
  async invite(b, env) {
    const f = await famAuth(env, b);
    const t = await first(env, 'SELECT id, name, verified FROM acc WHERE id=?', normId(b.id));
    if (!t || !t.verified) fail('notfound');
    if (t.id === f.acc.id) fail('self');
    if (await first(env, 'SELECT 1 AS x FROM mem WHERE fid=? AND aid=?', f.fam.fid, t.id)) fail('member');
    const cnt = (await first(env, 'SELECT COUNT(*) AS n FROM inv WHERE aid=?', t.id)).n;
    if (!(await first(env, 'SELECT 1 AS x FROM inv WHERE aid=? AND fid=?', t.id, f.fam.fid))) {
      if (cnt >= 20) fail('limit');
      await run(env, 'INSERT INTO inv(aid,fid,from_aid,from_name,ts) VALUES(?,?,?,?,?)', t.id, f.fam.fid, f.acc.id, f.acc.name, Date.now());
    }
    return { ok: true, name: t.name };
  },

  async invite_accept(b, env) {
    const a = await auth(env, b), fid = String(b.fid || '');
    if (!(await first(env, 'SELECT 1 AS x FROM inv WHERE aid=? AND fid=?', a.id, fid))) fail('noinvite');
    if (!(await first(env, 'SELECT 1 AS x FROM fam WHERE fid=?', fid))) { await run(env, 'DELETE FROM inv WHERE aid=? AND fid=?', a.id, fid); fail('noinvite'); }
    await joinFam(env, a, fid);
    return { ok: true, fid };
  },

  async invite_decline(b, env) {
    const a = await auth(env, b);
    await run(env, 'DELETE FROM inv WHERE aid=? AND fid=?', a.id, String(b.fid || ''));
    return { ok: true };
  },

  async code_new(b, env) {
    const f = await famAuth(env, b);
    const c = await newJoinCode(env, f.fam.fid);
    return { ok: true, code: c.code, exp: c.exp };
  },

  async join(b, env) {
    const a = await auth(env, b), now = Date.now();
    if (a.join_lock > now) fail('locked', a.join_lock);
    const code = String(b.code || '').replace(/\D/g, '');
    const fam = /^\d{6}$/.test(code) ? await first(env, 'SELECT fid FROM fam WHERE code=? AND code_exp>?', code, now) : null;
    if (!fam) {
      const jf = (a.join_fails || 0) + 1;
      if (jf >= JOIN_MAX_FAILS) await run(env, 'UPDATE acc SET join_fails=0, join_lock=? WHERE id=?', now + 3600000, a.id);
      else await run(env, 'UPDATE acc SET join_fails=? WHERE id=?', jf, a.id);
      fail('badcode');
    }
    await run(env, 'UPDATE acc SET join_fails=0 WHERE id=?', a.id);
    await joinFam(env, a, fam.fid);
    return { ok: true, fid: fam.fid };
  },

  async fam_leave(b, env) {
    const f = await famAuth(env, b);
    await dropMember(env, f.fam, f.acc.id);
    await run(env, "UPDATE acc SET fid='' WHERE id=?", f.acc.id);
    const a = await first(env, 'SELECT * FROM acc WHERE id=?', f.acc.id);
    await ensureFam(env, a);
    return { ok: true, fid: (await first(env, 'SELECT fid FROM acc WHERE id=?', a.id)).fid };
  },

  async fam_remove(b, env) {
    const f = await famAuth(env, b), target = normId(b.id);
    if (f.fam.owner !== f.acc.id) fail('owner');
    if (target === f.acc.id || !(await first(env, 'SELECT 1 AS x FROM mem WHERE fid=? AND aid=?', f.fam.fid, target))) fail('notfound');
    await dropMember(env, f.fam, target);
    await run(env, "UPDATE acc SET fid='' WHERE id=?", target);
    return { ok: true };
  },

  /* ---- данные семьи (шифртекст) ---- */
  async get(b, env) {
    const f = await famAuth(env, b);
    const members = await all(env, 'SELECT m.aid AS id, m.pending AS pending, a.name AS name, a.pub AS pub FROM mem m JOIN acc a ON a.id=m.aid WHERE m.fid=? ORDER BY m.joined', f.fam.fid);
    return {
      ok: true, rev: f.fam.rev, iv: f.fam.iv, ct: f.fam.ct, kver: f.fam.kver, needRotate: !!f.fam.need_rot,
      wrap: f.mem.pending ? null : parse(f.mem.wrap),
      members: members.map((m) => ({ id: m.id, name: m.name, pub: parse(m.pub), pending: !!m.pending }))
    };
  },

  /* только номера версий: дешёвая проверка «есть ли новое» */
  async rev(b, env) {
    const f = await famAuth(env, b);
    const p = await first(env, 'SELECT COUNT(*) AS n FROM mem WHERE fid=? AND pending=1', f.fam.fid);
    return { ok: true, rev: f.fam.rev, kver: f.fam.kver, pend: p.n, need: !!f.fam.need_rot, wrap: !f.mem.pending && !!f.mem.wrap };
  },

  async put(b, env) {
    const f = await famAuth(env, b);
    const ct = String(b.ct || ''), iv = String(b.iv || '');
    if (ct.length > MAX_CT || iv.length > 40) fail('big');
    if (f.mem.pending || Number(b.kver) !== f.fam.kver || !f.fam.kver) fail('kver');
    const r = await run(env, 'UPDATE fam SET rev=rev+1, iv=?, ct=? WHERE fid=? AND rev=?', iv, ct, f.fam.fid, Number(b.rev));
    if (!r.meta.changes) {
      const cur = await first(env, 'SELECT rev, iv, ct FROM fam WHERE fid=?', f.fam.fid);
      return { ok: false, error: 'conflict', rev: cur.rev, iv: cur.iv, ct: cur.ct };
    }
    return { ok: true, rev: Number(b.rev) + 1 };
  },

  /* выдача ключей: init (первый ключ семьи), approve (новым участникам), rotate (новый ключ после ухода участника) */
  async keys(b, env) {
    const f = await famAuth(env, b), fid = f.fam.fid;
    if (f.mem.pending) fail('auth');
    const wraps = b.wraps && typeof b.wraps === 'object' ? b.wraps : {};
    const ids = Object.keys(wraps);
    ids.forEach((id) => blob_(wraps[id], 1500));
    if (b.mode === 'init') {
      if (f.fam.kver !== 0 || ids.length !== 1 || ids[0] !== f.acc.id) fail('bad');
      const r = await run(env, 'UPDATE fam SET kver=1 WHERE fid=? AND kver=0', fid);
      if (!r.meta.changes) fail('kver');
      await run(env, 'UPDATE mem SET wrap=?, pending=0 WHERE fid=? AND aid=?', JSON.stringify(wraps[f.acc.id]), fid, f.acc.id);
      return { ok: true, kver: 1 };
    }
    if (b.mode === 'approve') {
      if (Number(b.kver) !== f.fam.kver || !f.fam.kver) fail('kver');
      const stmts = [];
      for (const id of ids) {
        const m = await first(env, 'SELECT pending FROM mem WHERE fid=? AND aid=?', fid, id);
        if (!m || !m.pending) continue;
        stmts.push(stmt(env, 'UPDATE mem SET wrap=?, pending=0 WHERE fid=? AND aid=?', JSON.stringify(wraps[id]), fid, id));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return { ok: true, n: stmts.length };
    }
    if (b.mode === 'rotate') {
      const members = await all(env, 'SELECT aid FROM mem WHERE fid=? AND pending=0', fid);
      if (Number(b.kver) !== f.fam.kver + 1) fail('kver');
      if (members.length !== ids.length || members.some((m) => !wraps[m.aid])) fail('bad');
      const ct = String(b.ct || ''), iv = String(b.iv || '');
      if (ct.length > MAX_CT || iv.length > 40) fail('big');
      const r = await run(env, 'UPDATE fam SET rev=rev+1, iv=?, ct=?, kver=?, need_rot=0 WHERE fid=? AND rev=? AND kver=?', iv, ct, f.fam.kver + 1, fid, Number(b.rev), f.fam.kver);
      if (!r.meta.changes) return { ok: false, error: 'conflict' };
      await env.DB.batch(members.map((m) => stmt(env, 'UPDATE mem SET wrap=? WHERE fid=? AND aid=?', JSON.stringify(wraps[m.aid]), fid, m.aid)));
      return { ok: true, kver: f.fam.kver + 1 };
    }
    fail('bad');
  },

  /* ---- Яндекс: вход через OAuth, токен хранится у аккаунта ---- */
  async ya_start(b, env) {
    const a = await auth(env, b), now = Date.now();
    if (!env.YANDEX_CLIENT_ID || !env.YANDEX_CLIENT_SECRET) fail('noyandex');
    const state = rnd(20);
    let ret = String(b.ret || '');
    if (!/^(https:\/\/|http:\/\/localhost)/.test(ret)) ret = '';
    await run(env, 'DELETE FROM yast WHERE exp<?', now);
    await run(env, 'INSERT INTO yast(state,aid,ret,exp) VALUES(?,?,?,?)', state, a.id, ret.slice(0, 300), now + 10 * 60000);
    const url = YA_AUTH + '/authorize?response_type=code&client_id=' + encodeURIComponent(env.YANDEX_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(yaRedirect(env, b._url)) + '&state=' + state;
    return { ok: true, url };
  },

  async ya_clear(b, env) {
    const a = await auth(env, b);
    await run(env, 'UPDATE acc SET ya=NULL WHERE id=?', a.id);
    return { ok: true };
  },

  async ya(b, env) {
    const a = await auth(env, b);
    let y = await unseal(env, a.ya);
    if (!y) return { ok: false, error: 'noyandex' };
    const method = b.method === 'POST' ? 'POST' : 'GET';
    if (!YA_ALLOW.test(String(b.path || ''))) return { ok: false, error: 'forbidden' };
    if (y.refresh && y.exp && y.exp - Date.now() < 3 * 86400000) {
      const rr = await yaToken(env, { grant_type: 'refresh_token', refresh_token: y.refresh });
      if (rr) { y = rr; await run(env, 'UPDATE acc SET ya=? WHERE id=?', await seal(env, y), a.id); }
    }
    const r = await yaCall(y.token, method, b.path, b.body);
    if (r.status === 401) { await run(env, 'UPDATE acc SET ya=NULL WHERE id=?', a.id); return { ok: false, error: 'noyandex' }; }
    return { ok: r.status === 200, status: r.status, data: r.data };
  },

  /* ---- ИИ ---- */
  async ai(b, env) {
    const a = await auth(env, b), day = new Date().toISOString().slice(0, 10);
    if (!env.GIGACHAT_AUTH && !env.ANTHROPIC_API_KEY) fail('noai');
    const u = await first(env, 'SELECT n FROM ai_use WHERE aid=? AND day=?', a.id, day);
    if (u && u.n >= AI_DAILY) fail('aiquota');
    await run(env, 'INSERT INTO ai_use(aid,day,n) VALUES(?,?,1) ON CONFLICT(aid,day) DO UPDATE SET n=n+1', a.id, day);
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) })).filter((m) => m.content);
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length) fail('bad');
    const sys = 'Ты ассистент внутри приложения «' + APP_NAME + '» (дом, заметки, календарь, спорт, здоровье, семья). ' +
      'Отвечай на языке пользователя: ' + (b.lang === 'en' ? 'английском' : 'русском') + '. ' +
      'Отвечай по делу и коротко; если просят длинный текст (сочинение, письмо) — пиши полностью. ' +
      'Текущие дата и время пользователя: ' + String(b.now || '').slice(0, 60) + '. ' +
      'Ты не можешь управлять приложением и устройствами сам: эти команды приложение обрабатывает отдельно. Не выдумывай данные пользователя.';
    let text = '';
    if (env.GIGACHAT_AUTH) { try { text = await aiGiga(env, sys, msgs); } catch (e) { text = ''; } }
    if (!text && env.ANTHROPIC_API_KEY) { try { text = await aiClaude(env, sys, msgs); } catch (e) { text = ''; } }
    return text ? { ok: true, text } : { ok: false, error: 'ai' };
  }
};

/* ================= аккаунты: помощники ================= */
async function newId(env) {
  for (let i = 0; i < 20; i++) {
    let s = '';
    for (let k = 0; k < 8; k++) s += ID_ALPHABET.charAt(randInt(ID_ALPHABET.length));
    const id = 'CL' + s;
    if (!(await first(env, 'SELECT 1 AS x FROM acc WHERE id=?', id))) return id;
  }
  throw new Error('id');
}
async function newSession(env, aid) {
  const now = Date.now(), token = rnd(32);
  await run(env, 'DELETE FROM sess WHERE aid=? AND exp<?', aid, now);
  await run(env, 'INSERT INTO sess(h,aid,exp) VALUES(?,?,?)', await sha(token), aid, now + SESSION_DAYS * 86400000);
  await run(env, 'DELETE FROM sess WHERE aid=? AND h NOT IN (SELECT h FROM sess WHERE aid=? ORDER BY exp DESC LIMIT 10)', aid, aid);
  return token;
}
async function auth(env, b) {
  const id = normId(b.aid);
  if (!id || !b.token) fail('session');
  const s = await first(env, 'SELECT aid FROM sess WHERE h=? AND exp>?', await sha(String(b.token)), Date.now());
  if (!s || s.aid !== id) fail('session');
  const a = await first(env, 'SELECT * FROM acc WHERE id=?', id);
  if (!a) fail('session');
  return a;
}
async function sessionReply(env, a, token, withMaterial) {
  const inv = (await all(env, 'SELECT fid, from_aid, from_name, ts FROM inv WHERE aid=? ORDER BY ts', a.id)).map((i) => ({ fid: i.fid, from: i.from_aid, fromName: i.from_name, ts: i.ts }));
  const r = { ok: true, aid: a.id, email: a.email, name: a.name, fid: a.fid, invites: inv, ya: !!a.ya };
  if (token) r.token = token;
  if (withMaterial) r.mat = { pub: parse(a.pub), wPw: parse(a.w_pw), wPriv: parse(a.w_priv), prof: parse(a.prof) };
  return r;
}
async function recAuth(env, b) {
  const email = email_(b.email);
  await limit(env, 'rec:' + email, 8, 900);
  const a = email ? await first(env, 'SELECT * FROM acc WHERE email=?', email) : null;
  if (!a || !a.verified || !hex64(b.recAuth) || !same(a.rec_h, await sha(a.rec_salt + b.recAuth))) fail('reckey');
  return a;
}
async function checkCode(env, a, code) {
  const now = Date.now();
  if (!a.code_h || a.code_exp < now) { await run(env, 'UPDATE acc SET code_h=NULL WHERE id=?', a.id); fail('code'); }
  if (!same(a.code_h, await sha(String(code || '').trim() + a.id))) {
    const tries = (a.code_tries || 0) + 1;
    if (tries >= MAX_CODE_TRIES) await run(env, 'UPDATE acc SET code_h=NULL, code_tries=0 WHERE id=?', a.id);
    else await run(env, 'UPDATE acc SET code_tries=? WHERE id=?', tries, a.id);
    fail('code');
  }
  await run(env, 'UPDATE acc SET code_h=NULL WHERE id=?', a.id);
}
const code6 = () => String(randInt(1000000)).padStart(6, '0');

/* письма с кодами. Два способа, оба бесплатны и не требуют своего домена:
   1) Brevo (BREVO_KEY + MAIL_FROM): 300 писем в день, отправитель подтверждается письмом;
   2) почтовый мост на Google Apps Script (MAIL_RELAY_URL + MAIL_RELAY_SECRET): письма уходят с вашей почты Gmail, ~100 в день. См. cloudflare/mail-relay.gs. */
const mailOn = (env) => !!((env.BREVO_KEY && env.MAIL_FROM) || (env.MAIL_RELAY_URL && env.MAIL_RELAY_SECRET));
async function mail(env, to, code) {
  const subject = APP_NAME + ': код ' + code;
  const text = 'Ваш код подтверждения для ' + APP_NAME + ': ' + code + '\n\nКод действует ' + CODE_MINUTES + ' минут. Если вы ничего не запрашивали, проигнорируйте письмо.\n\nYour ' + APP_NAME + ' code: ' + code + ' (valid ' + CODE_MINUTES + ' minutes).';
  if (!(env.BREVO_KEY && env.MAIL_FROM)) {
    const r = await fetch(env.MAIL_RELAY_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ secret: env.MAIL_RELAY_SECRET, to, subject, text }), redirect: 'follow' });
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d || !d.ok) fail('mailquota');
    return;
  }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: APP_NAME, email: env.MAIL_FROM }, to: [{ email: to }], subject: APP_NAME + ': код ' + code,
      textContent: 'Ваш код подтверждения для ' + APP_NAME + ': ' + code + '\n\nКод действует ' + CODE_MINUTES + ' минут. Если вы ничего не запрашивали, проигнорируйте письмо.\n\nYour ' + APP_NAME + ' code: ' + code + ' (valid ' + CODE_MINUTES + ' minutes).'
    })
  });
  if (!r.ok) fail('mailquota');
}

/* ================= семьи: помощники ================= */
async function createFam(env, aid) {
  const fid = rnd(16), now = Date.now();
  await run(env, 'INSERT INTO fam(fid,owner,created) VALUES(?,?,?)', fid, aid, now);
  await run(env, 'INSERT INTO mem(fid,aid,pending,joined) VALUES(?,?,0,?)', fid, aid, now);
  await run(env, 'UPDATE acc SET fid=? WHERE id=?', fid, aid);
  await newJoinCode(env, fid);
  return fid;
}
/* у каждого аккаунта всегда есть семья (сначала только он сам). Возвращает true, если пришлось создать */
async function ensureFam(env, a) {
  if (a.fid && (await first(env, 'SELECT 1 AS x FROM mem WHERE fid=? AND aid=?', a.fid, a.id))) return false;
  await createFam(env, a.id);
  return true;
}
async function newJoinCode(env, fid) {
  const exp = Date.now() + JOIN_DAYS * 86400000;
  for (let i = 0; i < 50; i++) {
    const c = code6();
    try { await run(env, 'UPDATE fam SET code=?, code_exp=? WHERE fid=?', c, exp, fid); return { code: c, exp }; }
    catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
  }
  throw new Error('code');
}
async function ensureCode(env, fid) {
  const f = await first(env, 'SELECT code, code_exp FROM fam WHERE fid=?', fid);
  if (f && (!f.code || f.code_exp <= Date.now())) await newJoinCode(env, fid);
}
async function famAuth(env, b) {
  const acc = await auth(env, b);
  const mem = acc.fid ? await first(env, 'SELECT * FROM mem WHERE fid=? AND aid=?', acc.fid, acc.id) : null;
  const fam = mem ? await first(env, 'SELECT * FROM fam WHERE fid=?', acc.fid) : null;
  if (!fam) fail('auth');
  return { acc, fam, mem };
}
/* вступить в семью: участник попадает в список «ожидает ключ», его принимают телефоны семьи.
   Из своей прежней семьи уходим, только если там больше никого нет */
async function joinFam(env, a, fid) {
  if (a.fid === fid) { await run(env, 'DELETE FROM inv WHERE aid=? AND fid=?', a.id, fid); return; }
  const n = (await first(env, 'SELECT COUNT(*) AS n FROM mem WHERE fid=?', fid)).n;
  if (n >= MAX_MEMBERS) fail('limit');
  if (a.fid) {
    const old = (await first(env, 'SELECT COUNT(*) AS n FROM mem WHERE fid=?', a.fid)).n;
    if (old > 1) fail('infam');
    await env.DB.batch([stmt(env, 'DELETE FROM mem WHERE fid=?', a.fid), stmt(env, 'DELETE FROM fam WHERE fid=?', a.fid)]);
  }
  await run(env, 'INSERT INTO mem(fid,aid,pending,joined) VALUES(?,?,1,?)', fid, a.id, Date.now());
  await run(env, 'UPDATE acc SET fid=? WHERE id=?', fid, a.id);
  await run(env, 'DELETE FROM inv WHERE aid=? AND fid=?', a.id, fid);
}
async function famInfo(env, fid) {
  const f = await first(env, 'SELECT * FROM fam WHERE fid=?', fid);
  if (!f) return null;
  const ms = await all(env, 'SELECT m.aid AS id, m.pending AS pending, a.name AS name, a.pub AS pub FROM mem m JOIN acc a ON a.id=m.aid WHERE m.fid=? ORDER BY m.joined', fid);
  return {
    fid, owner: f.owner, code: f.code || '', codeExp: f.code_exp || 0, kver: f.kver,
    members: ms.map((m) => ({ id: m.id, name: m.name || '?', pub: parse(m.pub), pending: !!m.pending }))
  };
}
/* участник ушёл: если у него был ключ, остальным нужно сменить ключ семьи (need_rot) */
async function dropMember(env, fam, id) {
  const m = await first(env, 'SELECT pending FROM mem WHERE fid=? AND aid=?', fam.fid, id);
  await run(env, 'DELETE FROM mem WHERE fid=? AND aid=?', fam.fid, id);
  const left = await all(env, 'SELECT aid FROM mem WHERE fid=? ORDER BY joined', fam.fid);
  if (!left.length) { await run(env, 'DELETE FROM fam WHERE fid=?', fam.fid); return; }
  const owner = fam.owner === id ? left[0].aid : fam.owner;
  await run(env, 'UPDATE fam SET owner=?, need_rot=? WHERE fid=?', owner, (m && !m.pending) ? 1 : fam.need_rot, fam.fid);
}

/* ================= Яндекс ================= */
function yaRedirect(env, url) { return env.YANDEX_REDIRECT || (url.origin + '/'); }
async function yaToken(env, form) {
  const body = new URLSearchParams({ client_id: env.YANDEX_CLIENT_ID, client_secret: env.YANDEX_CLIENT_SECRET, ...form });
  const res = await fetch(YA_AUTH + '/token', { method: 'POST', body });
  let d = null; try { d = await res.json(); } catch (e) {}
  if (res.status !== 200 || !d || !d.access_token) return null;
  return { token: d.access_token, refresh: d.refresh_token || form.refresh_token || '', exp: d.expires_in ? Date.now() + d.expires_in * 1000 : 0 };
}
async function yaCall(token, method, path, body) {
  const opt = { method, headers: { Authorization: 'Bearer ' + token } };
  if (method === 'POST') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
  const res = await fetch(YA_BASE + path, opt);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}
/* ответ на возврат из Яндекса: меняем код на токен и показываем страницу «готово» */
async function yaCallback(env, req, p) {
  let ok = false, ret = '';
  try {
    const state = String(p.get('state')).replace(/[^a-f0-9]/g, '');
    const st = await first(env, 'SELECT * FROM yast WHERE state=?', state);
    if (st) {
      ret = st.ret || '';
      await run(env, 'DELETE FROM yast WHERE state=?', state);
      if (!p.get('error') && st.exp >= Date.now()) {
        const tok = await yaToken(env, { grant_type: 'authorization_code', code: String(p.get('code')) });
        if (tok) { await run(env, 'UPDATE acc SET ya=? WHERE id=?', await seal(env, tok), st.aid); ok = true; }
      }
    }
  } catch (e) {}
  const back = ret ? ret.split('#')[0] + '#/home' : '';
  const title = ok ? 'Яндекс подключён' : 'Не получилось подключить Яндекс';
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:system-ui,sans-serif;padding:32px 20px;max-width:420px;margin:auto;color:#1c2a22"><h2>' + title + '</h2><p>' +
    (ok ? 'Вернитесь в приложение и выберите устройства.' : 'Вернитесь в приложение и попробуйте ещё раз.') + '</p>' +
    (back ? '<p><a href="' + back + '" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#3f6b4a;color:#fff;text-decoration:none">Вернуться в приложение</a></p>' +
      '<script>setTimeout(function(){location.href=' + JSON.stringify(back) + '},1200)</script>' : '') + '</body>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ================= ИИ ================= */
let gigaCache = { t: '', exp: 0 };
async function gigaToken(env) {
  if (gigaCache.t && gigaCache.exp > Date.now()) return gigaCache.t;
  const res = await fetch(GIGA_OAUTH, {
    method: 'POST', body: 'scope=' + encodeURIComponent(env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS'),
    headers: { Authorization: 'Basic ' + env.GIGACHAT_AUTH, RqUID: crypto.randomUUID(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || !d.access_token) throw new Error('giga token ' + res.status);
  gigaCache = { t: d.access_token, exp: Date.now() + 25 * 60000 };
  return d.access_token;
}
async function aiGiga(env, sys, msgs) {
  const token = await gigaToken(env);
  const res = await fetch((env.GIGACHAT_URL || GIGA_API) + '/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.GIGACHAT_MODEL || 'GigaChat', max_tokens: AI_MAX_TOKENS, messages: [{ role: 'system', content: sys }].concat(msgs) })
  });
  if (res.status === 401) gigaCache = { t: '', exp: 0 };
  const d = await res.json().catch(() => null);
  const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  return res.status === 200 && c ? String(c).trim() : '';
}
async function aiClaude(env, sys, msgs) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.AI_MODEL || 'claude-haiku-5-5', max_tokens: AI_MAX_TOKENS, system: sys, messages: msgs })
  });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || !d.content) return '';
  return d.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}
