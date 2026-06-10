// IA simples do bot de truco — heurísticas baseadas na força da mão
import { cardStrength } from './cards.js';

function strengths(game, seat) {
  return game.hands[seat].map((c, i) => ({ i, s: cardStrength(c, game.manilhaRank) }));
}

function handMax(game, seat) {
  const ss = strengths(game, seat);
  return ss.length ? Math.max(...ss.map(x => x.s)) : 0;
}

function handSum(game, seat) {
  return strengths(game, seat).reduce((t, x) => t + x.s, 0);
}

/** Decide se o bot pede truco/aumento na vez dele */
export function botShouldTruco(game, seat) {
  if (!game.trucoAllowed || game.pendingTruco || game.winner) return false;
  if (game.handValue >= 12 || game.currentTurn !== seat) return false;
  if (game.lastRaiseTeam === game.teamOf(seat)) return false;

  const max = handMax(game, seat);
  const team = game.teamOf(seat);
  const won = game.vazaResults.filter(r => r === team).length;
  const cards = game.hands[seat].length || 1;

  if (won === 1 && max >= 10 && Math.random() < 0.5) return true;
  if (max >= 13 && Math.random() < 0.4) return true;
  if (handSum(game, seat) / cards >= 9 && Math.random() < 0.2) return true;
  return Math.random() < 0.04; // blefe ocasional
}

/** Resposta do bot a um truco: 'accept' | 'raise' | 'fold' */
export function botRespondTruco(game, seat) {
  const max = handMax(game, seat);
  const sum = handSum(game, seat);
  const team = game.teamOf(seat);
  const won = game.vazaResults.filter(r => r === team).length;

  if (max >= 13 && game.pendingTruco.value < 12 && Math.random() < 0.4) return 'raise';
  if (max >= 11) return 'accept';
  if (won >= 1 && max >= 8) return 'accept';
  if (sum >= 20) return 'accept';
  return Math.random() < 0.25 ? 'accept' : 'fold';
}

/** Decide se joga a mão de onze */
export function botMaoDeOnze(game, seat) {
  return handMax(game, seat) >= 11 || handSum(game, seat) >= 22;
}

/** Escolhe a carta a jogar */
export function botChooseCard(game, seat) {
  const team = game.teamOf(seat);
  const hand = strengths(game, seat).sort((a, b) => a.s - b.s); // fraca → forte

  let bestOpp = -1;
  let bestMine = -1;
  for (const p of game.table) {
    const s = p.faceDown ? 0 : cardStrength(p.card, game.manilhaRank);
    if (game.teamOf(p.seat) === team) bestMine = Math.max(bestMine, s);
    else bestOpp = Math.max(bestOpp, s);
  }

  // Abrindo a vaza: joga uma carta mediana
  if (game.table.length === 0) {
    return { index: hand[Math.floor((hand.length - 1) / 2)].i, faceDown: false };
  }

  // Parceiro já está ganhando: descarta a mais fraca
  if (bestMine > bestOpp) {
    return { index: hand[0].i, faceDown: false };
  }

  // Tenta vencer com a carta mais barata possível
  const winner = hand.find(x => x.s > bestOpp);
  if (winner) return { index: winner.i, faceDown: false };

  // Não dá para ganhar: joga a mais fraca
  return { index: hand[0].i, faceDown: false };
}
