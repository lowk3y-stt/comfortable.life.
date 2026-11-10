/* Comfortable life — сквозное шифрование: все ключи рождаются и живут на телефоне.
   Пароль → два независимых значения: для входа (уходит на сервер, там хешируется ещё раз) и ключ-замок (остаётся на телефоне).
   Главный ключ аккаунта MK заперт паролем и ключом восстановления; из него выводятся ключ профиля и закрытый ключ ECDH.
   Ключ семьи (AES-256) создаёт телефон и запирает его открытым ключом каждого участника (ECDH P-256 + HKDF + AES-GCM).
   Сервер хранит только запертые копии и шифртекст, прочитать их он не может. */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ITER = 200000;
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  /* ---------- кодирование ---------- */
  function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function concat(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; }
  function sha256(bytes) { return crypto.subtle.digest('SHA-256', bytes); }
  function sub() { return crypto.subtle; }
  function ok() { return !!(window.crypto && crypto.subtle); }

  /* ---------- вход и ключ-замок из пароля ---------- */
  function pbkdf(password, saltStr, bits) {
    return sub().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return sub().deriveBits({ name: 'PBKDF2', salt: enc.encode(saltStr), iterations: ITER, hash: 'SHA-256' }, base, bits);
    });
  }
  function norm(email) { return String(email).trim().toLowerCase(); }
  /* то, что уходит на сервер для проверки пароля */
  function passHash(email, pw) { return pbkdf(pw, 'cl-pw:' + norm(email), 256).then(hex); }
  function kek(email, pw) {
    return pbkdf(pw, 'cl-kek:' + norm(email), 256).then(function (bits) { return sub().importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']); });
  }
  function hkdfKey(raw, info) {
    return sub().importKey('raw', raw, 'HKDF', false, ['deriveKey']).then(function (base) {
      return sub().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cl-v1'), info: enc.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function aesEnc(key, bytes) {
    var iv = rand(12);
    return sub().encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) { return { iv: b64(iv), ct: b64(ct) }; });
  }
  function aesDec(key, box) {
    return sub().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)).then(function (pt) { return new Uint8Array(pt); });
  }
  function encJson(key, obj) { return aesEnc(key, enc.encode(JSON.stringify(obj))); }
  function decJson(key, box) { return aesDec(key, box).then(function (b) { return JSON.parse(dec.decode(b)); }); }

  /* ---------- ключ восстановления: 26 символов, 130 бит ---------- */
  function rkEncode(bytes) {
    var bits = 0, val = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      val = (val << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { out += B32.charAt((val >>> (bits - 5)) & 31); bits -= 5; }
    }
    if (bits > 0) out += B32.charAt((val << (5 - bits)) & 31);
    return out;
  }
  function rkDecode(str) {
    var s = String(str).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
    if (s.length !== 26) return null;
    var bits = 0, val = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      var ix = B32.indexOf(s.charAt(i)); if (ix < 0) return null;
      val = (val << 5) | ix; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out.slice(0, 16));
  }
  function rkPretty(s) { return s.match(/.{1,4}/g).join('-'); }
  function rkAuth(rk) { return sha256(concat(enc.encode('cl-rec-auth:'), rk)).then(hex); }
  function rkKey(rk) { return hkdfKey(rk, 'cl-rec-wrap'); }

  /* ---------- ключи на устройстве (не извлекаемые) ---------- */
  var memKeys = {};
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('noidb'));
      var r = indexedDB.open('cl-keys', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('k'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function saveKeys(aid, k) {
    memKeys[aid] = k;
    return idb().then(function (db) {
      return new Promise(function (res) { var tx = db.transaction('k', 'readwrite'); tx.objectStore('k').put(k, aid); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; });
    }, function () { return false; });
  }
  function loadKeys(aid) {
    if (memKeys[aid]) return Promise.resolve(memKeys[aid]);
    return idb().then(function (db) {
      return new Promise(function (res) {
        var q = db.transaction('k', 'readonly').objectStore('k').get(aid);
        q.onsuccess = function () { if (q.result) memKeys[aid] = q.result; res(q.result || null); };
        q.onerror = function () { res(null); };
      });
    }, function () { return null; });
  }
  function dropKeys(aid) {
    delete memKeys[aid];
    return idb().then(function (db) {
      return new Promise(function (res) { var tx = db.transaction('k', 'readwrite'); tx.objectStore('k').delete(aid); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; });
    }, function () {});
  }
  function pubOf(jwk) { return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }; }
  function importPriv(pkcs8) { return sub().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); }

  /* ---------- аккаунт ---------- */
  /* регистрация: всё создаётся здесь; наружу уходят только запертые копии и открытый ключ */
  function createAccount(email, pw, profile) {
    var MK = rand(32), out = {}, pair, pkcs8;
    return Promise.all([passHash(email, pw), kek(email, pw), hkdfKey(MK, 'cl-priv'), hkdfKey(MK, 'cl-prof'),
      sub().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    ]).then(function (a) {
      pair = a[4];
      return Promise.all([sub().exportKey('pkcs8', pair.privateKey), sub().exportKey('jwk', pair.publicKey)]).then(function (e) {
        pkcs8 = e[0];
        var pub = pubOf(e[1]);
        return Promise.all([aesEnc(a[1], MK), aesEnc(a[2], new Uint8Array(pkcs8)), encJson(a[3], profile), importPriv(pkcs8)]).then(function (w) {
          out.payload = { ph: a[0], pub: pub, wPw: w[0], wPriv: w[1], prof: w[2] };
          out.local = { priv: w[3], kProf: a[3], pub: pub };
          return out;
        });
      });
    });
  }
  /* вход: открываем главный ключ паролем, достаём закрытый ключ и профиль */
  function openAccount(email, pw, mat) {
    return kek(email, pw).then(function (k) { return aesDec(k, mat.wPw); }).then(function (MK) {
      return Promise.all([hkdfKey(MK, 'cl-priv'), hkdfKey(MK, 'cl-prof')]).then(function (ks) {
        return aesDec(ks[0], mat.wPriv).then(function (pkcs8) {
          return Promise.all([importPriv(pkcs8), decJson(ks[1], mat.prof)]).then(function (r) {
            return { local: { priv: r[0], kProf: ks[1], pub: mat.pub }, profile: r[1] };
          });
        });
      });
    });
  }
  /* MK из пароля (для нового ключа восстановления) */
  function unlockMaster(email, pw, mat) { return kek(email, pw).then(function (k) { return aesDec(k, mat.wPw); }); }
  /* новый ключ восстановления для того же MK */
  function newRecovery(MK) {
    var rk = rand(16);
    return Promise.all([rkKey(rk), rkAuth(rk)]).then(function (a) {
      return aesEnc(a[0], MK).then(function (w) { return { recoveryKey: rkPretty(rkEncode(rk)), recAuth: a[1], wRec: w }; });
    });
  }
  /* восстановление: по ключу открываем MK и запираем его новым паролем */
  function recoverAuth(rkStr) {
    var rk = rkDecode(rkStr); if (!rk) return Promise.reject({ error: 'reckey' });
    return rkAuth(rk);
  }
  function recoverRewrap(email, rkStr, wRec, newPw) {
    var rk = rkDecode(rkStr); if (!rk) return Promise.reject({ error: 'reckey' });
    return rkKey(rk).then(function (k) { return aesDec(k, wRec); }).then(function (MK) {
      return Promise.all([passHash(email, newPw), kek(email, newPw)]).then(function (a) {
        return aesEnc(a[1], MK).then(function (w) { return { ph: a[0], wPw: w }; });
      });
    }, function () { return Promise.reject({ error: 'reckey' }); });
  }
  function encProfile(keys, profile) { return encJson(keys.kProf, profile); }

  /* ---------- ключ семьи ---------- */
  function newFamilyKey() { return rand(32); }
  function aesFromRaw(raw) { return sub().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function wrapFor(pub, fkRaw) {
    return Promise.all([
      sub().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      sub().importKey('jwk', pubOf(pub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    ]).then(function (a) {
      return Promise.all([sub().deriveBits({ name: 'ECDH', public: a[1] }, a[0].privateKey, 256), sub().exportKey('jwk', a[0].publicKey)]).then(function (b) {
        return hkdfKey(b[0], 'cl-fk-wrap').then(function (wk) {
          return aesEnc(wk, fkRaw).then(function (box) { box.e = pubOf(b[1]); return box; });
        });
      });
    });
  }
  function unwrap(priv, wrap) {
    return sub().importKey('jwk', pubOf(wrap.e), { name: 'ECDH', namedCurve: 'P-256' }, false, []).then(function (ep) {
      return sub().deriveBits({ name: 'ECDH', public: ep }, priv, 256);
    }).then(function (bits) { return hkdfKey(bits, 'cl-fk-wrap'); }).then(function (wk) { return aesDec(wk, wrap); });
  }
  /* отпечаток открытого ключа: можно сверить с другим участником по телефону */
  function fingerprint(pub) {
    return sha256(enc.encode(pub.x + '.' + pub.y)).then(function (h) { return hex(h).slice(0, 12).toUpperCase().match(/.{4}/g).join(' '); });
  }

  CL.e2e = {
    ok: ok, passHash: passHash, createAccount: createAccount, openAccount: openAccount, unlockMaster: unlockMaster, newRecovery: newRecovery,
    recoverAuth: recoverAuth, recoverRewrap: recoverRewrap, encProfile: encProfile,
    saveKeys: saveKeys, loadKeys: loadKeys, dropKeys: dropKeys, keys: function (aid) { return memKeys[aid] || null; },
    newFamilyKey: newFamilyKey, aesFromRaw: aesFromRaw, wrapFor: wrapFor, unwrap: unwrap, fingerprint: fingerprint,
    encJson: encJson, decJson: decJson, b64: b64, unb64: unb64, hex: hex
  };
})();
