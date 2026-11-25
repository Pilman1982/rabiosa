// Handy der Studierenden: beitreten, Avatar bauen, antworten, Rückmeldung sehen.
import { h, avatar, BUCHSTABEN } from '../ui.js';
import { t, zahl } from '../i18n.js';
import { BERUFE, FRISUREN, HAARFARBEN, HAUTTOENE, zufallsAvatar, saubererAvatar } from '../avatar.js';
import { leseZahl } from '../logik/pruefen.js';
import { zufallsKennung } from '../store/gemeinsam.js';

const HAARCODE = { schwarz: '#1E1A19', dunkel: '#4A2E1F', braun: '#7A4A2B', blond: '#C9A35E', rot: '#A6482B', grau: '#B9B7B0' };
const NAME_MAX = 16;

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  // Im Demo-Modus pro Fenster eine eigene Person, sonst bleibt man auch nach dem Schliessen dieselbe.
  const lager = ctx.demo ? sessionStorage : localStorage;
  const lagerName = 'rabiosa-spieler:' + code;
  const liesLager = (k, sonst) => { try { return JSON.parse(lager.getItem(k)) ?? sonst; } catch { return sonst; } };

  let spiel;                                  // undefined = lädt, null = gibt es nicht (mehr)
  let hatteSpiel = false;
  let ich = liesLager(lagerName, null);       // { schluessel, pid, name, avatar, gesendet: { [nr]: true } }
  let phase = ich ? 'spiel' : 'beitritt';     // 'beitritt' | 'spiel' | 'entfernt'
  let entwurf = ich ? { name: ich.name, avatar: ich.avatar } : liesLager('rabiosa-profil', null) || { name: '', avatar: zufallsAvatar() };
  entwurf.avatar = saubererAvatar(entwurf.avatar);
  let letzterEintrag = null;                  // eigener Platz in der Rangliste, bleibt nach Spielende stehen
  let stoppEigen = null;
  let gezeichnet = '';
  let zeitUm = false;
  let sendet = false;

  const sprache = () => (spiel && spiel.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const merke = () => { try { lager.setItem(lagerName, JSON.stringify(ich)); } catch { /* voll oder gesperrt */ } };

  function beobachteMich() {
    stoppEigen?.();
    stoppEigen = store.spiel.eigenerSpieler(code, ich.schluessel, s => {
      if (s || phase !== 'spiel') return;
      if (spiel && spiel.status !== 'ende') { phase = 'entfernt'; try { lager.removeItem(lagerName); } catch { /* egal */ } zeichne(true); }
    });
  }

  const restMs = () => {
    const f = spiel.frage;
    return (spiel.frageStart ?? store.jetzt()) + f.zeit * 1000 - store.jetzt();
  };

  // ---------- Bausteine ----------
  const kopf = rechts => h('header', { class: 'h-kopf' }, h('b', null, 'RABIOSA'), h('span', null, rechts));
  const codeText = code.slice(0, 3) + ' ' + code.slice(3);
  const seite = (rechts, ...inhalt) => h('div', { class: 'handy' }, kopf(rechts), h('div', { class: 'h-in' }, inhalt));

  function avatarBau() {
    const kasten = h('div', { class: 'avatarbau' });
    const baue = () => {
      const a = entwurf.avatar;
      const chip = (an, text, klick) => h('button', { type: 'button', class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(an), onclick: () => { klick(); baue(); } }, text);
      const farbe = (an, hex, titel, klick) => h('button', { type: 'button', class: 'farbe' + (an ? ' an' : ''), style: 'background:' + hex, title: titel, 'aria-label': titel, 'aria-pressed': String(an), onclick: () => { klick(); baue(); } });
      kasten.replaceChildren(
        h('div', { class: 'vorschau' }, avatar(a),
          h('button', { type: 'button', class: 'chip', onclick: () => { entwurf.avatar = zufallsAvatar(); baue(); } }, '⚄ ' + T('beitritt.zufall'))),
        h('p', { class: 'lab' }, T('beitritt.beruf')),
        h('div', { class: 'chips' }, BERUFE.map(b => chip(a.beruf === b, T('beruf.' + b), () => { a.beruf = b; }))),
        h('p', { class: 'lab' }, T('beitritt.haut')),
        h('div', { class: 'farben' }, HAUTTOENE.map((hex, i) => farbe(a.haut === i, hex, T('beitritt.hautNr', { n: i + 1 }), () => { a.haut = i; }))),
        h('p', { class: 'lab' }, T('beitritt.frisur')),
        h('div', { class: 'chips' }, FRISUREN.map(f => chip(a.frisur === f, T('frisur.' + f), () => { a.frisur = f; }))),
        h('p', { class: 'lab' }, T('beitritt.haarfarbe')),
        h('div', { class: 'farben' }, HAARFARBEN.map(f => farbe(a.haar === f, HAARCODE[f], T('haar.' + f), () => { a.haar = f; }))),
        h('p', { class: 'lab' }, T('beitritt.extras')),
        h('div', { class: 'chips' },
          chip(a.brille, T('beitritt.brille'), () => { a.brille = !a.brille; }),
          chip(a.bart, T('beitritt.bart'), () => { a.bart = !a.bart; })));
    };
    baue();
    return kasten;
  }

  function beitrittSeite() {
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    const feld = h('input', { class: 'feld', maxlength: String(NAME_MAX), autocomplete: 'off', placeholder: T('beitritt.name'), 'aria-label': T('beitritt.name'), value: entwurf.name });
    feld.addEventListener('input', () => { entwurf.name = feld.value; });
    const knopf = h('button', { class: 'knopf gross unten', type: 'submit' }, T('beitritt.bereit'));
    const los = async e => {
      e.preventDefault();
      const name = feld.value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
      if (!name) { hinweis.textContent = T('beitritt.nameFehlt'); feld.focus(); return; }
      knopf.disabled = true;
      const neu = { schluessel: ich?.schluessel || zufallsKennung(24), pid: ich?.pid || zufallsKennung(10), name, avatar: saubererAvatar(entwurf.avatar) };
      try {
        await store.spiel.beitreten(code, neu);
        ich = { ...neu, gesendet: ich?.gesendet || {} };
        try {
          for (let i = lager.length - 1; i >= 0; i--) { const k = lager.key(i); if (k && k.startsWith('rabiosa-spieler:') && k !== lagerName) lager.removeItem(k); }
          localStorage.setItem('rabiosa-profil', JSON.stringify({ name, avatar: neu.avatar }));
        } catch { /* egal */ }
        merke();
        phase = 'spiel';
        beobachteMich();
        zeichne(true);
      } catch (err) {
        knopf.disabled = false;
        hinweis.textContent = t(sprache(), err.code === 'nichtGefunden' ? 'start.codeFalsch' : 'fehler.netz');
      }
    };
    return h('form', { class: 'handy', onsubmit: los }, kopf(codeText),
      h('div', { class: 'h-in mit-knopf' }, feld, hinweis, avatarBau()), knopf);
  }

  function warteSeite() {
    return seite(codeText,
      h('div', { class: 'mitte' }, h('div', { class: 'gross-avatar' }, avatar(ich.avatar)),
        h('h2', null, ich.name), h('p', { class: 'stark' }, T('warte.drin')), h('p', null, T('warte.blick')),
        h('button', { class: 'knopf leise', onclick: () => { phase = 'beitritt'; entwurf = { name: ich.name, avatar: { ...ich.avatar } }; zeichne(true); } }, T('warte.aendern'))));
  }

  async function sende(wert, hinweis, knoepfe) {
    if (sendet) return;
    sendet = true;
    knoepfe.forEach(k => { k.disabled = true; });
    const nr = spiel.frage.nr;
    try {
      await store.spiel.antworten(code, nr, ich.schluessel, wert);
    } catch (e) {
      if (e.code !== 'schonGeantwortet') {
        sendet = false;
        knoepfe.forEach(k => { k.disabled = false; });
        hinweis.textContent = T('frage.fehler');
        return;
      }
    }
    sendet = false;
    ich.gesendet = { ...ich.gesendet, [nr]: true };
    merke();
    zeichne(true);
  }

  function antwortTeil(f) {
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    const sendeKnopf = (holeWert, bereit = () => true) => {
      const k = h('button', { class: 'knopf gross', type: 'button', disabled: !bereit() }, T('frage.senden'));
      k.addEventListener('click', () => {
        const w = holeWert();
        if (w === undefined) return;
        sende(w, hinweis, [k]);
      });
      return k;
    };
    if (f.typ === 'mc' || f.typ === 'umfrage') {
      const knoepfe = f.antworten.map((text, i) => h('button', { type: 'button', class: 'h-a a' + (i + 1) }, h('i', null, BUCHSTABEN[i]), h('span', null, text)));
      knoepfe.forEach((k, i) => k.addEventListener('click', () => sende(i, hinweis, knoepfe)));
      return [knoepfe, hinweis];
    }
    if (f.typ === 'wf') {
      const ja = h('button', { type: 'button', class: 'h-a a3 hoch' }, h('span', null, T('frage.wahr')));
      const nein = h('button', { type: 'button', class: 'h-a a2 hoch' }, h('span', null, T('frage.falsch')));
      ja.addEventListener('click', () => sende(true, hinweis, [ja, nein]));
      nein.addEventListener('click', () => sende(false, hinweis, [ja, nein]));
      return [h('div', { class: 'zwei' }, ja, nein), hinweis];
    }
    if (f.typ === 'mehrfach') {
      const gewaehlt = new Set();
      const knopf = sendeKnopf(() => [...gewaehlt].sort((a, b) => a - b), () => gewaehlt.size > 0);
      const knoepfe = f.antworten.map((text, i) => {
        const k = h('button', { type: 'button', class: 'h-a wahl a' + (i + 1), 'aria-pressed': 'false' }, h('i', null, BUCHSTABEN[i]), h('span', null, text));
        k.addEventListener('click', () => {
          if (gewaehlt.has(i)) gewaehlt.delete(i); else gewaehlt.add(i);
          k.classList.toggle('an', gewaehlt.has(i));
          k.setAttribute('aria-pressed', String(gewaehlt.has(i)));
          knopf.disabled = gewaehlt.size === 0;
        });
        return k;
      });
      return [h('p', { class: 'hilfe' }, T('frage.mehrere')), knoepfe, hinweis, knopf];
    }
    if (f.typ === 'schaetz') {
      const feld = h('input', { class: 'feld zahl', inputmode: 'decimal', autocomplete: 'off', maxlength: '14', placeholder: T('frage.zahl'), 'aria-label': T('frage.zahl') });
      const knopf = sendeKnopf(() => {
        const z = leseZahl(feld.value);
        if (Number.isNaN(z)) { hinweis.textContent = T('frage.zahlUngueltig'); feld.focus(); return undefined; }
        return z;
      });
      return [h('div', { class: 'zahlzeile' }, feld, f.einheit ? h('span', { class: 'einheit' }, f.einheit) : null), hinweis, knopf];
    }
    if (f.typ === 'reihe') {
      let folge = f.elemente.map((_, i) => i);
      const liste = h('ol', { class: 'reihe' });
      const baue = () => liste.replaceChildren(...folge.map((gemischt, platz) => {
        const schieb = (richtung, zeichen, text) => h('button', { type: 'button', class: 'pfeil', 'aria-label': text, disabled: platz + richtung < 0 || platz + richtung >= folge.length,
          onclick: () => { [folge[platz], folge[platz + richtung]] = [folge[platz + richtung], folge[platz]]; baue(); } }, zeichen);
        return h('li', null, h('span', { class: 'platz' }, platz + 1), h('span', { class: 'el' }, f.elemente[gemischt]), schieb(-1, '▲', T('frage.hoch')), schieb(1, '▼', T('frage.runter')));
      }));
      baue();
      return [h('p', { class: 'hilfe' }, T('frage.ordnen')), liste, hinweis, sendeKnopf(() => [...folge])];
    }
    // kurz
    const feld = h('input', { class: 'feld', autocomplete: 'off', autocapitalize: 'off', maxlength: '60', placeholder: T('frage.text'), 'aria-label': T('frage.text') });
    const knopf = sendeKnopf(() => { const w = feld.value.trim(); if (!w) { feld.focus(); return undefined; } return w; });
    return [feld, hinweis, knopf];
  }

  function frageSeite() {
    const f = spiel.frage;
    const titel = T('frage.nummer', { nr: f.nr + 1, von: spiel.frageAnzahl });
    if (ich.gesendet?.[f.nr]) return seite(titel, h('div', { class: 'mitte' }, h('div', { class: 'haken' }, '✓'), h('p', { class: 'stark' }, T('frage.gesendet')), h('p', null, T('frage.warte'))));
    if (zeitUm) return seite(titel, h('div', { class: 'mitte' }, h('p', { class: 'stark' }, T('frage.zeitUm')), h('p', null, T('frage.warte'))));
    return seite(titel,
      h('div', { class: 'balken' }, h('i', { id: 'restbalken' })),
      h('p', { class: 'h-frage' }, f.text),
      antwortTeil(f));
  }

  function eigenerEintrag() {
    const e = (spiel?.rangliste || []).find(x => x.pid === ich.pid) || null;
    if (e) letzterEintrag = { ...e, von: spiel.rangliste.length, davor: spiel.rangliste.filter(x => x.punkte > e.punkte).sort((a, b) => a.punkte - b.punkte)[0] || null };
    return e;
  }

  function rangTeil(e) {
    const info = letzterEintrag;
    return [
      h('div', { class: 'platz-kasten' }, h('p', { class: 'lab' }, T('ergebnis.rang')), h('b', null, T('ergebnis.rangVon', { rang: e.rang, von: info.von })),
        h('p', { class: 'punktestand' }, T('ergebnis.gesamt', { n: zahl(e.punkte) }))),
      h('p', { class: 'abstand' }, info.davor ? T('ergebnis.abstand', { n: zahl(info.davor.punkte - e.punkte), rang: info.davor.rang }) : (e.punkte > 0 ? T('ergebnis.erster') : '')),
    ];
  }

  function aufloesungSeite() {
    const f = spiel.frage;
    const titel = T('frage.nummer', { nr: f.nr + 1, von: spiel.frageAnzahl });
    const e = eigenerEintrag();
    if (!e) return seite(titel, h('div', { class: 'mitte' }, h('div', { class: 'gross-avatar klein' }, avatar(ich.avatar)), h('p', null, T('warte.naechste'))));
    let art, text;
    if (f.typ === 'umfrage') { art = 'neutral'; text = T(ich.gesendet?.[f.nr] ? 'ergebnis.umfrage' : 'ergebnis.keine'); }
    else if (e.anteil === null) { art = 'neutral'; text = T('ergebnis.keine'); }
    else if (e.anteil >= 1) { art = 'gut'; text = T('ergebnis.richtig'); }
    else if (e.anteil > 0) { art = 'halb'; text = T('ergebnis.teilweise'); }
    else { art = 'schlecht'; text = T('ergebnis.falsch'); }
    return seite(titel, h('div', { class: 'mitte ergebnis ' + art },
      h('div', { class: 'gross-avatar klein' }, avatar(e.avatar)),
      h('p', { class: 'lab urteil' }, text),
      f.typ === 'umfrage' ? null : h('div', { class: 'plus' }, '+ ' + zahl(e.plus)),
      rangTeil(e)));
  }

  function schlussSeite(vorbei) {
    eigenerEintrag();
    const e = letzterEintrag;
    return seite(codeText, h('div', { class: 'mitte' },
      h('div', { class: 'gross-avatar' }, avatar(ich.avatar)),
      h('h2', null, ich.name),
      e ? h('p', { class: 'stark' }, T('ende.rang', { rang: e.rang, von: e.von })) : null,
      e ? h('p', { class: 'punktestand' }, T('ergebnis.gesamt', { n: zahl(e.punkte) })) : null,
      h('p', null, T(vorbei ? 'ende.danke' : 'beamer.siegerehrung')),
      vorbei ? h('a', { class: 'knopf leise', href: '#/' }, T('ende.zurueck')) : null));
  }

  const hinweisSeite = (text) => seite(codeText, h('div', { class: 'mitte' }, h('p', { class: 'stark' }, text), h('a', { class: 'knopf leise', href: '#/' }, T('ende.zurueck'))));

  // ---------- Zeichnen ----------
  function zeichne(erzwingen = false) {
    let kennung, baue;
    if (spiel === undefined) { kennung = 'laedt'; baue = () => seite(codeText, h('p', { class: 'mitte' }, T('allg.laedt'))); }
    else if (phase === 'entfernt') { kennung = 'entfernt'; baue = () => hinweisSeite(T('ende.entfernt')); }
    else if (spiel === null) {
      kennung = 'weg';
      baue = () => (hatteSpiel && ich && phase === 'spiel' ? schlussSeite(true) : hinweisSeite(T(hatteSpiel ? 'ende.vorbei' : 'start.codeFalsch')));
    }
    else if (phase === 'beitritt') { kennung = 'beitritt'; baue = beitrittSeite; }
    else if (spiel.status === 'warteraum') { kennung = 'warteraum'; baue = warteSeite; }
    else if (spiel.status === 'frage') { kennung = `frage:${spiel.frage.nr}:${!!ich.gesendet?.[spiel.frage.nr]}:${zeitUm}`; baue = frageSeite; }
    else if (spiel.status === 'aufloesung') { kennung = 'aufloesung:' + spiel.frageNr; baue = aufloesungSeite; }
    else if (spiel.status === 'podest') { kennung = 'podest'; baue = () => schlussSeite(false); }
    else { kennung = 'ende'; baue = () => schlussSeite(true); }
    if (!erzwingen && kennung === gezeichnet) return;
    const vorher = gezeichnet;
    gezeichnet = kennung;
    document.documentElement.lang = sprache();
    wurzel.replaceChildren(baue());
    if (kennung.startsWith('aufloesung') && kennung !== vorher) {
      const e = letzterEintrag;
      try { navigator.vibrate?.(e && e.anteil ? 80 : [40, 60, 40]); } catch { /* nicht überall erlaubt */ }
    }
    takt();
  }

  function takt() {
    if (!spiel || spiel.status !== 'frage' || phase !== 'spiel') return;
    const rest = restMs();
    const balken = document.getElementById('restbalken');
    if (balken) balken.style.width = Math.max(0, Math.min(100, rest / (spiel.frage.zeit * 10))) + '%';
    if (rest <= 0 && !zeitUm && !sendet) { zeitUm = true; zeichne(); }
  }

  let letzteFrage = -1;
  const stoppSpiel = store.spiel.beobachten(code, s => {
    if (s) hatteSpiel = true;
    spiel = s;
    if (s && s.status === 'frage' && s.frage.nr !== letzteFrage) { letzteFrage = s.frage.nr; zeitUm = false; sendet = false; }
    zeichne();
  });
  if (ich) beobachteMich();
  const uhr = setInterval(takt, 200);
  zeichne();

  return () => { stoppSpiel(); stoppEigen?.(); clearInterval(uhr); };
}
