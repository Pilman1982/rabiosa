// Wählt den Speicher: Demo (nur dieser Browser) oder Firebase.
import { FIREBASE } from '../config.js';

export function istDemo() {
  return !FIREBASE || new URLSearchParams(globalThis.location?.search || '').has('demo');
}

export async function waehleStore() {
  if (istDemo()) return (await import('./demo.js')).erstelleDemoStore();
  return (await import('./firebase.js')).erstelleFirebaseStore(FIREBASE);
}
