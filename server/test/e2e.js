// Teste de ponta a ponta: sobe o servidor e valida via Socket.IO:
// 1) lista de salas visível para outros clientes (bug da sala sumindo)
// 2) partida humano x humano até o fim
// 3) partida solo contra bot (baralho sujo) até o fim
import { spawn } from 'child_process';
import { io } from 'socket.io-client';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let failures = 0;

function assert(cond, msg) {
  if (cond) console.log(`✅ ${msg}`);
  else { failures++; console.error(`❌ ${msg}`); }
}

const server = spawn('node', ['src/index.js'], { env: { ...process.env, PORT }, stdio: 'pipe' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeBotClient(name) {
  const sock = io(URL, { transports: ['websocket'] });
  const bot = { name, sock, state: null, rooms: [], done: false };
  sock.on('roomsList', (list) => { bot.rooms = list; });
  sock.on('state', (s) => { bot.state = s; act(bot); });
  return bot;
}

function act(bot) {
  const s = bot.state;
  const g = s?.game;
  if (!g || bot.done) return;
  if (g.winner) { bot.done = true; return; }

  setTimeout(() => {
    const cur = bot.state?.game;
    if (!cur || cur.winner) return;
    if (cur.maoDeOnze && !cur.maoDeOnze.decided && cur.maoDeOnze.team === s.you.team) {
      bot.sock.emit('maoDeOnze', { play: Math.random() < 0.7 });
      return;
    }
    if (cur.pendingTruco && cur.pendingTruco.toTeam === s.you.team) {
      bot.sock.emit('respondTruco', { action: Math.random() < 0.7 ? 'accept' : 'fold' });
      return;
    }
    if (cur.currentTurn === s.you.seat && !cur.pendingTruco &&
        !(cur.maoDeOnze && !cur.maoDeOnze.decided)) {
      if (cur.canTruco && Math.random() < 0.08) { bot.sock.emit('truco'); return; }
      const idx = Math.floor(Math.random() * cur.yourCards.length);
      bot.sock.emit('playCard', { index: idx, faceDown: false });
    }
  }, 5);
}

async function waitDone(bots, label, timeout = 60000) {
  const start = Date.now();
  while (!bots.every(b => b.done)) {
    if (Date.now() - start > timeout) {
      assert(false, `${label}: TIMEOUT`);
      return false;
    }
    await wait(150);
  }
  assert(true, `${label}: partida completa`);
  return true;
}

async function main() {
  await wait(900);

  // --- 1) Visibilidade da sala no lobby ---
  const a = makeBotClient('Ana');
  const b = makeBotClient('Beto');
  const c = makeBotClient('Caio'); // só observa o lobby
  await wait(400);

  const { roomId } = await new Promise(res =>
    a.sock.emit('createRoom', { name: 'Ana', mode: 2, deck: 'limpo' }, res));
  await wait(400);
  assert(c.rooms.some(r => r.id === roomId), 'sala criada aparece para outro cliente no lobby');
  assert(b.rooms.some(r => r.id === roomId), 'sala criada aparece para o futuro participante');

  // Criador cria OUTRA sala (simula voltar ao lobby sem sair) → a antiga deve sumir, sem fantasma
  const { roomId: roomId2 } = await new Promise(res =>
    a.sock.emit('createRoom', { name: 'Ana', mode: 2, deck: 'limpo' }, res));
  await wait(400);
  assert(!c.rooms.some(r => r.id === roomId), 'sala antiga é removida (sem sala fantasma)');
  assert(c.rooms.some(r => r.id === roomId2), 'sala nova aparece no lobby');

  // --- 2) Partida humano x humano ---
  await new Promise(res => b.sock.emit('joinRoom', { roomId: roomId2, name: 'Beto' }, res));
  await wait(300);
  assert(!c.rooms.some(r => r.id === roomId2), 'sala cheia sai da lista');
  await waitDone([a, b], 'humano x humano');

  // --- 3) Solo contra bot, baralho sujo ---
  const d = makeBotClient('Dani');
  await wait(300);
  const resBot = await new Promise(res =>
    d.sock.emit('createRoom', { name: 'Dani', mode: 2, deck: 'sujo', bots: true }, res));
  assert(!!resBot.roomId, 'sala com bot criada');
  await wait(400);
  assert(d.state?.status === 'playing', 'partida contra bot inicia na hora');
  assert(d.state?.game?.deck === 'sujo' && !!d.state?.game?.vira, 'baralho sujo com vira na mesa');
  assert(d.state?.players?.some(p => p.isBot), 'bot presente na sala');
  await waitDone([d], 'solo contra o bot');

  // encerramento
  for (const x of [a, b, c, d]) x.sock.close();
  server.kill();
  if (failures === 0) console.log('\n✅ E2E completo!');
  else { console.error(`\n❌ ${failures} falha(s)`); process.exitCode = 1; }
  process.exit(process.exitCode ?? 0);
}

main().catch(e => { console.error(e); server.kill(); process.exit(1); });
