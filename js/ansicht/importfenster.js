// Fenster «Quiz mit einer KI erstellen»: Prompt kopieren, Antwort der KI einfügen oder als Datei wählen, importieren.
import { h, fehlerText } from '../ui.js';
import { t } from '../i18n.js';
import { importiereQuiz } from '../logik/import.js';
import { importPrompt } from '../prompt.js';

/**
 * Öffnet das Fenster. Ergebnis: { quiz, uebersprungen } (noch nicht gespeichert) oder null bei Abbruch.
 */
export function oeffneImport(sprache) {
  const T = (k, w) => t(sprache, k, w);
  return new Promise(fertig => {
    let ergebnis = null;
    const prompt = importPrompt(sprache);

    const promptFeld = h('textarea', { class: 'feld import-prompt', readonly: true, rows: 8, 'aria-label': T('import.zeigen') });
    promptFeld.value = prompt;
    const kopiert = h('span', { class: 'import-ok', role: 'status' });
    async function kopiere() {
      try { await navigator.clipboard.writeText(prompt); }
      catch {
        // Ohne Erlaubnis für die Zwischenablage: Text zeigen und markieren, dann geht Ctrl+C.
        details.open = true;
        promptFeld.focus();
        promptFeld.select();
        try { document.execCommand('copy'); } catch { return; }
      }
      kopiert.textContent = '✓ ' + T('import.kopiert');
    }
    const details = h('details', { class: 'import-details' }, h('summary', null, T('import.zeigen')), promptFeld);

    const eingabe = h('textarea', { class: 'feld import-eingabe', rows: 7, placeholder: T('import.feld'), 'aria-label': T('import.feld') });
    const datei = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', class: 'versteckt' });
    datei.addEventListener('change', async () => {
      const f = datei.files && datei.files[0];
      if (!f) return;
      try { eingabe.value = await f.text(); zeigeFehler(''); } catch { zeigeFehler(T('fehler.allgemein')); }
      datei.value = '';
    });

    const fehlerZeile = h('p', { class: 'import-fehler', role: 'alert' });
    const zeigeFehler = text => { fehlerZeile.textContent = text; };

    function importiere() {
      try { ergebnis = importiereQuiz(eingabe.value, { sprache }); }
      catch (e) { ergebnis = null; zeigeFehler(fehlerText(sprache, e)); return; }
      d.close();
    }

    const d = h('dialog', { class: 'rueckfrage importfenster' },
      h('h2', null, T('import.titel')),
      h('ol', { class: 'import-schritte' },
        h('li', null, h('p', null, T('import.s1')),
          h('div', { class: 'import-zeile' }, h('button', { type: 'button', class: 'knopf klein', onclick: kopiere }, T('import.kopieren')), kopiert),
          details),
        h('li', null, h('p', null, T('import.s2'))),
        h('li', null, h('p', null, T('import.s3')),
          eingabe,
          h('div', { class: 'import-zeile' }, h('button', { type: 'button', class: 'knopf klein leise', onclick: () => datei.click() }, T('import.datei')), datei))),
      fehlerZeile,
      h('p', { class: 'import-hinweis' }, T('import.hinweis')),
      h('div', { class: 'knopfzeile' },
        h('button', { type: 'button', class: 'knopf leise', onclick: () => { ergebnis = null; d.close(); } }, T('allg.abbrechen')),
        h('button', { type: 'button', class: 'knopf', onclick: importiere }, T('import.los'))));
    d.addEventListener('cancel', () => { ergebnis = null; });
    d.addEventListener('close', () => { d.remove(); fertig(ergebnis); });
    document.body.append(d);
    d.showModal();
  });
}
