// Whiteboard: Druckansicht (als PDF sichern über das Druckfenster des Browsers). A4 quer, Rand 10 mm.
// Pro Gruppe zuerst eine Seite mit dem ganzen Board, dann eine Seite pro Zone; oben ein kleiner Kopf mit Titel, Gruppe,
// Namen und dem EHL-Logo. Jede Seite ist ein eigener Block mit fester Höhe, die Welt darin skaliert (nichts absolut
// Positioniertes über eine Seitengrenze, Erfahrung aus Cloche). Erst wenn alle Bilder geladen sind, öffnet sich das Druckfenster.
// Adressen: #/tafel/CODE/druck (Leitung, alle Gruppen), #/tafel/CODE/G/druck (Leitung, eine Gruppe),
// #/t/CODE/druck (Gast: nur die eigene Gruppe, ab Abgeben bis zum Beenden, wie beim Zeigen).
import { h, logo } from '../ui.js';
import { t } from '../i18n.js';
import { praesentationsSchritte } from '../logik/tafel.js';
import { reihenfolge } from '../logik/tafelbrett.js';
import { schrittRechteck, passeRechteck, schrittTexte, zeigenZugang } from '../logik/tafelzeigen.js';
import { zeichneElement, zeichneWelt } from './tafelelemente.js';
import { erstelleBildUrls } from './tafelbilder.js';
import { sammle, benutzteBilder } from './tafelexport.js';

const MM = 96 / 25.4;                          // CSS-Pixel pro Millimeter
const FLAECHE_B = 277 * MM, FLAECHE_H = 166 * MM;   // wie .tdr-flaeche in css/rabiosa.css

