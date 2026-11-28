// Whiteboard: Übersicht der Lehrperson unter #/tafel/CODE. Kacheln aller Gruppen mit verkleinerter Vorschau,
// Beitritt per QR-Code, Sammelknöpfe (sperren, PDF, HTML, präsentieren, beenden) und «Neue Bilder» mit Löschen.
// Nur die Leitung der Sitzung (konto.uid === hostUid) sieht sie. Gelesen werden alle Mitglieder und alle Elemente.
//
// Bilder erscheinen in den Kacheln nur als Platzhalter (alle Bilder aller Gruppen zu laden wäre zu schwer);
// in «Neue Bilder» werden sie geladen, zuerst die neuesten 24, mehr auf Knopfdruck.
// «Alle als HTML» liefert Task 10 über den Haken ctx.exportHtml(code, null); ohne ihn bleibt der Knopf ausgeschaltet.
import { h, svg, marke, meldung, fehlerText, rueckfrage } from '../ui.js';
import { t } from '../i18n.js';
import { qrSvg } from '../qr.js';
import { reihenfolge } from '../logik/tafelbrett.js';
import { codeText, beitrittsAdresse, alleSperren, kacheln, neueBilder } from '../logik/tafeluebersicht.js';
import { zeichneElement, zeichneWelt } from './tafelelemente.js';
import { erstelleBildUrls } from './tafelbilder.js';

