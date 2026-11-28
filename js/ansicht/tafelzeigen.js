// Whiteboard: Präsentieren. Vollbild-Ansicht ohne Werkzeuge: Kopf mit Gruppe und Namen, darunter das ganze Board oder eine Zone
// bildschirmfüllend, unten die Schritte (Gesamt · 1 Inspiration · …). Die Elemente laufen live mit (auch GIFs).
// Adressen: #/tafel/CODE/G/zeigen (Leitung, Gruppen mit den Ziffern 1 bis 8 wechseln) und #/t/CODE/zeigen (Gast, nur die eigene Gruppe,
// ab Abgeben bis zum Beenden der Sitzung).
import { h, marke } from '../ui.js';
import { t } from '../i18n.js';
import { praesentationsSchritte } from '../logik/tafel.js';
import { zoome, reihenfolge } from '../logik/tafelbrett.js';
import { schrittRechteck, passeRechteck, schrittTexte, blaettere, gruppeVonZiffer, zeigenZugang } from '../logik/tafelzeigen.js';
import { zeichneElement, zeichneWelt } from './tafelelemente.js';
import { erstelleBildUrls } from './tafelbilder.js';

const UEBERGANG_MS = 550;
const AUSSEN = 5000;   // so weit reicht der Ausschnitt auf «Gesamt» über das Board hinaus