export function zeige(wurzel, ctx, code, g) {
  const { store } = ctx;
  const gast = g === 'gast';
  const alle = g === undefined;
  const gruppe = gast || alle ? null : Number(g);
  let sitzung, konto, ich;
  let zu = false, gestartet = false, gedruckt = false;
  const stopps = [];
  const bilder = erstelleBildUrls(pfad => store.tafel.bildLaden(pfad));
  const ziel = h('div', { class: 'tdr' });
  wurzel.append(ziel);

  const sprache = () => (sitzung && sitzung.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const sicher = f => { try { return f(); } catch (e) { console.warn('rabiosa:', e); return () => {}; } };
  const zurueck = () => (gast ? '#/t/' + code : alle ? '#/tafel/' + code : '#/tafel/' + code + '/' + gruppe);
  const zugang = () => zeigenZugang({
    leitung: !gast, sitzung, konto, ich,
    gruppe: gast ? (ich ? ich.gruppe : -1) : alle ? 0 : gruppe,
  });

  function hinweis(text, hin) {
    ziel.replaceChildren(h('div', { class: 'tdr-leer' }, h('p', null, text), hin ? h('a', { class: 'knopf leise', href: hin[0] }, hin[1]) : null));
  }

  // ---------- Seiten ----------
  function seite(s, gr, schritt, beschriftung, urls) {
    const zonen = Array.isArray(s.zonen) ? s.zonen : [];
    const { welt, ebene, raster } = zeichneWelt(zonen);
    for (const e of reihenfolge(gr.elemente)) {
      ebene.append(zeichneElement(e, e.art === 'bild' ? { bildUrl: (e.bildPfad && urls.get(e.bildPfad)) || undefined } : undefined));
    }
    const r = schrittRechteck(schritt, zonen.length);
    const a = passeRechteck(r, FLAECHE_B, FLAECHE_H);
    welt.style.transform = `translate(${a.x}px, ${a.y}px) scale(${a.s})`;
    if (typeof schritt === 'number') welt.style.clipPath = `inset(${r.y}px ${raster.b - r.x - r.b}px ${raster.h - r.y - r.h}px ${r.x}px)`;
    return h('section', { class: 'tdr-blatt' },
      h('header', { class: 'tdr-kopf' },
        h('div', { class: 'tdr-kopftext' },
          h('div', { class: 'tdr-zeile' },
            h('h1', { class: 'tdr-titel' }, s.titel || ''),
            h('span', { class: 'tdr-gruppe' }, gr.name),
            h('span', { class: 'tdr-schritt' }, beschriftung)),
          h('div', { class: 'tdr-namen' }, gr.mitglieder.length ? gr.mitglieder.join(' · ') : T('tu.keineMitglieder'))),
        logo(sprache(), 'blau')),
      h('div', { class: 'tdr-flaeche' }, welt));
  }

  async function baue() {
    hinweis(T('td.laedt'));
    const nr = gast ? ich.gruppe : gruppe;
    const { gruppen } = await sammle(store, code, nr, sitzung);
    if (zu) return;
    const urls = new Map();
    // bildLaden gibt nach einer Frist auf (null): Fehlende Bilder erscheinen als Platzhalter, gedruckt wird trotzdem.
    const pfade = benutzteBilder(gruppen).pfade;
    await Promise.all(pfade.map(async p => { const url = await bilder.bildUrl(p); if (url) urls.set(p, url); }));
    if (zu) return;
    const fehlen = pfade.length - urls.size;
    const zonen = Array.isArray(sitzung.zonen) ? sitzung.zonen : [];
    // Für den Druck: das ganze Board und jede Zone einmal (ohne das zweite «Gesamt» der Präsentation).
    const schritte = zonen.length ? praesentationsSchritte(zonen.length).slice(0, -1) : ['gesamt'];
    const texte = schrittTexte(schritte, zonen, T('tz.gesamt'), n => T('tz.zone', { n }));
    const blaetter = gruppen.flatMap(gr => schritte.map((s, i) => seite(sitzung, gr, s, texte[i], urls)));
    const drucken = () => window.print();
    ziel.replaceChildren(
      h('div', { class: 'tdr-leiste' },
        h('a', { class: 'tdr-zurueck', href: zurueck() }, '‹ ', T('td.zurueck')),
        h('b', null, T('td.titel'), ' · ', sitzung.titel || ''),
        h('span', { class: 'tdr-zahl' }, T('td.seiten', { n: blaetter.length })),
        h('button', { type: 'button', class: 'knopf', onclick: drucken }, T('druck.drucken')),
        fehlen > 0 ? h('p', { class: 'tdr-warnung', role: 'status' }, T('td.bilderFehlen')) : null,
        h('p', { class: 'tdr-hilfe' }, T('td.hinweis'))),
      h('div', { class: 'tdr-blaetter' }, blaetter));
    // Erst drucken, wenn Bilder (auch Sticker und Logo) und Schriften bereit sind.
    await Promise.all([...ziel.querySelectorAll('img')].map(i => (i.complete ? null : i.decode().catch(() => {}))));
    try { await document.fonts?.ready; } catch { /* ohne Schriften-Schnittstelle */ }
    if (zu || gedruckt) return;
    gedruckt = true;
    setTimeout(() => { if (!zu) drucken(); }, 200);
  }

  function abgleich() {
    if (zu || gestartet) return;
    const z = zugang();
    if (z === 'ok') {
      gestartet = true;
      baue().catch(e => { console.warn('rabiosa:', e); if (!zu) hinweis(t(sprache(), e && e.code === 'netz' ? 'fehler.netz' : 'fehler.allgemein'), [zurueck(), T('td.zurueck')]); });
      return;
    }
    const text = z === 'laedt' ? T('allg.laedt') : z === 'wartet' ? T('td.wartet') : z === 'beendet' ? T('td.beendet') : z === 'fremd' ? T('tz.fremd') : T('tz.weg');
    const hin = z === 'wartet' ? ['#/t/' + code, T('tz.zumBoard')] : z === 'laedt' ? null : [gast ? '#/' : '#/studio', T('ende.zurueck')];
    hinweis(text, hin);
  }

  if (!gast) {
    stopps.push(sicher(() => store.konto.beobachten(k => {
      if (zu) return;
      if (!k || !k.freigeschaltet) { ctx.geh('#/studio'); return; }
      konto = { uid: k.uid };
      abgleich();
    })));
  } else {
    stopps.push(sicher(() => store.tafel.ichBeobachten(code, m => { ich = m ? { uid: m.uid, gruppe: m.gruppe, name: m.name } : null; abgleich(); })));
  }
  stopps.push(sicher(() => store.tafel.beobachten(code, s => {
    if (zu || s === undefined) return;
    sitzung = s;
    document.documentElement.lang = sprache();
    abgleich();
  })));
  abgleich();

  return () => {
    if (zu) return;
    zu = true;
    for (const f of stopps) { try { f(); } catch { /* schon weg */ } }
    bilder.freigeben();
  };
}