const BILDER_SEITE = 24;
const NEU_ZEICHNEN_MS = 200;     // Änderungen kommen gehäuft: einmal zeichnen statt je Meldung
const ONLINE_TAKT_MS = 15_000;   // «online» läuft ohne Meldung des Speichers ab

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  const T = (k, w) => t(ctx.sprache, k, w);
  let konto;                       // undefined = lädt, null = abgemeldet
  let sitzung;                     // undefined = lädt, null = gibt es nicht
  let mitglieder = [], elemente = [];
  let zu = false, gestartet = false, praesentieren = false, bilderAnzahl = BILDER_SEITE, bald = null;
  let boxen = [];                  // Vorschauen der Kacheln: { box, welt, raster }
  const stopps = [];
  const bilder = erstelleBildUrls(pfad => store.tafel.bildLaden(pfad));
  const melde = e => meldung(fehlerText(ctx.sprache, e));
  const sicher = f => { try { return f(); } catch (e) { console.warn('rabiosa:', e); return () => {}; } };

  const ziel = h('div', { class: 'tu' });
  wurzel.append(ziel);

  // ---------- Aktionen ----------
  async function schreibe(patch) {
    try { await store.tafel.aktualisieren(code, patch); } catch (e) { melde(e); }
  }
  async function sperren() {
    if (await rueckfrage(ctx.sprache, T('tu.sperrenFrage'), T('tu.sperren'))) schreibe({ gesperrt: alleSperren(sitzung) });
  }
  async function beenden() {
    if (await rueckfrage(ctx.sprache, T('tu.beendenFrage'), T('tu.beenden'))) schreibe({ status: 'beendet' });
  }
  async function bildLoeschen(e) {
    if (!(await rueckfrage(ctx.sprache, T('tu.bildLoeschenFrage'), T('brett.loeschen')))) return;
    try { await store.tafel.elementLoeschen(code, { id: e.id, gruppe: e.gruppe }); } catch (err) { melde(err); }
  }

  // ---------- Zeichnen ----------
  function vorschau(k) {
    const { welt, ebene, raster } = zeichneWelt(sitzung.zonen);
    for (const e of reihenfolge(k.elemente)) ebene.append(zeichneElement(e));
    const box = h('div', { class: 'tu-vorschau' }, welt);
    box.style.aspectRatio = `${raster.b} / ${raster.h}`;
    boxen.push({ box, welt, raster });
    return box;
  }
  function skaliere() {
    for (const { box, welt, raster } of boxen) welt.style.transform = `scale(${(box.clientWidth || 1) / raster.b})`;
  }

  function kachel(k) {
    const abgegeben = k.stand === 'abgegeben';
    return h('a', { class: 'tu-kachel' + (abgegeben ? ' abgegeben' : ''), href: `#/tafel/${code}/${k.nr}` },
      vorschau(k),
      h('div', { class: 'tu-kachelkopf' },
        h('h3', null, k.name),
        h('span', { class: 'tu-stand' + (abgegeben ? ' abgegeben' : '') }, T(abgegeben ? 'tu.abgegeben' : 'tu.arbeitet'))),
      h('p', { class: 'tu-online' + (k.online ? ' an' : '') }, T('tu.online', { n: k.online })),
      h('p', { class: 'tu-namen' }, k.namen.length ? k.namen.join(', ') : T('tu.keineMitglieder')));
  }

  function beitrittsKachel() {
    let qr;
    try { qr = svg(qrSvg(beitrittsAdresse(location, code), { rand: 2 })); } catch (e) { console.error(e); qr = h('span'); }
    return h('div', { class: 'tu-beitritt' },
      h('div', { class: 'tu-qr' }, qr),
      h('p', { class: 'tu-etikett' }, T('tu.beitritt')),
      h('p', { class: 'tu-code' }, codeText(code)),
      h('p', { class: 'tu-hilfe' }, T('tu.beitrittHilfe')));
  }

  function knopf(text, onclick, { gefahr = false, aus = false, titel = '' } = {}) {
    return h('button', { type: 'button', class: 'knopf klein leise' + (gefahr ? ' gefahr' : ''), onclick, disabled: aus, title: titel || null }, text);
  }

  function kopf() {
    const beendet = sitzung.status !== 'offen';
    const alleGesperrt = sitzung.gruppen.every((_, i) => (sitzung.gesperrt || []).includes(i));
    return h('header', { class: 'tu-kopf' },
      h('div', { class: 'tu-zeile' },
        h('a', { class: 'tu-zurueck', href: '#/studio' }, '‹ ', T('tu.zumStudio')),
        h('h1', null, sitzung.titel || T('tb.titel')),
        h('span', { class: 'tu-marke' }, marke()),
        beendet ? h('span', { class: 'tbr-stand' }, T('tu.beendet')) : null),
      h('div', { class: 'tu-knoepfe' },
        knopf(T('tu.sperren'), sperren, { aus: beendet || alleGesperrt }),
        knopf(T('tu.pdf'), () => ctx.geh(`#/tafel/${code}/druck`)),
        typeof ctx.exportHtml === 'function'
          ? knopf(T('tu.html'), () => ctx.exportHtml(code, null))
          : knopf(T('tu.html'), null, { aus: true, titel: T('brett.spaeter') }),
        knopf(T('tu.praesentieren') + (praesentieren ? ' ▴' : ' ▾'), () => { praesentieren = !praesentieren; zeichne(); }),
        h('span', { class: 'tbr-platz' }),
        beendet
          ? knopf(T('tu.oeffnen'), () => schreibe({ status: 'offen' }))
          : knopf(T('tu.beenden'), beenden, { gefahr: true })),
      praesentieren ? h('div', { class: 'tu-waehlen' },
        h('span', null, T('tu.praesentierenWahl')),
        sitzung.gruppen.map((name, i) => h('a', { class: 'chip', href: `#/tafel/${code}/${i}/zeigen` }, name))) : null);
  }

  function bilderListe() {
    const alle = neueBilder(elemente);
    const sichtbar = alle.slice(0, bilderAnzahl);
    return h('section', { class: 'tu-bilder' },
      h('h2', null, T('tu.neueBilder'), alle.length ? ` (${alle.length})` : ''),
      alle.length ? null : h('p', { class: 'tu-hilfe' }, T('tu.keineBilder')),
      h('ul', null, sichtbar.map(e => {
        const bild = h('img', { alt: '', draggable: 'false' });
        if (e.bildPfad) bilder.bildUrl(e.bildPfad).then(url => { if (url && !zu) bild.src = url; });
        return h('li', null,
          h('div', { class: 'tu-bildvorschau' }, bild),
          h('div', { class: 'tu-bildtext' },
            h('b', null, sitzung.gruppen[e.gruppe] ?? '?'),
            h('span', null, e.vonName || '')),
          h('button', { type: 'button', class: 'knopf klein leise gefahr', onclick: () => bildLoeschen(e) }, T('brett.loeschen')));
      })),
      alle.length > sichtbar.length
        ? h('button', { type: 'button', class: 'knopf klein leise', onclick: () => { bilderAnzahl += BILDER_SEITE; zeichne(); } }, T('tu.mehr'))
        : null);
  }

  function hinweis(text, link = true) {
    ziel.replaceChildren(h('div', { class: 'tu-leer' }, h('p', null, text),
      link ? h('a', { class: 'knopf leise', href: '#/studio' }, T('tu.zumStudio')) : null));
  }

  function zeichne() {
    if (zu) return;
    boxen = [];
    document.documentElement.lang = ctx.sprache;
    if (konto === undefined || sitzung === undefined) { hinweis(T('allg.laedt'), false); return; }
    if (sitzung === null) { hinweis(T('tu.weg')); return; }
    if (!konto || sitzung.hostUid !== konto.uid) { hinweis(T('tu.fremd')); return; }
    const jetzt = store.jetzt ? store.jetzt() : Date.now();
    ziel.replaceChildren(kopf(),
      h('main', { class: 'tu-inhalt' },
        h('div', { class: 'tu-raster' }, beitrittsKachel(), kacheln(sitzung, mitglieder, elemente, jetzt).map(kachel)),
        bilderListe()));
    skaliere();
  }
  const zeichneBald = () => { if (bald === null && !zu) bald = setTimeout(() => { bald = null; zeichne(); }, NEU_ZEICHNEN_MS); };

  // ---------- Beobachten ----------
  // Mitglieder und Elemente aller Gruppen darf nur die Leitung lesen; erst starten, wenn sie feststeht.
  function starte() {
    if (gestartet || !sitzung || !konto || sitzung.hostUid !== konto.uid) return;
    gestartet = true;
    stopps.push(sicher(() => store.tafel.mitgliederBeobachten(code, null, liste => { mitglieder = Array.isArray(liste) ? liste : []; zeichneBald(); })));
    stopps.push(sicher(() => store.tafel.elementeBeobachten(code, null, liste => { elemente = Array.isArray(liste) ? liste : []; zeichneBald(); })));
  }
  stopps.push(sicher(() => store.konto.beobachten(k => {
    if (zu) return;
    if (!k || !k.freigeschaltet) { ctx.geh('#/studio'); return; }
    konto = k; starte(); zeichne();
  })));
  stopps.push(sicher(() => store.tafel.beobachten(code, s => {
    if (zu || s === undefined) return;
    sitzung = s; starte(); zeichne();
  })));
  const takt = setInterval(zeichneBald, ONLINE_TAKT_MS);
  window.addEventListener('resize', skaliere);
  zeichne();

  return () => {
    if (zu) return;
    zu = true;
    clearInterval(takt);
    if (bald !== null) clearTimeout(bald);
    window.removeEventListener('resize', skaliere);
    for (const f of stopps) { try { f(); } catch { /* schon weg */ } }
    bilder.freigeben();
  };
}
