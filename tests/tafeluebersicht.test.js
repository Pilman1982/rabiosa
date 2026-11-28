import test from 'node:test';
import assert from 'node:assert/strict';
import { codeText, beitrittsAdresse, alleSperren, ohneSperre, kachelStand, neueBilder, kacheln } from '../js/logik/tafeluebersicht.js';

test('codeText: sechs Ziffern als «123 456»', () => {
  assert.equal(codeText('123456'), '123 456');
  assert.equal(codeText('12'), '12');
});

test('beitrittsAdresse: Ort und Suchteil bleiben, der Teil nach # ist #/t/CODE', () => {
  assert.equal(beitrittsAdresse({ origin: 'https://x.ch', pathname: '/rabiosa/', search: '?demo=1' }, '123456'), 'https://x.ch/rabiosa/?demo=1#/t/123456');
});

test('alleSperren und ohneSperre', () => {
  assert.deepEqual(alleSperren({ gruppen: ['a', 'b', 'c'] }), [0, 1, 2]);
  assert.deepEqual(ohneSperre({ gesperrt: [0, 2, 1] }, 2), [0, 1]);
  assert.deepEqual(ohneSperre({}, 1), []);
});

test('kachelStand: abgegeben, wenn die Gruppe gesperrt ist, sonst arbeitet', () => {
  assert.equal(kachelStand({ gesperrt: [1] }, 1), 'abgegeben');
  assert.equal(kachelStand({ gesperrt: [1] }, 0), 'arbeitet');
  assert.equal(kachelStand({}, 0), 'arbeitet');
});

test('neueBilder: nur Bilder, neueste Kennung zuerst, ohne die Eingabe zu ändern', () => {
  const liste = [
    { id: 'e1a', art: 'bild' }, { id: 'e9z', art: 'zettel' }, { id: 'e2b', art: 'bild' }, { id: 'e1c', art: 'bild' }, null,
  ];
  assert.deepEqual(neueBilder(liste).map(e => e.id), ['e2b', 'e1c', 'e1a']);
  assert.equal(liste.length, 5);
  assert.deepEqual(neueBilder(undefined), []);
});

test('kacheln: je Gruppe Namen, Online-Zahl, Stand und Elemente; Gruppen ohne Mitglieder und Elemente bleiben leer', () => {
  const sitzung = { gruppen: ['A', 'B', 'C'], gesperrt: [1] };
  const jetzt = 1_000_000;
  const mitglieder = [
    { uid: 'u1', gruppe: 0, name: 'Zoe', zuletzt: jetzt - 1000 },
    { uid: 'u2', gruppe: 0, name: 'Ali', zuletzt: jetzt - 100_000 },
    { uid: 'u3', gruppe: 1, name: 'Mia', zuletzt: jetzt - 5000 },
    { uid: 'u4', gruppe: 7, name: 'Fremd', zuletzt: jetzt },
  ];
  const elemente = [{ id: 'a', gruppe: 0, art: 'text' }, { id: 'b', gruppe: 1, art: 'bild' }, { id: 'c', gruppe: 0, art: 'zettel' }];
  const k = kacheln(sitzung, mitglieder, elemente, jetzt);
  assert.equal(k.length, 3);
  assert.deepEqual(k[0].namen, ['Ali', 'Zoe']);
  assert.equal(k[0].online, 1);
  assert.equal(k[0].stand, 'arbeitet');
  assert.equal(k[0].elemente.length, 2);
  assert.equal(k[1].stand, 'abgegeben');
  assert.equal(k[1].online, 1);
  assert.deepEqual(k[2], { nr: 2, name: 'C', namen: [], online: 0, stand: 'arbeitet', elemente: [] });
});
