// Quiz-Editor: Fragen erfassen, ordnen und laufend speichern.
import { h, marke, meldung, fehlerText, rueckfrage, BUCHSTABEN } from '../ui.js';
import { t } from '../i18n.js';
import { TYPEN, ZEIT_WAHL, neueFrage, quizFehler, zufallsId, clocheFelder, zuVieleFuerEcken, THEMA_MAX } from '../logik/quiz.js';
import { leseZahl } from '../logik/pruefen.js';

const BILD_MAX_ZEICHEN = 900000;   // als Text gespeichert; entspricht rund 675 KB

/** Verkleinert ein Bild im Browser zu einem JPEG, das sicher in einen Datenbank-Eintrag passt. */
export async function verkleinere(datei) {
  const bild = await createImageBitmap(datei);
  for (const [seite, guete] of [[1280, 0.82], [1280, 0.68], [1024, 0.68], [1024, 0.52], [800, 0.55], [640, 0.5]]) {
    const faktor = Math.min(1, seite / Math.max(bild.width, bild.height));
    const flaeche = document.createElement('canvas');
    flaeche.width = Math.round(bild.width * faktor);
    flaeche.height = Math.round(bild.height * faktor);
    const stift = flaeche.getContext('2d');
    stift.fillStyle = '#fff';
    stift.fillRect(0, 0, flaeche.width, flaeche.height);
    stift.drawImage(bild, 0, 0, flaeche.width, flaeche.height);
    const daten = flaeche.toDataURL('image/jpeg', guete);
    if (daten.length <= BILD_MAX_ZEICHEN) return daten;
  }
  throw Object.assign(new Error('Bild zu gross'), { code: 'bildZuGross' });
}

