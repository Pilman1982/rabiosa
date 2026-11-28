import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BYTES_MAX, TEXT_MAX, PUNKTE_MAX, neueTafelVorlage, beispielTafel, tafelFehler, zonenRaster, zoneVon,
  saeubereElement, vereinfache, zielGroesse, bildPruefen, bildErlaubt, istOnline, praesentationsSchritte,
  neuerStapel, merke, rueckgaengig, wiederholen, sitzungAusVorlage, istWhiteboard, neustartWarten, NEUSTART_WARTEN_MS,
} from '../js/logik/tafel.js';
import { quizFehler } from '../js/logik/quiz.js';

test('zonenRaster: 16:9 pro Zone, Raster nach Anzahl', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(n => { const r = zonenRaster(n); return [r.spalten, r.zeilen]; }),
    [[1, 1], [1, 1], [2, 1], [2, 2], [2, 2], [3, 2], [3, 2]]);
  const r = zonenRaster(3);
  assert.equal(r.b, 3200); assert.equal(r.h, 1800);
  assert.deepEqual(r.zonen[2], { x: 0, y: 900, b: 1600, h: 900 });
  assert.equal(r.zonen.length, 3, 'das vierte Feld des Rasters bleibt leer');
});

test('zoneVon: die Mitte entscheidet, ausserhalb ist -1', () => {
  const r = zonenRaster(4);
  assert.equal(zoneVon({ x: 1500, y: 100, b: 300, h: 100 }, r), 1);
  assert.equal(zoneVon({ x: 1400, y: 100, b: 300, h: 100 }, r), 0);
  assert.equal(zoneVon({ x: 4000, y: 0, b: 10, h: 10 }, r), -1);
});

test('tafelFehler: Titel nötig, höchstens 6 Zonen mit Titel, Gruppen 2 bis 8', () => {
  assert.deepEqual(tafelFehler(beispielTafel('de')), []);
  const v = { ...neueTafelVorlage('de'), titel: '' };
  assert.deepEqual(tafelFehler(v).map(f => f.code), ['titel']);
  const zuViele = { ...beispielTafel('de'), fragen: Array.from({ length: 7 }, () => ({ typ: 'zone', text: 'Z', inhalt: '' })) };
  assert.ok(tafelFehler(zuViele).some(f => f.code === 'zonenZuViele'));
  assert.deepEqual(tafelFehler({ ...beispielTafel('de'), fragen: [{ typ: 'zone', text: ' ', inhalt: '' }] }), [{ frage: 0, code: 'zoneTitel' }]);
  assert.ok(tafelFehler({ ...beispielTafel('de'), gruppenVorgabe: 9 }).some(f => f.code === 'gruppen'));
  assert.deepEqual(quizFehler(beispielTafel('de')), [], 'quizFehler leitet Vorlagen hierher');
});

test('Beispiel: Zonen, Sprachen, Erkennung', () => {
  const de = beispielTafel('de'), en = beispielTafel('en');
  assert.ok(istWhiteboard(de)); assert.ok(!istWhiteboard({ art: 'quiz' })); assert.ok(!istWhiteboard(null));
  assert.deepEqual(de.fragen.map(z => z.text), ['Inspiration', 'Saison', 'Ideen', 'Unser Gericht']);
  assert.deepEqual(en.fragen.map(z => z.text), ['Inspiration', 'Season', 'Ideas', 'Our dish']);
  assert.equal(de.gruppenVorgabe, 5); assert.equal(en.sprache, 'en');
  assert.deepEqual(tafelFehler(en), []);
});

test('bildPruefen: Art und Grösse (Review Focus 3)', () => {
  assert.equal(bildPruefen({ type: 'image/gif', size: 12 * 1024 * 1024 }), 'gross');
  assert.equal(bildPruefen({ type: 'image/gif', size: 8 * 1024 * 1024 }), null);
  assert.equal(bildPruefen({ type: 'image/jpeg', size: 30 * 1024 * 1024 }), null, 'wird verkleinert');
  assert.equal(bildPruefen({ type: 'application/pdf', size: 1000 }), 'art');
  assert.equal(bildPruefen({ type: '', size: 10 }), 'art');
});

test('bildErlaubt: höchstens 40 Bilder und 100 MB pro Board', () => {
  assert.equal(bildErlaubt({ bilder: 39, bytes: 0 }, 1), null);
  assert.equal(bildErlaubt({ bilder: 40, bytes: 0 }, 1), 'anzahl');
  assert.equal(bildErlaubt({ bilder: 1, bytes: BYTES_MAX - 10 }, 11), 'menge');
});

