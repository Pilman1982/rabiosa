// Punkte nach Tempo: sofort 1000, am Ende der Zeit 500, mal Anteil der Richtigkeit.
export function punkte(anteil, sekunden, zeit) {
  if (!(anteil > 0)) return 0;
  const verbraucht = Math.min(1, Math.max(0, sekunden / zeit));
  return Math.round((1000 - 500 * verbraucht) * anteil);
}
