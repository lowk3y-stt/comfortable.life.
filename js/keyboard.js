/* Comfortable life — собственная экранная клавиатура (русский и английский).
   Системная клавиатура телефона не появляется: у полей ввода ставится inputmode="none",
   а текст вводится нажатиями на клавиши ниже. Поля с датой и временем остаются системными.
   Включена на сенсорных экранах; в Настройках её можно выключить (например, для голосового ввода). */
(function () {
  'use strict';
  var CL = (window.CL = window.CL || {});

  /* раскладки как на iPhone: в русской нет «ъ» на виду (долгое нажатие на «ь»), «ё» под «е» */
  var ROWS = {
    ru: ['йцукенгшщзх', 'фывапролджэ', 'ячсмитьбю'],
    en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  };
  var NUM = ['1234567890', '-/:;()₽&@"', '.,?!\''];
  var SYM2 = ['[]{}#%^*+=', '_\\|~<>$€£•', '.,?!\''];
  var ALTS = {
    'е': 'ё', 'ь': 'ъ',
    a: 'àáâäæãåā', e: 'èéêëēėę', i: 'îïíīįì', o: 'ôöòóœøōõ', u: 'ûüùúū', y: 'ÿ', c: 'çćč', n: 'ñń', s: 'ßśš', z: 'žźż', l: 'ł',
    '-': '–—•', '/': '\\', '"': '«»„“”', "'": '`‘’', '?': '¿', '!': '¡', '0': '°', '%': '‰', '.': '…', '$': '€£¥'
  };
  var TEXT_TYPES = ['', 'text', 'search', 'email', 'password', 'tel', 'url'];
  var HINTS = { go: 'kb.go', search: 'kb.search', send: 'kb.send', next: 'kb.next', done: 'kb.done', enter: 'kb.return' };

  var kb = null, keysBox = null, target = null, layout = null, layer = 'abc', shift = 'off', lastShift = 0, lastSpace = 0, hideTimer = null, repeat = null;
  var active = {}, pop = null;

  function meta() { return CL.store && CL.store.meta ? CL.store.meta() : {}; }
  function coarse() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  /* по умолчанию — только на сенсорных экранах; пользователь может включить или выключить */
  function enabled() { var v = meta().vkb; return v === true || (v !== false && coarse()); }

  function eligible(el) {
    if (!el || el.disabled || el.readOnly || (el.hasAttribute && el.hasAttribute('data-native'))) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && TEXT_TYPES.indexOf((el.getAttribute('type') || '').toLowerCase()) > -1;
  }
  /* убираем системную клавиатуру; цифровые поля помечаем, чтобы показать цифровую панель */
  function prepare(el) {
    if (!eligible(el)) return;
    var im = el.getAttribute('inputmode');
    if (im && im !== 'none' && /^(numeric|decimal|tel)$/.test(im) && !el.getAttribute('data-kb')) el.setAttribute('data-kb', 'num');
    if (im !== 'none') el.setAttribute('inputmode', 'none');
  }
  function scan(root) {
    if (!enabled()) return;
    var list = root.querySelectorAll ? root.querySelectorAll('input, textarea') : [];
    Array.prototype.forEach.call(list, prepare);
    if (root.tagName === 'INPUT' || root.tagName === 'TEXTAREA') prepare(root);
  }

  /* ---------- вставка текста ---------- */
  function hasSel(el) { try { return typeof el.selectionStart === 'number'; } catch (e) { return false; } }
  function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
  function put(el, str) {
    var s = hasSel(el) ? el.selectionStart : el.value.length, e = hasSel(el) ? el.selectionEnd : s;
    if (el.maxLength > 0 && el.value.length - (e - s) + str.length > el.maxLength) return;
    if (hasSel(el)) el.setRangeText(str, s, e, 'end'); else el.value += str;
    fire(el);
  }
  function back(el) {
    if (hasSel(el)) {
      var s = el.selectionStart, e = el.selectionEnd;
      if (s !== e) el.setRangeText('', s, e, 'end');
      else if (s > 0) el.setRangeText('', s - 1, s, 'end');
      else return;
    } else el.value = el.value.slice(0, -1);
    fire(el);
  }
  function before(el) { return hasSel(el) ? el.value.slice(0, el.selectionStart) : el.value; }

  /* первая буква предложения — заглавная (не для почты и паролей) */
  function autoShift() {
    if (!target || layer !== 'abc' || shift === 'lock') return;
    var type = (target.getAttribute('type') || 'text').toLowerCase();
    if (target.tagName !== 'TEXTAREA' && type !== 'text' && type !== 'search') { shift = 'off'; return; }
    var b = before(target);
    shift = (!b.trim() || /[.!?]\s+$/.test(b) || /\n$/.test(b)) ? 'once' : 'off';
  }

  /* ---------- значки ---------- */
  var SVG = {
    shift: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 4 4 12.5h4.5V19h7v-6.5H20z"/></svg>',
    shiftOn: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 4 4 12.5h4.5V19h7v-6.5H20z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 4 11.5h4.5V16h7v-4.5H20z"/><rect x="8.5" y="18.5" width="7" height="2" stroke="none"/></svg>',
    del: '<svg viewBox="0 0 28 24" width="26" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M9 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9L2.5 12z"/><path d="m13.5 9 6 6m0-6-6 6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5"/><path d="M3.5 12h17M5 7.5h14M5 16.5h14"/></svg>'
  };

  /* ---------- клавиши ---------- */
  function mk(o) {
    var b = document.createElement('div');
    b.className = 'k ' + (o.cls || ''); b.setAttribute('role', 'button'); b._o = o;
    if (o.aria) b.setAttribute('aria-label', o.aria);
    if (o.svg) b.innerHTML = o.svg; else b.textContent = o.label || '';
    return b;
  }
  function row(cls, keys) { var r = document.createElement('div'); r.className = 'kr ' + (cls || ''); keys.forEach(function (k) { r.appendChild(k); }); return r; }

  function showCase() { return shift !== 'off' && layer === 'abc'; }
  /* буква или знак: набирается при отпускании, при нажатии над клавишей всплывает увеличенная копия */
  function charKey(ch) {
    var shown = showCase() ? ch.toUpperCase() : ch;
    return mk({ label: shown, ch: shown, base: ch, alts: ALTS[ch], pop: true, up: function () {
      put(target, shown);
      if (shift === 'once') shift = 'off';
      if (shift === 'off') autoShift();
      build();
    } });
  }
  function symKey(ch) { return mk({ label: ch, ch: ch, base: ch, alts: ALTS[ch], pop: true, up: function () { put(target, ch); } }); }

  function hint() {
    if (!target) return 'enter';
    var h = (target.getAttribute('enterkeyhint') || '').toLowerCase();
    if (HINTS[h]) return h;
    return target.tagName === 'TEXTAREA' ? 'enter' : 'done';
  }

  function build() {
    if (!keysBox) return;
    keysBox.textContent = '';
    var num = target && target.getAttribute('data-kb') === 'num';
    var type = target ? (target.getAttribute('type') || '').toLowerCase() : '';
    var t = CL.i18n.t;
    var del = mk({ svg: SVG.del, cls: 'k-fn k-del', aria: t('kb.backspace'), down: function () { back(target); autoShift(); build(); }, repeat: true });

    if (num) {
      ['123', '456', '789'].forEach(function (r) { keysBox.appendChild(row('num', r.split('').map(symKey))); });
      keysBox.appendChild(row('num', [symKey('.'), symKey('0'), del]));
      keysBox.appendChild(row('num', [mk({ label: t('kb.done'), cls: 'k-go', up: function () { enter(true); } })]));
      return;
    }

    if (layer === 'abc') {
      var rows = ROWS[layout];
      keysBox.appendChild(row('', rows[0].split('').map(charKey)));
      keysBox.appendChild(row(rows[1].length < 11 && layout === 'en' ? 'r2' : '', rows[1].split('').map(charKey)));
      var sh = mk({ svg: shift === 'lock' ? SVG.lock : shift === 'once' ? SVG.shiftOn : SVG.shift, cls: 'k-fn k-wide' + (shift !== 'off' ? ' on' : ''), aria: t('kb.shift'), down: function () {
        var now = Date.now();
        shift = (shift === 'off') ? 'once' : (shift === 'once' && now - lastShift < 500) ? 'lock' : 'off';
        lastShift = now; build();
      } });
      keysBox.appendChild(row('r3', [sh].concat(rows[2].split('').map(charKey), [del])));
    } else {
      var set = layer === 'num' ? NUM : SYM2;
      keysBox.appendChild(row('', set[0].split('').map(symKey)));
      keysBox.appendChild(row('', set[1].split('').map(symKey)));
      var sw = mk({ label: layer === 'num' ? '#+=' : '123', cls: 'k-fn k-wide k-small', aria: t('kb.symbols'), down: function () { layer = layer === 'num' ? 'sym' : 'num'; build(); } });
      keysBox.appendChild(row('r3', [sw].concat(set[2].split('').map(symKey), [del])));
    }

    var h = hint(), blue = h !== 'enter';
    keysBox.appendChild(row('bottom', [
      mk({ label: layer === 'abc' ? '123' : (layout === 'ru' ? 'АБВ' : 'ABC'), cls: 'k-fn k-small k-mode', aria: t('kb.symbols'), down: function () { layer = layer === 'abc' ? 'num' : 'abc'; build(); } }),
      mk({ svg: SVG.globe, cls: 'k-fn k-globe', aria: t('kb.language') + ': ' + layout.toUpperCase(), down: function () { layout = layout === 'ru' ? 'en' : 'ru'; layer = 'abc'; autoShift(); build(); } }),
      mk({ label: layer === 'abc' ? (layout === 'ru' ? 'пробел' : 'space') : '', cls: 'k-space', aria: t('kb.space'), up: function () {
        var now = Date.now(), before1 = target ? before(target) : '';
        var plain = type !== 'email' && type !== 'password' && type !== 'url';
        /* два пробела подряд после слова дают точку и пробел, как на iPhone */
        if (plain && now - lastSpace < 450 && /[^\s.!?,:;]\s$/.test(before1) && !/\s\s$/.test(before1)) { back(target); put(target, '. '); lastSpace = 0; }
        else { put(target, ' '); lastSpace = now; }
        autoShift(); build();
      } }),
      mk({ label: t(HINTS[h]), cls: 'k-ret' + (blue ? ' k-go' : ' k-fn'), aria: t('kb.enter'), up: function () { enter(); } })
    ]));
  }

  function enter(force) {
    if (!target) return;
    var h = hint();
    if (target.tagName === 'TEXTAREA' && !force) { put(target, '\n'); autoShift(); build(); return; }
    if (h === 'next') {
      var all = Array.prototype.filter.call((target.form || document).querySelectorAll('input, textarea'), eligible);
      var nx = all[all.indexOf(target) + 1];
      if (nx) { nx.focus(); return; }
    }
    var form = target.form;
    if (form && form.querySelector('[type=submit]')) { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
    else { target.blur(); hide(); }
  }

  /* ---------- нажатия: всплывающая буква, долгое нажатие, повтор стирания ---------- */
  function keyAt(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== kb && !(el.classList && el.classList.contains('k'))) el = el.parentNode;
    return el && el !== kb && el.classList.contains('k') ? el : null;
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function showPop(el, alts) {
    closePop();
    var kr = kb.getBoundingClientRect(), r = el.getBoundingClientRect();
    pop = document.createElement('div');
    pop.className = alts ? 'kpop kalts' : 'kpop';
    var list = alts ? [el._o.ch].concat(alts.split('')) : [el._o.ch];
    list.forEach(function (c, i) { var s = document.createElement('span'); s.textContent = showCase() && alts ? c.toUpperCase() : c; if (alts) { s.className = 'alt' + (i === 0 ? ' on' : ''); s._c = s.textContent; } pop.appendChild(s); });
    kb.appendChild(pop);
    var w = alts ? pop.offsetWidth : r.width + 18;
    if (!alts) pop.style.width = w + 'px';
    var left = r.left - kr.left - (alts ? 0 : 9);
    left = Math.max(2, Math.min(left, kr.width - (alts ? pop.offsetWidth : w) - 2));
    pop.style.left = left + 'px';
    pop.style.bottom = (kr.bottom - r.bottom + r.height * (alts ? 1.12 : 0.92)) + 'px';
  }
  function press(id, el, e) {
    var o = el._o;
    var st = { el: el, timer: null, alt: null };
    active[id] = st;
    el.classList.add('down');
    if (o.down) { o.down(); if (o.repeat) { clearInterval(repeat); clearTimeout(repeat); repeat = setTimeout(function () { repeat = setInterval(function () { if (target) back(target); }, 70); }, 420); } return; }
    if (o.pop) showPop(el, null);
    if (o.alts && o.pop) st.timer = setTimeout(function () { st.alt = true; showPop(el, o.alts); }, 420);
  }
  function release(id, commit) {
    var st = active[id]; if (!st) return;
    delete active[id];
    clearTimeout(st.timer); clearInterval(repeat); clearTimeout(repeat);
    st.el.classList.remove('down');
    var o = st.el._o, chosen = null;
    if (st.alt && pop) { var on = pop.querySelector('.alt.on'); chosen = on && on._c; }
    closePop();
    if (!commit || !target) return;
    if (st.alt && chosen != null) { put(target, chosen); if (shift === 'once') shift = 'off'; if (shift === 'off') autoShift(); build(); }
    else if (o.up) o.up();
  }
  function ensure() {
    if (kb) return;
    kb = document.createElement('div');
    kb.className = 'vkb'; kb.hidden = true; kb.setAttribute('role', 'group'); kb.setAttribute('aria-label', CL.i18n.t('kb.title'));
    var bar = document.createElement('div'); bar.className = 'vkb-bar';
    var dn = document.createElement('div'); dn.className = 'vkb-done'; dn.setAttribute('role', 'button'); dn.textContent = CL.i18n.t('kb.done');
    dn._o = { cls: 'vkb-done', up: function () { if (target) target.blur(); hide(); } };
    dn.classList.add('k'); bar.appendChild(dn);
    keysBox = document.createElement('div'); keysBox.className = 'vkb-keys';
    kb.appendChild(bar); kb.appendChild(keysBox);

    kb.addEventListener('pointerdown', function (e) {
      e.preventDefault();                       // фокус остаётся в поле
      var el = keyAt(e.clientX, e.clientY);
      if (!el || !target) return;
      var id = e.pointerId || 0;
      try { kb.setPointerCapture(id); } catch (x) {}
      release(id, false);
      press(id, el, e);
    });
    kb.addEventListener('pointermove', function (e) {
      var id = e.pointerId || 0, st = active[id]; if (!st) return;
      if (st.alt && pop) {                     // выбор варианта пальцем
        var on = null;
        Array.prototype.forEach.call(pop.querySelectorAll('.alt'), function (s) {
          var r = s.getBoundingClientRect(), hit = e.clientX >= r.left && e.clientX <= r.right;
          s.classList.toggle('on', hit); if (hit) on = s;
        });
        if (!on) pop.querySelector('.alt').classList.add('on');
        return;
      }
      var el = keyAt(e.clientX, e.clientY);
      if (el && el !== st.el && el._o.pop && st.el._o.pop) { release(id, false); press(id, el, e); }
    });
    function end(commit) { return function (e) { release(e.pointerId || 0, commit); }; }
    kb.addEventListener('pointerup', end(true));
    kb.addEventListener('pointercancel', end(false));
    kb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    kb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------- показать и спрятать ---------- */
  function host() { return document.querySelector('dialog[open]') || document.body; }
  function setHeight() {
    document.documentElement.style.setProperty('--kb-h', (kb && !kb.hidden ? kb.offsetHeight : 0) + 'px');
  }
  function show(el) {
    if (!enabled() || !eligible(el)) return;
    clearTimeout(hideTimer);
    ensure();
    target = el;
    if (!layout) layout = CL.i18n.getLang() === 'en' ? 'en' : 'ru';
    var num = el.getAttribute('data-kb') === 'num';
    if (!num) layer = 'abc';
    shift = 'off'; autoShift();
    build();
    var hst = host();
    if (kb.parentNode !== hst) hst.appendChild(kb);
    kb.hidden = false;
    document.body.classList.add('kb-open');
    setHeight();
    requestAnimationFrame(function () {
      setHeight();
      try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) {}
    });
  }
  function hide() {
    clearTimeout(hideTimer);
    if (!kb) return;
    closePop(); active = {};
    kb.hidden = true; target = null;
    if (kb.parentNode !== document.body) document.body.appendChild(kb);
    document.body.classList.remove('kb-open');
    setHeight();
  }

  document.addEventListener('focusin', function (e) {
    if (!enabled()) return;
    prepare(e.target);
    if (eligible(e.target)) show(e.target);
  });
  document.addEventListener('focusout', function () {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      var a = document.activeElement;
      if (a && eligible(a)) return;
      hide();
    }, 120);
  });
  /* окно закрылось или поле исчезло — прячем клавиатуру */
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
    if (kb && !kb.hidden && target && !document.contains(target)) hide();
  });
  function start() {
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('hashchange', hide);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  CL.kbd = {
    enabled: enabled, hide: hide,
    /* переключатель из Настроек: true / false */
    set: function (on) {
      meta().vkb = !!on; CL.store.saveMeta();
      if (on) scan(document.body);
      else { hide(); Array.prototype.forEach.call(document.querySelectorAll('input[inputmode="none"], textarea[inputmode="none"]'), function (el) { if (el.getAttribute('data-kb')) el.setAttribute('inputmode', 'decimal'); else el.removeAttribute('inputmode'); }); }
    }
  };
})();
