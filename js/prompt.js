// Der Prompt, mit dem Dozierende eine KI (Claude, ChatGPT, Copilot …) ein Quiz schreiben lassen.
// Die Antwort der KI wird im Studio unter «Quiz importieren» eingefügt und von js/logik/import.js eingelesen.
// Ein Test prüft, dass das Beispiel im Prompt selbst ohne Mängel einlesbar ist. Wer das Format ändert,
// ändert es hier und in import.js. Im Text ausserhalb des Beispiels dürfen keine geschweiften Klammern stehen.

const BEISPIEL_DE = `{
  "titel": "Titel des Quiz",
  "fach": "Fach",
  "sprache": "de",
  "fragen": [
    { "typ": "mc", "text": "Wie heisst die Hauptstadt des Kantons Graubünden?", "zeit": 20, "thema": "Graubünden", "stufe": 1,
      "antworten": [ { "text": "Davos" }, { "text": "Chur", "richtig": true }, { "text": "St. Moritz" }, { "text": "Arosa" } ],
      "erklaerung": "Chur ist die Hauptstadt des Kantons Graubünden." },
    { "typ": "mehrfach", "text": "Welche dieser Orte liegen im Kanton Graubünden?", "zeit": 30, "thema": "Graubünden", "stufe": 2,
      "antworten": [ { "text": "Arosa", "richtig": true }, { "text": "Zermatt" }, { "text": "Davos", "richtig": true }, { "text": "Lugano" } ],
      "erklaerung": "Zermatt liegt im Wallis, Lugano im Tessin." },
    { "typ": "wf", "text": "Passugg liegt im Kanton Graubünden.", "zeit": 15, "richtig": true, "thema": "Graubünden", "stufe": 1,
      "erklaerung": "Passugg gehört zur Gemeinde Churwalden im Kanton Graubünden." },
    { "typ": "schaetz", "text": "Wie viele Kantone hat die Schweiz?", "zeit": 20, "wert": 26, "toleranz": 2, "einheit": "",
      "erklaerung": "Die Schweiz hat 26 Kantone." },
    { "typ": "reihe", "text": "Ordnen Sie die Wochentage, beginnend mit Montag.", "zeit": 30,
      "elemente": [ "Montag", "Dienstag", "Mittwoch", "Donnerstag" ],
      "erklaerung": "Die Woche beginnt am Montag." },
    { "typ": "kurz", "text": "Wie heisst die Bundesstadt der Schweiz?", "zeit": 20, "loesungen": [ "Bern", "Berne" ],
      "erklaerung": "Bern ist die Bundesstadt und Sitz von Regierung und Parlament." },
    { "typ": "umfrage", "text": "Wie sicher fühlen Sie sich mit diesem Stoff?", "zeit": 20,
      "antworten": [ { "text": "Sehr sicher" }, { "text": "Eher sicher" }, { "text": "Eher unsicher" }, { "text": "Unsicher" } ] }
  ]
}`;

const BEISPIEL_EN = `{
  "titel": "Title of the quiz",
  "fach": "Subject",
  "sprache": "en",
  "fragen": [
    { "typ": "mc", "text": "What is the capital of the canton of Graubünden?", "zeit": 20, "thema": "Graubünden", "stufe": 1,
      "antworten": [ { "text": "Davos" }, { "text": "Chur", "richtig": true }, { "text": "St. Moritz" }, { "text": "Arosa" } ],
      "erklaerung": "Chur is the capital of the canton of Graubünden." },
    { "typ": "mehrfach", "text": "Which of these places are in the canton of Graubünden?", "zeit": 30, "thema": "Graubünden", "stufe": 2,
      "antworten": [ { "text": "Arosa", "richtig": true }, { "text": "Zermatt" }, { "text": "Davos", "richtig": true }, { "text": "Lugano" } ],
      "erklaerung": "Zermatt is in Valais, Lugano in Ticino." },
    { "typ": "wf", "text": "Passugg is in the canton of Graubünden.", "zeit": 15, "richtig": true, "thema": "Graubünden", "stufe": 1,
      "erklaerung": "Passugg belongs to the municipality of Churwalden in Graubünden." },
    { "typ": "schaetz", "text": "How many cantons does Switzerland have?", "zeit": 20, "wert": 26, "toleranz": 2, "einheit": "",
      "erklaerung": "Switzerland has 26 cantons." },
    { "typ": "reihe", "text": "Put the weekdays in order, starting with Monday.", "zeit": 30,
      "elemente": [ "Monday", "Tuesday", "Wednesday", "Thursday" ],
      "erklaerung": "The week starts on Monday." },
    { "typ": "kurz", "text": "What is the name of Switzerland's federal city?", "zeit": 20, "loesungen": [ "Bern", "Berne" ],
      "erklaerung": "Bern is the federal city and the seat of government and parliament." },
    { "typ": "umfrage", "text": "How confident do you feel about this material?", "zeit": 20,
      "antworten": [ { "text": "Very confident" }, { "text": "Fairly confident" }, { "text": "Rather unsure" }, { "text": "Unsure" } ] }
  ]
}`;

