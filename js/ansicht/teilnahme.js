// Handy in einer Präsentation: ohne Namen und ohne Avatar beitreten, pro Folie einmal antworten.
// Adresse #/p/123456. Wer den Code auf der Startseite eintippt, kommt über spieler.js hierher.
import { h, marke, BUCHSTABEN } from '../ui.js';
import { t } from '../i18n.js';
import { zufallsKennung } from '../store/gemeinsam.js';
import { istNeuerStand, istGeschlossen, istInteraktiv, OFFEN_MAX, WORT_MAX, PUNKTE_SUMME } from '../logik/praesentation.js';
import { sollNachsehen, nachsehTakt, vertrauen, SCHULD_START } from '../logik/waechter.js';
import { inhaltText } from './folien.js';

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  // Im Demo-Modus pro Fenster eine eigene Person (mehrere Fenster = mehrere Handys).
  const lager = ctx.demo ? sessionStorage : localStorage;
  const lagerName = 'rabiosa-teilnahme:' + code;
  let ich = null;
  try { ich = JSON.parse(lager.getItem(lagerName)); } catch { /* neu */ }
  let spiel;                                  // undefined = lädt, null = gibt es nicht (mehr)
  let hatteSpiel = false, beigetreten = false, beitrittFehler = null, sendet = false, gezeichnet = '', zu = false;

  const sprache = () => (spiel && spiel.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const merke = () => { try { lager.setItem(lagerName, JSON.stringify(ich)); } catch { /* voll oder gesperrt */ } };
  const codeText = code.slice(0, 3) + ' ' + code.slice(3);
  const seite = (rechts, ...inhalt) => h('div', { class: 'handy' },
    h('header', { class: 'h-kopf' }, h('b', null, marke()), h('span', null, rechts)), h('div', { class: 'h-in' }, inhalt));
  const mitte = (...inhalt) => h('div', { class: 'mitte' }, inhalt);

  async function beitreten() {
    if (beigetreten || !spiel) return;
    // Ausweis aus einem früheren Spiel mit zufällig gleichem Code: neu anfangen.
    if (ich && typeof ich.erstellt === 'number' && typeof spiel.erstellt === 'number' && Math.abs(ich.erstellt - spiel.erstellt) > 1000) ich = null;
    ich ??= { schluessel: zufallsKennung(24), pid: zufallsKennung(10), gesendet: {} };
    ich.erstellt = spiel.erstellt ?? null;
    beigetreten = true;
    try {
      await store.spiel.beitreten(code, { schluessel: ich.schluessel, pid: ich.pid, name: '', avatar: {} });
      beitrittFehler = null;
      merke();
    } catch (e) {
      beigetreten = false;
      beitrittFehler = e.code === 'nichtGefunden' ? 'start.codeFalsch' : 'fehler.netz';
    }
    zeichne(true);
  }

  // ---------- Antworten ----------
  async function sende(wert, hinweis, knoepfe) {
    if (sendet) return;
    sendet = true;
    knoepfe.forEach(k => { k.disabled = true; });
    const n = spiel.folie.nr;
    try {
      await store.spiel.antworten(code, n, ich.schluessel, wert);
    } catch (e) {
      if (e.code !== 'schonGeantwortet') {
        sendet = false;
        knoepfe.forEach(k => { k.disabled = false; });
        hinweis.textContent = T('frage.fehler');
        return;
      }
    }
    sendet = false;
    ich.gesendet = { ...ich.gesendet, [n]: true };
    merke();
    try { navigator.vibrate?.(60); } catch { /* nicht überall erlaubt */ }
    zeichne(true);
  }

  function sendeKnopf(hinweis, holeWert, bereit = true) {
    const k = h('button', { class: 'knopf gross', type: 'button', disabled: !bereit }, T('frage.senden'));
    k.addEventListener('click', () => { const w = holeWert(); if (w !== undefined) sende(w, hinweis, [k]); });
    return k;
  }

  function eingabe(f) {
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    if (f.typ === 'abstimmung' && !f.mehrere) {
      const knoepfe = f.antworten.map((text, i) => h('button', { type: 'button', class: 'h-a a' + (i + 1) }, h('i', null, BUCHSTABEN[i]), h('span', null, text)));
      knoepfe.forEach((k, i) => k.addEventListener('click', () => sende(i, hinweis, knoepfe)));
      return [knoepfe, hinweis];
    }
    if (f.typ === 'abstimmung') {
      const gewaehlt = new Set();
      const knopf = sendeKnopf(hinweis, () => [...gewaehlt].sort((a, b) => a - b), false);
      const knoepfe = f.antworten.map((text, i) => {
        const k = h('button', { type: 'button', class: 'h-a wahl a' + (i + 1), 'aria-pressed': 'false' }, h('i', null, BUCHSTABEN[i]), h('span', null, text));
        k.addEventListener('click', () => {
          if (gewaehlt.has(i)) gewaehlt.delete(i); else gewaehlt.add(i);
          k.classList.toggle('an', gewaehlt.has(i));
          k.setAttribute('aria-pressed', String(gewaehlt.has(i)));
          knopf.disabled = !gewaehlt.size;
        });
        return k;
      });
      return [h('p', { class: 'hilfe' }, T('ph.mehrere')), knoepfe, hinweis, knopf];
    }
    if (f.typ === 'wortwolke') {
      const n = f.proPerson || 1;
      const felder = Array.from({ length: n }, (_, i) => h('input', { class: 'feld', maxlength: String(WORT_MAX), autocomplete: 'off', autocapitalize: 'off',
        enterkeyhint: i < n - 1 ? 'next' : 'send', placeholder: n > 1 ? T('ph.wort', { n: i + 1 }) : T('ph.offen'), 'aria-label': T('ph.wort', { n: i + 1 }) }));
      const knopf = sendeKnopf(hinweis, () => {
        const woerter = felder.map(x => x.value.trim()).filter(Boolean);
        if (!woerter.length) { felder[0].focus(); return undefined; }
        return woerter;
      });
      felder.forEach((x, i) => x.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); if (i < n - 1) felder[i + 1].focus(); else knopf.click(); }));
      return [h('p', { class: 'hilfe' }, n > 1 ? T('ph.woerterHilfe', { n }) : T('ph.woerterHilfe1')), h('div', { class: 'ph-woerter' }, felder), hinweis, knopf];
    }
    if (f.typ === 'skala') {
      const werte = f.aussagen.map(() => Math.round((f.min + f.max) / 2));
      const zeilen = f.aussagen.map((aussage, i) => {
        const zahl = h('b', { class: 'ph-skalawert' }, String(werte[i]));
        const regler = h('input', { type: 'range', class: 'ph-regler', min: String(f.min), max: String(f.max), step: '1', value: String(werte[i]), 'aria-label': aussage });
        regler.addEventListener('input', () => { werte[i] = Number(regler.value); zahl.textContent = regler.value; });
        return h('div', { class: 'ph-skala' },
          h('div', { class: 'ph-skalakopf' }, h('span', null, aussage), zahl), regler,
          h('div', { class: 'ph-pole' }, h('span', null, f.links || f.min), h('span', null, f.rechts || f.max)));
      });
      return [h('p', { class: 'hilfe' }, T('ph.skalaHilfe')), zeilen, hinweis, sendeKnopf(hinweis, () => [...werte])];
    }
    if (f.typ === 'offen') {
      const feld = h('textarea', { class: 'feld ph-offen', maxlength: String(OFFEN_MAX), rows: '5', placeholder: T('ph.offen'), 'aria-label': T('ph.offen') });
      const rest = h('p', { class: 'hilfe ph-rest' }, T('ph.zeichen', { n: OFFEN_MAX }));
      feld.addEventListener('input', () => { rest.textContent = T('ph.zeichen', { n: OFFEN_MAX - feld.value.length }); });
      return [feld, rest, hinweis, sendeKnopf(hinweis, () => { const w = feld.value.trim(); if (!w) { feld.focus(); return undefined; } return w; })];
    }
    if (f.typ === 'rangfolge') {
      const folge = f.elemente.map((_, i) => i);
      const liste = h('ol', { class: 'reihe' });
      const baue = () => liste.replaceChildren(...folge.map((element, platz) => {
        const schieb = (richtung, zeichen, text) => h('button', { type: 'button', class: 'pfeil', 'aria-label': text, disabled: platz + richtung < 0 || platz + richtung >= folge.length,
          onclick: () => { [folge[platz], folge[platz + richtung]] = [folge[platz + richtung], folge[platz]]; baue(); } }, zeichen);
        return h('li', null, h('span', { class: 'platz' }, platz + 1), h('span', { class: 'el' }, f.elemente[element]), schieb(-1, '▲', T('frage.hoch')), schieb(1, '▼', T('frage.runter')));
      }));
      baue();
      return [h('p', { class: 'hilfe' }, T('ph.ordnen')), liste, hinweis, sendeKnopf(hinweis, () => [...folge])];
    }
    if (f.typ === 'punkte') {
      const werte = f.elemente.map(() => 0);
      const stand = h('p', { class: 'ph-punktestand' });
      const zahlen = [];
      const knopf = sendeKnopf(hinweis, () => [...werte], false);
      const nachfuehren = () => {
        const rest = PUNKTE_SUMME - werte.reduce((s, w) => s + w, 0);
        stand.textContent = rest ? T('ph.punkteRest', { n: rest }) : T('ph.punkteFertig');
        stand.classList.toggle('fertig', rest === 0);
        werte.forEach((w, i) => { zahlen[i].textContent = String(w); });
        knopf.disabled = rest === PUNKTE_SUMME;
      };
      const aendere = (i, um) => {
        const rest = PUNKTE_SUMME - werte.reduce((s, w) => s + w, 0);
        werte[i] = Math.max(0, Math.min(werte[i] + Math.min(um, rest), PUNKTE_SUMME));
        nachfuehren();
      };
      const zeilen = f.elemente.map((element, i) => {
        zahlen[i] = h('b', { class: 'ph-punkte-zahl' }, '0');
        return h('div', { class: 'ph-punkte' },
          h('span', { class: 'el' }, element),
          h('button', { type: 'button', class: 'pfeil', 'aria-label': T('ph.weniger') + ': ' + element, onclick: () => aendere(i, -10) }, '−'),
          zahlen[i],
          h('button', { type: 'button', class: 'pfeil', 'aria-label': T('ph.mehr') + ': ' + element, onclick: () => aendere(i, 10) }, '+'));
      });
      nachfuehren();
      return [stand, zeilen, hinweis, knopf];
    }
    return [];
  }

  function folieSeite() {
    const f = spiel.folie;
    const titel = T('pb.folie', { nr: f.nr + 1, von: spiel.folieAnzahl });
    if (!istInteraktiv(f)) return seite(titel, h('div', { class: 'ph-inhalt' }, h('h2', null, f.text), inhaltText(f.inhalt)), mitte(h('p', null, T('ph.warte'))));
    if (ich.gesendet?.[f.nr]) return seite(titel, mitte(h('div', { class: 'haken' }, '✓'), h('p', { class: 'stark' }, T('ph.gesendet')), h('p', null, T('ph.warte'))));
    if (istGeschlossen(spiel, f.nr)) return seite(titel, mitte(h('p', { class: 'stark' }, T('ph.geschlossen')), h('p', null, T('ph.warte'))));
    return seite(titel, h('p', { class: 'h-frage' }, f.text), eingabe(f));
  }

  // ---------- Zeichnen ----------
  function zeichne(erzwingen = false) {
    if (zu) return;
    let kennung, baue;
    if (spiel === undefined) { kennung = 'laedt'; baue = () => seite(codeText, mitte(h('p', null, T('allg.laedt')))); }
    else if (spiel === null || spiel.status === 'ende') {
      kennung = 'weg';
      baue = () => seite(codeText, mitte(h('p', { class: 'stark' }, T(hatteSpiel ? 'ph.ende' : 'start.codeFalsch')), h('a', { class: 'knopf leise', href: '#/' }, T('ende.zurueck'))));
    }
    else if (beitrittFehler) { kennung = 'fehler:' + beitrittFehler; baue = () => seite(codeText, mitte(h('p', { class: 'stark' }, T(beitrittFehler)), h('button', { class: 'knopf leise', onclick: () => { beitrittFehler = null; beitreten(); } }, T('ph.nochmals')))); }
    else if (!beigetreten || !ich) { kennung = 'beitritt'; baue = () => seite(codeText, mitte(h('p', null, T('allg.laedt')))); }
    else if (spiel.status === 'folie' && spiel.folie) {
      const f = spiel.folie;
      kennung = `folie:${f.nr}:${spiel.stand}:${!!ich.gesendet?.[f.nr]}:${istGeschlossen(spiel, f.nr)}`;
      // Gleiche Folie, nur ein anderer Stand (z. B. Ergebnis verborgen): nicht neu zeichnen, sonst ginge Getipptes verloren.
      if (!erzwingen && gezeichnet.startsWith(`folie:${f.nr}:`) && gezeichnet.endsWith(`:${!!ich.gesendet?.[f.nr]}:${istGeschlossen(spiel, f.nr)}`)) return;
      baue = folieSeite;
    }
    else if (spiel.status === 'schluss') { kennung = 'schluss'; baue = () => seite(codeText, mitte(h('div', { class: 'haken' }, '✓'), h('p', { class: 'stark' }, T('ph.ende')))); }
    else { kennung = 'warteraum'; baue = () => seite(codeText, mitte(h('div', { class: 'haken leise' }, '✓'), h('h2', null, spiel.quizTitel || ''), h('p', { class: 'stark' }, T('warte.drin')), h('p', null, T('ph.blick')))); }
    if (!erzwingen && kennung === gezeichnet) return;
    gezeichnet = kennung;
    document.documentElement.lang = sprache();
    wurzel.replaceChildren(baue());
  }

  function uebernimm(s) {
    if (s && s.art !== 'praesentation') { location.replace('#/' + code); return; }   // ein gewöhnliches Quiz
    if (s) hatteSpiel = true;
    spiel = s;
    if (s && !beigetreten && !beitrittFehler) beitreten();
    zeichne();
  }

  // ---------- Live-Verbindung und Wächter (siehe js/logik/waechter.js) ----------
  let letzterKontakt = Date.now(), schuld = SCHULD_START;
  const stoppSpiel = store.spiel.beobachten(code, s => {
    letzterKontakt = Date.now();
    if (!istNeuerStand(s, spiel) && spiel !== undefined) return;
    if (spiel !== undefined) schuld = vertrauen(schuld, 'geliefert');
    uebernimm(s);
  });
  let letztesNachsehen = 0, geweckt = false, siehtNach = false;
  async function sieheNach() {
    if (siehtNach) return;
    siehtNach = true;
    const imTakt = !geweckt;
    geweckt = false;
    letztesNachsehen = Date.now();
    try {
      const stand = await store.spiel.nachsehen(code);
      if (!zu && istNeuerStand(stand, spiel)) {
        const erster = spiel === undefined;
        if (!erster && imTakt) schuld = vertrauen(schuld, 'verpasst');
        uebernimm(stand);
        if (!erster && !sendet) store.verbindungNeu().catch(() => {});
      }
    } catch { /* kein Netz: beim nächsten Mal */ }
    finally { siehtNach = false; letztesNachsehen = Date.now(); }
  }
  function pruefeTakt() {
    const j = Date.now();
    const offen = spiel?.status === 'folie' && spiel.folie && istInteraktiv(spiel.folie) && !ich?.gesendet?.[spiel.folie.nr];
    // Auch wer gerade antworten könnte, wartet auf die Lehrperson (sie kann jederzeit weiterblättern).
    if (sollNachsehen({ sichtbar: !document.hidden, wartet: spiel !== null && spiel?.status !== 'ende', geweckt, ohneStand: spiel === undefined,
      takt: offen ? Math.max(nachsehTakt(schuld, j - letzterKontakt), 5000) : nachsehTakt(schuld, j - letzterKontakt),
      seitKontakt: j - letzterKontakt, seitNachsehen: j - letztesNachsehen })) sieheNach();
  }
  const waechter = setInterval(pruefeTakt, 500);
  const wecke = () => { geweckt = true; };
  const weckeSeite = e => { if (e.persisted) wecke(); };
  document.addEventListener('visibilitychange', wecke);
  window.addEventListener('online', wecke);
  window.addEventListener('pageshow', weckeSeite);
  zeichne();
  pruefeTakt();

  return () => {
    zu = true;
    stoppSpiel(); clearInterval(waechter);
    document.removeEventListener('visibilitychange', wecke);
    window.removeEventListener('online', wecke);
    window.removeEventListener('pageshow', weckeSeite);
  };
}