export function zeige(wurzel, ctx, quizId) {
  const { store } = ctx;
  const s = ctx.sprache;
  const T = (k, w) => t(s, k, w);
  let quiz = null, gewaehlt = 0, abgebaut = false;
  let speicherUhr = null, kette = Promise.resolve(true);

  const standEl = h('span', { class: 'speicherstand' });
  const maengelEl = h('div');
  const listeEl = h('aside', { class: 'ed-liste' });
  const frageEl = h('section', { class: 'ed-frage' });

  // ---------- Speichern ----------
  function setzeStand(k, fehler = false) { standEl.textContent = T(k); standEl.classList.toggle('fehler', fehler); }
  /** Speichert nacheinander (nie zwei Speicherungen gleichzeitig). Ergebnis: true, wenn es geklappt hat. */
  function speichere() {
    clearTimeout(speicherUhr);
    speicherUhr = null;
    kette = kette.then(async () => {
      setzeStand('editor.speichert');
      try { await store.quiz.speichern(quiz); setzeStand('editor.gespeichert'); return true; }
      catch (e) { console.error(e); setzeStand('editor.nichtGespeichert', true); return false; }
    });
    return kette;
  }
  /** Nach jeder Änderung: bald speichern, Mängel und Liste links nachführen. */
  function geaendert() {
    clearTimeout(speicherUhr);
    speicherUhr = setTimeout(speichere, 700);
    zeichneMaengel();
    zeichneListe();
  }
  const neu = () => { geaendert(); zeichneFrage(); };

  // ---------- Kopf, Mängel, Liste ----------
  function zeichneMaengel() {
    const fehler = quizFehler(quiz);
    const teile = [fehler.length
      ? h('div', { class: 'maengel' }, h('b', null, T('editor.maengel')), h('ul', null, fehler.map(f => h('li', null, T('mangel.' + f.code, { nr: (f.frage ?? 0) + 1 })))))
      : h('p', { class: 'spielbar' }, '✓ ' + T('editor.spielbar'))];
    if (zuVieleFuerEcken(quiz)) teile.push(h('p', { class: 'hilfe' }, T('editor.eckenHinweis')));
    maengelEl.replaceChildren(...teile);
  }

  function zeichneListe() {
    const mitMangel = new Set(quizFehler(quiz).filter(f => f.frage !== null).map(f => f.frage));
    listeEl.replaceChildren(
      h('ol', null, quiz.fragen.map((f, i) => h('li', null,
        h('button', { type: 'button', class: 'ed-punkt' + (i === gewaehlt ? ' an' : '') + (mitMangel.has(i) ? ' mangel' : ''), onclick: () => { gewaehlt = i; zeichneListe(); zeichneFrage(); } },
          h('span', { class: 'nr' }, i + 1),
          h('span', null, h('span', { class: 'art' }, T('typ.' + f.typ)), h('span', { class: 'auszug' }, f.text || '…')))))),
      h('p', { class: 'lab' }, T('editor.frageNeu')),
      h('div', { class: 'typwahl' }, TYPEN.map(typ => h('button', { type: 'button', class: 'chip', onclick: () => { quiz.fragen.push(neueFrage(typ)); gewaehlt = quiz.fragen.length - 1; neu(); } }, '+ ' + T('typ.' + typ)))));
  }

  // ---------- Formular einer Frage ----------
  const eingabe = (wert, beiAenderung, mehr = {}) => {
    const el = h('input', { class: 'feld', value: wert ?? '', ...mehr });
    el.addEventListener('input', () => { beiAenderung(el.value); geaendert(); });
    return el;
  };
  const textfeld = (wert, beiAenderung, mehr = {}) => {
    const el = h('textarea', { class: 'feld', ...mehr });
    el.value = wert ?? '';
    el.addEventListener('input', () => { beiAenderung(el.value); geaendert(); });
    return el;
  };
  const block = (titel, ...inhalt) => h('div', { class: 'ed-block' }, titel ? h('span', { class: 'lab' }, titel) : null, inhalt);
  const symbol = (zeichen, titel, klick, aus = false) => h('button', { type: 'button', class: 'symbolknopf', title: titel, 'aria-label': titel, disabled: aus, onclick: klick }, zeichen);
  const zahlText = z => (Number.isFinite(z) ? String(z).replace('.', s === 'en' ? '.' : ',') : '');
  const zahlWert = text => { const z = leseZahl(text); return Number.isNaN(z) ? null : z; };

  function antwortListe(f) {
    const mitRichtig = f.typ !== 'umfrage';
    const zeilen = f.antworten.map((a, i) => {
      const wahl = mitRichtig ? h('input', { type: f.typ === 'mc' ? 'radio' : 'checkbox', name: 'richtig-' + f.id, checked: !!a.richtig }) : null;
      wahl?.addEventListener('change', () => {
        if (f.typ === 'mc') f.antworten.forEach((x, j) => { x.richtig = j === i; }); else a.richtig = wahl.checked;
        geaendert();
      });
      return h('div', { class: 'ed-antwort' },
        h('i', { class: 'marke a' + (i + 1) }, BUCHSTABEN[i]),
        eingabe(a.text, v => { a.text = v; }, { maxlength: '120', placeholder: T('editor.antwort', { n: i + 1 }), 'aria-label': T('editor.antwort', { n: i + 1 }) }),
        wahl ? h('label', { class: 'richtigwahl' }, wahl, T('editor.richtigMarke')) : null,
        symbol('✕', T('editor.entfernen'), () => { f.antworten.splice(i, 1); if (f.typ === 'mc' && !f.antworten.some(x => x.richtig)) f.antworten[0].richtig = true; neu(); }, f.antworten.length <= 2));
    });
    return [zeilen, f.antworten.length < 6 ? h('button', { type: 'button', class: 'chip', onclick: () => { f.antworten.push(mitRichtig ? { text: '', richtig: false } : { text: '' }); neu(); } }, '+ ' + T('editor.antwortNeu')) : null,
      f.typ === 'umfrage' ? h('p', { class: 'hilfe' }, T('editor.umfrageHilfe')) : null];
  }

  function listenFelder(liste, min, max, beschriftung, neuText, sortierbar) {
    const zeilen = liste.map((wert, i) => h('div', { class: 'ed-antwort' },
      sortierbar ? h('i', { class: 'marke a1' }, i + 1) : null,
      eingabe(wert, v => { liste[i] = v; }, { maxlength: '80', placeholder: T(beschriftung, { n: i + 1 }), 'aria-label': T(beschriftung, { n: i + 1 }) }),
      sortierbar ? symbol('▲', T('frage.hoch'), () => { [liste[i - 1], liste[i]] = [liste[i], liste[i - 1]]; neu(); }, i === 0) : null,
      sortierbar ? symbol('▼', T('frage.runter'), () => { [liste[i + 1], liste[i]] = [liste[i], liste[i + 1]]; neu(); }, i === liste.length - 1) : null,
      symbol('✕', T('editor.entfernen'), () => { liste.splice(i, 1); neu(); }, liste.length <= min)));
    return [zeilen, liste.length < max ? h('button', { type: 'button', class: 'chip', onclick: () => { liste.push(''); neu(); } }, '+ ' + T(neuText)) : null];
  }

  function bildBlock(f) {
    const vorschau = h('div');
    if (f.bildId) store.quiz.bildLaden(quiz.id, f.bildId).then(d => { if (d) vorschau.replaceChildren(h('img', { class: 'bildvorschau', src: d, alt: '' })); }).catch(() => {});
    const wahl = h('input', { type: 'file', accept: 'image/*', hidden: true });
    wahl.addEventListener('change', async () => {
      const datei = wahl.files[0];
      if (!datei) return;
      try {
        const daten = await verkleinere(datei);
        const alt = f.bildId;
        f.bildId = await store.quiz.bildSpeichern(quiz.id, daten);
        if (alt) store.quiz.bildLoeschen(quiz.id, alt).catch(() => {});
        neu();
      } catch (e) { meldung(e.code === 'bildZuGross' ? T('editor.bildZuGross') : fehlerText(s, e)); }
    });
    return block(null, vorschau, wahl,
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => wahl.click() }, T('editor.bildWaehlen')),
        f.bildId ? h('button', { type: 'button', class: 'chip', onclick: () => { store.quiz.bildLoeschen(quiz.id, f.bildId).catch(() => {}); f.bildId = null; neu(); } }, T('editor.bildEntfernen')) : null),
      h('p', { class: 'hilfe' }, T('editor.bildHilfe')));
  }

  function typFelder(f) {
    if (f.typ === 'mc' || f.typ === 'mehrfach' || f.typ === 'umfrage') return block(null, antwortListe(f));
    if (f.typ === 'wf') {
      const wahl = (wert, text) => {
        const r = h('input', { type: 'radio', name: 'wf-' + f.id, checked: f.richtig === wert });
        r.addEventListener('change', () => { f.richtig = wert; geaendert(); });
        return h('label', { class: 'schalter' }, r, text);
      };
      return block(null, wahl(true, T('editor.stimmt')), wahl(false, T('editor.stimmtNicht')));
    }
    if (f.typ === 'schaetz') {
      return block(null, h('div', { class: 'ed-zeile' },
        h('label', null, h('span', { class: 'lab' }, T('editor.wert')), eingabe(zahlText(f.wert), v => { f.wert = zahlWert(v); }, { inputmode: 'decimal' })),
        h('label', null, h('span', { class: 'lab' }, T('editor.toleranz')), eingabe(zahlText(f.toleranz), v => { f.toleranz = v.trim() === '' ? 0 : zahlWert(v); }, { inputmode: 'decimal' })),
        h('label', null, h('span', { class: 'lab' }, T('editor.einheit')), eingabe(f.einheit, v => { f.einheit = v; }, { maxlength: '12' }))),
        h('p', { class: 'hilfe' }, T('editor.toleranzHilfe')));
    }
    if (f.typ === 'reihe') return block(null, h('p', { class: 'hilfe' }, T('editor.reiheHilfe')), listenFelder(f.elemente, 3, 6, 'editor.element', 'editor.elementNeu', true));
    return block(null, listenFelder(f.loesungen, 1, 8, 'editor.loesung', 'editor.loesungNeu', false), h('p', { class: 'hilfe' }, T('editor.kurzHilfe')));
  }

  function zeichneFrage() {
    const f = quiz.fragen[gewaehlt];
    if (!f) { frageEl.replaceChildren(h('p', { class: 'ed-leer' }, T('mangel.keineFragen'))); return; }
    const i = gewaehlt, letzte = quiz.fragen.length - 1;
    const tausche = j => { [quiz.fragen[i], quiz.fragen[j]] = [quiz.fragen[j], quiz.fragen[i]]; gewaehlt = j; neu(); };
    const zeitFeld = eingabe(String(f.zeit), v => { f.zeit = /^\d+$/.test(v.trim()) ? Number(v) : 0; }, { class: 'feld zeitfeld', inputmode: 'numeric', maxlength: '3', 'aria-label': T('editor.zeit') });
    frageEl.replaceChildren(
      h('div', { class: 'ed-werkzeug' },
        h('h2', null, `${i + 1} · ${T('typ.' + f.typ)}`),
        h('div', null,
          symbol('▲', T('editor.hoch'), () => tausche(i - 1), i === 0),
          symbol('▼', T('editor.runter'), () => tausche(i + 1), i === letzte),
          symbol('⧉', T('editor.frageDuplizieren'), async () => {
            const kopie = JSON.parse(JSON.stringify(f));
            kopie.id = zufallsId('f');
            if (f.bildId) { const d = await store.quiz.bildLaden(quiz.id, f.bildId).catch(() => null); kopie.bildId = d ? await store.quiz.bildSpeichern(quiz.id, d).catch(() => null) : null; }
            quiz.fragen.splice(i + 1, 0, kopie); gewaehlt = i + 1; neu();
          }),
          symbol('🗑', T('editor.frageLoeschen'), async () => {
            if (!await rueckfrage(s, T('editor.frageLoeschen') + '?', T('studio.loeschen'))) return;
            if (f.bildId) store.quiz.bildLoeschen(quiz.id, f.bildId).catch(() => {});
            quiz.fragen.splice(i, 1); gewaehlt = Math.max(0, Math.min(i, quiz.fragen.length - 1)); neu();
          }))),
      block(T('editor.frageText'), textfeld(f.text, v => { f.text = v; }, { maxlength: '300', rows: '3' })),
      bildBlock(f),
      typFelder(f),
      block(T('editor.zeit'), h('div', { class: 'chips' },
        ZEIT_WAHL.map(z => h('button', { type: 'button', class: 'chip' + (f.zeit === z ? ' an' : ''), onclick: () => { f.zeit = z; neu(); } }, T('editor.sekunden', { n: z }))), zeitFeld)),
      block(T('editor.erklaerung'), textfeld(f.erklaerung, v => { f.erklaerung = v; }, { maxlength: '400', rows: '2' })),
      clocheBlock(f));
  }

  /** Thema und Stufe für Cloche (freiwillig; für das Live-Spiel ohne Bedeutung). */
  function clocheBlock(f) {
    const themen = [...new Set(quiz.fragen.map(x => clocheFelder(x).thema).filter(Boolean))];
    const setzeThema = v => { const th = v.trim().slice(0, THEMA_MAX); if (th) f.thema = th; else delete f.thema; };
    const stufe = clocheFelder(f).stufe;
    const setzeStufe = n => { if (n) f.stufe = n; else delete f.stufe; neu(); };
    return h('div', { class: 'ed-cloche' },
      h('p', { class: 'lab' }, T('editor.clocheTitel')),
      h('div', { class: 'ed-cloche-felder' },
        block(T('editor.thema'),
          eingabe(f.thema, setzeThema, { maxlength: String(THEMA_MAX), list: 'themen-vorschlaege', autocomplete: 'off', placeholder: T('editor.themaBeispiel') }),
          h('datalist', { id: 'themen-vorschlaege' }, themen.map(th => h('option', { value: th })))),
        block(T('editor.stufe'), h('div', { class: 'chips' },
          [null, 1, 2, 3].map(n => h('button', { type: 'button', class: 'chip' + (stufe === n ? ' an' : ''), onclick: () => setzeStufe(n) },
            n ? T('editor.stufeN', { n, p: n * 100 }) : '–'))))),
      h('p', { class: 'hilfe' }, T('editor.clocheHilfe')));
  }

  /** Ordner, die schon jemand benutzt (das Studio merkt sie sich beim Laden der Listen). */
  function bekannteOrdner() {
    try { const liste = JSON.parse(sessionStorage.getItem('rabiosa-ordner') || '[]'); return Array.isArray(liste) ? liste.filter(o => typeof o === 'string').slice(0, 200) : []; }
    catch { return []; }
  }

  function zeichneAlles() {
    const sprachwahl = h('select', { class: 'feld' }, h('option', { value: 'de' }, T('editor.deutsch')), h('option', { value: 'en' }, T('editor.englisch')));
    sprachwahl.value = quiz.sprache || 'de';
    sprachwahl.addEventListener('change', () => { quiz.sprache = sprachwahl.value; geaendert(); });
    const titel = h('input', { class: 'titelfeld', value: quiz.titel || '', maxlength: '80', placeholder: T('editor.unbenannt'), 'aria-label': T('editor.titel') });
    titel.addEventListener('input', () => { quiz.titel = titel.value; geaendert(); });
    wurzel.replaceChildren(h('div', { class: 'studio editor' },
      h('header', { class: 'studiokopf' },
        h('a', { class: 'marke-klein', href: '#/studio' }, marke()), titel, standEl,
        h('button', { class: 'knopf klein', onclick: async () => { if (await speichere()) ctx.geh('#/studio'); } }, T('editor.fertig'))),
      h('div', { class: 'ed-meta' },
        h('label', null, h('span', { class: 'lab' }, T('editor.fach')), eingabe(quiz.fach, v => { quiz.fach = v; }, { maxlength: '40' })),
        h('label', null, h('span', { class: 'lab' }, T('editor.ordner')),
          eingabe(quiz.ordner, v => { quiz.ordner = v; }, { maxlength: '80', placeholder: T('editor.ordnerBeispiel'), list: 'ordner-vorschlaege', autocomplete: 'off' })),
        h('datalist', { id: 'ordner-vorschlaege' }, bekannteOrdner().map(o => h('option', { value: o }))),
        h('label', null, h('span', { class: 'lab' }, T('editor.sprache')), sprachwahl)),
      h('p', { class: 'hilfe' }, T('editor.ordnerHilfe')),
      maengelEl,
      h('div', { class: 'ed-spalten' }, listeEl, frageEl)));
    zeichneMaengel();
    zeichneListe();
    zeichneFrage();
    setzeStand('editor.gespeichert');
  }

  wurzel.replaceChildren(h('p', { class: 'laedt' }, T('allg.laedt')));
  let geladen = false;
  const stopp = store.konto.beobachten(async konto => {
    if (!konto || !konto.freigeschaltet) { ctx.geh('#/studio'); return; }
    if (geladen) return;
    geladen = true;
    try {
      const q = await store.quiz.laden(quizId);
      if (q.besitzer !== konto.uid) { ctx.geh('#/studio'); return; }
      if (q.art === 'praesentation') { ctx.geh('#/studio/folien/' + quizId); return; }
      if (abgebaut) return;
      quiz = JSON.parse(JSON.stringify(q));
      zeichneAlles();
    } catch (e) { meldung(fehlerText(s, e)); ctx.geh('#/studio'); }
  });

  // Beim Schliessen des Fensters noch speichern, was offen ist.
  const beimVerlassen = () => { if (speicherUhr && quiz) speichere(); };
  window.addEventListener('pagehide', beimVerlassen);

  return () => {
    abgebaut = true;
    stopp();
    window.removeEventListener('pagehide', beimVerlassen);
    if (speicherUhr && quiz) speichere();
  };
}
