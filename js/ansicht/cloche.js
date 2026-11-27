// Cloche: Board mit Gruppen vor einem Bildschirm (Platzhalter).
import { h } from '../ui.js';

export function zeige(wurzel, ctx, quizId) {
  ctx.store.quiz.laden(quizId).then(q => wurzel.replaceChildren(h('h1', { class: 'laedt' }, q.titel)));
}
