/**
 * Comfortable life — серверная часть (Google Apps Script), версия 3.
 *
 * Развёртывается ОДИН раз владельцем проекта. Пользователям ничего настраивать не нужно:
 * они только регистрируются в приложении.
 *
 *  1) аккаунты: регистрация по почте (код из письма), профиль (фамилия, имя, дата рождения, пол),
 *     вход по паролю, личный ID вида CL-XXXX-XXXX;
 *  2) семья создаётся автоматически при регистрации; вступить можно по ссылке/6-значному коду
 *     или по приглашению на ID;
 *  3) хранит общие данные семьи (на телефоне они шифруются ключом семьи; ключ лежит здесь);
 *  4) вход через Яндекс (OAuth) без ввода токенов: токен хранится у аккаунта, команды идут в Яндекс Умный дом;
 *  5) ответы ИИ-ассистента: GigaChat (Сбер) или Claude, ключ в «Свойствах скрипта», см. SETUP-sync-ru.md.
 *
 * Все файлы лежат в папке «ComfortableLifeSync» вашего Google Drive.
 * Пароли сюда не попадают: телефон отправляет только результат PBKDF2, здесь он ещё раз хешируется с солью.
 */
var FOLDER_NAME = 'ComfortableLifeSync';
var APP_NAME = 'Comfortable life';
var MAX_CT = 2000000;                       // максимум символов шифртекста
var SESSION_DAYS = 90;
var CODE_MINUTES = 15;                      // код из письма
var MAX_CODE_TRIES = 5;
var MAX_FAILS = 5;
var LOCK_MINUTES = 15;
var MAIL_GAP_SEC = 60;
var JOIN_DAYS = 7;                          // срок жизни 6-значного кода семьи
var JOIN_MAX_FAILS = 10;                    // неверных кодов подряд до блокировки на час
var MAX_MEMBERS = 10;
var AI_DAILY = 40;                          // сообщений ИИ в сутки на аккаунт
var AI_MAX_TOKENS = 2000;
var ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var YA_BASE = 'https://api.iot.yandex.net';
var YA_AUTH = 'https://oauth.yandex.ru';
var GIGA_OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
var GIGA_API = 'https://gigachat.devices.sberbank.ru/api/v1';
// Через сервер разрешены только эти запросы к Яндексу
var YA_ALLOW = /^\/v1\.0\/(user\/info|devices\/actions|scenarios\/[A-Za-z0-9._-]+\/actions)$/;

var folderCache_ = null;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.state && (p.code || p.error)) return yaCallback_(p);       // возврат из Яндекса после входа
  return out_({ ok: true, app: 'comfortable-life-sync', v: 4 });
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    // ИИ отвечает долго: блокировку держим только на проверку лимита, не на сам запрос
    if (b.op === 'ai') return out_(aiOp_(b));
    return out_(locked_(function () {
      var h = HANDLERS[String(b.op || '')];
      if (!h) return { ok: false, error: 'bad' };
      return h(b);
    }));
  } catch (err) {
    if (err && err.fail) return out_({ ok: false, error: err.fail, until: err.until });
    return out_({ ok: false, error: 'server', message: String(err) });
  }
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { try { lock.releaseLock(); } catch (x) {} }
}

function fail_(code, extra) { var e = { fail: code }; if (extra) e.until = extra; throw e; }

