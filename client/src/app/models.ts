export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Team = 'A' | 'B';

export interface Card {
  rank: string;
  suit: Suit;
}

export type DeckType = 'limpo' | 'sujo';

export interface PlayerInfo {
  name: string;
  seat: number;
  team: Team;
  connected: boolean;
  isBot: boolean;
}

export interface TablePlay {
  seat: number;
  card: Card | null;
  faceDown: boolean;
}

export interface PendingTruco {
  bySeat: number;
  byTeam: Team;
  toTeam: Team;
  value: number;
}

export interface GameState {
  scores: { A: number; B: number };
  handValue: number;
  currentTurn: number;
  dealerSeat: number;
  maoSeat: number;
  deck: DeckType;
  vira: Card | null;
  manilhaRank: string | null;
  vazaResults: (Team | null)[];
  table: TablePlay[];
  yourCards: Card[];
  teammateCards: Card[] | null;
  cardCounts: number[];
  pendingTruco: PendingTruco | null;
  maoDeOnze: { team: Team; decided: boolean } | null;
  canTruco: boolean;
  winner: Team | null;
}

export interface RoomState {
  roomId: string;
  mode: number;
  deck: DeckType;
  status: 'waiting' | 'playing' | 'finished';
  players: PlayerInfo[];
  you: { seat: number; team: Team; name: string };
  game: GameState | null;
}

export interface RoomSummary {
  id: string;
  mode: number;
  deck: DeckType;
  players: number;
  capacity: number;
  hostName: string;
}

export interface GameEvent {
  type: string;
  [key: string]: any;
}

export interface ChatMessage {
  name: string;
  seat: number;
  message: string;
}
