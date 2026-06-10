import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss']
})
export class LobbyComponent implements OnInit {
  name = '';
  mode = 2;
  deck: 'limpo' | 'sujo' = 'limpo';
  joinCode = '';
  error = signal<string | null>(null);
  busy = signal(false);

  constructor(public socket: SocketService, private router: Router) {}

  ngOnInit(): void {
    this.socket.connect();
    this.name = this.socket.playerName || localStorage.getItem('truco-name') || '';
  }

  private validName(): boolean {
    if (!this.name.trim()) {
      this.showError('Digite seu apelido para jogar!');
      return false;
    }
    localStorage.setItem('truco-name', this.name.trim());
    return true;
  }

  async create(bots = false): Promise<void> {
    if (!this.validName() || this.busy()) return;
    this.busy.set(true);
    const res = await this.socket.createRoom(this.name.trim(), this.mode, this.deck, bots);
    if (res.error) { this.busy.set(false); return this.showError(res.error); }
    await this.socket.waitForRoom(); // garante o estado antes de navegar
    this.busy.set(false);
    this.router.navigate(['/sala']);
  }

  async join(code?: string): Promise<void> {
    const roomId = (code ?? this.joinCode).trim().toUpperCase();
    if (!roomId) return this.showError('Digite o código da sala.');
    if (!this.validName() || this.busy()) return;
    this.busy.set(true);
    const res = await this.socket.joinRoom(roomId, this.name.trim());
    if (res.error) { this.busy.set(false); return this.showError(res.error); }
    await this.socket.waitForRoom();
    this.busy.set(false);
    this.router.navigate(['/sala']);
  }

  private showError(msg: string): void {
    this.error.set(msg);
    setTimeout(() => this.error.set(null), 3500);
  }
}