/* ================= обработчики ================= */
var HANDLERS = {

  /* ---- аккаунт ---- */
  register: function (b) {
    var email = email_(b.email);
    if (!email) fail_('email');
    if (!/^[a-f0-9]{64}$/.test(String(b.ph || ''))) fail_('bad');
    var prof = profile_(b);
    var rec = accByEmail_(email), now = Date.now();
    if (rec && rec.data.verified) fail_('taken');
    if (rec && now - (rec.data.lastMail || 0) < MAIL_GAP_SEC * 1000) fail_('wait');
    var fresh = !rec;
    if (fresh) {
      rec = { file: null, data: { id: newId_(), email: email, verified: false, sessions: [], fid: '', invites: [], fails: 0, lockUntil: 0, created: now } };
    }
    var d = rec.data;
    d.profile = prof; d.salt = uuid_(); d.ph = sha_(d.salt + b.ph);
    var code = code_();
    d.code = { h: sha_(code + d.id), exp: now + CODE_MINUTES * 60000, tries: 0 };
    d.lastMail = now;
    mail_(email, code);
    saveAcc_(rec);
    if (fresh) write_('mail-' + sha_(email) + '.json', { id: d.id });
    return { ok: true };
  },

  verify: function (b) {
    var rec = accByEmail_(email_(b.email));
    if (!rec || !rec.data.code) fail_('code');
    checkCode_(rec, 'code', b.code);
    rec.data.verified = true;
    ensureFam_(rec);
    var token = newSession_(rec.data);
    saveAcc_(rec);
    return sessionReply_(rec.data, token);
  },

  login: function (b) {
    var rec = accByEmail_(email_(b.email)), now = Date.now();
    if (!rec || !rec.data.verified || !/^[a-f0-9]{64}$/.test(String(b.ph || ''))) fail_('login');
    var d = rec.data;
    if (d.lockUntil > now) fail_('locked', d.lockUntil);
    if (!same_(d.ph, sha_(d.salt + b.ph))) {
      d.fails = (d.fails || 0) + 1;
      if (d.fails >= MAX_FAILS) { d.lockUntil = now + LOCK_MINUTES * 60000; d.fails = 0; }
      saveAcc_(rec);
      fail_('login');
    }
    d.fails = 0; d.lockUntil = 0;
    ensureFam_(rec);
    var token = newSession_(d);
    saveAcc_(rec);
    return sessionReply_(d, token);
  },

  reset_request: function (b) {
    var rec = accByEmail_(email_(b.email)), now = Date.now();
    if (rec && rec.data.verified && now - (rec.data.lastMail || 0) >= MAIL_GAP_SEC * 1000) {
      var code = code_();
      rec.data.rcode = { h: sha_(code + rec.data.id), exp: now + CODE_MINUTES * 60000, tries: 0 };
      rec.data.lastMail = now;
      mail_(rec.data.email, code);
      saveAcc_(rec);
    }
    return { ok: true };   // всегда одинаковый ответ, чтобы нельзя было узнать, есть ли такая почта
  },

  reset_confirm: function (b) {
    var rec = accByEmail_(email_(b.email));
    if (!rec || !rec.data.rcode) fail_('code');
    if (!/^[a-f0-9]{64}$/.test(String(b.ph || ''))) fail_('bad');
    checkCode_(rec, 'rcode', b.code);
    var d = rec.data;
    d.salt = uuid_(); d.ph = sha_(d.salt + b.ph); d.sessions = []; d.fails = 0; d.lockUntil = 0;
    saveAcc_(rec);
    return { ok: true };
  },

  logout: function (b) {
    var rec = auth_(b), h = sha_(String(b.token));
    rec.data.sessions = rec.data.sessions.filter(function (s) { return s.h !== h; });
    saveAcc_(rec);
    return { ok: true };
  },

  /* состояние аккаунта и семьи; семья создаётся, если её нет (например, после удаления из чужой) */
  me: function (b) {
    var rec = auth_(b), d = rec.data;
    var fresh = ensureFam_(rec);
    if (fresh) saveAcc_(rec);
    var fr = readFam_(d.fid);
    if (fr && ensureCode_(fr)) write_('fam-' + d.fid + '.json', fr.data, fr);
    return { ok: true, id: d.id, email: d.email, profile: d.profile, fid: d.fid, invites: d.invites, ya: !!d.ya, fam: famInfo_(d.fid) };
  },

  set_profile: function (b) {
    var rec = auth_(b);
    rec.data.profile = profile_(b);
    saveAcc_(rec);
    return { ok: true, profile: rec.data.profile };
  },

  find: function (b) {
    auth_(b);
    var t = accById_(normId_(b.id));
    if (!t || !t.data.verified) fail_('notfound');
    return { ok: true, id: t.data.id, name: shortName_(t.data.profile), mail: mask_(t.data.email) };
  },

  /* ---- семья ---- */
  invite: function (b) {
    var f = famAuth_(b);
    var t = accById_(normId_(b.id));
    if (!t || !t.data.verified) fail_('notfound');
    if (t.data.id === f.rec.data.id) fail_('self');
    if (f.fam.members.indexOf(t.data.id) > -1) fail_('member');
    var have = t.data.invites.some(function (i) { return i.fid === f.fam.fid; });
    if (!have) {
      if (t.data.invites.length >= 20) fail_('limit');
      t.data.invites.push({ fid: f.fam.fid, from: f.rec.data.id, fromName: shortName_(f.rec.data.profile), ts: Date.now() });
      saveAcc_(t);
    }
    return { ok: true, name: shortName_(t.data.profile) };
  },

  invite_accept: function (b) {
    var rec = auth_(b), fid = String(b.fid || '');
    var inv = rec.data.invites.filter(function (i) { return i.fid === fid; })[0];
    if (!inv) fail_('noinvite');
    if (!readFam_(fid)) { rec.data.invites = rec.data.invites.filter(function (i) { return i.fid !== fid; }); saveAcc_(rec); fail_('noinvite'); }
    joinFam_(rec, fid);
    saveAcc_(rec);
    return { ok: true, fid: rec.data.fid };
  },

  invite_decline: function (b) {
    var rec = auth_(b), fid = String(b.fid || '');
    rec.data.invites = rec.data.invites.filter(function (i) { return i.fid !== fid; });
    saveAcc_(rec);
    return { ok: true };
  },

  /* новый 6-значный код (старый перестаёт работать) */
  code_new: function (b) {
    var f = famAuth_(b);
    newJoinCode_(f.fam);
    write_('fam-' + f.fam.fid + '.json', f.fam, f.famRec);
    return { ok: true, code: f.fam.code, exp: f.fam.codeExp };
  },

  /* вступить в семью по 6-значному коду (ссылка содержит тот же код) */
  join: function (b) {
    var rec = auth_(b), d = rec.data, now = Date.now();
    if (d.joinLock > now) fail_('locked', d.joinLock);
    var code = String(b.code || '').replace(/\D/g, '');
    var ix = /^\d{6}$/.test(code) ? read_('jc-' + code + '.json') : null;
    var fr = ix && ix.data.exp > now ? readFam_(ix.data.fid) : null;
    if (!fr || fr.data.code !== code) {
      d.joinFails = (d.joinFails || 0) + 1;
      if (d.joinFails >= JOIN_MAX_FAILS) { d.joinLock = now + 3600000; d.joinFails = 0; }
      saveAcc_(rec);
      fail_('badcode');
    }
    d.joinFails = 0;
    joinFam_(rec, fr.data.fid);
    saveAcc_(rec);
    return { ok: true, fid: d.fid };
  },

  fam_leave: function (b) {
    var f = famAuth_(b), rec = f.rec;
    dropMember_(f.fam, f.famRec, rec.data.id);
    rec.data.fid = '';
    ensureFam_(rec);
    saveAcc_(rec);
    return { ok: true, fid: rec.data.fid };
  },

  fam_remove: function (b) {
    var f = famAuth_(b), target = normId_(b.id);
    if (f.fam.owner !== f.rec.data.id) fail_('owner');
    if (target === f.rec.data.id || f.fam.members.indexOf(target) < 0) fail_('notfound');
    dropMember_(f.fam, f.famRec, target);
    var t = accById_(target);
    if (t) { t.data.fid = ''; saveAcc_(t); }
    return { ok: true };
  },

  /* ---- данные семьи ---- */
  get: function (b) {
    var f = famAuth_(b);
    return { ok: true, rev: f.fam.rev, iv: f.fam.iv, ct: f.fam.ct, key: f.fam.key };
  },

  /* только номер версии: дешёвая проверка «есть ли новое» */
  rev: function (b) {
    var f = famAuth_(b);
    return { ok: true, rev: f.fam.rev };
  },

  put: function (b) {
    var f = famAuth_(b), d = f.fam;
    if (String(b.ct || '').length > MAX_CT) fail_('big');
    if (Number(b.rev) !== d.rev) return { ok: false, error: 'conflict', rev: d.rev, iv: d.iv, ct: d.ct };
    d.rev = d.rev + 1; d.iv = String(b.iv || ''); d.ct = String(b.ct || '');
    write_('fam-' + d.fid + '.json', d, f.famRec);
    return { ok: true, rev: d.rev };
  },

  /* ---- Яндекс: вход через OAuth, токен хранится у аккаунта ---- */
  ya_start: function (b) {
    var rec = auth_(b), now = Date.now();
    var id = prop_('YANDEX_CLIENT_ID');
    if (!id || !prop_('YANDEX_CLIENT_SECRET')) fail_('noyandex');
    var state = sha_(uuid_() + now).slice(0, 40);
    var ret = String(b.ret || '');
    if (!/^(https:\/\/|http:\/\/localhost)/.test(ret)) ret = '';
    write_('yast-' + state + '.json', { aid: rec.data.id, exp: now + 10 * 60000, ret: ret.slice(0, 300) });
    var url = YA_AUTH + '/authorize?response_type=code&client_id=' + encodeURIComponent(id) +
      '&redirect_uri=' + encodeURIComponent(yaRedirect_()) + '&state=' + state;
    return { ok: true, url: url };
  },

  ya_clear: function (b) {
    var rec = auth_(b);
    rec.data.ya = null;
    saveAcc_(rec);
    return { ok: true };
  },

  ya: function (b) {
    var rec = auth_(b), y = rec.data.ya;
    if (!y) return { ok: false, error: 'noyandex' };
    var method = b.method === 'POST' ? 'POST' : 'GET';
    if (!YA_ALLOW.test(String(b.path || ''))) return { ok: false, error: 'forbidden' };
    if (y.refresh && y.exp && y.exp - Date.now() < 3 * 86400000) {      // токен скоро истечёт: обновляем
      var rr = yaToken_({ grant_type: 'refresh_token', refresh_token: y.refresh });
      if (rr) { rec.data.ya = y = rr; saveAcc_(rec); }
    }
    var r = yaCall_(y.token, method, b.path, b.body);
    if (r.status === 401) { rec.data.ya = null; saveAcc_(rec); return { ok: false, error: 'noyandex' }; }
    return { ok: r.status === 200, status: r.status, data: r.data };
  }
};

