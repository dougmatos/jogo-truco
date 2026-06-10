// Baralho e força das cartas — Truco Paulista
// Suporta baralho "limpo" (manilhas fixas) e "sujo" (manilha definida pela vira)

export const SUITS = ['diamonds', 'spades', 'hearts', 'clubs'];
export const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

// Força base (sem manilha): 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3
const BASE_STRENGTH = {
  '4': 1, '5': 2, '6': 3, '7': 4, 'Q': 5,
  'J': 6, 'K': 7, 'A': 8, '2': 9, '3': 10
};

// Manilhas fixas (baralho limpo):
// 4♣ (Zap) > 7♥ (Copas) > A♠ (Espadilha) > 7♦ (Pica-fumo)
const FIXED_MANILHAS = {
  '7|diamonds': 11,
  'A|spades': 12,
  '7|hearts': 13,
  '4|clubs': 14
};

// Desempate entre manilhas no baralho sujo: ouros < espadas < copas < paus
const SUIT_RANK = { diamonds: 0, spades: 1, hearts: 2, clubs: 3 };

export function cardKey(card) {
  return `${card.rank}|${card.suit}`;
}

/** Rank seguinte ao da vira (depois do 3 volta para o 4) */
export function nextRank(rank) {
  return RANKS[(RANKS.indexOf(rank) + 1) % RANKS.length];
}

export function isManilha(card, manilhaRank = null) {
  if (manilhaRank) return card.rank === manilhaRank;
  return FIXED_MANILHAS[cardKey(card)] !== undefined;
}

export function cardStrength(card, manilhaRank = null) {
  if (manilhaRank) {
    return card.rank === manilhaRank
      ? 11 + SUIT_RANK[card.suit]
      : BASE_STRENGTH[card.rank];
  }
  return FIXED_MANILHAS[cardKey(card)] ?? BASE_STRENGTH[card.rank];
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
