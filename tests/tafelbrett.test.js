import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DICKE, neueKennung, zuBrett, einpassen, zoome, huelle, strichAus, rechteckAus, linieAus, verschiebe, skaliere,
  getroffen, reihenfolge, zVorn, zHinten, pfeilSpitze, erstelleDrossel, kurzname, istFremdBearbeitet, gleicheElemente,
} from '../js/logik/tafelbrett.js';
import { PUNKTE_MAX, NAME_MAX } from '../js/logik/tafel.js';

test('neueKennung: e + Zeit in Basis 36 + 8 Zufallszeichen, sortiert nach Anlegezeit', () => {
  const a = neueKennung(1_700_000_000_000, n => 'x'.repeat(n));
  assert.equal(a, 'e' + (1_700_000_000_000).toString(36) + 'xxxxxxxx');
  const b = neueKennung(1_700_000_000_001, n => 'a'.repeat(n));
  assert.ok(a < b);
});

test('zuBrett und einpassen: Bildschirm = Brett * s + Versatz, Welt mittig mit Rand', () => {
  const a = { s: 0.5, x: 100, y: 20 };
  assert.deepEqual(zuBrett(a, 100, 20), { x: 0, y: 0 });
  assert.deepEqual(zuBrett(a, 900, 470), { x: 1600, y: 900 });
  const e = einpassen(1000, 1000, 1600, 900, 0);
  assert.equal(e.s, 1000 / 1600);
  assert.equal(e.x, 0);
  assert.equal(e.y, (1000 - 900 * e.s) / 2);
  const r = einpassen(1648, 948, 1600, 900, 24);
  assert.equal(r.s, 1); assert.equal(r.x, 24); assert.equal(r.y, 24);
  assert.ok(einpassen(0, 0, 1600, 900).s > 0, 'auch ohne Fläche ein brauchbarer Massstab');
});

test('zoome: der Punkt unter dem Zeiger bleibt stehen, Grenzen gelten', () => {
  const a = { s: 1, x: 0, y: 0 };
  const z = zoome(a, 2, 200, 100, 0.1, 4);
  assert.equal(z.s, 2);
  assert.deepEqual(zuBrett(z, 200, 100), zuBrett(a, 200, 100));
  assert.equal(zoome(a, 100, 0, 0, 0.1, 4).s, 4);
  assert.equal(zoome(a, 0.001, 0, 0, 0.1, 4).s, 0.1);
});

test('huelle: kleinstes Rechteck um alle Punkte, mindestens 1 breit und hoch', () => {
  assert.deepEqual(huelle([10, 20, 30, 5, 15, 40]), { x: 10, y: 5, b: 20, h: 35 });
  assert.deepEqual(huelle([10, 20, 30, 20]), { x: 10, y: 20, b: 20, h: 1 });
  assert.deepEqual(huelle([]), { x: 0, y: 0, b: 1, h: 1 });
});

test('strichAus: vereinfacht, Punkte relativ zur Ecke, Klick ergibt einen Punkt, Grenze eingehalten', () => {
  const s = strichAus([100, 100, 150, 100.2, 200, 100, 200, 160]);
  assert.equal(s.x, 100); assert.equal(s.y, 100);
  assert.deepEqual(s.punkte, [0, 0, 100, 0, 100, 60], 'der fast gerade Zwischenpunkt fällt weg');
  assert.equal(s.b, 100); assert.equal(s.h, 60);
  const p = strichAus([50, 60]);
  assert.deepEqual(p.punkte, [0, 0, 0, 0]);
  assert.equal(p.x, 50); assert.equal(p.y, 60);
  const zick = [];
  for (let i = 0; i < 3000; i++) zick.push(i * 3, i % 2 ? 0 : 40);
  const lang = strichAus(zick);
  assert.ok(lang.punkte.length <= PUNKTE_MAX && lang.punkte.length % 2 === 0, String(lang.punkte.length));
  assert.ok(lang.punkte.every(Number.isFinite));
});

test('rechteckAus und linieAus: Ziehen in jede Richtung', () => {
  assert.deepEqual(rechteckAus(300, 200, 100, 50), { x: 100, y: 50, b: 200, h: 150 });
  const l = linieAus(300, 200, 100, 50);
  assert.deepEqual(l, { x: 100, y: 50, b: 200, h: 150, punkte: [200, 150, 0, 0] }, 'Start bleibt Start (die Spitze zeigt zum Ende)');
});

test('verschiebe und skaliere: Punkte bleiben relativ, Striche wachsen mit', () => {
  const s = { id: 'e1', gruppe: 0, art: 'strich', x: 10, y: 10, b: 100, h: 50, punkte: [0, 0, 100, 50] };
  assert.deepEqual(verschiebe(s, 5, -5), { ...s, x: 15, y: 5 });
  const g = skaliere(s, 200, 25);
  assert.deepEqual(g.punkte, [0, 0, 200, 25]);
  assert.equal(g.b, 200); assert.equal(g.h, 25);
  assert.equal(s.b, 100, 'das Original bleibt');
  const z = skaliere({ id: 'e2', gruppe: 0, art: 'zettel', x: 0, y: 0, b: 100, h: 100 }, 2, -5);
  assert.ok(z.b >= 20 && z.h >= 20, 'nicht kleiner als die Mindestgrösse');
});