/* ответ на возврат из Яндекса: меняем код на токен и показываем страницу «готово» */
function yaCallback_(p) {
  var res = { ok: false, ret: '' };
  try {
    locked_(function () {
      var st = read_('yast-' + String(p.state).replace(/[^a-f0-9]/g, '') + '.json');
      if (!st) return;
      res.ret = st.data.ret || '';
      st.file.setTrashed(true);
      if (p.error || st.data.exp < Date.now()) return;
      var tok = yaToken_({ grant_type: 'authorization_code', code: String(p.code) });
      var rec = tok && accById_(st.data.aid);
      if (!rec) return;
      rec.data.ya = tok; saveAcc_(rec);
      res.ok = true;
    });
  } catch (e) {}
  var back = res.ret ? res.ret.split('#')[0] + '#/home' : '';
  var title = res.ok ? 'Яндекс подключён' : 'Не получилось подключить Яндекс';
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top">' +
    '<body style="font-family:system-ui,sans-serif;padding:32px 20px;max-width:420px;margin:auto;color:#1c2a22"><h2>' + title + '</h2><p>' +
    (res.ok ? 'Вернитесь в приложение и выберите устройства.' : 'Вернитесь в приложение и попробуйте ещё раз.') + '</p>' +
    (back ? '<p><a href="' + back + '" target="_top" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#3f6b4a;color:#fff;text-decoration:none">Вернуться в приложение</a></p>' +
      '<script>setTimeout(function(){window.top.location.href=' + JSON.stringify(back) + '},1200)</script>' : '') + '</body>';
  return HtmlService.createHtmlOutput(html).setTitle('Comfortable life');
}
function yaRedirect_() { return prop_('YANDEX_REDIRECT') || ScriptApp.getService().getUrl(); }
function yaToken_(form) {
  var body = Object.assign({ client_id: prop_('YANDEX_CLIENT_ID'), client_secret: prop_('YANDEX_CLIENT_SECRET') }, form);
  var res = UrlFetchApp.fetch(YA_AUTH + '/token', { method: 'post', payload: body, muteHttpExceptions: true });
  var d = null; try { d = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !d || !d.access_token) return null;
  return { token: d.access_token, refresh: d.refresh_token || form.refresh_token || '', exp: d.expires_in ? Date.now() + d.expires_in * 1000 : 0 };
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

/* ================= ИИ-ассистент ================= */
function aiOp_(b) {
  var giga = prop_('GIGACHAT_AUTH'), claude = prop_('ANTHROPIC_API_KEY');
  // 1) под блокировкой: проверить вход и лимит
  locked_(function () {
    var rec = auth_(b), d = rec.data, day = new Date().toISOString().slice(0, 10);
    if (!giga && !claude) fail_('noai');
    if (!d.ai || d.ai.day !== day) d.ai = { day: day, n: 0 };
    if (d.ai.n >= AI_DAILY) fail_('aiquota');
    d.ai.n++;
    saveAcc_(rec);
  });
  // 2) без блокировки: сам запрос
  var msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) };
  }).filter(function (m) { return m.content; });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) fail_('bad');
  var sys = 'Ты ассистент внутри приложения «' + APP_NAME + '» (дом, заметки, календарь, спорт, здоровье, семья). ' +
    'Отвечай на языке пользователя: ' + (b.lang === 'en' ? 'английском' : 'русском') + '. ' +
    'Отвечай по делу и коротко; если просят длинный текст (сочинение, письмо) — пиши полностью. ' +
    'Текущие дата и время пользователя: ' + String(b.now || '').slice(0, 60) + '. ' +
    'Ты не можешь управлять приложением и устройствами сам: эти команды приложение обрабатывает отдельно. Не выдумывай данные пользователя.';
  var text = '';
  if (giga) {
    try { text = aiGiga_(giga, sys, msgs); } catch (e) { text = ''; }
  }
  if (!text && claude) text = aiClaude_(claude, sys, msgs);
  return text ? { ok: true, text: text } : { ok: false, error: 'ai' };
}

