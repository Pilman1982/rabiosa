// Rückblick: zu jeder Frage die Lösung und wie die Klasse geantwortet hat. Ohne Namen.
import { h, BUCHSTABEN, fehlerText, datum } from '../ui.js';
import { t } from '../i18n.js';

/**
 * Zeichnet Lösung und Verteilung einer Frage.
 * info: { typ, antworten?: [text], loesung, verteilung }
 */
export function zeichneVerteilung(info, sprache) {
  const T = (k, w) => t(sprache, k, w);
  const { typ, loesung, verteilung: v } = info;
  const zahlText = z => String(z).replace('.', sprache === 'en' ? '.' : ',');
  const zeile = (marke, klasse, text, anzahl, hoechst, richtig, blass) => h('div', { class: 'vzeile' + (richtig ? ' richtig' : '') + (blass ? ' blass' : '') },
    h('i', { class: 'marke ' + klasse }, marke),
    h('span', { class: 'vtext' }, text),
    h('span', { class: 'vbalken' }, h('i', { class: klasse, style: `width:${hoechst ? Math.round(anzahl / hoechst * 100) : 0}%` })),
    h('b', { class: 'vzahl' }, anzahl),
    h('span', { class: 'vhaken' }, richtig ? '✓' : ''));

  if (typ === 'mc' || typ === 'mehrfach' || typ === 'umfrage') {
    const hoechst = Math.max(1, ...v);
    const richtige = typ === 'mc' ? [loesung] : typ === 'mehrfach' ? loesung : [];
    return h('div', { class: 'verteilung' }, (info.antworten || []).map((text, i) =>
      zeile(BUCHSTABEN[i], 'a' + (i + 1), text, v[i] || 0, hoechst, richtige.includes(i), typ !== 'umfrage' && !richtige.includes(i))));
  }
  if (typ === 'wf') {
    const hoechst = Math.max(1, ...v);
    return h('div', { class: 'verteilung' },
      zeile('✓', 'a3', T('frage.wahr'), v[0], hoechst, loesung === true, loesung !== true),
      zeile('✕', 'a2', T('frage.falsch'), v[1], hoechst, loesung === false, loesung !== false));
  }
  if (typ === 'schaetz') {
    const innerhalb = w => Math.abs(w - loesung.wert) <= loesung.toleranz;
    return h('div', { class: 'verteilung schaetz' },
      h('p', { class: 'loesung-gross' }, h('span', { class: 'lab' }, T('beamer.richtigIst')), h('b', null, zahlText(loesung.wert), loesung.einheit ? ' ' + loesung.einheit : ''),
        loesung.toleranz ? h('span', { class: 'toleranz' }, '± ' + zahlText(loesung.toleranz)) : null),
      h('div', { class: 'wertchips' }, v.werte.map(w => h('span', { class: 'wertchip' + (innerhalb(w) ? ' treffer' : '') }, zahlText(w)))),
      h('p', { class: 'vfuss' }, T('beamer.treffer', { n: v.treffer })));
  }
  if (typ === 'reihe') {
    return h('div', { class: 'verteilung' },
      h('ol', { class: 'loesung-reihe' }, loesung.map(text => h('li', null, text))),
      h('p', { class: 'vfuss' }, `${T('beamer.ganz')}: ${v.ganz} · ${T('beamer.teil')}: ${v.teil} · ${T('beamer.daneben')}: ${v.falsch}`));
  }
  if (typ === 'kurz') {
    const hoechst = Math.max(1, ...v.map(e => e.anzahl));
    return h('div', { class: 'verteilung' },
      h('p', { class: 'loesung-gross' }, h('span', { class: 'lab' }, T('beamer.richtigIst')), h('b', null, loesung[0] || '')),
      v.map(e => zeile(e.richtig ? '✓' : '·', e.richtig ? 'a3' : 'a5', e.text, e.anzahl, hoechst, e.richtig, !e.richtig)));
  }
  return h('div', { class: 'verteilung' });
}

/** Ein ganzer Rückblick (eine Durchführung). */
export function zeichneRueckblick(rb, sprache) {
  const T = (k, w) => t(sprache, k, w);
  let schwierigste = false;
  const liste = h('div', { class: 'rb-fragen' });
  const knopf = h('button', { class: 'knopf leise klein' });
  const baue = () => {
    knopf.textContent = T(schwierigste ? 'rueckblick.reihenfolge' : 'rueckblick.schwierigste');
    const fragen = rb.fragen.map((f, nr) => ({ f, nr }));
    if (schwierigste) fragen.sort((a, b) => (a.f.typ === 'umfrage') - (b.f.typ === 'umfrage') || a.f.schnitt - b.f.schnitt);
    liste.replaceChildren(...fragen.map(({ f, nr }) => h('section', { class: 'rb-frage' },
      h('header', null,
        h('h3', null, `${nr + 1}. ${f.text}`),
        h('p', { class: 'rb-zahlen' },
          f.typ === 'umfrage' ? null : h('b', null, T('rueckblick.richtig', { n: Math.round(f.schnitt * 100) })),
          h('span', null, T('rueckblick.beantwortet', { n: f.beantwortet, von: f.spieler })))),
      zeichneVerteilung(f, sprache))));
  };
  knopf.addEventListener('click', () => { schwierigste = !schwierigste; baue(); });
  baue();
  return h('article', { class: 'rueckblick' },
    h('header', { class: 'rb-kopf' },
      h('div', null, h('h2', null, rb.quizTitel), h('p', null, `${T('rueckblick.vom', { datum: datum(sprache, rb.datum) })} · ${T('rueckblick.personen', { n: rb.spieler })}`)),
      rb.fragen.length > 1 ? knopf : null),
    liste);
}

/** Seite im Studio: alle Durchführungen eines Quiz. */
export function zeige(wurzel, ctx, quizId) {
  const { store } = ctx;
  const s = ctx.sprache;
  const inhalt = h('div', { class: 'rb-liste' }, h('p', null, t(s, 'allg.laedt')));
  wurzel.replaceChildren(h('div', { class: 'studio' },
    h('header', { class: 'studiokopf' }, h('a', { class: 'marke-klein', href: '#/studio' }, 'RABIOSA'), h('h1', null, t(s, 'studio.rueckblicke')),
      h('a', { class: 'knopf leise klein', href: '#/studio' }, t(s, 'rueckblick.studio'))),
    inhalt));
  const stopp = store.konto.beobachten(async konto => {
    if (!konto || !konto.freigeschaltet) { ctx.geh('#/studio'); return; }
    try {
      const liste = await store.rueckblick.liste(quizId);
      inhalt.replaceChildren(...(liste.length ? liste.map(rb => zeichneRueckblick(rb, s)) : [h('p', { class: 'leer' }, t(s, 'rueckblick.leer'))]));
    } catch (e) { inhalt.replaceChildren(h('p', { class: 'fehler' }, fehlerText(s, e))); }
  });
  return stopp;
}