/** Adresse #/tafel/CODE/G/zeigen (g = Nummer) oder #/t/CODE/zeigen (g = 'gast'). */
export function zeige(wurzel, ctx, code, g) {
  const { store } = ctx;
  const leitung = g !== 'gast';
  let gruppe = leitung ? Number(g) : -1;     // Gast: kommt aus dem eigenen Mitglied
  let sitzung;                               // undefined = lädt, null = gibt es nicht
  let konto;                                 // Leitung: undefined = lädt, null = nicht angemeldet
  let ich;                                   // Gast: undefined = lädt, null = nicht Mitglied
  let mitglieder = [];
  const elemente = new Map();                // id -> Element
  const knoten = new Map();                  // id -> { json, el }
  const bilder = erstelleBildUrls(pfad => store.tafel.bildLaden(pfad));
  const timer = new Set();
  let stoppGruppe = [];                      // Beobachter der gerade gezeigten Gruppe
  let beobachtet = null;                     // Gruppe, für die gerade beobachtet wird
  let schritt = 0, manuell = null;           // manuell: { s, x, y } (Zoom von Hand, nur ohne Zonen)
  let gebaut = false, gezeigtZonen = '', zu = false, schwenk = null;
  let buehne, welt, ebene, kopfEl, leisteEl, knoepfe = [], schritte = ['gesamt'], texte = [];
  const ziel = h('div', { class: 'tz' });
  wurzel.append(ziel);

  const sprache = () => (sitzung && sitzung.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const zonen = () => (sitzung && Array.isArray(sitzung.zonen) ? sitzung.zonen : []);
  const zurueckAdresse = () => (leitung ? '#/tafel/' + code : '#/t/' + code);
  const zugang = () => zeigenZugang({ leitung, sitzung, konto, ich, gruppe: leitung ? gruppe : (ich ? ich.gruppe : -1) });
  const sicher = f => { try { return f(); } catch (e) { console.warn('rabiosa:', e); return () => {}; } };

  // ---------- Ansicht ----------
  function anwenden(mitUebergang) {
    if (!gebaut) return;
    const b = buehne.clientWidth, hoehe = buehne.clientHeight;
    const r = schrittRechteck(schritte[schritt], zonen().length);
    const a = manuell || passeRechteck(r, b, hoehe);
    welt.style.transition = mitUebergang ? `transform ${UEBERGANG_MS}ms ease, clip-path ${UEBERGANG_MS}ms ease` : 'none';
    welt.style.transform = `translate(${a.x}px, ${a.y}px) scale(${a.s})`;
    const w = { b: parseFloat(welt.style.width), h: parseFloat(welt.style.height) };
    const zone = typeof schritte[schritt] === 'number';
    welt.style.clipPath = zone && !manuell
      ? `inset(${r.y}px ${w.b - r.x - r.b}px ${w.h - r.y - r.h}px ${r.x}px)`
      : `inset(-${AUSSEN}px)`;
  }

  function geheZu(i) {
    const n = Math.max(0, Math.min(schritte.length - 1, i));
    if (n === schritt) return;
    schritt = n; manuell = null;
    zeichneLeiste();
    anwenden(true);
  }
  const weiter = () => geheZu(blaettere(schritt, 1, schritte.length));
  const zurueck = () => geheZu(blaettere(schritt, -1, schritte.length));

  // Zoom von Hand nur, wenn es keine Zonen gibt (dann gibt es nur «Gesamt»).
  const handZoom = () => zonen().length === 0;
  function setzeHand(a) { manuell = a; anwenden(false); }
  const aktuell = () => {
    const r = schrittRechteck(schritte[schritt], zonen().length);
    return manuell || passeRechteck(r, buehne.clientWidth, buehne.clientHeight);
  };
  function rad(ev) {
    ev.preventDefault();
    if (!handZoom()) return;
    const r = buehne.getBoundingClientRect(), a = aktuell();
    if (ev.ctrlKey || ev.metaKey) setzeHand(zoome(a, Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top));
    else setzeHand({ ...a, x: a.x - ev.deltaX, y: a.y - ev.deltaY });
  }
  function unten(ev) {
    if (!handZoom() || ev.button !== 0) return;
    try { buehne.setPointerCapture(ev.pointerId); } catch { /* Zeiger schon weg */ }
    schwenk = { x: ev.clientX, y: ev.clientY, a: aktuell() };
    buehne.classList.add('schwenkt');
  }
  function bewege(ev) {
    if (schwenk) setzeHand({ ...schwenk.a, x: schwenk.a.x + ev.clientX - schwenk.x, y: schwenk.a.y + ev.clientY - schwenk.y });
  }
  function los() { schwenk = null; buehne?.classList.remove('schwenkt'); }

  // ---------- Zeichnen ----------
  function ladeBild(pfad) {
    bilder.bildUrl(pfad).then(url => {
      if (zu) return;
      if (!url) { const nr = setTimeout(() => { timer.delete(nr); zeichne(); }, 5200); timer.add(nr); }   // später noch einmal versuchen
      zeichne();
    });
  }
  function zeichne() {
    if (!gebaut || zu) return;
    const da = new Set();
    for (const e of reihenfolge([...elemente.values()])) {
      da.add(e.id);
      const pfad = e.art === 'bild' && e.bildPfad;
      let url;
      if (pfad) { url = bilder.gecacht(pfad); if (url === undefined && !bilder.laeuft(pfad)) ladeBild(pfad); }
      const json = JSON.stringify(e) + (url || '');
      const alt = knoten.get(e.id);
      if (alt && alt.json === json) continue;
      const el = zeichneElement(e, e.art === 'bild' ? { bildUrl: url || undefined, ladetext: pfad ? undefined : T('bild.laedt') } : undefined);
      if (alt) alt.el.replaceWith(el); else ebene.append(el);
      knoten.set(e.id, { json, el });
    }
    for (const [id, k] of knoten) if (!da.has(id)) { k.el.remove(); knoten.delete(id); }
  }

  function zeichneKopf() {
    if (!gebaut || !sitzung) return;
    const g = leitung ? gruppe : ich.gruppe;
    const namen = [...mitglieder].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(m => m.name);
    kopfEl.replaceChildren(
      h('div', { class: 'tz-zeile' },
        h('b', { class: 'tz-marke' }, marke()),
        h('h1', { class: 'tz-titel' }, sitzung.titel || ''),
        h('span', { class: 'tz-gruppe' }, sitzung.gruppen[g] ?? '')),
      namen.length ? h('div', { class: 'tz-namen' }, namen.join(' · ')) : null);
  }

  function zeichneLeiste() {
    if (!gebaut) return;
    knoepfe.forEach((k, i) => { k.classList.toggle('an', i === schritt); if (i === schritt) k.setAttribute('aria-current', 'step'); else k.removeAttribute('aria-current'); });
  }

  function vollbild() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function baue() {
    const w = zeichneWelt(zonen());
    welt = w.welt; ebene = w.ebene;
    schritte = praesentationsSchritte(zonen().length);
    texte = schrittTexte(schritte, zonen(), T('tz.gesamt'), n => T('tz.zone', { n }));
    schritt = Math.min(schritt, schritte.length - 1);
    buehne = h('div', { class: 'tz-buehne' }, welt);
    kopfEl = h('header', { class: 'tz-kopf' });
    knoepfe = texte.map((text, i) => h('button', { type: 'button', class: 'tz-schritt', onclick: ev => { ev.currentTarget.blur(); geheZu(i); } }, text));
    const nav = h('nav', { class: 'tz-leiste', 'aria-label': T('tz.schritte') }, h('div', { class: 'tz-schritte' }, knoepfe),
      h('button', { type: 'button', class: 'tz-vollbild', title: T('tz.vollbild'), 'aria-label': T('tz.vollbild'), onclick: ev => { ev.currentTarget.blur(); vollbild(); } }, '⛶'));
    leisteEl = nav;
    ziel.replaceChildren(kopfEl, buehne, nav);
    buehne.addEventListener('wheel', rad, { passive: false });
    buehne.addEventListener('pointerdown', unten);
    buehne.addEventListener('pointermove', bewege);
    buehne.addEventListener('pointerup', los);
    buehne.addEventListener('pointercancel', los);
    const beobachter = new ResizeObserver(() => anwenden(false));
    beobachter.observe(buehne);
    abbauBuehne = () => beobachter.disconnect();
    gebaut = true;
    zeichneKopf();
    zeichneLeiste();
    anwenden(false);
    zeichne();
  }
  let abbauBuehne = null;
  function reisseAb() {
    abbauBuehne?.(); abbauBuehne = null;
    gebaut = false; knoten.clear(); manuell = null;
  }

  // ---------- Beobachten ----------
  function stoppeGruppe() {
    for (const f of stoppGruppe) { try { f(); } catch { /* schon weg */ } }
    stoppGruppe = []; beobachtet = null;
    elemente.clear(); mitglieder = [];
    if (gebaut) { knoten.clear(); ebene.replaceChildren(); }
  }
  function beobachteGruppe(g) {
    if (beobachtet === g) return;
    stoppeGruppe();
    beobachtet = g;
    stoppGruppe.push(sicher(() => store.tafel.mitgliederBeobachten(code, g, liste => { if (beobachtet !== g) return; mitglieder = Array.isArray(liste) ? liste : []; zeichneKopf(); })));
    stoppGruppe.push(sicher(() => store.tafel.elementeBeobachten(code, g, liste => {
      if (beobachtet !== g) return;
      elemente.clear();
      for (const e of Array.isArray(liste) ? liste : []) if (e && e.gruppe === g && e.id) elemente.set(e.id, e);
      zeichne();
    })));
  }

  /** Bringt die Ansicht in den Zustand, den Sitzung, Konto und Mitglied verlangen. */
  function abgleich() {
    if (zu) return;
    const z = zugang();
    const zonenJson = JSON.stringify(zonen());
    if (z === 'ok') {
      const g = leitung ? gruppe : ich.gruppe;
      if (gebaut && zonenJson !== gezeigtZonen) reisseAb();
      if (!gebaut) { gezeigtZonen = zonenJson; baue(); }
      beobachteGruppe(g);
      zeichneKopf();
      return;
    }
    stoppeGruppe();
    if (gebaut) reisseAb();
    const text = z === 'laedt' ? T('allg.laedt') : z === 'wartet' ? T('tz.wartet') : z === 'beendet' ? T('tz.beendet') : z === 'fremd' ? T('tz.fremd') : T('tz.weg');
    const hin = z === 'wartet' ? ['#/t/' + code, T('tz.zumBoard')] : z === 'laedt' ? null : [leitung ? '#/studio' : '#/', T('ende.zurueck')];
    gezeigtZonen = '';
    ziel.replaceChildren(h('div', { class: 'tz-leer' }, h('p', null, text), hin ? h('a', { class: 'knopf leise', href: hin[0] }, hin[1]) : null));
  }

  function wechsleGruppe(g) {
    if (!leitung || g === gruppe || zugang() !== 'ok') return;
    gruppe = g;
    try { history.replaceState(null, '', '#/tafel/' + code + '/' + g + '/zeigen'); } catch { /* ohne Verlauf */ }
    abgleich();
  }

  const stoppKonto = leitung
    ? sicher(() => store.konto.beobachten(k => {
      if (zu) return;
      if (!k || !k.freigeschaltet) { ctx.geh('#/studio'); return; }
      konto = { uid: k.uid };
      abgleich();
    }))
    : () => {};
  const stoppIch = leitung ? () => {} : sicher(() => store.tafel.ichBeobachten(code, m => { ich = m ? { uid: m.uid, gruppe: m.gruppe, name: m.name } : null; abgleich(); }));
  const stoppSitzung = sicher(() => store.tafel.beobachten(code, s => {
    if (s === undefined) return;
    sitzung = s;
    document.documentElement.lang = sprache();
    abgleich();
  }));

  const taste = ev => {
    if (zu || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target.closest?.('input, textarea, select, dialog') || document.querySelector('dialog[open]')) return;
    const k = ev.key;
    if (!gebaut) { if (k === 'Escape' && !document.fullscreenElement) ctx.geh(zurueckAdresse()); return; }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') {
      if (ev.target.closest?.('button, a') && (k === ' ' || k === 'Enter')) return;   // Knöpfe lösen selbst aus
      ev.preventDefault(); weiter();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { ev.preventDefault(); zurueck(); }
    else if (k === 'Home') { ev.preventDefault(); manuell = null; geheZu(0); anwenden(true); }
    else if (k === 'End') { ev.preventDefault(); geheZu(schritte.length - 1); }
    else if (k === '0' && handZoom()) { manuell = null; anwenden(true); }
    else if (k === 'f' || k === 'F') vollbild();
    else if (k === 'Escape') { if (!document.fullscreenElement) ctx.geh(zurueckAdresse()); }
    else if (leitung && sitzung) { const g = gruppeVonZiffer(k, sitzung.gruppen.length); if (g >= 0) wechsleGruppe(g); }
  };
  document.addEventListener('keydown', taste);
  abgleich();

  return () => {
    if (zu) return;
    zu = true;
    for (const nr of timer) clearTimeout(nr);
    document.removeEventListener('keydown', taste);
    stoppeGruppe();
    reisseAb();
    stoppKonto(); stoppIch(); stoppSitzung();
    bilder.freigeben();
  };
}