/* GigaChat (Сбер). Ключ авторизации из личного кабинета разработчика кладётся в свойство GIGACHAT_AUTH.
   Сертификаты Сбера выдаёт Минцифры: если Google их не признаёт, запрос повторяется без проверки сертификата. */
function fetchCert_(url, opt) {
  try { return UrlFetchApp.fetch(url, opt); }
  catch (e) {
    if (!/cert|ssl|pkix|handshake|trust/i.test(String(e))) throw e;
    opt.validateHttpsCertificates = false;
    return UrlFetchApp.fetch(url, opt);
  }
}
function gigaToken_(authKey) {
  var cache = CacheService.getScriptCache(), t = cache.get('giga_token');
  if (t) return t;
  var res = fetchCert_(GIGA_OAUTH, {
    method: 'post', muteHttpExceptions: true, payload: 'scope=' + encodeURIComponent(prop_('GIGACHAT_SCOPE') || 'GIGACHAT_API_PERS'),
    headers: { Authorization: 'Basic ' + authKey, RqUID: uuid_(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  var d = null; try { d = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !d || !d.access_token) throw new Error('giga token ' + res.getResponseCode());
  cache.put('giga_token', d.access_token, 25 * 60);     // токен живёт 30 минут
  return d.access_token;
}
function aiGiga_(authKey, sys, msgs) {
  var token = gigaToken_(authKey);
  var res = fetchCert_((prop_('GIGACHAT_URL') || GIGA_API) + '/chat/completions', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    payload: JSON.stringify({ model: prop_('GIGACHAT_MODEL') || 'GigaChat', max_tokens: AI_MAX_TOKENS, messages: [{ role: 'system', content: sys }].concat(msgs) })
  });
  var d = null; try { d = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() === 401) CacheService.getScriptCache().remove('giga_token');
  var c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  return res.getResponseCode() === 200 && c ? String(c).trim() : '';
}
function aiClaude_(key, sys, msgs) {
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: prop_('AI_MODEL') || 'claude-haiku-5-5', max_tokens: AI_MAX_TOKENS, system: sys, messages: msgs })
  });
  var data = null; try { data = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !data || !data.content) return '';
  return data.content.filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\n').trim();
}

