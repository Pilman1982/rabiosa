import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { varianteVon, VARIANTE } from '../js/variante.js';
import { konfigFuer } from '../js/store/index.js';
import { FIREBASE, FIREBASE_STUDENT } from '../js/config.js';
import { t, TEXTE, TEXTE_STUDENT } from '../js/i18n.js';

const lies = pfad => readFileSync(new URL(pfad, import.meta.url), 'utf8');

test('varianteVon: die Seite sagt selbst, welche Fassung läuft; alles andere ist die Fassung für Dozierende', () => {
  assert.equal(varianteVon({ documentElement: { dataset: { variante: 'student' } } }), 'student');
  assert.equal(varianteVon({ documentElement: { dataset: {} } }), 'lehre');
  assert.equal(varianteVon({ documentElement: { dataset: { variante: 'irgendwas' } } }), 'lehre');
  assert.equal(varianteVon(undefined), 'lehre');
  assert.equal(VARIANTE, 'lehre', 'ohne Seite (hier im Test) gilt die Fassung für Dozierende');
});

test('konfigFuer: jede Fassung hat ihr eigenes Firebase-Projekt', () => {
  assert.equal(konfigFuer('lehre'), FIREBASE);
  assert.equal(konfigFuer('student'), FIREBASE_STUDENT);
  if (FIREBASE && FIREBASE_STUDENT) assert.notEqual(FIREBASE.projectId, FIREBASE_STUDENT.projectId, 'nie dieselbe Datenbank');
});

test('Texte der Student-Fassung: nur bekannte Schlüssel, in beiden Sprachen, mit denselben Platzhaltern, ohne ß', () => {
  const platzhalter = s => (s.match(/\{\w+\}/g) || []).sort();
  assert.deepEqual(Object.keys(TEXTE_STUDENT.de).sort(), Object.keys(TEXTE_STUDENT.en).sort());
  assert.ok(Object.keys(TEXTE_STUDENT.de).length > 0);
  for (const sprache of ['de', 'en']) for (const [k, v] of Object.entries(TEXTE_STUDENT[sprache])) {
    assert.ok(k in TEXTE[sprache], sprache + ':' + k + ' gibt es in der Hauptfassung nicht');
    assert.ok(typeof v === 'string' && v.trim() && !v.includes('ß'), sprache + ':' + k);
    assert.deepEqual(platzhalter(v), platzhalter(TEXTE[sprache][k]), sprache + ':' + k);
  }
});

test('t: die Student-Fassung ersetzt nur ihre eigenen Texte, der Rest bleibt gleich', () => {
  assert.equal(t('de', 'studio.kollegium'), 'Kollegium');
  assert.equal(t('de', 'studio.kollegium', {}, true), TEXTE_STUDENT.de['studio.kollegium']);
  assert.notEqual(t('de', 'studio.kollegium', {}, true), 'Kollegium');
  assert.equal(t('en', 'studio.kollegium', {}, true), TEXTE_STUDENT.en['studio.kollegium']);
  assert.equal(t('de', 'studio.fragen', { n: 3 }, true), '3 Fragen');
  assert.equal(t('xx', 'studio.kollegium', {}, true), TEXTE_STUDENT.de['studio.kollegium'], 'unbekannte Sprache = Deutsch');
});

test('student/index.html ist dieselbe Seite wie index.html, nur als Student-Fassung und eine Ebene tiefer', () => {
  const haupt = lies('../index.html'), student = lies('../student/index.html');
  assert.match(student, /<html lang="de-CH" data-variante="student">/);
  assert.doesNotMatch(haupt, /data-variante/);
  assert.match(student, /<title>Rabiosa Student<\/title>/);
  // Gleich bis auf: Kennzeichen, Titel und «../» vor den eigenen Dateien.
  const erwartet = haupt
    .replace('<html lang="de-CH">', '<html lang="de-CH" data-variante="student">')
    .replace('<title>Rabiosa</title>', '<title>Rabiosa Student</title>')
    .replace(/(href|src)="(bilder|css|js)\//g, '$1="../$2/');
  assert.equal(student, erwartet);
});

test('Bilder aus dem Programm hängen am Ort des Programms, nicht an der Adresse der Seite', () => {
  assert.match(lies('../js/ui.js'), /new URL\(`\.\.\/bilder\/ehl-\$\{s\}-\$\{farbe\}\.svg`, import\.meta\.url\)/);
});
