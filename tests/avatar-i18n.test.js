import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSvg, zufallsAvatar, saubererAvatar, BERUFE, FRISUREN, HAARFARBEN, HAUTTOENE, GESCHLECHTER } from '../js/avatar.js';
import { t, TEXTE, SPRACHEN } from '../js/i18n.js';
import { readdirSync, readFileSync } from 'node:fs';

test('avatarSvg: jede Kombination aus Beruf und Frisur ergibt ein vollständiges SVG', () => {
  for (const beruf of BERUFE) for (const frisur of FRISUREN) {
    const svg = avatarSvg({ beruf, frisur, haar: 'braun', haut: 2, brille: true, bart: true });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), beruf + '/' + frisur);
    assert.ok(!/undefined|NaN|null/.test(svg), beruf + '/' + frisur);
  }
});

test('avatarSvg: jede Zeichnung hat eine eigene clipPath-Kennung', () => {
  const kennung = svg => svg.match(/clipPath id="([^"]+)"/)[1];
  const a = avatarSvg({ beruf: 'kueche' }), b = avatarSvg({ beruf: 'kueche' });
  assert.notEqual(kennung(a), kennung(b));
  assert.ok(a.includes(`url(#${kennung(a)})`));
});

test('saubererAvatar lässt nur erlaubte Werte durch', () => {
  assert.deepEqual(saubererAvatar({ beruf: 'direktion', haut: 4, haar: 'grau', frisur: 'scheitel', brille: true, bart: false, geschlecht: 'frau', geschminkt: true, ohrstecker: true }),
    { beruf: 'direktion', haut: 4, haar: 'grau', frisur: 'scheitel', brille: true, bart: false, geschlecht: 'frau', geschminkt: true, ohrstecker: true });
  assert.deepEqual(saubererAvatar({ beruf: '<script>', haut: 99, haar: '"><img onerror=x>', frisur: null, brille: 'ja', bart: 1, geschlecht: '<b>', geschminkt: 'ja', ohrstecker: 1 }),
    { beruf: BERUFE[0], haut: 1, haar: HAARFARBEN[1], frisur: FRISUREN[0], brille: false, bart: false, geschlecht: 'divers', geschminkt: false, ohrstecker: false });
  assert.deepEqual(saubererAvatar(undefined), saubererAvatar({}));
});

const ohneKennung = svg => svg.replace(/av\d+/g, 'av');

test('Geschlecht: Frau, Mann und divers sind wählbar und ergeben drei verschiedene Figuren', () => {
  assert.deepEqual(GESCHLECHTER, ['frau', 'mann', 'divers']);
  const bilder = GESCHLECHTER.map(geschlecht => ohneKennung(avatarSvg({ beruf: 'service', geschlecht })));
  assert.equal(new Set(bilder).size, 3);
});

test('Geschlecht: ein Avatar ohne Angabe (altes Handy, gespeichertes Profil) sieht aus wie bisher, also wie divers', () => {
  const alt = { beruf: 'kueche', haut: 2, haar: 'braun', frisur: 'lang', brille: true, bart: false };
  assert.equal(ohneKennung(avatarSvg(alt)), ohneKennung(avatarSvg({ ...alt, geschlecht: 'divers', geschminkt: false, ohrstecker: false })));
});

test('Extras: Schminke und Ohrstecker verändern die Zeichnung, bei jedem Geschlecht und jeder Frisur', () => {
  for (const geschlecht of GESCHLECHTER) for (const frisur of FRISUREN) {
    const basis = { beruf: 'reception', frisur, geschlecht };
    const ohne = ohneKennung(avatarSvg(basis));
    const geschminkt = ohneKennung(avatarSvg({ ...basis, geschminkt: true }));
    const stecker = ohneKennung(avatarSvg({ ...basis, ohrstecker: true }));
    assert.notEqual(geschminkt, ohne, geschlecht + '/' + frisur);
    assert.notEqual(stecker, ohne, geschlecht + '/' + frisur);
    assert.notEqual(stecker, geschminkt, geschlecht + '/' + frisur);
  }
});

test('avatarSvg: alle Kombinationen aus Geschlecht und Extras ergeben ein vollständiges SVG', () => {
  const janein = [false, true];
  for (const beruf of BERUFE) for (const geschlecht of GESCHLECHTER) for (const brille of janein) for (const bart of janein) for (const geschminkt of janein) for (const ohrstecker of janein) {
    const svg = avatarSvg({ beruf, geschlecht, brille, bart, geschminkt, ohrstecker, frisur: 'locken', haut: 4 });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!/undefined|NaN|null/.test(svg), JSON.stringify({ beruf, geschlecht, brille, bart, geschminkt, ohrstecker }));
  }
});

