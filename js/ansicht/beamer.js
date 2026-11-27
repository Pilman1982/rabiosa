// Beamer und Spielleitung: läuft auf dem Laptop der Lehrperson. Sie ist der Schiedsrichter des Spiels.
import { h, svg, avatar, fluss, logo, marke, rueckfrage, meldung, fehlerText, BUCHSTABEN } from '../ui.js';
import { t, zahl } from '../i18n.js';
import { qrSvg } from '../qr.js';
import ton from '../ton.js';
import { frageStarten, auswerten, rueckblick, saubereSpieler, statistikSetzen, KULANZ_MS } from '../logik/spiel.js';
import { SERVERZEIT } from '../store/gemeinsam.js';
import { zeichneVerteilung, zeichneRueckblick } from './rueckblick.js';

const VORLAUF_S = 3;

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  let konto = null, spiel, privat = null, quiz = null;
  let spieler = [], antworten = [];
  let zustand = 'laedt';             // 'laedt' | 'bereit' | 'fremd' | 'weg' | 'fertig'
  let teil = 'aufloesung';           // innerhalb des Status «aufloesung»: 'aufloesung' | 'rangliste'
  let vorlauf = null;                // { nr, rest } während des Countdowns vor einer Frage
  let fertigerRueckblick = null;
  let stoppSpiel = null, stoppSpieler = null, stoppAntworten = null, antwortenNr = -1;
  let wertetAus = false, fruehGeplant = false, abgebaut = false, startet = false, antwortenDa = false, naechsterVersuch = 0;
  let primaer = null;                // Aktion der Leertaste
  let qrKnoten = null;
  const bilder = new Map();
  const zeiten = new Set();

  const sprache = () => (spiel && spiel.sprache) || (quiz && quiz.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const spaeter = (f, ms) => { const id = setTimeout(() => { zeiten.delete(id); if (!abgebaut) f(); }, ms); zeiten.add(id); };
  const aktive = () => saubereSpieler(spieler, privat?.gesperrt || []);
  const frageStart = () => spiel.frageStart ?? store.jetzt();
  const melde = e => meldung(fehlerText(sprache(), e));

  async function schreibe(patch, privatPatch) {
    try { await store.spiel.aktualisieren(code, patch, privatPatch); return true; } catch (e) { melde(e); return false; }
  }

  // ---------- Ablauf ----------
  function naechsteFrage() {
    if (vorlauf || startet || !quiz) return;
    const nr = spiel.frageNr + 1;
    if (nr >= quiz.fragen.length) { schreibe({ status: 'podest' }); return; }
    vorlauf = { nr, rest: VORLAUF_S };
    ton.stopp();
    zeichne();
    const zaehle = () => {
      if (!vorlauf) return;
      vorlauf.rest -= 1;
      if (vorlauf.rest > 0) { zeichne(); spaeter(zaehle, 1000); return; }
      starteFrage(nr);
    };
    spaeter(zaehle, 1000);
  }

  async function starteFrage(nr) {
    const { frage, mischung } = frageStarten(quiz, nr);
    if (mischung) privat = { ...privat, mischungen: { ...privat.mischungen, [nr]: mischung } };
    antworten = [];
    fruehGeplant = false;
    // Der Vorlauf endet vor dem Schreiben: Die Meldung über den neuen Stand kann schon vor der Bestätigung eintreffen.
    vorlauf = null;
    startet = true;
    const ok = await schreibe({ status: 'frage', frageNr: nr, frage, frageStart: SERVERZEIT, aufloesung: null }, { mischungen: privat.mischungen || {} });
    startet = false;
    if (!ok) zeichne();
  }

  /** Abonniert die Antworten neu und wartet auf die erste Meldung des Servers: keine Auswertung auf veraltetem Stand. */
  function frischeAntworten(nr) {
    return new Promise(fertig => {
      stoppAntworten?.();
      antwortenDa = false;
      antwortenNr = nr;
      let erste = true;
      stoppAntworten = store.spiel.antwortenBeobachten(code, nr, liste => {
        antworten = liste;
        antwortenDa = true;
        if (erste) { erste = false; fertig(liste); } else takt();
      });
    });
  }
  function frischeSpieler() {
    return new Promise(fertig => {
      stoppSpieler?.();
      let erste = true;
      stoppSpieler = store.spiel.spielerBeobachten(code, liste => {
        spieler = liste;
        if (erste) { erste = false; fertig(liste); return; }
        if (zustand !== 'bereit') return;
        if (spiel && spiel.status === 'warteraum' && !vorlauf) zeichne(); else takt();
      });
    });
  }

  async function aufloesen() {
    if (wertetAus || !spiel || spiel.status !== 'frage' || Date.now() < naechsterVersuch) return;
    wertetAus = true;
    const nr = spiel.frageNr;
    try {
      // Frischer Stand vom Server: Antworten, Spieler und der private Teil (falls ein zweites Beamer-Fenster offen ist).
      const [frisch, , privatNeu] = await Promise.all([frischeAntworten(nr), frischeSpieler(), store.spiel.privatLaden(code)]);
      if (abgebaut || !spiel || spiel.status !== 'frage' || spiel.frageNr !== nr) return;
      privat = { ...privat, ...privatNeu };
      const ergebnis = auswerten({ frage: quiz.fragen[nr], mischung: (privat.mischungen || {})[nr] || null, spieler: aktive(),
        antworten: frisch, frageStart: frageStart(), rangVorher: spiel.rangliste });
      const statistik = statistikSetzen(privat.statistik, nr, { ...ergebnis.statistik, aufloesung: ergebnis.aufloesung });
      teil = 'aufloesung';
      await store.spiel.aktualisieren(code, { status: 'aufloesung', aufloesung: ergebnis.aufloesung, rangliste: ergebnis.rangliste }, { statistik });
      privat = { ...privat, statistik };
      ton.spiele('gong');
    } catch (e) {
      console.error(e);
      naechsterVersuch = Date.now() + 5000;   // nicht im Zehntelsekundentakt wiederholen
      melde(e);
    } finally {
      wertetAus = false;
    }
  }

  async function abschliessen(mitRueckblick) {
    if (zustand === 'fertig') return;
    const statistik = privat?.statistik || [];
    const rb = statistik.length ? rueckblick(quiz, statistik, aktive().length, store.jetzt()) : null;
    zustand = 'fertig';
    ton.stopp();
    try { localStorage.removeItem('rabiosa-laufend'); } catch { /* ohne Speicher */ }
    try {
      if (rb) await store.rueckblick.speichern(rb);
      await store.spiel.aktualisieren(code, { status: 'ende' });
      await store.spiel.beenden(code);
    } catch (e) { melde(e); }
    if (mitRueckblick && rb) { fertigerRueckblick = rb; zeichne(); } else ctx.geh('#/studio');
  }

  async function entferne(s) {
    if (!await rueckfrage(sprache(), T('beamer.entfernen', { name: s.name }), T('beamer.entfernenJa'))) return;
    privat = { ...privat, gesperrt: [...(privat.gesperrt || []), s.schluessel] };
    try {
      await store.spiel.spielerEntfernen(code, s.schluessel);
      await store.spiel.aktualisieren(code, {}, { gesperrt: privat.gesperrt });
    } catch (e) { melde(e); }
    zeichne();
  }

  // ---------- Bausteine ----------
  function werkzeug() {
    // Nach dem Klick den Fokus abgeben: Sonst löst die Leertaste diesen Knopf aus statt «Weiter».
    const knopf = (zeichen, titel, klick) => h('button', { class: 'wz', title: titel, 'aria-label': titel, onclick: e => { e.currentTarget.blur(); klick(); } }, zeichen);
    const regler = h('input', { class: 'lautregler', type: 'range', min: '5', max: '100', step: '5', value: String(Math.round(ton.laut * 100)), title: T('beamer.lautstaerke'), 'aria-label': T('beamer.lautstaerke') });
    regler.addEventListener('input', () => { ton.laut = Number(regler.value) / 100; });
    regler.addEventListener('change', () => regler.blur());
    return h('div', { class: 'werkzeug' },
      ton.stumm ? null : regler,
      knopf(ton.stumm ? '🔇' : '🔊', T(ton.stumm ? 'beamer.tonAn' : 'beamer.tonAus'), () => { ton.stumm = !ton.stumm; zeichne(); }),
      knopf('⛶', T('beamer.vollbild'), () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }),
      zustand === 'bereit' ? knopf('✕', T('beamer.beenden'), async () => { if (await rueckfrage(sprache(), T('beamer.beendenFrage'), T('beamer.beenden'))) abschliessen(false); }) : null);
  }

  function haupt(text, aktion, frei = true) {
    primaer = frei ? aktion : null;
    return h('div', { class: 'hauptknopf' },
      h('span', { class: 'tastenhinweis' }, T('beamer.leertaste')),
      h('button', { class: 'start', disabled: !frei, onclick: aktion }, text));
  }

  const buehne = (klasse, ...inhalt) => h('div', { class: 'beamerseite ' + klasse }, h('div', { class: 'buehne' }, werkzeug(), inhalt));
  const kopfzeile = () => {
    const f = spiel.frage;
    return h('div', { class: 'fr-kopf' }, h('span', null, T('frage.nummer', { nr: f.nr + 1, von: spiel.frageAnzahl }), ' · ', T('typ.' + f.typ)));
  };

  function warteraum() {
    const liste = aktive();
    if (!qrKnoten) {
      try { qrKnoten = svg(qrSvg(ctx.beitrittsAdresse(code), { rand: 2 })); }
      catch (e) { console.error(e); qrKnoten = h('span'); }   // Adresse zu lang für den Code: Der Spielcode genügt
    }
    const spalten = liste.length <= 18 ? 6 : liste.length <= 32 ? 8 : 10;
    return buehne('b-navy',
      h('div', { class: 'lobby' },
        h('div', { class: 'links' },
          h('div', { class: 'marke' }, marke()),
          h('div', { class: 'unter' }, T('marke.unter')),
          h('div', { class: 'qr' }, qrKnoten),
          h('div', { class: 'code-l' }, T('beamer.code')),
          h('div', { class: 'code' }, code.slice(0, 3) + ' ' + code.slice(3)),
          h('div', { class: 'adresse' }, location.host + location.pathname)),
        h('div', { class: 'rechts' },
          h('div', { class: 'kopf' }, h('b', null, spiel.quizTitel), h('span', null, T('beamer.bereit', { n: liste.length }))),
          liste.length
            ? h('div', { class: 'spieler', style: `grid-template-columns:repeat(${spalten},1fr)` }, liste.map(s =>
              h('button', { class: 'sp', title: T('beamer.entfernenJa'), onclick: () => entferne(s) }, avatar(s.avatar), h('span', null, s.name))))
            : h('p', { class: 'leerhinweis' }, T('beamer.warte')))),
      h('div', { class: 'flusszeile' }, fluss()),
      logo(sprache(), 'weiss'),
      haupt(T('beamer.start'), naechsteFrage, liste.length > 0));
  }

  function vorlaufSeite() {
    const f = quiz.fragen[vorlauf.nr];
    primaer = null;
    return buehne('b-navy',
      h('div', { class: 'vorlauf' },
        h('p', { class: 'unter' }, T('frage.nummer', { nr: vorlauf.nr + 1, von: quiz.fragen.length }) + ' · ' + T('typ.' + f.typ)),
        h('div', { class: 'zaehlung' }, vorlauf.rest),
        h('p', { class: 'bereit' }, T('beamer.vorlauf'))),
      logo(sprache(), 'weiss'));
  }

  function bildKnoten(nr) {
    const frage = quiz.fragen[nr];
    if (!frage.bildId) return null;
    const img = h('img', { class: 'fr-bild', alt: '' });
    const setze = daten => { if (daten) img.src = daten; else img.remove(); };
    if (bilder.has(frage.bildId)) setze(bilder.get(frage.bildId));
    else store.quiz.bildLaden(quiz.id, frage.bildId).then(d => { bilder.set(frage.bildId, d); setze(d); }).catch(() => img.remove());
    return img;
  }

  function frageSeite() {
    const f = spiel.frage;
    let antwortTeil;
    if (f.typ === 'mc' || f.typ === 'mehrfach' || f.typ === 'umfrage') {
      antwortTeil = h('div', { class: 'antw' + (f.antworten.length > 4 ? ' eng' : '') }, f.antworten.map((text, i) => h('div', { class: 'a a' + (i + 1) }, h('i', null, BUCHSTABEN[i]), h('span', null, text))));
    } else if (f.typ === 'wf') {
      antwortTeil = h('div', { class: 'antw' }, h('div', { class: 'a a3' }, h('i', null, '✓'), h('span', null, T('frage.wahr'))), h('div', { class: 'a a2' }, h('i', null, '✕'), h('span', null, T('frage.falsch'))));
    } else if (f.typ === 'reihe') {
      antwortTeil = h('div', { class: 'antw' + (f.elemente.length > 4 ? ' eng' : '') }, f.elemente.map(text => h('div', { class: 'a neutral' }, h('span', null, text))));
    } else {
      antwortTeil = h('p', { class: 'eingabehinweis' }, T(f.typ === 'schaetz' ? 'frage.zahl' : 'frage.text'), f.einheit ? ` (${f.einheit})` : '', ' …');
    }
    const bild = bildKnoten(f.nr);
    return buehne('b-papier' + (bild ? ' mit-bild' : ''),
      h('div', { class: 'frage' },
        kopfzeile(),
        h('div', { class: 'fr-mitte' }, h('p', { class: 'fr-text' + (f.text.length > 110 ? ' lang' : '') }, f.text), bild),
        antwortTeil),
      h('div', { class: 'uhr', id: 'uhr' }, ''),
      h('div', { class: 'flusszeile zeit' }, fluss('#d9d4c9', 3), h('div', { class: 'ablauf', id: 'ablauf' }, fluss('#B6633F', 4))),
      logo(sprache(), 'blau'),
      h('div', { class: 'zaehler', id: 'zaehler' }, ''),
      haupt(T('beamer.aufloesen'), aufloesen));
  }

  function aufloesungSeite() {
    const f = spiel.frage, a = spiel.aufloesung;
    const letzte = spiel.frageNr + 1 >= spiel.frageAnzahl;
    if (teil === 'rangliste') {
      const top = (spiel.rangliste || []).slice(0, 5);
      return buehne('b-navy',
        h('div', { class: 'rangseite' },
          h('h2', null, T('beamer.rangliste')),
          top.length ? h('ol', { class: 'rangliste' }, top.map(e => h('li', null,
            h('span', { class: 'rang' }, e.rang), avatar(e.avatar), h('span', { class: 'name' }, e.name),
            e.plus ? h('span', { class: 'plus' }, '+ ' + zahl(e.plus)) : h('span', { class: 'plus' }),
            h('b', null, zahl(e.punkte)))))
            : h('p', { class: 'leerhinweis' }, T('beamer.niemand'))),
        logo(sprache(), 'weiss'),
        haupt(T(letzte ? 'beamer.zumPodest' : 'beamer.naechste'), naechsteFrage));
    }
    return buehne('b-papier',
      h('div', { class: 'frage aufgeloest' },
        kopfzeile(),
        h('p', { class: 'fr-text klein' }, f.text),
        zeichneVerteilung({ typ: f.typ, antworten: f.antworten, loesung: a.loesung, verteilung: a.verteilung }, sprache()),
        a.erklaerung ? h('p', { class: 'erklaerung' }, a.erklaerung) : null),
      logo(sprache(), 'blau'),
      haupt(T('beamer.weiter'), () => { teil = 'rangliste'; zeichne(); }));
  }

  function podestSeite() {
    const r = spiel.rangliste || [];
    const platz = (e, klasse) => e ? h('div', { class: 'pl ' + klasse }, h('div', { class: 'rang' }, e.rang), avatar(e.avatar), h('b', null, e.name), h('span', null, T('beamer.punkte', { n: zahl(e.punkte) }))) : null;
    return buehne('b-navy',
      h('div', { class: 'podest' }, h('h2', null, T('beamer.siegerehrung')), h('p', { class: 'unter' }, spiel.quizTitel)),
      h('div', { class: 'berge' }, svg(`<svg viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 420 L0 300 L120 230 L210 280 L330 170 L420 250 L520 120 L600 60 L690 150 L780 110 L860 200 L960 150 L1060 260 L1140 220 L1200 270 L1200 420Z" fill="#0f2a5a"/>
        <path d="M0 420 L0 350 L160 300 L300 340 L470 250 L600 190 L720 260 L880 230 L1030 320 L1200 300 L1200 420Z" fill="#17376f"/>
        <path d="M0 395 C200 370 400 410 600 388 S1000 372 1200 396" fill="none" stroke="#B6633F" stroke-width="3"/></svg>`)),
      platz(r[0], 'eins'), platz(r[1], 'zwei'), platz(r[2], 'drei'),
      r.length > 3 ? h('div', { class: 'liste' }, r.slice(3, 8).map(e => h('div', null, h('span', null, h('em', null, e.rang), e.name), h('span', null, zahl(e.punkte))))) : null,
      r.length ? null : h('p', { class: 'leerhinweis mitte' }, T('beamer.niemand')),
      logo(sprache(), 'weiss'),
      haupt(T('beamer.zumRueckblick'), () => abschliessen(true)));
  }

  function hinweisSeite(text) {
    primaer = null;
    return buehne('b-navy', h('div', { class: 'vorlauf' }, h('div', { class: 'marke' }, marke()), h('p', { class: 'bereit' }, text),
      h('a', { class: 'start statisch', href: '#/studio' }, T('rueckblick.studio'))), logo(sprache(), 'weiss'));
  }

  // ---------- Zeichnen ----------
  function zeichne() {
    if (abgebaut) return;
    document.documentElement.lang = sprache();
    let seite;
    if (fertigerRueckblick) {
      primaer = null;
      seite = h('div', { class: 'beamerseite b-papier rollbar' }, h('div', { class: 'rb-rahmen' },
        zeichneRueckblick(fertigerRueckblick, sprache()), h('a', { class: 'knopf', href: '#/studio' }, T('rueckblick.studio'))));
    }
    else if (zustand === 'fertig') return;
    else if (zustand === 'fremd') seite = hinweisSeite(T('beamer.fremd'));
    else if (zustand === 'weg') seite = hinweisSeite(T('beamer.nichtGefunden'));
    else if (zustand === 'laedt' || !spiel || !quiz) { primaer = null; seite = buehne('b-navy', h('div', { class: 'vorlauf' }, h('p', { class: 'bereit' }, T('allg.laedt')))); }
    else if (vorlauf) seite = vorlaufSeite();
    else if (spiel.status === 'warteraum') seite = warteraum();
    else if (spiel.status === 'frage') seite = frageSeite();
    else if (spiel.status === 'aufloesung') seite = aufloesungSeite();
    else seite = podestSeite();
    wurzel.replaceChildren(seite);
    takt();
  }

  function takt() {
    if (abgebaut || zustand !== 'bereit' || !spiel || spiel.status !== 'frage' || vorlauf) return;
    const f = spiel.frage, rest = frageStart() + f.zeit * 1000 - store.jetzt();
    const uhr = document.getElementById('uhr'), ablauf = document.getElementById('ablauf'), zaehler = document.getElementById('zaehler');
    if (uhr) { uhr.textContent = Math.max(0, Math.ceil(rest / 1000)); uhr.classList.toggle('knapp', rest <= 5000); }
    if (ablauf) ablauf.style.width = Math.max(0, Math.min(100, rest / (f.zeit * 10))) + '%';
    const alle = aktive(), schluessel = new Set(alle.map(s => s.schluessel));
    const da = new Set(antworten.filter(a => schluessel.has(a.schluessel)).map(a => a.schluessel)).size;
    if (zaehler) zaehler.textContent = T('beamer.antworten', { n: da, von: alle.length });
    if (rest > 0) ton.spiele(rest <= 5000 ? 'endspurt' : 'frage');
    if (rest <= -(KULANZ_MS + 500)) aufloesen();
    else if (antwortenDa && alle.length && da >= alle.length && !fruehGeplant) { fruehGeplant = true; spaeter(aufloesen, 700); }
  }

  function abgleich() {
    if (!spiel || zustand !== 'bereit') return;
    if (spiel.status === 'frage') {
      if (antwortenNr !== spiel.frageNr && !wertetAus) {
        stoppAntworten?.();
        antwortenNr = spiel.frageNr;
        antworten = [];
        antwortenDa = false;
        stoppAntworten = store.spiel.antwortenBeobachten(code, antwortenNr, liste => { antworten = liste; antwortenDa = true; takt(); });
      }
    } else {
      stoppAntworten?.();
      stoppAntworten = null;
      antwortenNr = -1;
      if (spiel.status === 'warteraum' && !vorlauf) ton.spiele('warteraum');
    }
  }

  let podestGespielt = false;
  async function ladeAllesZum(s) {
    try {
      privat = await store.spiel.privatLaden(code);
      // Das Quiz ist im Spiel eingefroren; ältere Spiele ohne Kopie laden es nach.
      quiz = privat.quiz || await store.quiz.laden(privat.quizId);
      // Erst bereit, wenn die Spielerliste da ist: Eine Auswertung ohne Liste würde alle Punkte löschen.
      await frischeSpieler();
      zustand = 'bereit';
      try { localStorage.setItem('rabiosa-laufend', code); } catch { /* ohne Speicher */ }
    } catch (e) { console.error(e); zustand = 'weg'; }
    abgleich();
    zeichne();
  }

  const stoppKonto = store.konto.beobachten(k => {
    if (!k || !k.freigeschaltet) { if (zustand !== 'fertig') ctx.geh('#/studio'); return; }
    if (konto) return;
    konto = k;
    let laedt = false;
    stoppSpiel = store.spiel.beobachten(code, s => {
      if (zustand === 'fertig') return;
      const vorher = spiel;
      spiel = s;
      if (!s) { zustand = 'weg'; zeichne(); return; }
      if (s.hostUid !== konto.uid) { zustand = 'fremd'; zeichne(); return; }
      if (s.art === 'praesentation') { ctx.geh('#/praesentation/' + code); return; }
      if (!laedt) { laedt = true; ladeAllesZum(s); return; }
      if (zustand !== 'bereit') return;
      if (s.status === 'podest' && !podestGespielt) { podestGespielt = true; ton.spiele('podest'); }
      abgleich();
      if (!vorher || vorher.status !== s.status || vorher.frageNr !== s.frageNr) zeichne(); else takt();
    });
  });

  const taste = e => {
    ton.wecke();
    if (e.repeat) return;   // gehaltene Taste soll nichts überspringen
    if (e.target.closest?.('input, textarea, select, dialog, button, a')) return;   // Knöpfe lösen selbst aus
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') && primaer && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      primaer();
    }
  };
  const klick = () => ton.wecke();
  document.addEventListener('keydown', taste);
  document.addEventListener('pointerdown', klick);
  const uhrwerk = setInterval(takt, 100);
  zeichne();

  return () => {
    abgebaut = true;
    clearInterval(uhrwerk);
    zeiten.forEach(clearTimeout);
    document.removeEventListener('keydown', taste);
    document.removeEventListener('pointerdown', klick);
    stoppKonto(); stoppSpiel?.(); stoppSpieler?.(); stoppAntworten?.();
    ton.stopp();
  };
}
