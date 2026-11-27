// Präsentation am Beamer: Folien zeigen, die Antworten der Handys live auswerten, vor- und zurückblättern.
// Läuft auf dem Laptop der Lehrperson. Keine Punkte, keine Namen, keine Zeitlimite.
import { h, svg, logo, marke, rueckfrage, meldung, fehlerText } from '../ui.js';
import { t } from '../i18n.js';
import { qrSvg } from '../qr.js';
import { SERVERZEIT } from '../store/gemeinsam.js';
import { stimmen, auswerten, folieWechsel, istGeschlossen, istInteraktiv, praesentationsRueckblick, istPraesentation, oeffentlicheFolie } from '../logik/praesentation.js';
import { zeichneFolie } from './folien.js';

/** Adresse, die im QR-Code steht: direkt in die Präsentation. */
export const teilnahmeAdresse = code => location.origin + location.pathname + location.search + '#/p/' + code;

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  let konto = null, spiel = null, privat = null, quiz = null;
  let spieler = [], antworten = [], antwortenNr = -1, stoppAntworten = null, stoppSpieler = null, stoppSpiel = null;
  let zustand = 'laedt';             // 'laedt' | 'bereit' | 'fremd' | 'weg' | 'fertig'
  let verborgen = new Set();         // Folien, deren Ergebnis gerade nicht gezeigt wird (nur an diesem Laptop)
  let qrGross = false, abgebaut = false, schreibt = false;
  let ergebnisEl = null, zaehlerEl = null, zeichneBald = null;
  const bilder = new Map();
  let qrKnoten = null;

  const sprache = () => (spiel && spiel.sprache) || (quiz && quiz.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const melde = e => meldung(fehlerText(sprache(), e));
  const nr = () => (spiel && spiel.status === 'folie' ? spiel.folieNr : -1);
  const folie = () => (nr() >= 0 ? quiz.fragen[nr()] : null);
  const ausgeblendet = n => (privat?.ausgeblendet || {})[String(n)] || [];

  async function schreibe(patch, privatPatch) {
    try { await store.spiel.aktualisieren(code, patch, privatPatch); return true; } catch (e) { melde(e); return false; }
  }

  // ---------- Ablauf ----------
  async function geheZu(ziel) {
    if (schreibt || !quiz || zustand !== 'bereit') return;
    const anzahl = quiz.fragen.length;
    if (ziel < 0) return;
    schreibt = true;
    if (ziel >= anzahl) await schreibe({ status: 'schluss', stand: (spiel.stand || 0) + 1 });
    else await schreibe(folieWechsel(quiz, ziel, spiel.stand, SERVERZEIT));
    schreibt = false;
  }
  const weiter = () => {
    if (!spiel) return;
    if (spiel.status === 'warteraum') geheZu(0);
    else if (spiel.status === 'folie') geheZu(spiel.folieNr + 1);
  };
  const zurueck = () => {
    if (!spiel) return;
    if (spiel.status === 'schluss') geheZu(quiz.fragen.length - 1);
    else if (spiel.status === 'folie' && spiel.folieNr > 0) geheZu(spiel.folieNr - 1);
  };

  function umschalten() {
    const n = nr();
    if (n < 0 || !istInteraktiv(folie())) return;
    if (verborgen.has(n)) verborgen.delete(n); else verborgen.add(n);
    zeichne();
  }
  async function abstimmungSchalten() {
    const n = nr();
    if (n < 0) return;
    const geschlossen = { ...(spiel.geschlossen || {}) };
    if (geschlossen[String(n)]) delete geschlossen[String(n)]; else geschlossen[String(n)] = true;
    await schreibe({ geschlossen, stand: (spiel.stand || 0) + 1 });
  }
  async function ausblenden(schluessel) {
    const n = String(nr());
    const neu = { ...(privat.ausgeblendet || {}), [n]: [...new Set([...ausgeblendet(n), schluessel])] };
    privat = { ...privat, ausgeblendet: neu };
    zeichneErgebnis();
    await schreibe({}, { ausgeblendet: neu });
  }
  async function einblenden() {
    const n = String(nr());
    const neu = { ...(privat.ausgeblendet || {}) };
    delete neu[n];
    privat = { ...privat, ausgeblendet: neu };
    zeichneErgebnis();
    await schreibe({}, { ausgeblendet: neu });
  }

  /** Die Antworten einer Folie einmal holen (für den Rückblick am Schluss). */
  function einmalAntworten(n) {
    return new Promise(fertig => {
      let stopp = null, da = false;
      stopp = store.spiel.antwortenBeobachten(code, n, liste => {
        if (da) return;
        da = true;
        fertig(liste);
        queueMicrotask(() => stopp?.());
      });
      if (da) stopp();
    });
  }

  async function abschliessen() {
    if (zustand === 'fertig') return;
    zustand = 'fertig';
    zeichne();
    try {
      privat = { ...privat, ...await store.spiel.privatLaden(code) };
      const ergebnisse = {};
      await Promise.all(quiz.fragen.map(async (f, n) => {
        if (!istInteraktiv(f)) return;
        const liste = n === antwortenNr ? antworten : await einmalAntworten(n);
        if (liste.length) ergebnisse[n] = auswerten(f, stimmen(f, liste, spieler));
      }));
      const rb = praesentationsRueckblick(quiz, ergebnisse, spieler.length, store.jetzt(), privat.ausgeblendet || {});
      if (rb.folien.length) await store.rueckblick.speichern(rb);
      try { localStorage.removeItem('rabiosa-laufend'); } catch { /* ohne Speicher */ }
      await store.spiel.aktualisieren(code, { status: 'ende' });
      await store.spiel.beenden(code);
      ctx.geh(rb.folien.length && quiz.id ? '#/studio/rueckblick/' + quiz.id : '#/studio');
    } catch (e) {
      melde(e);
      zustand = 'bereit';
      zeichne();
    }
  }

  // ---------- Antworten und Spieler ----------
  function abgleich() {
    const n = nr();
    if (n === antwortenNr) return;
    stoppAntworten?.();
    stoppAntworten = null;
    antworten = [];
    antwortenNr = n;
    if (n >= 0 && istInteraktiv(folie())) {
      stoppAntworten = store.spiel.antwortenBeobachten(code, n, liste => { if (n === antwortenNr) { antworten = liste; bald(); } });
    }
  }
  /** Viele Antworten auf einmal: höchstens alle 250 ms neu zeichnen. */
  function bald() {
    if (zeichneBald) return;
    zeichneBald = setTimeout(() => { zeichneBald = null; if (!abgebaut) zeichneErgebnis(); }, 250);
  }

  const ergebnisJetzt = () => {
    const f = folie();
    return f && istInteraktiv(f) ? auswerten(f, stimmen(f, antworten, spieler)) : null;
  };

  // ---------- Bausteine ----------
  function qr() {
    if (!qrKnoten) {
      try { qrKnoten = svg(qrSvg(teilnahmeAdresse(code), { rand: 2 })); }
      catch (e) { console.error(e); qrKnoten = h('span'); }
    }
    return qrKnoten.cloneNode(true);
  }
  const codeText = code.slice(0, 3) + ' ' + code.slice(3);
  const adresse = () => location.host + location.pathname.replace(/\/$/, '');

  function werkzeug() {
    const knopf = (zeichen, titel, klick, an = false) => h('button', { class: 'wz' + (an ? ' an' : ''), title: titel, 'aria-label': titel, onclick: e => { e.currentTarget.blur(); klick(); } }, zeichen);
    const n = nr(), f = folie();
    const mitAbstimmung = f && istInteraktiv(f);
    return h('div', { class: 'werkzeug' },
      mitAbstimmung ? knopf(verborgen.has(n) ? '◌' : '◉', T(verborgen.has(n) ? 'pb.ergebnisAn' : 'pb.ergebnisAus'), umschalten, verborgen.has(n)) : null,
      mitAbstimmung ? knopf(istGeschlossen(spiel, n) ? '🔒' : '🔓', T(istGeschlossen(spiel, n) ? 'pb.oeffnen' : 'pb.schliessen'), abstimmungSchalten, istGeschlossen(spiel, n)) : null,
      knopf('▦', T('pb.qr'), () => { qrGross = !qrGross; zeichne(); }, qrGross),
      knopf('⛶', T('beamer.vollbild'), () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }),
      zustand === 'bereit' ? knopf('✕', T('pb.beenden'), async () => { if (await rueckfrage(sprache(), T('pb.beendenFrage'), T('pb.beenden'))) abschliessen(); }) : null);
  }

  const buehne = (klasse, ...inhalt) => h('div', { class: 'beamerseite pb ' + klasse }, h('div', { class: 'buehne' }, werkzeug(), inhalt,
    qrGross ? h('div', { class: 'pb-qr-gross', onclick: () => { qrGross = false; zeichne(); } },
      h('div', { class: 'qr' }, qr()), h('p', null, T('pb.mitmachen', { adresse: adresse() })), h('b', null, codeText)) : null));

  function bildKnoten(n) {
    const f = quiz.fragen[n];
    if (!f.bildId) return null;
    const img = h('img', { class: 'pf-bild', alt: '' });
    const setze = d => { if (d) img.src = d; else img.remove(); };
    if (bilder.has(f.bildId)) setze(bilder.get(f.bildId));
    else store.quiz.bildLaden(quiz.id, f.bildId).then(d => { bilder.set(f.bildId, d); setze(d); }).catch(() => img.remove());
    return img;
  }

  function zaehlerText() {
    const f = folie();
    const verbunden = T('pb.verbunden', { n: spieler.length });
    if (!f || !istInteraktiv(f)) return verbunden;
    const n = new Set(stimmen(f, antworten, spieler).map(s => s.schluessel)).size;
    return verbunden + ' · ' + (n === 1 ? T('pb.antworten1') : T('pb.antwortenN', { n })) + (istGeschlossen(spiel, nr()) ? ' · ' + T('pb.geschlossen') : '');
  }

  function zeichneErgebnis() {
    if (zaehlerEl) zaehlerEl.textContent = zaehlerText();
    const f = folie();
    if (!ergebnisEl || !f || !istInteraktiv(f)) return;
    const n = nr();
    const neu = zeichneFolie(oeffentlicheFolie(f, n), ergebnisJetzt(), sprache(), {
      verborgen: verborgen.has(n), ausblenden, ausgeblendet: ausgeblendet(n),
    }).querySelector('.pf-ergebnis');
    ergebnisEl.replaceWith(neu);
    ergebnisEl = neu;
    const weg = ausgeblendet(n).length;
    const hinweis = document.getElementById('pb-ausgeblendet');
    if (hinweis) hinweis.replaceChildren(...(weg ? [T('pb.ausgeblendet', { n: weg }), ' · ', h('button', { type: 'button', class: 'textknopf', onclick: einblenden }, T('pb.einblenden'))] : []));
  }

  function kopfzeile() {
    return h('div', { class: 'pb-kopf' },
      h('span', null, T('pb.mitmachen', { adresse: adresse() }), ' · ', T('pb.code'), ' ', h('b', null, codeText)));
  }

  function fusszeile() {
    zaehlerEl = h('span', { class: 'pb-zaehler' }, zaehlerText());
    const navKnopf = (zeichen, titel, klick, aus) => h('button', { class: 'pb-nav', title: titel, 'aria-label': titel, disabled: aus, onclick: e => { e.currentTarget.blur(); klick(); } }, zeichen);
    return h('div', { class: 'pb-fuss' },
      logo(sprache(), 'blau'),
      h('div', { class: 'pb-mitte' }, zaehlerEl, h('span', { id: 'pb-ausgeblendet', class: 'pb-ausgeblendet' })),
      h('div', { class: 'pb-blaettern' },
        navKnopf('‹', T('pb.zurueck'), zurueck, nr() <= 0 && spiel.status !== 'schluss'),
        h('span', null, T('pb.folie', { nr: nr() + 1, von: quiz.fragen.length })),
        navKnopf('›', T('pb.weiter'), weiter, false)));
  }

  function warteraum() {
    return buehne('b-navy',
      h('div', { class: 'lobby pb-lobby' },
        h('div', { class: 'links' },
          h('div', { class: 'marke' }, marke()),
          h('div', { class: 'unter' }, T('studio.artPraesentation')),
          h('div', { class: 'qr' }, qr()),
          h('div', { class: 'code-l' }, T('pb.code')),
          h('div', { class: 'code' }, codeText),
          h('div', { class: 'adresse' }, adresse())),
        h('div', { class: 'rechts' },
          h('h1', { class: 'pb-titel' }, spiel.quizTitel),
          h('p', { class: 'pb-verbunden' }, T('pb.verbunden', { n: spieler.length })),
          h('p', { class: 'pb-anonym' }, T('pb.anonym')),
          h('p', { class: 'pb-tasten' }, T('pb.tasten')))),
      logo(sprache(), 'weiss'),
      h('div', { class: 'hauptknopf' }, h('button', { class: 'start', onclick: weiter }, T('pb.start'))));
  }

  function folieSeite() {
    const n = nr(), f = quiz.fragen[n];
    const inhalt = zeichneFolie(oeffentlicheFolie(f, n), ergebnisJetzt(), sprache(), {
      verborgen: verborgen.has(n), ausblenden, ausgeblendet: ausgeblendet(n), bild: bildKnoten(n),
    });
    ergebnisEl = inhalt.querySelector('.pf-ergebnis');
    const seite = buehne('b-papier', kopfzeile(), h('div', { class: 'pb-buehne' }, inhalt), fusszeile());
    queueMicrotask(zeichneErgebnis);   // Hinweis «ausgeblendet» braucht das Element im Dokument
    return seite;
  }

  function schlussSeite() {
    return buehne('b-navy',
      h('div', { class: 'vorlauf' },
        h('div', { class: 'marke' }, marke()),
        h('p', { class: 'bereit' }, T('pb.ende')),
        h('p', { class: 'unter' }, spiel.quizTitel)),
      logo(sprache(), 'weiss'),
      h('div', { class: 'pb-schlussknoepfe' },
        h('button', { class: 'pb-nav hell', title: T('pb.zurueck'), 'aria-label': T('pb.zurueck'), onclick: zurueck }, '‹'),
        h('button', { class: 'start', onclick: abschliessen }, T('pb.zuDenErgebnissen'))));
  }

  function hinweisSeite(text) {
    return buehne('b-navy', h('div', { class: 'vorlauf' }, h('div', { class: 'marke' }, marke()), h('p', { class: 'bereit' }, text),
      h('a', { class: 'start statisch', href: '#/studio' }, T('rueckblick.studio'))), logo(sprache(), 'weiss'));
  }

  function zeichne() {
    if (abgebaut) return;
    document.documentElement.lang = sprache();
    ergebnisEl = null; zaehlerEl = null;
    let seite;
    if (zustand === 'fremd') seite = hinweisSeite(T('beamer.fremd'));
    else if (zustand === 'weg') seite = hinweisSeite(T('beamer.nichtGefunden'));
    else if (zustand === 'laedt' || zustand === 'fertig' || !spiel || !quiz) seite = buehne('b-navy', h('div', { class: 'vorlauf' }, h('p', { class: 'bereit' }, T('allg.laedt'))));
    else if (spiel.status === 'warteraum') seite = warteraum();
    else if (spiel.status === 'folie') seite = folieSeite();
    else seite = schlussSeite();
    wurzel.replaceChildren(seite);
  }

  // ---------- Laden ----------
  async function ladeAlles() {
    try {
      privat = await store.spiel.privatLaden(code);
      quiz = privat.quiz || await store.quiz.laden(privat.quizId);
      if (!istPraesentation(quiz)) { ctx.geh('#/beamer/' + code); return; }
      await new Promise(fertig => {
        let erste = true;
        stoppSpieler = store.spiel.spielerBeobachten(code, liste => {
          spieler = liste;
          if (erste) { erste = false; fertig(); return; }
          if (spiel?.status === 'warteraum') zeichne(); else bald();
        });
      });
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
      if (s.art !== 'praesentation') { ctx.geh('#/beamer/' + code); return; }
      if (!laedt) { laedt = true; ladeAlles(); return; }
      if (zustand !== 'bereit') return;
      abgleich();
      if (!vorher || vorher.status !== s.status || vorher.folieNr !== s.folieNr || vorher.stand !== s.stand) zeichne();
    });
  });

  const taste = e => {
    if (e.repeat || zustand !== 'bereit' || !spiel) return;
    if (e.target.closest?.('input, textarea, select, dialog')) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') {
      if (e.target.closest?.('button, a') && (k === ' ' || k === 'Enter')) return;   // Knöpfe lösen selbst aus
      e.preventDefault(); weiter();
    } else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); zurueck(); }
    else if (k === 'h' || k === 'H') umschalten();
    else if (k === 'q' || k === 'Q') { qrGross = !qrGross; zeichne(); }
    else if (k === 'Escape' && qrGross) { qrGross = false; zeichne(); }
  };
  document.addEventListener('keydown', taste);
  zeichne();

  return () => {
    abgebaut = true;
    clearTimeout(zeichneBald);
    document.removeEventListener('keydown', taste);
    stoppKonto(); stoppSpiel?.(); stoppSpieler?.(); stoppAntworten?.();
  };
}
