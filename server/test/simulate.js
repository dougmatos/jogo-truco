// Simulação automática da lógica do jogo (1x1 e 2x2, baralho limpo e sujo)
import { TrucoGame } from '../src/game.js';
import { cardStrength, isManilha, createDeck, nextRank } from '../src/cards.js';
import { botShouldTruco, botRespondTruco, botMaoDeOnze, botChooseCard } from '../src/bot.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FALHOU:', msg);
  }
}

// --- Força das cartas (baralho limpo) ---
assert(createDeck().length === 40, 'baralho deve ter 40 cartas');
assert(cardStrength({ rank: '4', suit: 'clubs' }) === 14, 'zap é a maior');
assert(cardStrength({ rank: '7', suit: 'hearts' }) === 13, 'copas é a 2ª');
assert(cardStrength({ rank: 'A', suit: 'spades' }) === 12, 'espadilha é a 3ª');
assert(cardStrength({ rank: '7', suit: 'diamonds' }) === 11, 'pica-fumo é a 4ª');
assert(cardStrength({ rank: '3', suit: 'hearts' }) === 10, '3 é a maior comum');
assert(isManilha({ rank: '4', suit: 'clubs' }), '4 de paus é manilha no limpo');

// --- Força das cartas (baralho sujo / vira) ---
assert(nextRank('4') === '5', 'depois do 4 vem o 5');
assert(nextRank('7') === 'Q', 'depois do 7 vem a Q');
assert(nextRank('3') === '4', 'depois do 3 volta o 4');
assert(cardStrength({ rank: 'Q', suit: 'clubs' }, 'Q') === 14, 'manilha de paus é a maior');
assert(cardStrength({ rank: 'Q', suit: 'hearts' }, 'Q') === 13, 'manilha de copas é a 2ª');
assert(cardStrength({ rank: 'Q', suit: 'spades' }, 'Q') === 12, 'manilha de espadas é a 3ª');
assert(cardStrength({ rank: 'Q', suit: 'diamonds' }, 'Q') === 11, 'manilha de ouros é a 4ª');
assert(cardStrength({ rank: '4', suit: 'clubs' }, 'Q') === 1, 'zap vira carta comum no sujo');
assert(cardStrength({ rank: '3', suit: 'clubs' }, 'Q') === 10, '3 comum no sujo');
assert(isManilha({ rank: 'Q', suit: 'hearts' }, 'Q'), 'Q é manilha quando vira J... rank Q');
assert(!isManilha({ rank: '7', suit: 'hearts' }, 'Q'), '7 de copas não é manilha no sujo');

// --- Simulação de partidas completas ---
function simulate(playerCount, games, deck, useBots) {
  for (let g = 0; g < games; g++) {
    const game = new TrucoGame(playerCount, { deck });
    let safety = 0;

    while (!game.winner && safety++ < 5000) {
      game.drainEvents();

      if (game.deckType === 'sujo') {
        assert(game.vira && game.manilhaRank === nextRank(game.vira.rank), 'vira/manilha coerentes');
      } else {
        assert(game.vira === null && game.manilhaRank === null, 'limpo não tem vira');
      }

      if (game.maoDeOnze && !game.maoDeOnze.decided) {
        const seat = game.maoDeOnze.team === 'A' ? 0 : 1;
        const play = useBots ? botMaoDeOnze(game, seat) : Math.random() < 0.7;
        const res = game.decideMaoDeOnze(seat, play);
        assert(!res.error, `maoDeOnze: ${res.error}`);
        continue;
      }

      if (game.pendingTruco) {
        const seat = game.pendingTruco.toTeam === 'A' ? 0 : 1;
        let action;
        if (useBots) {
          action = botRespondTruco(game, seat);
        } else {
          const roll = Math.random();
          action = roll < 0.6 ? 'accept' : roll < 0.85 ? 'fold' : 'raise';
        }
        const res = game.respondTruco(seat, action);
        if (action === 'raise' && res.error) game.respondTruco(seat, 'accept');
        else assert(!res.error, `respondTruco: ${res.error}`);
        continue;
      }

      const seat = game.currentTurn;
      if (useBots ? botShouldTruco(game, seat) : Math.random() < 0.1) {
        const res = game.requestTruco(seat);
        if (!res.error) continue;
        if (useBots) assert(false, `botShouldTruco pediu truco inválido: ${res.error}`);
      }

      const hand = game.hands[seat];
      assert(hand.length > 0, `seat ${seat} sem cartas para jogar`);
      let res;
      if (useBots) {
        const mv = botChooseCard(game, seat);
        res = game.playCard(seat, mv.index, mv.faceDown);
      } else {
        const idx = Math.floor(Math.random() * hand.length);
        const faceDown = game.vazaResults.length > 0 && Math.random() < 0.1;
        res = game.playCard(seat, idx, faceDown);
      }
      assert(!res.error, `playCard: ${res.error}`);
    }

    assert(game.winner === 'A' || game.winner === 'B', `partida ${g} não terminou (safety=${safety})`);
    assert(game.scores[game.winner] >= 12, 'vencedor deve ter 12+ pontos');
  }
  console.log(`OK: ${games} partidas ${playerCount === 2 ? '1x1' : '2x2'} (${deck}${useBots ? ', bots' : ''})`);
}

simulate(2, 150, 'limpo', false);
simulate(4, 150, 'limpo', false);
simulate(2, 150, 'sujo', false);
simulate(4, 150, 'sujo', false);
simulate(2, 150, 'limpo', true);
simulate(2, 150, 'sujo', true);

// --- Regras de empate ---
{
  const game = new TrucoGame(2);
  game.vazaResults = [null, 'A'];
  assert(game.evalHandEnd() === 'A', 'empate na 1ª + vitória na 2ª → A');
  game.vazaResults = ['B', null];
  assert(game.evalHandEnd() === 'B', 'vitória na 1ª + empate na 2ª → B');
  game.vazaResults = ['A', 'B', null];
  assert(game.evalHandEnd() === 'A', '1-1 + empate na 3ª → quem fez a 1ª');
  game.vazaResults = [null, null];
  assert(game.evalHandEnd() === null, 'dois empates → vai para a 3ª');
  game.vazaResults = [null, null, null];
  assert(game.evalHandEnd() === game.teamOf(game.maoSeat), 'empate total → time do mão');
  game.vazaResults = ['A', 'A'];
  assert(game.evalHandEnd() === 'A', 'duas vazas → A');
}

if (failures === 0) {
  console.log('\n✅ Todos os testes passaram!');
} else {
  console.error(`\n❌ ${failures} teste(s) falharam`);
  process.exit(1);
}
