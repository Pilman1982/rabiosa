// Whiteboard: das Board einer Gruppe. Für Studierende über tafelbeitritt.js (rolle 'gast'), für die Lehrperson
// unter #/tafel/CODE/G (rolle 'leitung'). Darstellung, Ansicht (verschieben, zoomen), Live-Abgleich, Schreibschutz
// und Rückgängig stehen hier; die Werkzeuge in tafelwerkzeuge.js, das Zeichnen der Elemente in tafelelemente.js.
//
// Eigene Änderungen erscheinen sofort über eine lokale Vorschau («lokal»), bis der Speicher sie zurückmeldet.
// Was jemand anderes gerade bearbeitet (Feld «bearbeitet»), trägt einen Rahmen in Petrol mit dessen Vornamen.
// Name der Leitung in «bearbeitet» und «vonName»: der erste Teil des Kontonamens (kurzname), sonst der E-Mail-Name.
import { h, meldung, fehlerText, marke, rueckfrage } from '../ui.js';
import { t } from '../i18n.js';
import { neuerStapel, merke, rueckgaengig, wiederholen, istOnline } from '../logik/tafel.js';
import {
  zuBrett, einpassen, zoome, reihenfolge, erstelleDrossel, kurzname, istFremdBearbeitet, gleicheElemente,
  neueKennung, zVorn, DROSSEL_MS, FREMD_MS,
} from '../logik/tafelbrett.js';
import { zufallsKennung } from '../store/gemeinsam.js';
import { ohneSperre } from '../logik/tafeluebersicht.js';
import { zeichneElement, zeichneWelt } from './tafelelemente.js';
import { erstelleWerkzeuge } from './tafelwerkzeuge.js';
import { erstelleBilder, erstelleBildUrls } from './tafelbilder.js';

const LEBENSZEICHEN_MS = 30_000;
const ECHO_MS = 3000;            // so lange wartet eine gespeicherte Vorschau auf die Rückmeldung des Speichers
const NUR_ANSEHEN = '(max-width: 767px), (pointer: coarse)';

/** Adresse #/tafel/CODE/G: Board einer Gruppe für die Lehrperson. */
export function zeige(wurzel, ctx, code, g) {
  const ziel = h('div', { class: 'tbr-wurzel' });
  wurzel.append(ziel);
  let abbau = null, zu = false;
  const stopp = ctx.store.konto.beobachten(k => {
    if (zu) return;
    if (!k || !k.freigeschaltet) { ctx.geh('#/studio'); return; }
    if (!abbau) abbau = zeigeBrett(ziel, ctx, { code, gruppe: Number(g), rolle: 'leitung' });
  });
  return () => { zu = true; stopp(); abbau?.(); };
}