test('saeubereElement: fremde Felder weg, Grenzen eingehalten, unbekannte Art = null', () => {
  const e = saeubereElement({ id: 'e1', gruppe: 0, art: 'zettel', x: 1.234, y: 2, b: 200, h: 120, text: 'x'.repeat(5000), boese: 1 });
  assert.equal(e.text.length, TEXT_MAX); assert.equal(e.x, 1.2); assert.ok(!('boese' in e));
  assert.equal(saeubereElement({ id: 'e2', gruppe: 0, art: 'video' }), null);
  assert.equal(saeubereElement({ id: 'e3', gruppe: 0, art: 'strich', punkte: Array(5000).fill(1) }).punkte.length, PUNKTE_MAX);
});

test('vereinfache: gerade Linie schrumpft auf zwei Punkte, Ecke bleibt', () => {
  assert.deepEqual(vereinfache([0, 0, 1, 1, 2, 2, 3, 3]), [0, 0, 3, 3]);
  assert.deepEqual(vereinfache([0, 0, 50, 0, 50, 50]), [0, 0, 50, 0, 50, 50]);
});

test('zielGroesse: lange Seite höchstens 2000, kleine Bilder bleiben', () => {
  assert.deepEqual(zielGroesse(4000, 3000), { b: 2000, h: 1500 });
  assert.deepEqual(zielGroesse(800, 600), { b: 800, h: 600 });
});

test('praesentationsSchritte: Gesamt, jede Zone, Gesamt (Review Focus 5)', () => {
  assert.deepEqual(praesentationsSchritte(4), ['gesamt', 0, 1, 2, 3, 'gesamt']);
  assert.deepEqual(praesentationsSchritte(0), ['gesamt']);
});

test('Rückgängig und Wiederholen: Gegenschritt, Wiederholen nach Rückgängig, neuer Schritt leert vor', () => {
  const a = { id: 'e1', x: 0 }, b = { id: 'e1', x: 10 };
  let s = merke(neuerStapel(), { vorher: a, nachher: b });
  const r = rueckgaengig(s);
  assert.deepEqual(r.schritt, { vorher: b, nachher: a });
  const w = wiederholen(r.stapel);
  assert.deepEqual(w.schritt, { vorher: a, nachher: b });
  assert.equal(merke(r.stapel, { vorher: null, nachher: a }).vor.length, 0);
  assert.equal(rueckgaengig(neuerStapel()), null);
});

test('Stapel: höchstens 100 Schritte', () => {
  let s = neuerStapel();
  for (let i = 0; i < 150; i++) s = merke(s, { vorher: null, nachher: { id: 'e' + i } });
  assert.equal(s.zurueck.length, 100);
});

test('istOnline: Lebenszeichen jünger als 70 Sekunden', () => {
  assert.ok(istOnline({ zuletzt: 1000 }, 1000 + 69_000));
  assert.ok(!istOnline({ zuletzt: 1000 }, 1000 + 71_000));
  assert.ok(!istOnline({}, 5));
});

test('sitzungAusVorlage: Zonen, Gruppen, offen, nichts gesperrt', () => {
  const s = sitzungAusVorlage({ ...beispielTafel('de'), id: 'q1' }, ['A', 'B'], 'u1');
  assert.equal(s.vorlageId, 'q1'); assert.equal(s.hostUid, 'u1'); assert.equal(s.status, 'offen');
  assert.deepEqual(s.gruppen, ['A', 'B']); assert.deepEqual(s.gesperrt, []); assert.equal(s.zonen.length, 4);
});

test('neustartWarten: wenige Versuche mit wachsender Wartezeit, danach keiner mehr', () => {
  assert.ok(NEUSTART_WARTEN_MS.length >= 2 && NEUSTART_WARTEN_MS.length <= 5, 'nur wenige Versuche');
  const zeiten = NEUSTART_WARTEN_MS.map((_, i) => neustartWarten(i));
  assert.ok(zeiten[0] >= 1000, 'nie sofort (keine enge Schleife)');
  for (let i = 1; i < zeiten.length; i++) assert.ok(zeiten[i] > zeiten[i - 1], 'wachsend');
  assert.equal(neustartWarten(NEUSTART_WARTEN_MS.length), null);
  assert.equal(neustartWarten(-1), null);
  assert.equal(neustartWarten(Number.NaN), null);
});