const DE = `Du erstellst ein Quiz für «Rabiosa», das Live-Quiz der EHL Hotelfachschule Passugg. Die Klasse spielt es im Unterricht am Handy, zur Repetition und Prüfungsvorbereitung.

MEIN AUFTRAG (bitte ausfüllen)
Material: <Thema, Lernziele, Unterlagen, eine Prüfung oder ein bestehendes Quiz hier einfügen oder als Datei anhängen>
Fach und Klasse: <zum Beispiel Küchentheorie, HFd1>
Anzahl Fragen: 15 (die Umfrage am Schluss kommt dazu)
Sprache: Deutsch
Anrede der Studierenden: Sie

SO GEHST DU VOR
1. Lies das Material ganz. Bilde die Themen, die es abdeckt, und verteile die Fragen ungefähr nach ihrem Gewicht (bei einer Prüfung nach den Punkten).
2. Ist das Material eine Prüfung oder enthält es Prüfungsaufgaben: Übernimm NIE eine Prüfungsfrage. Frage dasselbe Wissen «daneben» ab: gleiche Art von Aufgabe, aber andere Produkte, Beispiele, Zahlen und Fälle. Verwende die Produkte, Beispiele, Zahlen und Aussagen der Prüfung gar nicht, auch nicht als falsche Antworten. Keine Antwort und keine Erklärung darf die Lösung einer Prüfungsaufgabe verraten. Ordnet die Prüfung Begriffe zu oder verlangt sie eine Liste auswendig, frage nicht dieselbe Zuordnung an einem neuen Fall ab, sondern den Nutzen, den Grund oder die Folge.
3. Ist das Material ein bestehendes Quiz (zum Beispiel aus Kahoot oder Moodle): Übernimm die Fragen sinngemäss und wähle für jede den passenden Fragetyp.
4. Ist das Material nur ein Thema: Stütze dich auf gesichertes Fachwissen und auf die Verhältnisse in der Schweiz. Was du nicht sicher weisst, lässt du weg.
5. Mische die Fragetypen, steigere die Schwierigkeit und schliesse mit einer Umfrage zur Selbsteinschätzung.

DIE SIEBEN FRAGETYPEN
"mc" = Multiple Choice: 2 bis 6 Antworten, genau eine ist richtig.
"mehrfach" = Mehrfachauswahl: 2 bis 6 Antworten, eine oder mehrere sind richtig.
"wf" = Richtig oder falsch: eine Aussage; "richtig" ist true oder false.
"schaetz" = Schätzfrage oder Rechnung: Die Antwort ist eine Zahl ("wert", Dezimalzahlen mit Punkt). "toleranz" ist die Abweichung, die noch Punkte gibt; 0, wenn nur der genaue Wert zählt. "einheit" ist zum Beispiel "g", "°C" oder "CHF". Wähle bei Rechnungen Zahlen, die aufgehen.
"reihe" = Reihenfolge: 3 bis 6 "elemente", von dir in der RICHTIGEN Reihenfolge angegeben. Rabiosa mischt sie selbst.
"kurz" = Kurzantwort: Die Klasse tippt ein Wort oder einen kurzen Begriff. "loesungen" enthält alle Schreibweisen, die gelten sollen. Gross- und Kleinschreibung und Akzente spielen keine Rolle.
"umfrage" = Umfrage ohne Punkte: 2 bis 6 Antworten, keine ist richtig.

REGELN
- Die Fragen werden am Beamer und am Handy gelesen: eine Frage hat höchstens 140 Zeichen, eine Antwort höchstens 60.
- Jede Frage ist für sich allein verständlich und eindeutig lösbar. Falsche Antworten sind plausibel, aber klar falsch.
- Bei Multiple Choice steht die richtige Antwort nicht immer an derselben Stelle.
- "zeit" ist die Antwortzeit in Sekunden: 15 bis 30 für Wissen, 40 bis 60 für Reihenfolgen und Überlegen, bis 120 für Rechnen.
- "erklaerung" ist ein Satz, der bei der Auflösung erscheint: warum die Antwort stimmt. Sie gehört zu jeder Frage ausser zur Umfrage.
- "fach" ist nur das Fach, ohne Klasse.
- Schweizer Rechtschreibung (ss statt ß).
- "thema" und "stufe" sind freiwillig und dienen dem Spielmodus Cloche (Gruppen spielen auf einem Board mit verdeckten Feldern). Für Cloche haben die Fragen 4 bis 8 Themen mit je 3 Fragen. "thema" ist ein kurzer Name (höchstens 40 Zeichen), "stufe" ist 1, 2 oder 3: 1 = Wissen, 2 = Verstehen, 3 = Anwenden an einem Fall. Am besten eignen sich für Cloche "mc" mit 4 Antworten und "wf".

AUSGABE
Gib nur einen einzigen JSON-Block aus (als Codeblock), ohne Text davor oder danach, genau in der Form des Beispiels. Die Feldnamen bleiben, wie sie sind. Das Beispiel zeigt nur die Form; übernimm seinen Inhalt nicht.

${BEISPIEL_DE}`;

