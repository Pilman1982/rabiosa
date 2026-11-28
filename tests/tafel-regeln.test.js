// Whiteboard: Grenzwerte in den Regeln stimmen mit js/logik/tafel.js überein. Ohne Netz, ohne Emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAME_MAX, BILDER_MAX, BYTES_MAX, TEXT_MAX, PUNKTE_MAX, GIF_MAX, BILDARTEN } from '../js/logik/tafel.js';

const lies = pfad => readFileSync(new URL('../' + pfad, import.meta.url), 'utf8');
const fire = lies('firestore.rules');
const speicher = lies('storage.rules');
const tafeln = fire.slice(fire.indexOf('match /tafeln/{code}'));

test('Firestore-Regeln: Grenzwerte wie in tafel.js', () => {
  assert.ok(tafeln.includes(`name.size() <= ${NAME_MAX}`));
  assert.ok(tafeln.includes(`vonName.size() <= ${NAME_MAX}`));
  assert.ok(tafeln.includes(`bilder <= ${BILDER_MAX}`));
  assert.ok(tafeln.includes(`bytes <= ${BYTES_MAX}`));
  assert.ok(tafeln.includes(`text.size() <= ${TEXT_MAX}`));
  assert.ok(tafeln.includes(`punkte.size() <= ${PUNKTE_MAX}`));
});

test('Storage-Regeln: GIF-Grenze und Bildarten wie in tafel.js', () => {
  assert.equal(GIF_MAX, 8 * 1024 * 1024);
  assert.ok(speicher.includes('request.resource.size <= 8 * 1024 * 1024'));
  const arten = BILDARTEN.map(a => a.replace('image/', '')).join('|');
  assert.ok(speicher.includes(`image/(${arten})`), 'Bildarten: ' + arten);
});

test('Sitzungen entstehen nur im Projekt der Dozierenden (einstellungen/whiteboard)', () => {
  const create = tafeln.slice(tafeln.indexOf('allow create'), tafeln.indexOf('allow update'));
  assert.ok(create.includes('whiteboardAn()'));
  assert.ok(fire.includes('einstellungen/whiteboard'));
});

test('CORS: nur GET für die eigene Seite und den lokalen Server', () => {
  const cors = JSON.parse(lies('werkzeug/cors.json'));
  assert.equal(cors.length, 1);
  assert.deepEqual(cors[0].method, ['GET']);
  assert.deepEqual([...cors[0].origin].sort(), ['http://localhost:8765', 'https://pilman1982.github.io']);
});

test('Zähler-Regel: nur Bilder, genau plus oder minus eins und die Grösse des Bildes', () => {
  const start = tafeln.indexOf('match /zaehler/{g}');
  const z = tafeln.slice(start, tafeln.indexOf('match /elemente/{id}'));
  assert.ok(z.includes('getAfter('));
  assert.ok(z.includes(".data.art == 'bild'"));
  assert.ok(z.includes('resource.data.bilder + 1'));
  assert.ok(z.includes('resource.data.bilder - 1'));
  assert.ok(z.includes('.bildBytes'));
});

test('Storage: nach dem Abgeben dürfen Mitglieder keine Dateien mehr löschen', () => {
  const zeile = speicher.split('\n').find(l => l.includes('allow delete'));
  assert.ok(zeile.includes('gesperrt'), zeile);
});
