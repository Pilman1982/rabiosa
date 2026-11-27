// Wählt den Speicher: Demo (nur dieser Browser) oder Firebase. Jede Fassung (siehe variante.js) hat ihr eigenes Projekt.
import { FIREBASE, FIREBASE_STUDENT } from '../config.js';
import { VARIANTE } from '../variante.js';

export const konfigFuer = variante => (variante === 'student' ? FIREBASE_STUDENT : FIREBASE);

export function istDemo() {
  return !konfigFuer(VARIANTE) || new URLSearchParams(globalThis.location?.search || '').has('demo');
}

export async function waehleStore() {
  // Auch im Demo-Modus getrennt: Die beiden Fassungen liegen unter derselben Adresse und teilen sich sonst den Browser-Speicher.
  if (istDemo()) return (await import('./demo.js')).erstelleDemoStore(VARIANTE === 'student' ? { name: 'rabiosa-student-demo' } : {});
  return (await import('./firebase.js')).erstelleFirebaseStore(konfigFuer(VARIANTE));
}