const EN = `You are writing a quiz for "Rabiosa", the live quiz of EHL Hotelfachschule Passugg. The class plays it in the lesson on their phones, for revision and exam preparation.

MY BRIEF (please fill in)
Material: <paste a topic, learning objectives, course material, an exam or an existing quiz here, or attach it as a file>
Subject and class: <for example Culinary Theory, HFe1>
Number of questions: 15 (the poll at the end comes on top)
Language: English

HOW TO PROCEED
1. Read all of the material. Work out the topics it covers and spread the questions roughly according to their weight (for an exam: according to the points).
2. If the material is an exam or contains exam questions: NEVER reuse an exam question. Test the same knowledge "next to it": the same kind of task, but with different products, examples, numbers and cases. Do not use the products, examples, numbers or statements of the exam at all, not even as wrong options. No answer and no explanation may give away the solution to an exam question. Where the exam matches terms or asks for a list from memory, do not ask for the same matching with a new case; ask for the benefit, the reason or the consequence instead.
3. If the material is an existing quiz (for example from Kahoot or Moodle): carry the questions over in substance and choose the fitting question type for each.
4. If the material is only a topic: rely on established knowledge and on conditions in Switzerland. Leave out anything you are not sure about.
5. Mix the question types, increase the difficulty, and finish with a poll for self-assessment.

THE SEVEN QUESTION TYPES (the field names and type names are German and must stay as they are)
"mc" = multiple choice: 2 to 6 answers, exactly one is correct.
"mehrfach" = multiple answers: 2 to 6 answers, one or more are correct.
"wf" = true or false: one statement; "richtig" is true or false.
"schaetz" = estimate or calculation: the answer is a number ("wert", decimals with a point). "toleranz" is the deviation that still earns points; 0 if only the exact value counts. "einheit" is the unit, for example "g", "°C" or "CHF". For calculations choose numbers that work out evenly.
"reihe" = put in order: 3 to 6 "elemente", given by you in the CORRECT order. Rabiosa shuffles them itself.
"kurz" = short answer: the class types a word or a short term. "loesungen" lists every spelling that should count. Upper and lower case and accents do not matter.
"umfrage" = poll without points: 2 to 6 answers, none is correct.

RULES
- The questions are read on the projector and on phones: a question has at most 140 characters, an answer at most 60.
- Every question can be understood on its own and has one clear solution. Wrong answers are plausible but clearly wrong.
- In multiple choice, the correct answer is not always in the same position.
- "zeit" is the answering time in seconds: 15 to 30 for knowledge, 40 to 60 for ordering and thinking, up to 120 for calculations.
- "erklaerung" is one sentence shown with the result: why the answer is right. Every question except the poll has one.
- "fach" is the subject only, without the class.
- "text" is the question, "antworten" are the answers, "richtig" marks a correct answer.
- "thema" (topic) and "stufe" (level) are optional and serve the Cloche game mode (groups play on a board of covered tiles). For Cloche the questions have 4 to 8 topics with 3 questions each. "thema" is a short name (at most 40 characters), "stufe" is 1, 2 or 3: 1 = knowledge, 2 = understanding, 3 = applying it to a case. Cloche works best with "mc" with 4 answers and "wf".

OUTPUT
Return a single JSON block only (as a code block), with no text before or after it, in exactly the form of the example. Keep the field names as they are. The example only shows the form; do not reuse its content.

${BEISPIEL_EN}`;

/** Der Prompt in der Sprache der Oberfläche. */
export function importPrompt(sprache = 'de') {
  return sprache === 'en' ? EN : DE;
}