/** Das Board. Ergebnis: Abbau-Funktion. */
export function zeigeBrett(ziel, ctx, { code, gruppe, rolle }) {
  const { store } = ctx;
  const leitung = rolle === 'leitung';
  let sitzung;                     // undefined = lädt, null = gibt es nicht
  let ich;                         // { uid, name } | null; undefined = lädt
  let mitglieder = [];
  const remote = new Map();        // id -> Element aus dem Speicher
  const empfangen = new Map();     // id -> lokale Zeit der letzten fremden Änderung
  const lokal = new Map();         // id -> { e: Element | null, bis: Zeit | Infinity }
  let stapel = neuerStapel();
  let auswahl = null;
  let ansicht = { s: 0.3, x: 0, y: 0 }, eingepasst = true;
  let abgelehnt = null;            // Stand der Sitzung, als ein Schreiben mit «abgegeben» abgelehnt wurde
  let zu = false, gebaut = false, gezeigt = '', letzteMeldung = 0, auftragOffen = true;
  let leertaste = false, schwenk = null, letzterKlick = null;
  const knoten = new Map();        // id -> { json, el }
  const bilder = erstelleBildUrls(pfad => store.tafel.bildLaden(pfad));   // Adressen der Bilder (Object-URL)
  let bilderMod = null;            // Einfügen und Sticker, entsteht mit dem Board
  let zeiger = null;               // letzte Mausposition über dem Board (Bildschirm), sonst null
  const timer = new Set();
  const medien = matchMedia(NUR_ANSEHEN);
  let nurAnsehen = medien.matches;

  const sprache = () => (sitzung && sitzung.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);

  // ---------- Zustand ----------
  function elemente() {
    const liste = [];
    for (const [id, e] of remote) if (!lokal.has(id)) liste.push(e);
    for (const { e } of lokal.values()) if (e) liste.push(e);
    return liste;
  }
  const element = id => (lokal.has(id) ? lokal.get(id).e : remote.get(id) ?? null);

  function modus() {
    if (nurAnsehen) return { schreib: false, hinweis: T('brett.laptop') };
    if (!sitzung || !ich) return { schreib: false, hinweis: '' };
    if (leitung) return { schreib: true, hinweis: '' };
    if (sitzung.status !== 'offen') return { schreib: false, hinweis: T('brett.beendet') };
    if ((sitzung.gesperrt || []).includes(gruppe) || (abgelehnt !== null && abgelehnt === JSON.stringify(sitzung))) {
      return { schreib: false, hinweis: T('brett.abgegeben') };
    }
    return { schreib: true, hinweis: '' };
  }
  const schreibbar = () => !zu && modus().schreib;

  // ---------- Speicher ----------
  function fehlgeschlagen(err, id) {
    if (id) lokal.delete(id);
    if (err && err.code === 'abgegeben') {
      const neu = abgelehnt === null;
      abgelehnt = JSON.stringify(sitzung);
      if (neu) meldung(fehlerText(sprache(), err));
      werkzeuge.abbrechen();
      lokal.clear();
      aktualisiereModus();
    } else if (Date.now() - letzteMeldung > 3000) {
      letzteMeldung = Date.now();
      meldung(fehlerText(sprache(), err));
    }
    zeichne();
  }

  const ohneBearbeitung = e => ({ ...e, bearbeitet: null });
  function warteAufEcho(id, e) {
    lokal.set(id, { e, bis: Date.now() + ECHO_MS });
    const nr = setTimeout(() => { timer.delete(nr); const o = lokal.get(id); if (o && o.bis <= Date.now()) { lokal.delete(id); zeichne(); } }, ECHO_MS + 50);
    timer.add(nr);
  }
  const roh = {
    speichern: e => store.tafel.elementSpeichern(code, e).catch(err => fehlgeschlagen(err, e.id)),
    loeschen: e => store.tafel.elementLoeschen(code, { id: e.id, gruppe: e.gruppe }).catch(err => fehlgeschlagen(err, e.id)),
  };
  const drossel = erstelleDrossel(e => { if (schreibbar()) roh.speichern({ ...e, bearbeitet: { uid: ich.uid, name: ich.name } }); }, DROSSEL_MS);

  /** Endgültig speichern (bearbeitet: null). vorher !== undefined: als Schritt für Rückgängig merken. */
  function speichern(e, vorher) {
    drossel.abbrechen();
    if (!schreibbar()) return;
    const nachher = ohneBearbeitung(e);
    if (vorher !== undefined) stapel = merke(stapel, { vorher: vorher && ohneBearbeitung(vorher), nachher });
    warteAufEcho(nachher.id, nachher);
    zeichne();
    roh.speichern(nachher);
  }
  /** Ein Bild lässt sich nach dem Löschen nicht zurückholen (die Datei ist weg): Rückfrage, kein Schritt für Rückgängig. */
  async function bildLoeschen(e) {
    if (!schreibbar() || !(await rueckfrage(sprache(), T('bild.loeschenFrage'), T('brett.loeschen')))) return;
    if (!schreibbar() || !element(e.id)) return;
    const ohne = s => s.vorher?.id !== e.id && s.nachher?.id !== e.id;
    stapel = { zurueck: stapel.zurueck.filter(ohne), vor: stapel.vor.filter(ohne) };
    loeschenDirekt(e, false);
  }
  const loeschen = e => (e.art === 'bild' ? bildLoeschen(e) : loeschenDirekt(e));
  function loeschenDirekt(e, merken = true) {
    drossel.abbrechen();
    if (!schreibbar()) return;
    if (merken) stapel = merke(stapel, { vorher: ohneBearbeitung(e), nachher: null });
    if (auswahl === e.id) auswahl = null;
    warteAufEcho(e.id, null);
    zeichne();
    roh.loeschen(e);
  }
  function wende(schritt) {
    if (!schritt) return;
    werkzeuge.abbrechen();
    if (schritt.nachher && schritt.nachher.art === 'bild' && !element(schritt.nachher.id)) return;   // das Bild ist inzwischen gelöscht
    if (schritt.nachher) { warteAufEcho(schritt.nachher.id, schritt.nachher); roh.speichern(schritt.nachher); }
    else if (schritt.vorher) { if (auswahl === schritt.vorher.id) auswahl = null; warteAufEcho(schritt.vorher.id, null); roh.loeschen(schritt.vorher); }
    zeichne();
  }
  function zurueck() { if (!schreibbar()) return; const r = rueckgaengig(stapel); if (r) { stapel = r.stapel; wende(r.schritt); } }
  function vor() { if (!schreibbar()) return; const r = wiederholen(stapel); if (r) { stapel = r.stapel; wende(r.schritt); } }

  function elementeKommen(liste) {
    const jetzt = Date.now();
    const neu = new Map(liste.filter(e => e && e.gruppe === gruppe).map(e => [e.id, e]));
    for (const [id, e] of neu) if (!gleicheElemente(remote.get(id), e)) empfangen.set(id, jetzt);
    remote.clear();
    for (const [id, e] of neu) remote.set(id, e);
    for (const [id, o] of lokal) {
      if (o.bis === Infinity) continue;
      const r = remote.get(id);
      if (o.e === null ? !r : r && gleicheElemente(r, o.e)) lokal.delete(id);
    }
    if (auswahl && !element(auswahl)) auswahl = null;
    zeichne();
  }

  // ---------- Ansicht ----------
  let buehne, welt, ebene, oben, editorEbene, hinweisEl, prozentEl, kopfEl, leisteEl, auftragEl;
  const groesseWelt = () => ({ b: parseFloat(welt.style.width), h: parseFloat(welt.style.height) });
  function setzeAnsicht(a, manuell = true) {
    ansicht = a;
    if (manuell) eingepasst = false;
    welt.style.transform = `translate(${a.x}px, ${a.y}px) scale(${a.s})`;
    prozentEl.textContent = Math.round(a.s * 100) + ' %';
    zeichneOben();
  }
  function passeEin() {
    const w = groesseWelt();
    setzeAnsicht(einpassen(buehne.clientWidth, buehne.clientHeight, w.b, w.h), false);
    eingepasst = true;
  }
  const mitte = () => [buehne.clientWidth / 2, buehne.clientHeight / 2];
  const zoomeUm = (faktor, px, py) => setzeAnsicht(zoome(ansicht, faktor, px, py));
  function brettPunkt(ev) {
    const r = buehne.getBoundingClientRect();
    return zuBrett(ansicht, ev.clientX - r.left, ev.clientY - r.top);
  }

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
    for (const e of reihenfolge(elemente())) {
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
    zeichneOben();
    werkzeuge.aktualisiere();
  }

  /** Auswahlrahmen und fremde Rahmen; die Masse bleiben am Bildschirm gleich gross. */
  function zeichneOben() {
    if (!gebaut) return;
    const s = ansicht.s, jetzt = Date.now();
    const teile = [];
    const rahmen = (e, klasse, rand) => {
      const el = h('div', { class: klasse });
      el.style.left = (e.x - rand) + 'px'; el.style.top = (e.y - rand) + 'px';
      el.style.width = ((e.b || 0) + 2 * rand) + 'px'; el.style.height = ((e.h || 0) + 2 * rand) + 'px';
      el.style.borderWidth = (2 / s) + 'px';
      return el;
    };
    for (const e of elemente()) {
      if (!ich || !istFremdBearbeitet(e, ich.uid, empfangen.get(e.id) ?? 0, jetzt)) continue;
      const el = rahmen(e, 'tb-fremd', 4 / s);
      const name = h('span', { class: 'tb-fremdname' }, e.bearbeitet.name || '?');
      name.style.fontSize = (12 / s) + 'px';
      el.append(name);
      teile.push(el);
    }
    const a = auswahl && element(auswahl);
    if (a && schreibbar()) {
      const el = rahmen(a, 'tb-auswahl', 6 / s);
      const griff = h('span', { class: 'tb-griff' });
      const g = 14 / s;
      griff.style.width = griff.style.height = g + 'px';
      griff.style.borderWidth = (2 / s) + 'px';
      griff.style.right = griff.style.bottom = (-g / 2) + 'px';
      el.append(griff);
      teile.push(el);
    }
    oben.replaceChildren(...teile);
  }

  // Leitung: Mitglied entfernen (mit Rückfrage) und eine abgegebene Gruppe wieder öffnen.
  async function entferne(m) {
    if (!(await rueckfrage(sprache(), T('brett.entfernenFrage', { name: m.name }), T('brett.entfernen')))) return;
    try { await store.tafel.mitgliedEntfernen(code, m.uid); } catch (e) { meldung(fehlerText(sprache(), e)); }
  }
  async function wiederOeffnen() {
    try { await store.tafel.aktualisieren(code, { gesperrt: ohneSperre(sitzung, gruppe) }); } catch (e) { meldung(fehlerText(sprache(), e)); }
  }
  // Studierende: die Gruppe gibt ab. Danach gilt sie als gesperrt, das Board ist nur noch zum Ansehen da.
  async function abgeben() {
    if (!schreibbar()) return;
    werkzeuge.beendeBearbeitung();   // ein Text in Arbeit wird noch gespeichert, solange die Rückfrage offen ist
    if (!(await rueckfrage(sprache(), T('brett.abgebenFrage'), T('brett.abgeben')))) return;
    if (zu || !schreibbar()) return;
    try { await store.tafel.abgeben(code); } catch (e) { meldung(fehlerText(sprache(), e)); }
  }
  // «HTML» liefert Task 10 über den Haken ctx.exportHtml(code, gruppe): eine Zahl = nur diese Gruppe, null = alle (nur die Leitung,
  // in der Übersicht). Ein abgelehntes Versprechen erscheint als Meldung. Ohne den Haken bleibt der Knopf ausgeschaltet.
  const exportiere = g => { try { Promise.resolve(ctx.exportHtml(code, g)).catch(e => meldung(fehlerText(sprache(), e))); } catch (e) { meldung(fehlerText(sprache(), e)); } };
  const htmlKnopf = (text, g) => (typeof ctx.exportHtml === 'function'
    ? h('button', { type: 'button', class: 'tbr-knopf', onclick: () => exportiere(g) }, text)
    : h('button', { type: 'button', class: 'tbr-knopf', disabled: true, title: T('brett.spaeter') }, text));

  function zeichneKopf() {
    if (!gebaut || !sitzung) return;
    const jetzt = store.jetzt ? store.jetzt() : Date.now();
    const namen = [...mitglieder].sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(m => h('span', { class: 'tbr-mitglied' + (istOnline(m, jetzt) ? ' an' : '') }, m.name,
        leitung ? h('button', { type: 'button', class: 'tbr-entfernen', title: T('brett.entfernen'), 'aria-label': T('brett.entfernen') + ': ' + m.name, onclick: () => entferne(m) }, '✕') : null));
    const abgegeben = (sitzung.gesperrt || []).includes(gruppe);
    const gesperrt = abgegeben || sitzung.status !== 'offen';
    const adresse = '#/t/' + code;
    kopfEl.replaceChildren(
      h('div', { class: 'tbr-zeile' },
        leitung ? h('a', { class: 'tbr-zurueck', href: '#/tafel/' + code, title: T('brett.uebersicht') }, '‹ ', T('brett.uebersicht')) : h('b', { class: 'tbr-marke' }, marke()),
        h('h1', { class: 'tbr-titel' }, sitzung.titel || T('tb.titel')),
        h('span', { class: 'tbr-gruppe' }, sitzung.gruppen[gruppe] ?? ''),
        gesperrt ? h('span', { class: 'tbr-stand' }, sitzung.status !== 'offen' ? T('brett.beendetKurz') : T('brett.abgegebenKurz')) : null,
        h('span', { class: 'tbr-platz' }),
        leitung && abgegeben ? h('button', { type: 'button', class: 'tbr-knopf', onclick: wiederOeffnen }, T('brett.wiederOeffnen')) : null,
        !leitung && schreibbar() ? h('button', { type: 'button', class: 'tbr-knopf', onclick: abgeben }, T('brett.abgeben')) : null,
        !leitung && abgegeben && sitzung.status === 'offen' ? [
          h('a', { class: 'tbr-knopf', href: adresse + '/druck' }, T('brett.pdf')),
          htmlKnopf(T('brett.html'), gruppe),
          h('a', { class: 'tbr-knopf', href: adresse + '/zeigen' }, T('brett.praesentieren')),
        ] : null,
        sitzung.auftrag ? h('button', { class: 'tbr-auftragknopf', 'aria-expanded': String(auftragOffen), onclick: () => { auftragOffen = !auftragOffen; zeichneKopf(); } },
          T('brett.auftrag'), auftragOffen ? ' ▴' : ' ▾') : null),
      h('div', { class: 'tbr-mitglieder', 'aria-label': T('brett.mitglieder') }, namen.length ? namen : h('span', { class: 'tbr-mitglied' }, T('brett.keineMitglieder'))));
    auftragEl.hidden = !sitzung.auftrag || !auftragOffen;
    auftragEl.textContent = sitzung.auftrag || '';
  }

  function aktualisiereModus() {
    if (!gebaut) return;
    const m = modus();
    if (!m.schreib) { werkzeuge.abbrechen(); bilderMod?.schliessen(); auswahl = null; }
    leisteEl.hidden = !m.schreib;
    hinweisEl.hidden = !m.hinweis;
    hinweisEl.textContent = m.hinweis;
    buehne.classList.toggle('nur-ansehen', !m.schreib);
    zeichneKopf();
    zeichneOben();
  }

  // ---------- Bedienung ----------
  function unten(ev) {
    if (ev.target.closest('.tb-editor, .tbr-zoom, .tbs-wahl')) return;
    const warOffen = werkzeuge.beendeBearbeitung();
    if (ev.button !== 0 && ev.button !== 1) return;
    ev.preventDefault();
    document.activeElement?.blur?.();
    try { buehne.setPointerCapture(ev.pointerId); } catch { /* Zeiger schon weg */ }
    if (ev.button === 1 || leertaste || !schreibbar()) { starteSchwenk(ev); return; }
    const p = brettPunkt(ev), jetzt = Date.now();
    const doppelt = letzterKlick && jetzt - letzterKlick.t < 400 && Math.hypot(ev.clientX - letzterKlick.x, ev.clientY - letzterKlick.y) < 6;
    letzterKlick = doppelt ? null : { t: jetzt, x: ev.clientX, y: ev.clientY };
    if (doppelt && werkzeuge.doppel(p)) return;
    werkzeuge.unten(ev, p, warOffen);
  }
  function starteSchwenk(ev) { schwenk = { x: ev.clientX, y: ev.clientY, a: ansicht }; buehne.classList.add('schwenkt'); }
  function bewege(ev) {
    zeiger = { x: ev.clientX, y: ev.clientY };
    if (schwenk) { setzeAnsicht({ ...schwenk.a, x: schwenk.a.x + ev.clientX - schwenk.x, y: schwenk.a.y + ev.clientY - schwenk.y }); return; }
    werkzeuge.ziehen(ev, brettPunkt(ev));
  }
  function loslassen(ev) {
    if (schwenk) { schwenk = null; buehne.classList.remove('schwenkt'); return; }
    werkzeuge.los(ev, brettPunkt(ev));
  }
  /** Mitte der Ansicht in Board-Einheiten. */
  const mittePunkt = () => zuBrett(ansicht, ...mitte());
  /** Wo die Maus zuletzt über dem Board war (Board-Einheiten), sonst die Mitte der Ansicht. */
  const zeigerPunkt = () => (zeiger ? brettPunkt({ clientX: zeiger.x, clientY: zeiger.y }) : mittePunkt());
  const dateienIn = dt => (dt ? [...(dt.files || [])] : []);
  const hatDateien = dt => !!dt && [...(dt.types || [])].includes('Files');

  /** Strg+V: Bilder (auch mehrere) werden hochgeladen, Text ohne Bild wird ein Textfeld an der Maus. */
  function einfuegen(ev) {
    if (zu || !gebaut || !schreibbar()) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    const cd = ev.clipboardData;
    if (!cd) return;
    let dateien = dateienIn(cd);
    if (!dateien.length) dateien = [...(cd.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    const p = zeigerPunkt();
    if (dateien.length) { ev.preventDefault(); bilderMod.einfuegen(dateien, p); return; }
    const text = cd.getData('text/plain') || '';
    if (!text.trim()) return;
    ev.preventDefault();
    const id = werkzeuge.textEinfuegen(text, p);
    api.platziert(id);
  }
  const dateiUeber = ev => { if (hatDateien(ev.dataTransfer)) { ev.preventDefault(); if (ev.type === 'dragover') ev.dataTransfer.dropEffect = schreibbar() ? 'copy' : 'none'; } };
  function dateiFallen(ev) {
    if (!hatDateien(ev.dataTransfer)) return;
    ev.preventDefault();
    buehne?.classList.remove('datei-drueber');
    if (ev.target.closest?.('.tbr-buehne') && schreibbar()) bilderMod.einfuegen(dateienIn(ev.dataTransfer), brettPunkt(ev));
  }
  function rad(ev) {
    if (ev.target.closest?.('.tbs-wahl')) return;   // das Auswahlfenster der Sticker scrollt selbst
    ev.preventDefault();
    const r = buehne.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) zoomeUm(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    else setzeAnsicht({ ...ansicht, x: ansicht.x - ev.deltaX, y: ansicht.y - ev.deltaY });
  }
  function taste(ev) {
    if (zu || !gebaut) return;
    const ziel = ev.target;
    if (ziel.closest?.('input, textarea, select, dialog, [contenteditable]') || document.querySelector('dialog[open]')) return;
    const strg = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (strg && k === 'z' && !ev.shiftKey) { ev.preventDefault(); zurueck(); }
    else if (strg && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); vor(); }
    else if (ev.key === ' ') { ev.preventDefault(); if (!leertaste) { leertaste = true; buehne.classList.add('leertaste'); } }
    else if (!strg && werkzeuge.taste(ev)) ev.preventDefault();
  }
  function tasteLos(ev) { if (ev.key === ' ') { leertaste = false; buehne.classList.remove('leertaste'); } }
  const blur = () => { leertaste = false; buehne?.classList.remove('leertaste'); };

  // ---------- Aufbau ----------
  const api = {
    T, gruppe, element, elemente, schreibbar, speichern, loeschen, zeichne, zurueck, vor,
    ich: () => ich,
    massstab: () => ansicht.s,
    auswahl: () => auswahl,
    kann: () => ({ zurueck: stapel.zurueck.length > 0, vor: stapel.vor.length > 0 }),
    markiere(name) { if (buehne) buehne.dataset.werkzeug = name; },
    waehle(id) { auswahl = id; zeichneOben(); werkzeuge.aktualisiere(); },
    vorschau(e) { lokal.set(e.id, { e, bis: Infinity }); zeichne(); },
    verwerfen(id) { if (lokal.get(id)?.bis === Infinity) lokal.delete(id); zeichne(); },
    zwischenspeichern: e => drossel.rufe(e),
    /** Nach Abbruch: den letzten Stand still festhalten, ohne Schritt und ohne Meldung. */
    stillSpeichern(e) { drossel.abbrechen(); if (schreibbar()) store.tafel.elementSpeichern(code, ohneBearbeitung(e)).catch(() => {}); },
    neueKennung: () => neueKennung(Date.now(), zufallsKennung),
    code,
    /** Neues Element mit Kennung, Gruppe, Ebene ganz vorn und Urheber. */
    neu(art, felder) {
      return { id: api.neueKennung(), gruppe, art, z: zVorn(elemente()), von: ich.uid, vonName: ich.name, bearbeitet: null, ...felder };
    },
    mitte: mittePunkt,
    get buehne() { return buehne; },
    get bilder() { return bilderMod; },
    bildHochladen: (e, blob) => store.tafel.bildHochladen(code, e, blob),
    zaehlerBeobachten: cb => store.tafel.zaehlerBeobachten(code, gruppe, cb),
    /** Ein hochgeladenes Bild bleibt als lokaler Stand stehen, bis der Speicher es meldet. */
    echo(e) { if (!zu) { warteAufEcho(e.id, e); zeichne(); } },
    fehlgeschlagen,
    /** Ein neues Element ist gelegt: Auswählen-Werkzeug, Element gewählt. */
    platziert(id) { werkzeuge.waehle('auswaehlen'); api.waehle(id); },
    starteSchwenk,
    /** Höhe des Inhalts eines Text- oder Zettel-Elements in Board-Einheiten. */
    messe(e) {
      const el = zeichneElement({ ...e, h: 1 });
      el.style.height = 'auto'; el.style.visibility = 'hidden';
      ebene.append(el);
      const hoehe = el.offsetHeight;
      el.remove();
      return hoehe;
    },
    get editorEbene() { return editorEbene; },
  };
  // Die Leiste entsteht erst mit der Sitzung (in deren Sprache); bis dahin tun die Werkzeuge nichts.
  const LEER = { leiste: null, aktualisiere() {}, abbrechen() {}, beendeBearbeitung: () => false, unten() {}, ziehen() {}, los() {}, doppel: () => false, taste: () => false };
  let werkzeuge = LEER;

  function baue() {
    const w = zeichneWelt(sitzung.zonen);
    welt = w.welt; ebene = w.ebene;
    oben = h('div', { class: 'tb-oben' });
    editorEbene = h('div', { class: 'tb-oben tb-editorebene' });
    welt.append(oben, editorEbene);
    hinweisEl = h('div', { class: 'tbr-hinweis', role: 'status', hidden: true });
    prozentEl = h('span', { class: 'tbr-prozent' });
    const zoomKnopf = (text, titel, f) => h('button', { type: 'button', class: 'tbr-zk', title: titel, 'aria-label': titel, onclick: f }, text);
    buehne = h('div', { class: 'tbr-buehne' }, welt, hinweisEl,
      h('div', { class: 'tbr-zoom' },
        zoomKnopf('−', T('brett.kleiner'), () => zoomeUm(1 / 1.25, ...mitte())), prozentEl,
        zoomKnopf('+', T('brett.groesser'), () => zoomeUm(1.25, ...mitte())),
        zoomKnopf(T('brett.einpassen'), T('brett.einpassen'), passeEin)));
    kopfEl = h('header', { class: 'tbr-kopf' });
    auftragEl = h('div', { class: 'tbr-auftrag' });
    bilderMod = erstelleBilder(api);
    werkzeuge = erstelleWerkzeuge(api);
    leisteEl = werkzeuge.leiste;
    ziel.replaceChildren(h('div', { class: 'tbr' }, kopfEl, auftragEl, leisteEl, buehne));
    buehne.addEventListener('pointerdown', unten);
    buehne.addEventListener('pointermove', bewege);
    buehne.addEventListener('pointerup', loslassen);
    buehne.addEventListener('pointercancel', loslassen);
    buehne.addEventListener('wheel', rad, { passive: false });
    buehne.addEventListener('auxclick', ev => ev.preventDefault());
    buehne.addEventListener('pointerleave', () => { zeiger = null; });
    buehne.addEventListener('dragover', ev => { dateiUeber(ev); if (hatDateien(ev.dataTransfer) && schreibbar()) buehne.classList.add('datei-drueber'); });
    buehne.addEventListener('dragleave', ev => { if (!buehne.contains(ev.relatedTarget)) buehne.classList.remove('datei-drueber'); });
    buehne.addEventListener('scroll', () => { buehne.scrollTop = 0; buehne.scrollLeft = 0; });
    const beobachter = new ResizeObserver(() => { if (eingepasst) passeEin(); });
    beobachter.observe(buehne);
    aufraeumen.push(() => beobachter.disconnect());
    gebaut = true;
    zeichneKopf();
    passeEin();
    aktualisiereModus();
    zeichne();
  }

  function zustand() {
    if (zu) return;
    let kennung = 'laedt';
    if (sitzung === null) kennung = 'weg';
    else if (sitzung && !(gruppe >= 0 && gruppe < sitzung.gruppen.length)) kennung = 'weg';
    else if (sitzung && leitung && ich && sitzung.hostUid !== ich.uid) kennung = 'fremd';
    else if (sitzung && ich !== undefined) kennung = 'bereit';
    if (kennung === gezeigt) {
      if (kennung === 'bereit') aktualisiereModus();
      return;
    }
    if (gezeigt === 'bereit') { werkzeuge.abbrechen(); bilderMod?.abbau(); bilderMod = null; werkzeuge = LEER; gebaut = false; knoten.clear(); }
    gezeigt = kennung;
    if (kennung === 'bereit') { baue(); return; }
    const text = kennung === 'laedt' ? T('allg.laedt') : kennung === 'fremd' ? T('brett.fremd') : T('brett.weg');
    ziel.replaceChildren(h('div', { class: 'tbr-leer' }, h('p', null, text),
      kennung === 'laedt' ? null : h('a', { class: 'knopf leise', href: leitung ? '#/studio' : '#/' }, T('ende.zurueck'))));
  }

  // ---------- Beobachten ----------
  const aufraeumen = [];
  const sicher = f => { try { return f(); } catch (e) { console.warn('rabiosa:', e); return () => {}; } };
  aufraeumen.push(sicher(() => store.tafel.beobachten(code, s => {
    if (s === undefined) return;
    sitzung = s;
    if (abgelehnt !== null && abgelehnt !== JSON.stringify(s)) abgelehnt = null;   // neuer Stand: die Sitzung entscheidet
    document.documentElement.lang = sprache();
    zustand();
  })));
  aufraeumen.push(sicher(() => (leitung
    ? store.konto.beobachten(k => { ich = k ? { uid: k.uid, name: kurzname(k.name) || kurzname(String(k.email || '').split('@')[0]) || '?' } : null; zustand(); })
    : store.tafel.ichBeobachten(code, m => { ich = m ? { uid: m.uid, name: m.name } : null; zustand(); }))));
  aufraeumen.push(sicher(() => store.tafel.mitgliederBeobachten(code, gruppe, liste => { mitglieder = Array.isArray(liste) ? liste : []; zeichneKopf(); })));
  aufraeumen.push(sicher(() => store.tafel.elementeBeobachten(code, gruppe, liste => elementeKommen(Array.isArray(liste) ? liste : []))));

  const lebenszeichen = () => { store.tafel.lebenszeichen(code).catch(() => {}); zeichneKopf(); };
  lebenszeichen();
  const puls = setInterval(lebenszeichen, LEBENSZEICHEN_MS);
  // Fremde Rahmen verschwinden, wenn lange nichts mehr kommt (Laptop zugeklappt mitten im Ziehen).
  const frische = setInterval(() => { if (elemente().some(e => e.bearbeitet)) zeichneOben(); }, FREMD_MS / 4);
  const medienWechsel = () => { nurAnsehen = medien.matches; aktualisiereModus(); };
  medien.addEventListener('change', medienWechsel);
  document.addEventListener('keydown', taste);
  document.addEventListener('keyup', tasteLos);
  document.addEventListener('paste', einfuegen);
  document.addEventListener('dragover', dateiUeber);   // eine daneben fallende Datei soll die Seite nicht verlassen
  document.addEventListener('drop', dateiFallen);
  window.addEventListener('blur', blur);
  zustand();

  return () => {
    if (zu) return;
    werkzeuge.abbrechen();
    zu = true;
    drossel.abbrechen();
    clearInterval(puls); clearInterval(frische);
    for (const nr of timer) clearTimeout(nr);
    medien.removeEventListener('change', medienWechsel);
    document.removeEventListener('keydown', taste);
    document.removeEventListener('keyup', tasteLos);
    document.removeEventListener('paste', einfuegen);
    document.removeEventListener('dragover', dateiUeber);
    document.removeEventListener('drop', dateiFallen);
    window.removeEventListener('blur', blur);
    bilderMod?.abbau(); bilderMod = null;
    bilder.freigeben();
    for (const f of aufraeumen) { try { f(); } catch { /* schon weg */ } }
  };
}
