import test from 'node:test';
import assert from 'node:assert/strict';
import { schrittRechteck, passeRechteck, schrittTexte, blaettere, gruppeVonZiffer, zeigenZugang } from '../js/logik/tafelzeigen.js';
import { praesentationsSchritte } from '../js/logik/tafel.js';

test('schrittRechteck: gesamt = ganzes Raster, Zahl = diese Zone, unbekannt = gesamt', () => {
  assert.deepEqual(schrittRechteck('gesamt', 4), { x: 0, y: 0, b: 3200, h: 1800 });
  assert.deepEqual(schrittRechteck(3, 4), { x: 1600, y: 900, b: 1600, h: 900 });
  assert.deepEqual(schrittRechteck('gesamt', 0), { x: 0, y: 0, b: 1600, h: 900 });
  assert.deepEqual(schrittRechteck(9, 2), { x: 0, y: 0, b: 3200, h: 900 });
});

test('passeRechteck: füllt die Fläche, behält das Seitenverhältnis, mittig; Zone wird an den Ursprung verschoben', () => {
  assert.deepEqual(passeRechteck({ x: 0, y: 0, b: 1600, h: 900 }, 1600, 900), { s: 1, x: 0, y: 0 });
  const breit = passeRechteck({ x: 0, y: 0, b: 1600, h: 900 }, 3200, 900);   // seitlich Leerraum
  assert.equal(breit.s, 1); assert.equal(breit.x, 800); assert.equal(breit.y, 0);
  const z = passeRechteck({ x: 1600, y: 900, b: 1600, h: 900 }, 800, 450);
  assert.equal(z.s, 0.5);
  assert.equal(1600 * z.s + z.x, 0, 'linke Kante der Zone am linken Rand');
  assert.equal(900 * z.s + z.y, 0, 'obere Kante der Zone am oberen Rand');
  const rand = passeRechteck({ x: 0, y: 0, b: 1000, h: 1000 }, 1000, 500, 50);
  assert.equal(rand.s, 0.4);
  assert.ok(passeRechteck({ x: 0, y: 0, b: 100, h: 100 }, 0, 0).s > 0);
});

test('schrittTexte: Gesamt · 1 Inspiration · …, ohne Titel «Zone n»', () => {
  const zonen = [{ text: 'Inspiration' }, { text: '  ' }, { text: 'Idee' }];
  assert.deepEqual(schrittTexte(praesentationsSchritte(3), zonen, 'Gesamt', n => 'Zone ' + n), ['Gesamt', '1 Inspiration', '2 Zone 2', '3 Idee', 'Gesamt']);
  assert.deepEqual(schrittTexte(praesentationsSchritte(0), [], 'Gesamt', n => 'Zone ' + n), ['Gesamt']);
  assert.deepEqual(schrittTexte(['gesamt', 0], undefined, 'G', n => 'Z' + n), ['G', '1 Z1']);
});

test('blaettere: bleibt in 0 bis anzahl-1', () => {
  assert.equal(blaettere(0, -1, 6), 0);
  assert.equal(blaettere(5, 1, 6), 5);
  assert.equal(blaettere(2, 1, 6), 3);
  assert.equal(blaettere(2, -1, 6), 1);
  assert.equal(blaettere(0, 1, 1), 0);
  assert.equal(blaettere(0, 1, 0), 0);
});

test('gruppeVonZiffer: 1 bis 8 im Rahmen der Gruppen', () => {
  assert.equal(gruppeVonZiffer('1', 5), 0);
  assert.equal(gruppeVonZiffer('5', 5), 4);
  assert.equal(gruppeVonZiffer('6', 5), -1);
  assert.equal(gruppeVonZiffer('0', 5), -1);
  assert.equal(gruppeVonZiffer('9', 8), -1);
  assert.equal(gruppeVonZiffer('a', 8), -1);
  assert.equal(gruppeVonZiffer('12', 8), -1);
});

test('zeigenZugang: Leitung nur eigene Sitzung; Gast nur eigene Gruppe, abgegeben, offen', () => {
  const s = { hostUid: 'L', status: 'offen', gruppen: ['A', 'B', 'C'], gesperrt: [1] };
  const L = { uid: 'L' };
  assert.equal(zeigenZugang({ leitung: true, sitzung: undefined, konto: L, gruppe: 0 }), 'laedt');
  assert.equal(zeigenZugang({ leitung: true, sitzung: null, konto: L, gruppe: 0 }), 'weg');
  assert.equal(zeigenZugang({ leitung: true, sitzung: s, konto: undefined, gruppe: 0 }), 'laedt');
  assert.equal(zeigenZugang({ leitung: true, sitzung: s, konto: { uid: 'X' }, gruppe: 0 }), 'fremd');
  assert.equal(zeigenZugang({ leitung: true, sitzung: s, konto: L, gruppe: 0 }), 'ok', 'auch nicht abgegeben');
  assert.equal(zeigenZugang({ leitung: true, sitzung: s, konto: L, gruppe: 3 }), 'weg');
  assert.equal(zeigenZugang({ leitung: true, sitzung: { ...s, status: 'beendet' }, konto: L, gruppe: 0 }), 'ok');
  assert.equal(zeigenZugang({ leitung: false, sitzung: s, ich: undefined }), 'laedt');
  assert.equal(zeigenZugang({ leitung: false, sitzung: s, ich: null }), 'weg');
  assert.equal(zeigenZugang({ leitung: false, sitzung: s, ich: { gruppe: 0 } }), 'wartet');
  assert.equal(zeigenZugang({ leitung: false, sitzung: s, ich: { gruppe: 1 } }), 'ok');
  assert.equal(zeigenZugang({ leitung: false, sitzung: { ...s, status: 'beendet' }, ich: { gruppe: 1 } }), 'beendet');
  assert.equal(zeigenZugang({ leitung: false, sitzung: s, ich: { gruppe: 7 } }), 'weg');
});
