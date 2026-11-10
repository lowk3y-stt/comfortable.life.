(function () {
  'use strict';
  var CL = window.CL, S = CL.store, KEY = 'cl_ui';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function meta() { return S.meta(); }
  function get() {
    var m = meta();
    return { theme: m.theme || 'auto', a11y: m.a11y || 'none', text: m.text || 'normal' };
  }
  function apply() {
    var v = get(), root = document.documentElement;
    var dark = v.theme === 'dark' || (v.theme === 'auto' && mq && mq.matches);
    root.setAttribute('data-scheme', dark ? 'dark' : 'light');
    if (v.a11y !== 'none') root.setAttribute('data-a11y', v.a11y); else root.removeAttribute('data-a11y');
    if (v.text === 'large') root.setAttribute('data-text', 'large'); else root.removeAttribute('data-text');
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    var tc = document.querySelectorAll('meta[name="theme-color"]');
    Array.prototype.forEach.call(tc, function (m) { m.removeAttribute('media'); m.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#131A16' : '#F4EFE0')); });
  }
  function set(k, val) { meta()[k] = val; S.saveMeta(); apply(); }
  if (mq) { var on = function () { if (get().theme === 'auto') apply(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  CL.theme = { apply: apply, set: set, get: get };
  apply();
})();
