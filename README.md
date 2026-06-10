# 🃏 Truco Online

Jogo de **Truco Paulista** online multiplayer, com salas **1x1** e **2x2**, feito em **Angular + Node.js (Socket.IO)**. Todas as cartas e imagens do jogo são desenhadas em **SVG**, com visual colorido e moderno.

## Estrutura

```
jogo-truco/
├── server/   → Backend Node.js (Express + Socket.IO)
└── client/   → Frontend Angular
```

## Como rodar

### 🐳 Com Docker (um único comando)

```bash
docker compose up --build
```

Abre tudo em **http://localhost:3099** — o container compila o Angular e o Node serve o front e o Socket.IO na mesma porta.

Sem compose: `docker build -t truco . && docker run -p 3099:3099 truco`

### Deploy no VPS

O deploy via GitHub Actions usa SSH com senha. Configure estes secrets no repositório:

- `VPS_HOST`
- `VPS_USER`
- `VPS_PASSWORD`

No VPS, o nginx precisa publicar o dominio `truco.dougm.dev` com TLS do Let's Encrypt e encaminhar para `127.0.0.1:3099`. O script `scripts/check-vps.sh` valida essa configuracao antes de subir o container.

### Em modo de desenvolvimento

### 1. Backend

```bash
cd server
npm install
npm start          # roda em http://localhost:3000
```

### 2. Frontend

```bash
cd client
npm install
npm start          # abre em http://localhost:4200
```

Abra `http://localhost:4200` em duas (ou quatro) abas/máquinas, crie uma sala, compartilhe o código de 4 letras e jogue!

> Para jogar em rede local, os outros jogadores acessam `http://SEU_IP:4200` — o client se conecta automaticamente ao servidor no mesmo host (porta 3000). Rode o serve com `ng serve --host 0.0.0.0`.

## Modos de jogo

- **1x1 ou 2x2** com amigos (sala com código de 4 letras)
- **🤖 Contra o computador:** botão no lobby cria a sala já preenchida com bots; na sala de espera também dá para clicar em "Adicionar bot" para completar vagas
- **Baralho limpo:** manilhas fixas (4♣ > 7♥ > A♠ > 7♦)
- **Baralho sujo:** uma carta é virada na mesa (vira) e a manilha é o rank seguinte, desempatada por naipe (♦ < ♠ < ♥ < ♣); a vira e as manilhas ficam destacadas na mesa

## Regras implementadas (Truco Paulista)

- Baralho de 40 cartas; força: 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3
- Manilhas fixas (limpo) ou por vira (sujo)
- Mão valendo 1 ponto; **Truco (3) → Seis (6) → Nove (9) → Doze (12)**, com aceitar / aumentar / correr
- Melhor de 3 vazas, com regras de empate (quem empata e ganha a próxima leva; empate total fica com o time do mão)
- **Mão de onze:** time com 11 pontos vê as cartas (inclusive do parceiro no 2x2) e decide jogar valendo 3 ou correr
- **Mão de ferro** (11x11): vale 3, sem truco
- **Carta coberta** a partir da segunda vaza
- Partida até **12 pontos**, com revanche ("jogar novamente")
- Chat na sala 💬

## Testes

```bash
cd server
npm test            # simula 900 partidas (limpo/sujo/bots) + testes de regras
node test/e2e.js    # teste de ponta a ponta via Socket.IO (salas, PvP, vs bot)
```

## Tecnologias

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** Angular 18 (standalone components + signals), socket.io-client, SCSS
- **Visual:** cartas, logo e mesa 100% em SVG gerado por código (baralho de 4 cores, figuras flat, verso com gradiente)