/* ================= помощники: аккаунты ================= */
function email_(s) {
  s = String(s || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120 ? s : '';
}
function mask_(e) {
  var p = e.split('@'); return p[0].charAt(0) + '***@' + p[1];
}
/* профиль: фамилия, имя, дата рождения (ГГГГ-ММ-ДД), пол m/f */
function profile_(b) {
  var surname = String(b.surname || '').trim().slice(0, 40), name = String(b.name || '').trim().slice(0, 40);
  if (!surname || !name) fail_('profile');
  var birth = String(b.birth || '');
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  var dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  if (!dt || dt.getFullYear() !== Number(m[1]) || dt.getMonth() !== Number(m[2]) - 1 || dt.getDate() !== Number(m[3]) || dt > new Date() || Number(m[1]) < 1900) fail_('birth');
  var gender = String(b.gender || '');
  if (gender !== 'm' && gender !== 'f') fail_('gender');
  return { surname: surname, name: name, birth: birth, gender: gender };
}
function shortName_(p) { p = p || {}; return String(p.name || '?') + (p.surname ? ' ' + String(p.surname).charAt(0) + '.' : ''); }
function normId_(s) {
  s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.indexOf('CL') === 0) s = s.slice(2);
  return /^[A-Z0-9]{8}$/.test(s) ? 'CL' + s : '';
}
function newId_() {
  for (var tries = 0; tries < 20; tries++) {
    var h = sha_(uuid_()), s = '';
    for (var i = 0; i < 8; i++) s += ID_ALPHABET.charAt(parseInt(h.substr(i * 2, 2), 16) % ID_ALPHABET.length);
    var id = 'CL' + s;
    if (!accById_(id)) return id;
  }
  throw new Error('id');
}
function accById_(id) {
  if (!id) return null;
  var r = read_('acc-' + id + '.json');
  return r ? { file: r.file, data: r.data, name: 'acc-' + id + '.json' } : null;
}
function accByEmail_(email) {
  if (!email) return null;
  var ix = read_('mail-' + sha_(email) + '.json');
  return ix ? accById_(ix.data.id) : null;
}
function saveAcc_(rec) {
  write_('acc-' + rec.data.id + '.json', rec.data, rec);
}
function newSession_(d) {
  var now = Date.now(), token = sha_(uuid_() + uuid_() + now);
  d.sessions = d.sessions.filter(function (s) { return s.exp > now; });
  d.sessions.push({ h: sha_(token), exp: now + SESSION_DAYS * 86400000 });
  if (d.sessions.length > 10) d.sessions = d.sessions.slice(-10);
  return token;
}
function sessionReply_(d, token) {
  return { ok: true, aid: d.id, token: token, email: d.email, profile: d.profile, fid: d.fid, invites: d.invites, ya: !!d.ya };
}
function auth_(b) {
  var rec = accById_(normId_(b.aid));
  if (!rec || !b.token) fail_('session');
  var h = sha_(String(b.token)), now = Date.now();
  var ok = rec.data.sessions.some(function (s) { return same_(s.h, h) && s.exp > now; });
  if (!ok) fail_('session');
  return rec;
}
function checkCode_(rec, field, code) {
  var c = rec.data[field], now = Date.now();
  if (!c || c.exp < now) { rec.data[field] = null; saveAcc_(rec); fail_('code'); }
  if (!same_(c.h, sha_(String(code || '').trim() + rec.data.id))) {
    c.tries = (c.tries || 0) + 1;
    if (c.tries >= MAX_CODE_TRIES) rec.data[field] = null;
    saveAcc_(rec);
    fail_('code');
  }
  rec.data[field] = null;
}
function code_() {
  var h = sha_(uuid_() + Date.now()), n = parseInt(h.slice(0, 10), 16) % 1000000;
  return ('000000' + n).slice(-6);
}
function mail_(to, code) {
  if (MailApp.getRemainingDailyQuota() < 1) fail_('mailquota');
  MailApp.sendEmail({
    to: to,
    subject: APP_NAME + ': код ' + code,
    body: 'Ваш код подтверждения для ' + APP_NAME + ': ' + code + '\n\nКод действует ' + CODE_MINUTES + ' минут. ' +
      'Если вы ничего не запрашивали, просто проигнорируйте это письмо.\n\nYour ' + APP_NAME + ' code: ' + code + ' (valid ' + CODE_MINUTES + ' minutes).',
    name: APP_NAME
  });
}