test('Firebase-Regeln lassen genau die Felder zu, die saubererAvatar liefert', () => {
  const regeln = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const block = regeln.slice(regeln.indexOf('function avatarGueltig'));
  const felder = block.match(/hasOnly\(\[([^\]]+)\]\)/)[1].match(/'([a-z]+)'/g).map(f => f.slice(1, -1));
  assert.deepEqual(felder.slice().sort(), Object.keys(saubererAvatar({})).sort());
  for (const f of felder) assert.ok(block.slice(0, block.indexOf('}')).includes(`a.get('${f}',`), 'Typprüfung fehlt: ' + f);
});

test('avatarSvg: fremde Eingaben vom Handy können kein HTML einschleusen', () => {
  const svg = avatarSvg({ beruf: '<script>alert(1)</script>', haar: '"><img src=x onerror=alert(1)>', frisur: '</svg><b>', haut: '<i>' });
  assert.ok(!/script|onerror|<img|<b>|<i>/.test(svg));
});

test('zufallsAvatar liefert nur erlaubte Werte und nutzt den übergebenen Zufall', () => {
  for (let i = 0; i < 200; i++) {
    const a = zufallsAvatar();
    assert.deepEqual(a, saubererAvatar(a));
    assert.ok(BERUFE.includes(a.beruf) && FRISUREN.includes(a.frisur) && HAARFARBEN.includes(a.haar));
    assert.ok(a.haut >= 0 && a.haut < HAUTTOENE.length);
    assert.ok(GESCHLECHTER.includes(a.geschlecht));
    assert.ok(!(a.geschlecht === 'frau' && a.bart), 'Zufall würfelt keiner Frau einen Bart');
  }
  assert.deepEqual(zufallsAvatar(() => 0), zufallsAvatar(() => 0));
  assert.notDeepEqual(zufallsAvatar(() => 0), zufallsAvatar(() => 0.99));
});

test('i18n: jede Textkennung gibt es in beiden Sprachen', () => {
  assert.deepEqual(SPRACHEN, ['de', 'en']);
  assert.deepEqual(Object.keys(TEXTE.de).sort(), Object.keys(TEXTE.en).sort());
  for (const sprache of SPRACHEN) for (const [k, v] of Object.entries(TEXTE[sprache])) assert.ok(typeof v === 'string' && v.trim(), sprache + ':' + k);
});

test('i18n: deutsche Texte in Schweizer Rechtschreibung (kein ß)', () => {
  for (const [k, v] of Object.entries(TEXTE.de)) assert.ok(!v.includes('ß'), k);
});

test('i18n: gleiche Platzhalter in beiden Sprachen', () => {
  const platzhalter = s => (s.match(/\{\w+\}/g) || []).sort();
  for (const k of Object.keys(TEXTE.de)) assert.deepEqual(platzhalter(TEXTE.en[k]), platzhalter(TEXTE.de[k]), k);
});

test('t ersetzt Platzhalter, fällt auf Deutsch zurück und zeigt unbekannte Kennungen an', () => {
  assert.equal(t('de', 'frage.nummer', { nr: 4, von: 12 }), 'Frage 4 von 12');
  assert.equal(t('en', 'frage.nummer', { nr: 4, von: 12 }), 'Question 4 of 12');
  assert.equal(t('fr', 'frage.nummer', { nr: 1, von: 2 }), 'Frage 1 von 2');
  assert.equal(t('de', 'gibt.es.nicht'), 'gibt.es.nicht');
});

test('i18n: jede in den Ansichten verwendete Textkennung gibt es', () => {
  const ordner = new URL('../js/ansicht/', import.meta.url);
  const dateien = readdirSync(ordner).map(d => new URL(d, ordner)).concat(new URL('../js/ui.js', import.meta.url));
  const bereiche = new Set(Object.keys(TEXTE.de).map(k => k.split('.')[0]));
  let gefunden = 0;
  for (const datei of dateien) {
    const text = readFileSync(datei, 'utf8');
    const name = datei.pathname.split('/').pop();
    // ganze Kennungen wie 'beamer.code'
    for (const m of text.matchAll(/'([a-z]+)\.([a-zA-Z]+)'/g)) {
      if (!bereiche.has(m[1])) continue;
      gefunden++;
      assert.ok(`${m[1]}.${m[2]}` in TEXTE.de, `${name}: ${m[1]}.${m[2]}`);
    }
    // zusammengesetzte Kennungen wie 'typ.' + f.typ: der Vorsatz muss vorkommen
    for (const m of text.matchAll(/'([a-z]+)\.' \+/g)) assert.ok(bereiche.has(m[1]), `${name}: ${m[1]}.*`);
  }
  assert.ok(gefunden > 100, 'nur ' + gefunden + ' Kennungen gefunden');
});
