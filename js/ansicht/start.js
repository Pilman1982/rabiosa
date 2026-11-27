// Startseite: Spielcode eintippen (für alle, die den QR-Code nicht scannen) und Weg ins Studio.
import { h, fluss, logo, marke } from '../ui.js';
import { t } from '../i18n.js';

export function zeige(wurzel, ctx) {
  const zeichne = () => {
    const s = ctx.sprache;
    const feld = h('input', { class: 'codefeld', inputmode: 'numeric', autocomplete: 'off', maxlength: '7', placeholder: '000 000', 'aria-label': t(s, 'start.code') });
    feld.addEventListener('input', () => {
      const ziffern = feld.value.replace(/\D/g, '').slice(0, 6);
      feld.value = ziffern.length > 3 ? ziffern.slice(0, 3) + ' ' + ziffern.slice(3) : ziffern;
    });
    const los = e => {
      e.preventDefault();
      const code = feld.value.replace(/\D/g, '');
      if (code.length === 6) ctx.geh('#/' + code); else feld.focus();
    };
    const sprachKnopf = k => h('button', { class: 'sprachknopf' + (s === k ? ' an' : ''), onclick: () => { ctx.sprache = k; zeichne(); } }, k.toUpperCase());
    wurzel.replaceChildren(h('div', { class: 'startseite' },
      h('div', { class: 'sprachwahl' }, sprachKnopf('de'), sprachKnopf('en')),
      h('h1', { class: 'marke' }, marke()),
      h('p', { class: 'unter' }, t(s, 'marke.unter')),
      fluss(),
      h('form', { class: 'codeform', onsubmit: los },
        h('label', { class: 'lab' }, t(s, 'start.code')),
        feld,
        h('button', { class: 'knopf gross', type: 'submit' }, t(s, 'start.beitreten'))),
      ctx.demo ? h('p', { class: 'demohinweis' }, t(s, 'allg.demo')) : null,
      h('p', { class: 'studiolink' }, t(s, 'start.dozierende') + ': ', h('a', { href: '#/studio' }, t(s, 'start.studio'))),
      logo(s, 'weiss')));
    feld.focus();
  };
  zeichne();
}
