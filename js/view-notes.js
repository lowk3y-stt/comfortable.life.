/* Экран «Заметки». */
(function () {
  'use strict';
  var CL = window.CL, U = CL.ui, L = CL.logic, h = U.h, t = U.t;
  var query = '';

  function editor(note) {
    var isNew = !note;
    var title = h('input', { type: 'text', maxlength: 120, value: note ? note.title : '', 'data-autofocus': true });
    var text = h('textarea', { rows: 9, maxlength: 20000 });
    text.value = note ? note.text : '';
    var pin = h('input', { type: 'checkbox' });
    pin.checked = !!(note && note.pinned);
    var share = U.shareField(note);
    U.modal({
      title: isNew ? t('notes.new') : t('notes.edit'),
      body: [
        U.field(t('notes.noteTitle'), title),
        U.field(t('notes.text'), text),
        h('label', { class: 'check' }, [pin, h('span', { text: t('notes.pin') })]),
        share.el
      ],
      extra: isNew ? [] : [{ label: t('common.delete'), kind: 'danger', onClick: function (close) {
        U.confirm(t('common.deleteAsk'), t('common.delete'), true).then(function (ok) { if (ok) { L.deleteNote(note.id); close(); } });
      } }],
      onSubmit: function () {
        var o = { title: title.value.trim(), text: text.value.trim(), pinned: pin.checked, shared: share.get() };
        if (isNew) { if (o.title || o.text) L.addNote(o); }
        else L.updateNote(note.id, o);
      }
    });
  }

  function respondDialog(n) {
    var mine = L.myResponse(n);
    var inp = h('input', { type: 'text', maxlength: 200, value: mine ? mine.text : '', placeholder: t('notes.respPh'), 'data-autofocus': '1' });
    U.modal({
      title: t('notes.respond'), body: [h('p', { class: 'muted', text: t('notes.respHint') }), U.field(t('notes.respText'), inp)], submitLabel: t('notes.respSend'),
      extra: mine ? [{ label: t('notes.respUndo'), kind: 'danger', onClick: function (close) { L.unrespond(n.id); close(); CL.app.render(); } }] : [],
      onSubmit: function () { if (!inp.value.trim()) return false; L.respond(n.id, inp.value); CL.app.render(); }
    });
  }
  function respBlock(n) {
    if (!n.shared) return null;
    var rs = (n.resp || []).map(function (r) {
      return h('li', {}, [h('b', { text: L.responderName(r) + ': ' }), h('span', { text: r.text })]);
    });
    var mine = L.myResponse(n);
    return h('div', { class: 'note-resp' }, [
      rs.length ? h('ul', { class: 'resp-list' }, rs) : null,
      U.btn(mine ? t('notes.respEdit') : t('notes.respond'), 'ghost', function () { respondDialog(n); })
    ]);
  }

  function card(n) {
    var first = n.title || n.text.split('\n')[0] || t('notes.untitled');
    var body = n.title ? n.text : n.text.split('\n').slice(1).join('\n');
    return h('article', { class: 'note' + (n.pinned ? ' pinned' : '') + (n.done ? ' done' : '') }, [
      h('button', { type: 'button', class: 'tick-btn', role: 'checkbox', 'aria-checked': n.done ? 'true' : 'false', 'aria-label': t('notes.markDone') + ': ' + first, onclick: function () { L.toggleNote(n.id); } },
        h('span', { class: 'tick' + (n.done ? ' on' : '') }, n.done ? U.icon('check', 16) : null)),
      h('button', { type: 'button', class: 'note-main', onclick: function () { editor(n); } }, [
        h('span', { class: 'note-top' }, [h('b', { text: first }), n.pinned ? U.icon('pin') : null]),
        body ? h('span', { class: 'note-body', text: body.slice(0, 200) }) : null,
        h('span', { class: 'note-meta' }, [h('small', { text: U.fmt(new Date(n.ts || Date.now()), { day: 'numeric', month: 'short' }) }), U.sharedChip(n)])
      ]),
      respBlock(n)
    ]);
  }

  function fill(box) {
    box.textContent = '';
    var q = query.trim().toLowerCase();
    var all = L.notes();
    var list = all.filter(function (n) { return !q || (n.title + ' ' + n.text).toLowerCase().indexOf(q) > -1; });
    if (!all.length) { box.className = ''; box.appendChild(U.empty(t('notes.empty'), U.btn(t('notes.new'), 'primary', function () { editor(); }, 'plus'))); return; }
    if (!list.length) { box.className = ''; box.appendChild(U.empty(t('notes.noMatch'))); return; }
    box.className = 'notes-grid';
    list.forEach(function (n) { box.appendChild(card(n)); });
  }

  CL.actions.newNote = function () { editor(); };
  CL.actions.editNote = function (id) { var n = L.find(CL.store.get().notes, id); if (n) editor(n); };

  CL.views.notes = function (root) {
    root.appendChild(U.head(t('notes.title'), [U.btn(t('notes.new'), 'primary', function () { editor(); }, 'plus')]));
    var box = h('div');
    var search = h('input', { type: 'search', class: 'search', placeholder: t('notes.search'), 'aria-label': t('notes.search'), value: query });
    search.addEventListener('input', function () { query = search.value; fill(box); });
    root.appendChild(search);
    root.appendChild(box);
    fill(box);
  };
})();
