import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSvg, zufallsAvatar, saubererAvatar, BERUFE, FRISUREN, HAARFARBEN, HAUTTOENE } from '../js/avatar.js';
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
  assert.deepEqual(saubererAvatar({ beruf: 'direktion', haut: 4, haar: 'grau', frisur: 'scheitel', brille: true, bart: false }),
    { beruf: 'direktion', haut: 4, haar: 'grau', frisur: 'scheitel', brille: true, bart: false });
  assert.deepEqual(saubererAvatar({ beruf: '<script>', haut: 99, haar: '"><img onerror=x>', frisur: null, brille: 'ja', bart: 1 }),
    { beruf: BERUFE[0], haut: 1, haar: HAARFARBEN[1], frisur: FRISUREN[0], brille: false, bart: false });
  assert.deepEqual(saubererAvatar(undefined), saubererAvatar({}));
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
