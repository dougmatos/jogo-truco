import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CardComponent } from '../../components/card/card.component';
import { GameEvent, PlayerInfo, TablePlay } from '../../models';
import { SocketService } from '../../services/socket.service';

interface Toast { id: number; text: string; kind: 'info' | 'truco' | 'win' | 'lose'; }

const RAISE_NAMES: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

let toastId = 0;

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [FormsModule, CardComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss']
})
export class GameComponent implements OnInit, OnDestroy {
  state = this.socket.state;
  game = computed(() => this.state()?.game ?? null);
  you = computed(() => this.state()?.you ?? null);

  toasts = signal<Toast[]>([]);
  trucoBanner = signal<string | null>(null);
  frozenTable = signal<TablePlay[] | null>(null);
  playFaceDown = false;
  chatOpen = signal(false);
  chatText = '';
  copied = signal(false);

  private redirectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Mesa exibida: congela a última vaza por um instante antes de limpar */
  displayTable = computed<TablePlay[]>(() =>
    this.frozenTable() ?? this.game()?.table ?? []);

  constructor(public socket: SocketService, private router: Router) {
    effect(() => {
      const events = this.socket.events();
      if (events.length) {
        this.handleEvents(events);
        this.socket.events.set([]);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    // Período de tolerância: o estado pode chegar logo após a navegação.
    // Sem isso, redirecionar na hora criava uma corrida que derrubava o jogador da sala.
    if (!this.state()) {
      this.redirectTimer = setTimeout(() => {
        if (!this.state()) this.router.navigate(['/']);
      }, 4000);
    }
  }

  ngOnDestroy(): void {
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    // Saiu da tela (ex.: botão voltar do navegador) ainda dentro de uma sala:
    // avisa o servidor para não deixar sala fantasma no lobby
    if (this.state()) this.socket.leaveRoom();
  }

  addBot(): void {
    this.socket.addBot();
  }

  avatarOf(p: { name: string; isBot: boolean }): string {
    return p.isBot ? '🤖' : p.name.charAt(0).toUpperCase();
  }

  // ---------- posições relativas na mesa ----------

  private relSeat(seat: number): number {
    const s = this.state();
    if (!s) return 0;
    return (seat - s.you.seat + s.mode) % s.mode;
  }

  /** posição visual: 'bottom' | 'top' | 'left' | 'right' */
  posOf(seat: number): string {
    const rel = this.relSeat(seat);
    const mode = this.state()?.mode ?? 2;
    if (rel === 0) return 'bottom';
    if (mode === 2) return 'top';
    return rel === 1 ? 'left' : rel === 2 ? 'top' : 'right';
  }

  playerAt(pos: string): PlayerInfo | null {
    return this.state()?.players.find(p => this.posOf(p.seat) === pos) ?? null;
  }

  tableCardAt(pos: string): TablePlay | null {
    return this.displayTable().find(p => this.posOf(p.seat) === pos) ?? null;
  }

  nameOf(seat: number): string {
    return this.state()?.players.find(p => p.seat === seat)?.name ?? '?';
  }

  cardCount(seat: number): number[] {
    const n = this.game()?.cardCounts?.[seat] ?? 0;
    return Array.from({ length: n });
  }

  isTurn(seat: number | undefined): boolean {
    if (seat === undefined) return false;
    const g = this.game();
    return !!g && !g.winner && g.currentTurn === seat &&
      !this.frozenTable() && !g.pendingTruco;
  }

  // ---------- placar ----------

  myScore(): number {
    const g = this.game(); const you = this.you();
    return g && you ? g.scores[you.team] : 0;
  }

  theirScore(): number {
    const g = this.game(); const you = this.you();
    return g && you ? g.scores[you.team === 'A' ? 'B' : 'A'] : 0;
  }

  vazaDots(): ('win' | 'lose' | 'tie' | 'pending')[] {
    const g = this.game(); const you = this.you();
    if (!g || !you) return ['pending', 'pending', 'pending'];
    return [0, 1, 2].map(i => {
      if (i >= g.vazaResults.length) return 'pending';
      const r = g.vazaResults[i];
      return r === null ? 'tie' : r === you.team ? 'win' : 'lose';
    });
  }

  // ---------- ações ----------

  trucoLabel(): string {
    const v = this.game()?.handValue ?? 1;
    return (RAISE_NAMES[v === 1 ? 3 : v + 3] ?? 'TRUCO') + '!';
  }

  canPlay(): boolean {
    const g = this.game(); const you = this.you();
    return !!g && !!you && g.currentTurn === you.seat && !g.pendingTruco &&
      !(g.maoDeOnze && !g.maoDeOnze.decided) && !g.winner && !this.frozenTable();
  }

  play(index: number): void {
    if (!this.canPlay()) return;
    this.socket.playCard(index, this.playFaceDown);
    this.playFaceDown = false;
  }

  truco(): void { this.socket.truco(); }

  mustRespondTruco(): boolean {
    const g = this.game(); const you = this.you();
    return !!g?.pendingTruco && !!you && g.pendingTruco.toTeam === you.team;
  }

  mustDecideMaoDeOnze(): boolean {
    const g = this.game(); const you = this.you();
    return !!g?.maoDeOnze && !g.maoDeOnze.decided && !!you && g.maoDeOnze.team === you.team;
  }

  waitingMaoDeOnze(): boolean {
    const g = this.game(); const you = this.you();
    return !!g?.maoDeOnze && !g.maoDeOnze.decided && !!you && g.maoDeOnze.team !== you.team;
  }

  raiseLabel(): string {
    const v = this.game()?.pendingTruco?.value ?? 3;
    return v >= 12 ? '' : (RAISE_NAMES[v === 3 ? 6 : v + 3] ?? '') + '!';
  }

  won(): boolean {
    const g = this.game(); const you = this.you();
    return !!g?.winner && !!you && g.winner === you.team;
  }

  sendChat(): void {
    const msg = this.chatText.trim();
    if (!msg) return;
    this.socket.sendChat(msg);
    this.chatText = '';
  }

  copyCode(): void {
    const id = this.state()?.roomId;
    if (!id) return;
    navigator.clipboard?.writeText(id);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  playAgain(): void { this.socket.playAgain(); }

  leave(): void {
    this.socket.leaveRoom();
    this.router.navigate(['/']);
  }

  backToLobby(): void {
    this.socket.playerLeft.set(null);
    this.socket.leaveRoom();
    this.router.navigate(['/']);
  }

  // ---------- eventos do servidor ----------

  private handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'trucoRequested':
          this.showTrucoBanner(`${this.nameOf(e['seat'])} pediu ${e['name']}!`);
          break;
        case 'trucoRaised':
          this.showTrucoBanner(`${this.nameOf(e['seat'])} aumentou: ${e['name']}!`);
          break;
        case 'trucoAccepted':
          this.toast(`Aceitou! A mão vale ${e['value']} 🔥`, 'info');
          break;
        case 'trucoFolded':
          this.toast(`${this.nameOf(e['seat'])} correu! 🏃💨`, 'info');
          break;
        case 'vazaResult': {
          this.frozenTable.set(e['table']);
          const text = e['result'] === null
            ? 'Empachou! Vaza empatada 😬'
            : `${this.nameOf(e['winnerSeat'])} levou a vaza!`;
          this.toast(text, 'info');
          setTimeout(() => this.frozenTable.set(null), 1700);
          break;
        }
        case 'handEnd': {
          const you = this.you();
          const mine = you && e['team'] === you.team;
          const pts = e['points'];
          this.toast(
            mine ? `Nós fizemos ${pts} ponto${pts > 1 ? 's' : ''}! 🎉`
                 : `Eles fizeram ${pts} ponto${pts > 1 ? 's' : ''} 😤`,
            mine ? 'win' : 'lose');
          break;
        }
        case 'maoDeOnze':
          this.toast('MÃO DE ONZE! 😱', 'truco');
          break;
        case 'maoDeFerro':
          this.toast('MÃO DE FERRO! Vale 3, sem truco!', 'truco');
          break;
        case 'maoDeOnzeFolded':
          this.toast('Correram da mão de onze!', 'info');
          break;
        case 'maoDeOnzeAccepted':
          this.toast('Vão jogar a mão de onze! Vale 3 🔥', 'info');
          break;
      }
    }
  }

  private toast(text: string, kind: Toast['kind']): void {
    const t: Toast = { id: toastId++, text, kind };
    this.toasts.update(list => [...list, t]);
    setTimeout(() => this.toasts.update(list => list.filter(x => x.id !== t.id)), 2800);
  }

  private showTrucoBanner(text: string): void {
    this.trucoBanner.set(text);
    setTimeout(() => this.trucoBanner.set(null), 1800);
  }
}