test('getroffen: oberstes Element, Striche nur nahe der Linie', () => {
  const unten = { id: 'e1', gruppe: 0, art: 'zettel', x: 0, y: 0, b: 200, h: 200, z: 1 };
  const oben = { id: 'e2', gruppe: 0, art: 'zettel', x: 100, y: 100, b: 200, h: 200, z: 5 };
  const strich = { id: 'e3', gruppe: 0, art: 'strich', x: 500, y: 500, b: 100, h: 100, z: 9, dicke: 1, punkte: [0, 0, 100, 100] };
  const liste = [unten, oben, strich];
  assert.equal(getroffen(liste, 150, 150, 0).id, 'e2');
  assert.equal(getroffen(liste, 50, 50, 0).id, 'e1');
  assert.equal(getroffen(liste, 550, 550, 2).id, 'e3');
  assert.equal(getroffen(liste, 590, 510, 2), null, 'in der Hülle, aber weit weg von der Linie');
  assert.equal(getroffen(liste, 1000, 1000, 2), null);
  assert.equal(getroffen([{ ...strich, punkte: [0, 0, 0, 0] }], 501, 501, 2).id, 'e3', 'ein Punkt ist auch treffbar');
});

test('reihenfolge, zVorn, zHinten: nach z, dann nach Kennung', () => {
  const l = [{ id: 'b', z: 2 }, { id: 'a', z: 2 }, { id: 'c', z: -1 }, { id: 'd' }];
  assert.deepEqual(reihenfolge(l).map(e => e.id), ['c', 'd', 'a', 'b']);
  assert.equal(zVorn(l), 3);
  assert.equal(zHinten(l), -2);
  assert.equal(zVorn([]), 1);
});

test('pfeilSpitze: Dreieck am Ende, in Richtung des Pfeils', () => {
  const [ax, ay, bx, by, cx, cy] = pfeilSpitze(0, 0, 100, 0, 20);
  assert.equal(ax, 100); assert.equal(ay, 0);
  assert.ok(bx < 100 && cx < 100 && by * cy < 0);
});

test('erstelleDrossel: höchstens ein Aufruf pro Abstand, der letzte Stand kommt nach', () => {
  let zeit = 0;
  const geplant = [];
  const aufrufe = [];
  const d = erstelleDrossel(w => aufrufe.push(w), 250, {
    jetzt: () => zeit,
    plane: (f, ms) => { geplant.push({ f, um: zeit + ms }); return geplant.length; },
    stoppe: nr => { geplant[nr - 1].f = null; },
  });
  d.rufe(1);
  assert.deepEqual(aufrufe, [1], 'der erste sofort');
  zeit = 100; d.rufe(2);
  zeit = 200; d.rufe(3);
  assert.deepEqual(aufrufe, [1]);
  assert.equal(geplant.length, 1, 'nur ein Nachzügler geplant');
  assert.equal(geplant[0].um, 250);
  zeit = 250; geplant[0].f();
  assert.deepEqual(aufrufe, [1, 3], 'der neuste Stand');
  zeit = 300; d.rufe(4);
  d.abbrechen();
  assert.equal(geplant[1].f, null, 'abbrechen verwirft den Nachzügler');
  zeit = 600; d.rufe(5);
  assert.deepEqual(aufrufe, [1, 3, 5]);
});

test('kurzname: erster Teil des Kontonamens, höchstens 16 Zeichen', () => {
  assert.equal(kurzname('Michael Pilman'), 'Michael');
  assert.equal(kurzname('  '), '');
  assert.equal(kurzname(undefined), '');
  assert.equal(kurzname('Maximiliananananana Muster').length, NAME_MAX);
});

test('istFremdBearbeitet: nur andere, nur solange frisch', () => {
  const e = { bearbeitet: { uid: 'u2', name: 'Lea' } };
  assert.equal(istFremdBearbeitet(e, 'u1', 1000, 5000), true);
  assert.equal(istFremdBearbeitet(e, 'u2', 1000, 5000), false, 'eigene Bearbeitung ohne Rahmen');
  assert.equal(istFremdBearbeitet(e, 'u1', 1000, 20_000), false, 'alter Rahmen (Laptop zugeklappt) verschwindet');
  assert.equal(istFremdBearbeitet({ bearbeitet: null }, 'u1', 1000, 1000), false);
  assert.ok(DICKE[1] < DICKE[2] && DICKE[2] < DICKE[3]);
});

test('gleicheElemente: Reihenfolge der Felder egal, undefined zählt wie fehlend, tief verglichen', () => {
  const a = { id: 'e1', x: 1, punkte: [0, 0, 2, 2], bearbeitet: null, farbe: undefined };
  assert.equal(gleicheElemente(a, { bearbeitet: null, punkte: [0, 0, 2, 2], x: 1, id: 'e1' }), true);
  assert.equal(gleicheElemente(a, { ...a, punkte: [0, 0, 2, 3] }), false);
  assert.equal(gleicheElemente(a, { ...a, bearbeitet: { uid: 'u', name: 'A' } }), false);
  assert.equal(gleicheElemente({ b: { uid: 'u', name: 'A' } }, { b: { name: 'A', uid: 'u' } }), true);
  assert.equal(gleicheElemente(a, null), false);
  assert.equal(gleicheElemente(null, null), true);
});
