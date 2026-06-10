import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ChatMessage, GameEvent, RoomState, RoomSummary } from '../models';

// Em dev (ng serve na 4200) o servidor roda na 3000; em produção (Docker),
// front e back saem da mesma origem.
const SERVER_URL = location.port === '4200'
  ? `http://${location.hostname}:3000`
  : location.origin;

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  readonly state = signal<RoomState | null>(null);
  readonly events = signal<GameEvent[]>([]);
  readonly rooms = signal<RoomSummary[]>([]);
  readonly chat = signal<ChatMessage[]>([]);
  readonly errorMsg = signal<string | null>(null);
  readonly playerLeft = signal<string | null>(null);

  playerName = '';

  connect(): void {
    if (this.socket) return;
    this.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    this.socket.on('state', (data: RoomState & { events?: GameEvent[] }) => {
      const { events, ...room } = data;
      this.state.set(room as RoomState);
      if (events?.length) this.events.set(events);
    });

    this.socket.on('roomsList', (rooms: RoomSummary[]) => this.rooms.set(rooms));

    this.socket.on('chat', (msg: ChatMessage) =>
      this.chat.update(list => [...list.slice(-49), msg]));

    this.socket.on('gameError', (msg: string) => {
      this.errorMsg.set(msg);
      setTimeout(() => this.errorMsg.set(null), 3000);
    });

    this.socket.on('playerLeft', ({ name }: { name: string }) => {
      this.playerLeft.set(name);
    });

    this.socket.on('disconnect', () => {
      this.state.set(null);
    });
  }

  private request<T>(event: string, payload: unknown): Promise<T> {
    return new Promise(resolve => this.socket!.emit(event, payload, resolve));
  }

  createRoom(name: string, mode: number, deck: string, bots = false):
    Promise<{ ok?: boolean; roomId?: string; error?: string }> {
    this.connect();
    this.playerName = name;
    return this.request('createRoom', { name, mode, deck, bots });
  }

  joinRoom(roomId: string, name: string): Promise<{ ok?: boolean; roomId?: string; error?: string }> {
    this.connect();
    this.playerName = name;
    return this.request('joinRoom', { roomId, name });
  }

  addBot(): void {
    this.socket?.emit('addBot');
  }

  /** Espera o estado da sala chegar antes de navegar (evita corrida de eventos) */
  waitForRoom(timeoutMs = 4000): Promise<boolean> {
    return new Promise(resolve => {
      if (this.state()) return resolve(true);
      const start = Date.now();
      const iv = setInterval(() => {
        if (this.state()) { clearInterval(iv); resolve(true); }
        else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 25);
    });
  }

  playCard(index: number, faceDown: boolean): void {
    this.socket?.emit('playCard', { index, faceDown });
  }

  truco(): void {
    this.socket?.emit('truco');
  }

  respondTruco(action: 'accept' | 'raise' | 'fold'): void {
    this.socket?.emit('respondTruco', { action });
  }

  maoDeOnze(play: boolean): void {
    this.socket?.emit('maoDeOnze', { play });
  }

  sendChat(message: string): void {
    this.socket?.emit('chat', { message });
  }

  playAgain(): void {
    this.socket?.emit('playAgain');
  }

  leaveRoom(): void {
    this.socket?.emit('leaveRoom');
    this.state.set(null);
    this.chat.set([]);
    this.events.set([]);
    this.playerLeft.set(null);
  }
}
