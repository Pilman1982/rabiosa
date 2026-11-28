// Whiteboard: Ergebnisse einer Vorlage im Studio unter #/studio/tafeln/ID. Alle eigenen Sitzungen dieser Vorlage,
// neueste zuerst: Datum, Code, Gruppen, offen/beendet, Speicher. Knöpfe: Öffnen, Präsentieren, PDF, HTML, Beenden/Wieder öffnen, Löschen.
// Nur für die angemeldete, freigeschaltete Lehrperson. Den Speicher je Sitzung liest store.tafel.zaehlerLesen einmalig.
// Ist die Vorlage weg (gelöscht oder im Kollegium nicht mehr freigegeben), erscheinen die Sitzungen trotzdem, mit dem
// Titel aus der Sitzung: Sonst blieben sie samt Bildern unerreichbar im Speicher.
import { h, marke, meldung, fehlerText, rueckfrage, datum } from '../ui.js';
import { t } from '../i18n.js';
import { megabyte, speicherSumme, zeilenStand, ergebnisTitel } from '../logik/tafelergebnisse.js';

export function zeige(wurzel, ctx, vorlageId) {
  const { store } = ctx;
  const s = ctx.sprache;
  const T = (k, w) => t(s, k, w);
  let zu = false, gestartet = false;
  let vorlage = null;              // null: gelöscht oder nicht (mehr) freigegeben; die Sitzungen erscheinen trotzdem
  const melde = e => meldung(fehlerText(s, e));
  const offeneWahl = new Set();    // Codes, bei denen die Gruppenwahl für «Präsentieren» offen ist

  const titelEl = h('h1', null, T('terg.titel'));
  const inhalt = h('div', { class: 'rb-liste' }, h('p', null, T('allg.laedt')));
  wurzel.replaceChildren(h('div', { class: 'studio' },
    h('header', { class: 'studiokopf' }, h('a', { class: 'marke-klein', href: '#/studio' }, marke()), titelEl,
      h('a', { class: 'knopf leise klein', href: '#/studio' }, T('terg.zumStudio'))),
    inhalt));

  // replaceChildren nimmt null als Text «null»: nur echte Knoten übergeben.
  const hinweis = (text, mitLink = false) => inhalt.replaceChildren(...[h('p', { class: 'leer' }, text),
    mitLink ? h('a', { class: 'knopf leise', href: '#/studio' }, T('terg.zumStudio')) : null].filter(Boolean));

  async function schreibe(code, patch) {
    try { await store.tafel.aktualisieren(code, patch); } catch (e) { melde(e); }
    await lade();
  }
  async function beenden(sitzung) {
    if (await rueckfrage(s, T('terg.beendenFrage', { code: zeilenStand(sitzung).codeText }), T('terg.beenden'))) schreibe(sitzung.code, { status: 'beendet' });
  }
  async function loeschen(sitzung) {
    if (!(await rueckfrage(s, T('terg.loeschenFrage', { code: zeilenStand(sitzung).codeText }), T('terg.loeschen')))) return;
    try { await store.tafel.loeschen(sitzung.code); } catch (e) { melde(e); }
    offeneWahl.delete(sitzung.code);
    await lade();
  }
  // Vertrag des Hakens: ctx.exportHtml(code, null) = alle Gruppen (nur die Leitung). Ein Fehler erscheint als Meldung.
  function exportiere(code) {
    try { Promise.resolve(ctx.exportHtml(code, null)).catch(melde); } catch (e) { melde(e); }
  }

  function knopf(text, onclick, { gefahr = false, aus = false } = {}) {
    return h('button', { type: 'button', class: 'knopf klein leise' + (gefahr ? ' gefahr' : ''), onclick, disabled: aus }, text);
  }

  function zeile(sitzung) {
    const z = zeilenStand(sitzung);
    const speicher = h('span', { class: 'terg-speicher' }, T('terg.speicherLaedt'));
    store.tafel.zaehlerLesen(sitzung.code).then(liste => {
      if (zu) return;
      const sum = speicherSumme(liste);
      speicher.textContent = T('terg.speicher', { mb: megabyte(sum.bytes, s), n: sum.bilder });
    }, () => { if (!zu) speicher.textContent = T('terg.speicherLeer'); });
    const wahl = h('div', { class: 'terg-waehlen', hidden: !offeneWahl.has(z.code) },
      h('span', null, T('tu.praesentierenWahl')),
      (sitzung.gruppen || []).map((name, i) => h('a', { class: 'chip', href: `#/tafel/${z.code}/${i}/zeigen` }, name)));
    return h('li', { class: 'terg-zeile' },
      h('div', { class: 'terg-daten' },
        h('span', { class: 'terg-datum' }, sitzung.erstellt ? datum(s, sitzung.erstellt) : '–'),
        h('b', { class: 'terg-code' }, z.codeText),
        h('span', null, T('terg.gruppen', { n: z.gruppen })),
        h('span', { class: 'terg-stand' + (z.offen ? '' : ' beendet') }, T(z.offen ? 'terg.offen' : 'terg.beendet')),
        speicher),
      h('div', { class: 'terg-knoepfe' },
        h('a', { class: 'knopf klein leise', href: `#/tafel/${z.code}` }, T('terg.oeffnen')),
        knopf(T('terg.praesentieren'), () => { wahl.hidden = !wahl.hidden; if (wahl.hidden) offeneWahl.delete(z.code); else offeneWahl.add(z.code); }, { aus: z.gruppen === 0 }),
        h('a', { class: 'knopf klein leise', href: `#/tafel/${z.code}/druck` }, T('terg.pdf')),
        typeof ctx.exportHtml === 'function' ? knopf(T('terg.html'), () => exportiere(z.code)) : null,
        z.offen ? knopf(T('terg.beenden'), () => beenden(sitzung)) : knopf(T('terg.wiederOeffnen'), () => schreibe(z.code, { status: 'offen' })),
        knopf(T('terg.loeschen'), () => loeschen(sitzung), { gefahr: true })),
      wahl);
  }

  async function lade() {
    if (zu) return;
    try {
      const liste = await store.tafel.meine(vorlageId);
      if (zu) return;
      titelEl.textContent = ergebnisTitel(vorlage, liste, T('terg.titel'));
      if (!liste.length) { hinweis(T(vorlage ? 'terg.leer' : 'terg.weg'), !vorlage); return; }
      inhalt.replaceChildren(...[vorlage ? null : h('p', { class: 'hilfe' }, T('terg.ohneVorlage')),
        h('ul', { class: 'terg-liste' }, liste.map(zeile))].filter(Boolean));
    } catch (e) { if (!zu) inhalt.replaceChildren(h('p', { class: 'fehler' }, fehlerText(s, e))); }
  }

  async function starte() {
    try { vorlage = await store.quiz.laden(vorlageId); } catch { vorlage = null; }
    if (zu) return;
    await lade();
  }

  const stopp = store.konto.beobachten(konto => {
    if (zu) return;
    if (!konto || !konto.freigeschaltet) { ctx.geh('#/studio'); return; }
    if (!gestartet) { gestartet = true; starte(); }
  });
  return () => { zu = true; try { stopp(); } catch { /* schon weg */ } };
}
