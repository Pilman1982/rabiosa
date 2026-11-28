import test from 'node:test';
import assert from 'node:assert/strict';
import { megabyte, speicherSumme, zeilenStand, ergebnisTitel, ohneVorlage, OHNE_VORLAGE } from '../js/logik/tafelergebnisse.js';

test('megabyte: eine Dezimalstelle, Komma auf Deutsch, Punkt auf Englisch', () => {
  assert.equal(megabyte(0, 'de'), '0,0');
  assert.equal(megabyte(1_572_864, 'de'), '1,5');
  assert.equal(megabyte(1_572_864, 'en'), '1.5');
  assert.equal(megabyte(104_857_600, 'de'), '100,0');
  assert.equal(megabyte(undefined, 'de'), '0,0');
});

test('speicherSumme: Bilder und Bytes über alle Gruppen, Unbrauchbares zählt null', () => {
  assert.deepEqual(speicherSumme([{ bilder: 2, bytes: 1000 }, { bilder: 1, bytes: 500, letztes: 'x' }, null, { bilder: 'a', bytes: -3 }]), { bilder: 3, bytes: 1500 });
  assert.deepEqual(speicherSumme([]), { bilder: 0, bytes: 0 });
  assert.deepEqual(speicherSumme(undefined), { bilder: 0, bytes: 0 });
});

test('zeilenStand: offen/beendet, Gruppenzahl, Code mit Leerzeichen', () => {
  assert.deepEqual(zeilenStand({ code: '123456', status: 'offen', gruppen: ['a', 'b'], erstellt: 5 }),
    { code: '123456', codeText: '123 456', offen: true, gruppen: 2, erstellt: 5 });
  assert.equal(zeilenStand({ code: '1', status: 'beendet', gruppen: [] }).offen, false);
  assert.equal(zeilenStand({ code: '1' }).gruppen, 0);
});

test('ergebnisTitel: Titel der Vorlage, sonst der Titel aus einer Sitzung, sonst der Ersatz (Schlussprüfung 2)', () => {
  assert.equal(ergebnisTitel({ titel: 'Mise en place' }, [{ titel: 'alt' }], 'Ergebnisse'), 'Mise en place');
  assert.equal(ergebnisTitel(null, [{ code: '1' }, { titel: 'Aus der Sitzung' }], 'Ergebnisse'), 'Aus der Sitzung', 'Vorlage gelöscht oder nicht mehr freigegeben');
  assert.equal(ergebnisTitel(null, [], 'Ergebnisse'), 'Ergebnisse');
  assert.equal(ergebnisTitel({ titel: '' }, undefined, 'Ergebnisse'), 'Ergebnisse');
});

test('ohneVorlage: nur Sitzungen, deren Vorlage im Studio fehlt (gelöscht, nicht mehr freigegeben)', () => {
  const sitzungen = [{ code: '1', vorlageId: 'a' }, { code: '2', vorlageId: 'weg' }, { code: '3', vorlageId: 'k' }, { code: '4' }, null];
  const vorlagen = [{ id: 'a' }, { id: 'k' }, null];
  assert.deepEqual(ohneVorlage(sitzungen, vorlagen).map(x => x.code), ['2', '4']);
  assert.deepEqual(ohneVorlage(sitzungen, []).map(x => x.code), ['1', '2', '3', '4']);
  assert.deepEqual(ohneVorlage(undefined, vorlagen), []);
  assert.deepEqual(ohneVorlage([{ code: '5', vorlageId: 'x' }], undefined).map(x => x.code), ['5']);
});

test('OHNE_VORLAGE: Adresse der Sammelliste, kann keine Kennung einer Vorlage sein', () => {
  assert.match(OHNE_VORLAGE, /-/);
  assert.ok(!/^[A-Za-z0-9]{20}$/.test(OHNE_VORLAGE), 'Firestore-Kennungen haben 20 Zeichen ohne Bindestrich');
});
