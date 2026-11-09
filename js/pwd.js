/* Кнопка «показать пароль» у всех полей пароля + защита от «плавающих» окон */
(function () {
  'use strict';
  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function t(k) { return window.CL && CL.i18n ? CL.i18n.t(k) : k; }

  function wrap(inp) {
    if (inp.__pw || inp.getAttribute('data-nopw') != null || !inp.parentNode) return;
    inp.__pw = true;
    if (inp.classList.contains('pin')) return;          // PIN-экран: цифры, без глазка
    var box = document.createElement('span'); box.className = 'pw-wrap';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pw-eye'; btn.tabIndex = -1;
    function paint() {
      var shown = inp.getAttribute('data-kbtype') === 'password' && inp.type === 'text';
      btn.innerHTML = shown ? EYE_OFF : EYE; btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
      btn.setAttribute('aria-label', t(shown ? 'pw.hide' : 'pw.show'));
    }
    inp.parentNode.insertBefore(box, inp); box.appendChild(inp); box.appendChild(btn);
    paint();
    /* не отнимаем фокус у поля, чтобы клавиатура не мигала */
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      var shown = inp.type === 'text' && inp.getAttribute('data-kbtype') === 'password';
      if (shown) { inp.type = 'password'; inp.removeAttribute('data-kbtype'); }
      else { inp.type = 'text'; inp.setAttribute('data-kbtype', 'password'); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('spellcheck', 'false'); }
      paint();
    });
  }
  function scan(root) {
    var l = root.querySelectorAll ? root.querySelectorAll('input[type=password]') : [];
    Array.prototype.forEach.call(l, wrap);
    if (root.tagName === 'INPUT' && root.type === 'password') wrap(root);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (list) {
      list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* окно (регистрация, диалоги) не двигается пальцем, если внутри нечего прокручивать */
  function scrollable(el, root) {
    for (; el && el !== document.documentElement; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      var oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
      if (el === root) break;
    }
    return false;
  }
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) return;
    var tg = e.target; if (!tg || !tg.closest) return;
    var root = tg.closest('dialog[open], .gate');
    if (!root) return;
    if (!scrollable(tg, root)) e.preventDefault();
  }, { passive: false });
})();
