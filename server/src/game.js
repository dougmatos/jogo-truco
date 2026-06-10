// Lógica do Truco Paulista — partida até 12 pontos, truco 3/6/9/12, mão de onze
// Baralho "limpo" (manilhas fixas) ou "sujo" (vira define a manilha)
import { createDeck, shuffle, cardStrength, nextRank } from './cards.js';

const TARGET_SCORE = 12;
const RAISE_NAMES = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

export class TrucoGame {
  /**
   * @param {number} playerCount 2 (1x1) ou 4 (2x2)
   * @param {{deck?: 'limpo'|'sujo'}} options
   * Times: seats pares = 'A', seats ímpares = 'B'
   */
  constructor(playerCount, options = {}) {
    this.playerCount = playerCount;
    this.deckType = options.deck === 'sujo' ? 'sujo' : 'limpo';
    this.scores = { A: 0, B: 0 };
    this.dealerSeat = Math.floor(Math.random() * playerCount);
    this.winner = null;
    this.events = [];
    this.startHand();
  }

  teamOf(seat) {
    return seat % 2 === 0 ? 'A' : 'B';
  }

  otherTeam(team) {
    return team === 'A' ? 'B' : 'A';
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------- Mão (hand) ----------------

  startHand() {
    this.dealerSeat = (this.dealerSeat + 1) % this.playerCount;
    const maoSeat = (this.dealerSeat + 1) % this.playerCount;

    const deck = shuffle(createDeck());
    this.hands = [];
    for (let s = 0; s < this.playerCount; s++) {
      this.hands[s] = deck.slice(s * 3, s * 3 + 3);
    }

    // Baralho sujo: vira a próxima carta; manilha é o rank seguinte
    if (this.deckType === 'sujo') {
      this.vira = deck[this.playerCount * 3];
      this.manilhaRank = nextRank(this.vira.rank);
    } else {
      this.vira = null;
      this.manilhaRank = null;
    }

    this.handValue = 1;
    this.lastRaiseTeam = null;
    this.pendingTruco = null;
    this.vazaResults = []; // 'A' | 'B' | null (empate)
    this.table = []; // [{ seat, card, faceDown }]
    this.vazaLeader = maoSeat;
    this.maoSeat = maoSeat;
    this.currentTurn = maoSeat;
    this.handOver = false;

    // Mão de onze
    this.maoDeOnze = null;
    this.trucoAllowed = true;
    const aAt11 = this.scores.A === TARGET_SCORE - 1;
    const bAt11 = this.scores.B === TARGET_SCORE - 1;
    if (aAt11 && bAt11) {
      // Mão de ferro simplificada: vale 3, sem truco, sem desistir
      this.handValue = 3;
      this.trucoAllowed = false;
      this.emit('maoDeFerro');
    } else if (aAt11 || bAt11) {
      this.maoDeOnze = { team: aAt11 ? 'A' : 'B', decided: false };
      this.trucoAllowed = false;
      this.emit('maoDeOnze', { team: this.maoDeOnze.team });
    }

    this.emit('newHand', { dealerSeat: this.dealerSeat, maoSeat });
  }

  decideMaoDeOnze(seat, play) {
    if (!this.maoDeOnze || this.maoDeOnze.decided) return { error: 'Nada a decidir.' };
    if (this.teamOf(seat) !== this.maoDeOnze.team) return { error: 'Não é a sua decisão.' };
    if (play) {
      this.maoDeOnze.decided = true;
      this.handValue = 3;
      this.emit('maoDeOnzeAccepted', { team: this.maoDeOnze.team });
    } else {
      const opponent = this.otherTeam(this.maoDeOnze.team);
      this.emit('maoDeOnzeFolded', { team: this.maoDeOnze.team });
      this.endHand(opponent, 1);
    }
    return { ok: true };
  }

  // ---------------- Jogada de carta ----------------

  playCard(seat, cardIndex, faceDown = false) {
    if (this.winner) return { error: 'A partida já terminou.' };
    if (this.pendingTruco) return { error: 'Responda ao truco primeiro.' };
    if (this.maoDeOnze && !this.maoDeOnze.decided) return { error: 'Aguardando decisão da mão de onze.' };
    if (seat !== this.currentTurn) return { error: 'Não é a sua vez.' };

    const hand = this.hands[seat];
    if (cardIndex < 0 || cardIndex >= hand.length) return { error: 'Carta inválida.' };

    // Carta coberta não é permitida na primeira vaza
    if (faceDown && this.vazaResults.length === 0) faceDown = false;

    const [card] = hand.splice(cardIndex, 1);
    this.table.push({ seat, card, faceDown });
    this.emit('cardPlayed', { seat, card: faceDown ? null : card, faceDown });

    if (this.table.length === this.playerCount) {
      this.resolveVaza();
    } else {
      this.currentTurn = (seat + 1) % this.playerCount;
    }
    return { ok: true };
  }

  resolveVaza() {
    const strengthOf = (p) => (p.faceDown ? 0 : cardStrength(p.card, this.manilhaRank));

    let best = { A: null, B: null };
    for (const play of this.table) {
      const team = this.teamOf(play.seat);
      const s = strengthOf(play);
      if (!best[team] || s > best[team].strength) {
        best[team] = { seat: play.seat, strength: s };
      }
    }

    let result, winnerSeat = null;
    if (best.A.strength === best.B.strength) {
      result = null; // empate (cangou)
    } else if (best.A.strength > best.B.strength) {
      result = 'A';
      winnerSeat = best.A.seat;
    } else {
      result = 'B';
      winnerSeat = best.B.seat;
    }

    this.vazaResults.push(result);
    this.emit('vazaResult', {
      result,
      winnerSeat,
      table: this.table.map(p => ({ seat: p.seat, card: p.card, faceDown: p.faceDown }))
    });

    // Quem lidera a próxima vaza
    this.vazaLeader = winnerSeat !== null ? winnerSeat : this.table[0].seat;
    this.table = [];
    this.currentTurn = this.vazaLeader;

    const handWinner = this.evalHandEnd();
    if (handWinner) {
      this.endHand(handWinner, this.handValue);
    }
  }

  evalHandEnd() {
    const r = this.vazaResults;
    const a = r.filter(x => x === 'A').length;
    const b = r.filter(x => x === 'B').length;
    const ties = r.filter(x => x === null).length;

    if (a >= 2) return 'A';
    if (b >= 2) return 'B';
    // Empatou uma vaza: quem tiver vencido qualquer outra leva a mão
    if (ties > 0 && a === 1 && b === 0) return 'A';
    if (ties > 0 && b === 1 && a === 0) return 'B';
    if (r.length === 3) {
      // 3 vazas jogadas sem decisão: vale quem ganhou a primeira; empate total → time do mão
      const first = r.find(x => x !== null);
      return first ?? this.teamOf(this.maoSeat);
    }
    return null;
  }

  // ---------------- Truco ----------------

  requestTruco(seat) {
    if (this.winner) return { error: 'A partida já terminou.' };
    if (!this.trucoAllowed) return { error: 'Truco não permitido nesta mão.' };
    if (this.pendingTruco) return { error: 'Já existe um truco pendente.' };
    if (seat !== this.currentTurn) return { error: 'Só é possível trucar na sua vez.' };

    const team = this.teamOf(seat);
    if (this.lastRaiseTeam === team) return { error: 'Sua equipe não pode pedir de novo.' };
    if (this.handValue >= 12) return { error: 'Valor máximo atingido.' };

    const value = this.handValue === 1 ? 3 : this.handValue + 3;
    this.pendingTruco = {
      bySeat: seat,
      byTeam: team,
      toTeam: this.otherTeam(team),
      value,
      previousValue: this.handValue
    };
    this.emit('trucoRequested', { seat, team, value, name: RAISE_NAMES[value] });
    return { ok: true };
  }

  respondTruco(seat, action) {
    const p = this.pendingTruco;
    if (!p) return { error: 'Não há truco pendente.' };
    if (this.teamOf(seat) !== p.toTeam) return { error: 'Não é você quem responde.' };

    if (action === 'accept') {
      this.handValue = p.value;
      this.lastRaiseTeam = p.byTeam;
      this.pendingTruco = null;
      this.emit('trucoAccepted', { seat, value: this.handValue });
      return { ok: true };
    }

    if (action === 'fold') {
      const winnerTeam = p.byTeam;
      const points = p.previousValue;
      this.pendingTruco = null;
      this.emit('trucoFolded', { seat, team: this.teamOf(seat) });
      this.endHand(winnerTeam, points);
      return { ok: true };
    }

    if (action === 'raise') {
      if (p.value >= 12) return { error: 'Não dá para aumentar mais.' };
      const newValue = p.value === 3 ? 6 : p.value + 3;
      this.pendingTruco = {
        bySeat: seat,
        byTeam: p.toTeam,
        toTeam: p.byTeam,
        value: newValue,
        previousValue: p.value
      };
      this.emit('trucoRaised', { seat, value: newValue, name: RAISE_NAMES[newValue] });
      return { ok: true };
    }

    return { error: 'Ação inválida.' };
  }

  // ---------------- Fim de mão / partida ----------------

  endHand(team, points) {
    this.scores[team] += points;
    this.handOver = true;
    this.emit('handEnd', { team, points, scores: { ...this.scores } });

    if (this.scores[team] >= TARGET_SCORE) {
      this.winner = team;
      this.emit('gameOver', { team, scores: { ...this.scores } });
    } else {
      this.startHand();
    }
  }

  // ---------------- Estado por jogador ----------------

  stateFor(seat) {
    const showTeammateCards =
      this.maoDeOnze && !this.maoDeOnze.decided &&
      this.maoDeOnze.team === this.teamOf(seat);

    return {
      scores: { ...this.scores },
      handValue: this.handValue,
      currentTurn: this.currentTurn,
      dealerSeat: this.dealerSeat,
      maoSeat: this.maoSeat,
      deck: this.deckType,
      vira: this.vira,
      manilhaRank: this.manilhaRank,
      vazaResults: [...this.vazaResults],
      table: this.table.map(p => ({
        seat: p.seat,
        card: p.faceDown ? null : p.card,
        faceDown: p.faceDown
      })),
      yourCards: this.hands[seat] ?? [],
      teammateCards: showTeammateCards && this.playerCount === 4
        ? this.hands[(seat + 2) % 4]
        : null,
      cardCounts: this.hands.map(h => h.length),
      pendingTruco: this.pendingTruco
        ? {
            bySeat: this.pendingTruco.bySeat,
            byTeam: this.pendingTruco.byTeam,
            toTeam: this.pendingTruco.toTeam,
            value: this.pendingTruco.value
          }
        : null,
      maoDeOnze: this.maoDeOnze ? { ...this.maoDeOnze } : null,
      canTruco:
        this.trucoAllowed &&
        !this.pendingTruco &&
        !this.winner &&
        this.handValue < 12 &&
        this.currentTurn === seat &&
        this.lastRaiseTeam !== this.teamOf(seat),
      winner: this.winner
    };
  }
}
