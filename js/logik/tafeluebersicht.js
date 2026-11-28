// Whiteboard: reine Hilfen der Übersicht der Lehrperson (Kacheln, «Neue Bilder», Beitrittsadresse), ohne Oberfläche.
import { istOnline } from './tafel.js';

/** «123456» -> «123 456». */
export const codeText = code => String(code).replace(/^(\d{3})(\d+)$/, '$1 $2');

/** Adresse im QR-Code: direkt zum Beitritt der Studierenden. ort = location. */
export const beitrittsAdresse = (ort, code) => ort.origin + ort.pathname + ort.search + '#/t/' + code;

/** «Alle sperren»: alle Gruppennummern. */
export const alleSperren = sitzung => (sitzung.gruppen || []).map((_, i) => i);
/** «Wieder öffnen»: die Sperren ohne diese Gruppe. */
export const ohneSperre = (sitzung, gruppe) => (sitzung.gesperrt || []).filter(g => g !== gruppe);

export const kachelStand = (sitzung, gruppe) => ((sitzung.gesperrt || []).includes(gruppe) ? 'abgegeben' : 'arbeitet');

/** Alle Bilder, neueste zuerst: Die Kennung beginnt mit der Anlegezeit in Basis 36. */
export function neueBilder(elemente) {
  return (Array.isArray(elemente) ? elemente : []).filter(e => e && e.art === 'bild')
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Eine Kachel je Gruppe: Namen (alphabetisch), Zahl der Personen online, Stand und die Elemente der Gruppe. */
export function kacheln(sitzung, mitglieder, elemente, jetzt) {
  return (sitzung.gruppen || []).map((name, nr) => {
    const dabei = (mitglieder || []).filter(m => m && m.gruppe === nr);
    return {
      nr, name,
      namen: dabei.map(m => m.name).sort((a, b) => String(a).localeCompare(String(b))),
      online: dabei.filter(m => istOnline(m, jetzt)).length,
      stand: kachelStand(sitzung, nr),
      elemente: (elemente || []).filter(e => e && e.gruppe === nr),
    };
  });
}