/* ================= помощники: семьи ================= */
function readFam_(fid) {
  if (!/^[a-f0-9]{32}$/.test(String(fid || ''))) return null;
  return read_('fam-' + fid + '.json');
}
function famAuth_(b) {
  var rec = auth_(b);
  var fr = readFam_(rec.data.fid);
  if (!fr || fr.data.members.indexOf(rec.data.id) < 0) fail_('auth');
  return { rec: rec, fam: fr.data, famRec: fr };
}
/* ключ семьи: 32 случайных байта (base64, 44 символа) */
function newKey_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, uuid_() + uuid_() + Date.now(), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
/* у каждого аккаунта всегда есть семья (сначала только он сам). Возвращает true, если пришлось создать */
function ensureFam_(rec) {
  var d = rec.data;
  if (d.fid && readFam_(d.fid)) return false;
  var fid = sha_(uuid_() + Date.now()).slice(0, 32);
  var fam = { fid: fid, key: newKey_(), owner: d.id, members: [d.id], rev: 0, iv: '', ct: '', created: Date.now(), code: '', codeExp: 0 };
  newJoinCode_(fam);
  write_('fam-' + fid + '.json', fam);
  d.fid = fid;
  return true;
}
/* новый 6-значный код семьи; старый индекс удаляется */
function newJoinCode_(fam) {
  dropCode_(fam);
  for (var i = 0; i < 50; i++) {
    var c = code_();
    if (!read_('jc-' + c + '.json')) {
      fam.code = c; fam.codeExp = Date.now() + JOIN_DAYS * 86400000;
      write_('jc-' + c + '.json', { fid: fam.fid, exp: fam.codeExp });
      return;
    }
  }
  throw new Error('code');
}
function dropCode_(fam) {
  if (!fam.code) return;
  var r = read_('jc-' + fam.code + '.json');
  if (r && r.file) r.file.setTrashed(true);
  fam.code = ''; fam.codeExp = 0;
}
/* если срок кода вышел — выдать новый; true, если семья изменилась */
function ensureCode_(fr) {
  if (fr.data.code && fr.data.codeExp > Date.now()) return false;
  newJoinCode_(fr.data);
  return true;
}
/* перевести аккаунт в семью fid. Из своей прежней семьи уходим, только если там больше никого нет */
function joinFam_(rec, fid) {
  var d = rec.data;
  if (d.fid === fid) { d.invites = d.invites.filter(function (i) { return i.fid !== fid; }); return; }
  var fr = readFam_(fid);
  if (!fr) fail_('badcode');
  if (fr.data.members.length >= MAX_MEMBERS) fail_('limit');
  var old = d.fid ? readFam_(d.fid) : null;
  if (old && old.data.members.length > 1) fail_('infam');
  if (old) { dropCode_(old.data); old.file.setTrashed(true); }
  fr.data.members.push(d.id);
  write_('fam-' + fid + '.json', fr.data, fr);
  d.fid = fid;
  d.invites = d.invites.filter(function (i) { return i.fid !== fid; });
}
function famInfo_(fid) {
  var fr = readFam_(fid);
  if (!fr) return null;
  return {
    fid: fid, owner: fr.data.owner, code: fr.data.code, codeExp: fr.data.codeExp,
    members: fr.data.members.map(function (id) {
      var a = accById_(id), p = a && a.data.profile || {};
      return { id: id, name: p.name || '?', surname: p.surname || '', birth: p.birth || '', gender: p.gender || '' };
    })
  };
}
function dropMember_(fam, famRec, id) {
  fam.members = fam.members.filter(function (x) { return x !== id; });
  if (!fam.members.length) { dropCode_(fam); famRec.file.setTrashed(true); return; }
  if (fam.owner === id) fam.owner = fam.members[0];
  write_('fam-' + fam.fid + '.json', fam, famRec);
}

/* ================= Яндекс ================= */
function yaCall_(token, method, path, body) {
  var opt = { method: method.toLowerCase(), headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  if (method === 'POST') { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body || {}); }
  var res = UrlFetchApp.fetch(YA_BASE + path, opt);
  var data = null;
  try { data = JSON.parse(res.getContentText()); } catch (e) { data = res.getContentText(); }
  return { status: res.getResponseCode(), data: data };
}

/* ================= хранилище (Google Drive) ================= */
function folder_() {
  if (folderCache_) return folderCache_;
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  folderCache_ = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  return folderCache_;
}
function read_(name) {
  var it = folder_().getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    return { file: f, data: JSON.parse(f.getBlob().getDataAsString()) };
  }
  return null;
}
function write_(name, data, rec) {
  var s = JSON.stringify(data);
  if (rec && rec.file) rec.file.setContent(s);
  else {
    var f = folder_().createFile(name, s, 'application/json');
    if (rec) rec.file = f;
  }
}

/* ================= разное ================= */
function uuid_() { return Utilities.getUuid(); }
function sha_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8), out = '';
  for (var i = 0; i < bytes.length; i++) out += ('0' + (bytes[i] & 255).toString(16)).slice(-2);
  return out;
}
function same_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
