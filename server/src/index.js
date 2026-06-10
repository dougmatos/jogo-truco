// Servidor do Truco Online — Express + Socket.IO
import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { TrucoGame } from './game.js';
import { botShouldTruco, botRespondTruco, botMaoDeOnze, botChooseCard } from './bot.js';

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true, service: 'truco-server' }));

// Em produção (Docker), serve o front Angular compilado na mesma porta
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '../public');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!socket\.io|health).*/, (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html')));
  console.log(`📦 Servindo o front de: ${clientDist}`);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ---------------- Salas ----------------

const rooms = new Map(); // id -> room
const BOT_NAMES = ['Zé Bot', 'Bia Bot', 'Tião Bot'];
let botSeq = 0;

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function publicRooms() {
  return [...rooms.values()]
    .filter(r => r.status === 'waiting')
    .map(r => ({
      id: r.id,
      mode: r.mode,
      deck: r.deck,
      players: r.players.length,
      capacity: r.mode,
      hostName: r.players.find(p => !p.isBot)?.name ?? '?'
    }));
}

function broadcastRooms() {
  io.emit('roomsList', publicRooms());
}

function teamOf(seat) {
  return seat % 2 === 0 ? 'A' : 'B';
}

function nextFreeSeat(room) {
  const used = new Set(room.players.map(p => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  return seat;
}

function makeBot(room) {
  const seat = nextFreeSeat(room);
  return {
    id: `bot-${botSeq++}`,
    name: BOT_NAMES[room.players.filter(p => p.isBot).length % BOT_NAMES.length],
    seat,
    connected: true,
    isBot: true
  };
}

function startGame(room) {
  room.status = 'playing';
  room.game = new TrucoGame(room.mode, { deck: room.deck });
  syncGame(room);
}

function roomStateFor(room, player) {
  return {
    roomId: room.id,
    mode: room.mode,
    deck: room.deck,
    status: room.status,
    players: room.players.map(p => ({
      name: p.name,
      seat: p.seat,
      team: teamOf(p.seat),
      connected: p.connected,
      isBot: !!p.isBot
    })),
    you: { seat: player.seat, team: teamOf(player.seat), name: player.name },
    game: room.game ? room.game.stateFor(player.seat) : null
  };
}

function syncRoom(room, events = []) {
  for (const p of room.players) {
    if (p.isBot) continue;
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('state', { ...roomStateFor(room, p), events });
  }
}

function syncGame(room) {
  const events = room.game ? room.game.drainEvents() : [];
  syncRoom(room, events);
  if (room.game?.winner) room.status = 'finished';
  scheduleBots(room);
}

// ---------------- Bots ----------------

function pendingBotSeat(room) {
  const g = room.game;
  if (!g || g.winner) return null;
  const teamHasHuman = team =>
    room.players.some(p => !p.isBot && teamOf(p.seat) === team);
  const botOfTeam = team =>
    room.players.find(p => p.isBot && teamOf(p.seat) === team);

  if (g.maoDeOnze && !g.maoDeOnze.decided) {
    if (teamHasHuman(g.maoDeOnze.team)) return null;
    return botOfTeam(g.maoDeOnze.team)?.seat ?? null;
  }
  if (g.pendingTruco) {
    if (teamHasHuman(g.pendingTruco.toTeam)) return null;
    return botOfTeam(g.pendingTruco.toTeam)?.seat ?? null;
  }
  const p = room.players.find(x => x.seat === g.currentTurn && x.isBot);
  return p ? p.seat : null;
}

function scheduleBots(room) {
  if (room.botTimer) return;
  if (pendingBotSeat(room) === null) return;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (rooms.get(room.id) !== room || !room.game) return;
    const g = room.game;
    const seat = pendingBotSeat(room);
    if (seat === null) return;

    if (g.maoDeOnze && !g.maoDeOnze.decided) {
      g.decideMaoDeOnze(seat, botMaoDeOnze(g, seat));
    } else if (g.pendingTruco) {
      g.respondTruco(seat, botRespondTruco(g, seat));
    } else if (botShouldTruco(g, seat)) {
      g.requestTruco(seat);
    } else {
      const mv = botChooseCard(g, seat);
      g.playCard(seat, mv.index, mv.faceDown);
    }
    syncGame(room);
  }, 700 + Math.floor(Math.random() * 800));
}

// ---------------- Socket.IO ----------------

io.on('connection', (socket) => {
  let room = null;
  let player = null;

  socket.emit('roomsList', publicRooms());

  socket.on('createRoom', ({ name, mode, deck, bots }, cb) => {
    leaveRoom(); // sai de sala anterior, se houver
    name = String(name ?? '').trim().slice(0, 20) || 'Jogador';
    mode = mode === 4 ? 4 : 2;
    deck = deck === 'sujo' ? 'sujo' : 'limpo';

    const id = genRoomId();
    player = { id: socket.id, name, seat: 0, connected: true };
    room = { id, mode, deck, status: 'waiting', players: [player], game: null, botTimer: null };
    rooms.set(id, room);
    socket.join(id);

    if (bots) {
      while (room.players.length < room.mode) room.players.push(makeBot(room));
    }

    cb?.({ ok: true, roomId: id });
    if (room.players.length === room.mode) {
      startGame(room);
    } else {
      syncRoom(room);
    }
    broadcastRooms();
  });

  socket.on('joinRoom', ({ roomId, name }, cb) => {
    const r = rooms.get(String(roomId ?? '').toUpperCase().trim());
    if (!r) return cb?.({ error: 'Sala não encontrada.' });
    if (r.status !== 'waiting') return cb?.({ error: 'A partida já começou.' });
    if (r.players.length >= r.mode) return cb?.({ error: 'Sala cheia.' });

    leaveRoom(); // sai de sala anterior, se houver
    name = String(name ?? '').trim().slice(0, 20) || 'Jogador';

    player = { id: socket.id, name, seat: nextFreeSeat(r), connected: true };
    room = r;
    room.players.push(player);
    socket.join(room.id);
    cb?.({ ok: true, roomId: room.id });

    if (room.players.length === room.mode) {
      startGame(room);
    } else {
      syncRoom(room);
    }
    broadcastRooms();
  });

  socket.on('addBot', () => {
    if (!room || room.status !== 'waiting') return;
    if (room.players.length >= room.mode) return;
    room.players.push(makeBot(room));
    if (room.players.length === room.mode) {
      startGame(room);
    } else {
      syncRoom(room);
    }
    broadcastRooms();
  });

  socket.on('listRooms', (cb) => cb?.(publicRooms()));

  socket.on('playCard', ({ index, faceDown }) => {
    if (!room?.game || !player) return;
    const res = room.game.playCard(player.seat, index, !!faceDown);
    if (res.error) return socket.emit('gameError', res.error);
    syncGame(room);
  });

  socket.on('truco', () => {
    if (!room?.game || !player) return;
    const res = room.game.requestTruco(player.seat);
    if (res.error) return socket.emit('gameError', res.error);
    syncGame(room);
  });

  socket.on('respondTruco', ({ action }) => {
    if (!room?.game || !player) return;
    const res = room.game.respondTruco(player.seat, action);
    if (res.error) return socket.emit('gameError', res.error);
    syncGame(room);
  });

  socket.on('maoDeOnze', ({ play }) => {
    if (!room?.game || !player) return;
    const res = room.game.decideMaoDeOnze(player.seat, !!play);
    if (res.error) return socket.emit('gameError', res.error);
    syncGame(room);
  });

  socket.on('chat', ({ message }) => {
    if (!room || !player) return;
    message = String(message ?? '').trim().slice(0, 200);
    if (!message) return;
    io.to(room.id).emit('chat', { name: player.name, seat: player.seat, message });
  });

  socket.on('playAgain', () => {
    if (!room || room.status !== 'finished') return;
    startGame(room);
  });

  socket.on('leaveRoom', () => leaveRoom());
  socket.on('disconnect', () => leaveRoom());

  function leaveRoom() {
    if (!room || !player) return;
    const r = room;
    r.players = r.players.filter(p => p.id !== socket.id);
    socket.leave(r.id);

    const humansLeft = r.players.filter(p => !p.isBot);
    if (humansLeft.length === 0) {
      // Só sobraram bots (ou ninguém): fecha a sala
      clearTimeout(r.botTimer);
      r.botTimer = null;
      rooms.delete(r.id);
    } else if (r.status === 'playing' || r.status === 'finished') {
      // Partida em andamento: encerra e avisa
      clearTimeout(r.botTimer);
      r.botTimer = null;
      io.to(r.id).emit('playerLeft', { name: player.name });
      rooms.delete(r.id);
      io.to(r.id).socketsLeave(r.id);
    } else {
      // Sala de espera: reorganiza os assentos
      r.players.forEach((p, i) => { p.seat = i; });
      syncRoom(r);
    }
    room = null;
    player = null;
    broadcastRooms();
  }
});

server.listen(PORT, () => {
  console.log(`🃏 Truco server rodando em http://localhost:${PORT}`);
});
