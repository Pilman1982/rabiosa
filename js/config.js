// Angaben zum Firebase-Projekt «Rabiosa» (rabiosa-fb63b, Datenbank in Zürich).
// Steht hier null, läuft Rabiosa im Demo-Modus (alles bleibt im Browser). Die Werte stehen in der
// Firebase-Konsole unter Projekteinstellungen > Meine Apps > Web-App. Sie sind nicht geheim:
// Den Schutz machen die Regeln in firestore.rules, nicht diese Angaben.
export const FIREBASE = {
  apiKey: 'AIzaSyBbOkyUUtBVs41R-jtXGxTs6KsdShuAb1k',
  authDomain: 'rabiosa-fb63b.firebaseapp.com',
  projectId: 'rabiosa-fb63b',
  storageBucket: 'rabiosa-fb63b.firebasestorage.app',
  messagingSenderId: '383025752576',
  appId: '1:383025752576:web:1bffb4301d4e42a31cc6e5',
};

// Dasselbe für die Student-Fassung (Ordner student/): ein eigenes Firebase-Projekt mit eigenen Konten und Daten.
// Projekt «Rabiosa Student» (rabiosa-student, Datenbank in Zürich), eingerichtet am 27.11.2026.
// Stünde hier null, liefe die Student-Fassung im Demo-Modus. Einrichten: siehe LIESMICH.md.
export const FIREBASE_STUDENT = {
  apiKey: 'AIzaSyBjrt4Vb_qfjftCY2ux8TsClHd5hl_r8u0',
  authDomain: 'rabiosa-student.firebaseapp.com',
  projectId: 'rabiosa-student',
  storageBucket: 'rabiosa-student.firebasestorage.app',
  messagingSenderId: '981897662759',
  appId: '1:981897662759:web:0b6ae7560be29fbaf35902',
};
