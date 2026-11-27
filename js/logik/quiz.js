// Quiz und Fragen: Vorlagen, Prüfung, öffentliche Fassung ohne Lösung.

export const TYPEN = ['mc', 'mehrfach', 'wf', 'schaetz', 'reihe', 'kurz', 'umfrage'];
export const ZEIT_MIN = 5, ZEIT_MAX = 240, ZEIT_VORGABE = 20;
export const ZEIT_WAHL = [10, 20, 30, 45, 60, 90, 120];

export const zufallsId = (vorsatz = '') => vorsatz + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function neueFrage(typ) {
  const f = { id: zufallsId('f'), typ, text: '', bildId: null, zeit: ZEIT_VORGABE, erklaerung: '' };
  if (typ === 'mc' || typ === 'mehrfach') f.antworten = [0, 1, 2, 3].map(i => ({ text: '', richtig: i === 0 }));
  if (typ === 'umfrage') f.antworten = [{ text: '' }, { text: '' }];
  if (typ === 'wf') f.richtig = true;
  if (typ === 'schaetz') Object.assign(f, { wert: 0, toleranz: 0, einheit: '' });
  if (typ === 'reihe') f.elemente = ['', '', ''];
  if (typ === 'kurz') f.loesungen = [''];
  return f;
}

export function neuesQuiz(sprache = 'de') {
  return { id: null, titel: '', fach: '', sprache, freigegeben: false, fragen: [] };
}

const leer = s => typeof s !== 'string' || !s.trim();

/** Liste der Mängel: [{ frage: Nummer | null, code }]. Leer = spielbar. */
export function quizFehler(quiz) {
  const fehler = [];
  if (leer(quiz.titel)) fehler.push({ frage: null, code: 'titel' });
  if (!Array.isArray(quiz.fragen) || !quiz.fragen.length) fehler.push({ frage: null, code: 'keineFragen' });
  (quiz.fragen || []).forEach((f, nr) => {
    const melde = code => fehler.push({ frage: nr, code });
    if (leer(f.text)) melde('text');
    if (!Number.isInteger(f.zeit) || f.zeit < ZEIT_MIN || f.zeit > ZEIT_MAX) melde('zeit');
    if (f.typ === 'mc' || f.typ === 'mehrfach' || f.typ === 'umfrage') {
      const a = f.antworten || [];
      if (a.length < 2 || a.length > 6 || a.some(x => leer(x.text))) melde('antworten');
      const richtige = a.filter(x => x.richtig).length;
      if (f.typ === 'mc' && richtige !== 1) melde('richtig');
      if (f.typ === 'mehrfach' && richtige < 1) melde('richtig');
    } else if (f.typ === 'wf') {
      if (typeof f.richtig !== 'boolean') melde('richtig');
    } else if (f.typ === 'schaetz') {
      if (!Number.isFinite(f.wert) || !Number.isFinite(f.toleranz) || f.toleranz < 0) melde('wert');
    } else if (f.typ === 'reihe') {
      const e = f.elemente || [];
      const verschieden = new Set(e.map(x => String(x).trim().toLowerCase())).size === e.length;
      if (e.length < 3 || e.length > 6 || e.some(leer) || !verschieden) melde('elemente');
    } else if (f.typ === 'kurz') {
      if (!(f.loesungen || []).some(l => !leer(l))) melde('loesungen');
    } else {
      melde('typ');
    }
  });
  return fehler;
}

/** Was die Handys sehen dürfen: nie die Lösung. */
export function oeffentlicheFrage(frage, nr, mischung) {
  const o = { nr, typ: frage.typ, text: frage.text, zeit: frage.zeit, hatBild: !!frage.bildId };
  if (frage.antworten) o.antworten = frage.antworten.map(a => a.text);
  if (frage.typ === 'schaetz') o.einheit = frage.einheit || '';
  if (frage.typ === 'reihe') o.elemente = mischung.map(i => frage.elemente[i]);
  return o;
}

export function beispielQuiz(sprache = 'de') {
  const de = sprache !== 'en';
  const f = (typ, text, zeit, rest, erklaerung = '') => ({ ...neueFrage(typ), text, zeit, erklaerung, ...rest });
  const a = (...paare) => ({ antworten: paare.map(([text, richtig]) => ({ text, richtig })) });
  return {
    id: null,
    titel: de ? 'Beispiel: Willkommen bei Rabiosa' : 'Sample: Welcome to Rabiosa',
    fach: de ? 'Beispiel' : 'Sample',
    sprache: de ? 'de' : 'en',
    freigegeben: false,
    fragen: [
      f('mc', de ? 'Wie heisst der Fluss, der durch die Schlucht bei Passugg fliesst?' : 'What is the name of the river that runs through the gorge at Passugg?', 20,
        a(['Plessur', false], ['Rabiosa', true], ['Landquart', false], ['Albula', false]),
        de ? 'Die Rabiosa mündet unterhalb von Passugg in die Plessur.' : 'The Rabiosa joins the Plessur just below Passugg.'),
      f('wf', de ? 'Ein Gastronorm-Behälter GN 1/1 misst 530 × 325 mm.' : 'A Gastronorm GN 1/1 container measures 530 × 325 mm.', 15, { richtig: true }),
      f('mehrfach', de ? 'Welche Zutaten gehören zu den 14 deklarationspflichtigen Allergenen?' : 'Which of these are among the 14 allergens that must be declared?', 30,
        a([de ? 'Sellerie' : 'Celery', true], [de ? 'Reis' : 'Rice', false], [de ? 'Senf' : 'Mustard', true], [de ? 'Sesam' : 'Sesame', true])),
      f('schaetz', de ? 'Wie viele Gramm wiegt ein Ei der Grösse M ungefähr?' : 'Roughly how many grams does a size M egg weigh?', 20,
        { wert: 58, toleranz: 5, einheit: 'g' }, de ? 'Grösse M: 53 bis 63 Gramm.' : 'Size M: 53 to 63 grams.'),
      f('reihe', de ? 'Ordne die Küchenbrigade vom höchsten zum tiefsten Rang.' : 'Put the kitchen brigade in order, from highest to lowest rank.', 40,
        { elemente: de ? ['Küchenchef', 'Sous-chef', 'Chef de partie', 'Commis'] : ['Head chef', 'Sous-chef', 'Chef de partie', 'Commis'] }),
      f('kurz', de ? 'Wie nennt man in der Küche das Bereitstellen von allem, was man für den Service braucht? (französisch)' : 'What is the French kitchen term for having everything prepared and in its place before service?', 30,
        { loesungen: ['Mise en place', 'Mise-en-place', 'Miseenplace'] }),
      f('umfrage', de ? 'Wie sicher fühlst du dich mit diesem Stoff?' : 'How confident do you feel about this material?', 20,
        { antworten: (de ? ['Sehr sicher', 'Eher sicher', 'Eher unsicher', 'Unsicher'] : ['Very confident', 'Fairly confident', 'Rather unsure', 'Unsure']).map(text => ({ text })) }),
    ],
  };
}

// ---------- Cloche: Thema und Stufe pro Frage (beide freiwillig) ----------
export const THEMA_MAX = 40;

/** Thema und Stufe einer Frage, bereinigt: Thema getrimmt (höchstens 40 Zeichen), Stufe 1, 2, 3 oder null. */
export function clocheFelder(frage) {
  const thema = typeof frage?.thema === 'string' ? frage.thema.trim().slice(0, THEMA_MAX) : '';
  const n = Number(frage?.stufe);
  return { thema, stufe: n === 1 || n === 2 || n === 3 ? n : null };
}
