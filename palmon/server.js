const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const WORLD_W = 5000;
const WORLD_H = 3200;
const MAX_PLAYERS = 50;
const players = new Map();
let nextId = 1;

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    angle: player.angle,
    color: player.color
  };
}

function broadcast(message, exceptId = null) {
  for (const player of players.values()) {
    if (player.id !== exceptId) send(player.ws, message);
  }
}

function snapshot() {
  return [...players.values()].map(publicPlayer);
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true, players: players.size });
  if (req.url === '/api/status') return json(res, 200, { ok: true, players: players.size });

  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(__dirname, `.${requested}`);
  if (!file.startsWith(path.resolve(__dirname))) return json(res, 403, { error: 'Forbidden' });

  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, { error: 'Not found' });
    const contentType = path.extname(file).toLowerCase() === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Server full');

  const player = {
    id: `p${nextId++}`,
    ws,
    name: 'Palmon Player',
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    angle: 0,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 55%)`
  };
  players.set(player.id, player);
  send(ws, { type: 'welcome', id: player.id, players: snapshot() });
  broadcast({ type: 'playerJoined', player: publicPlayer(player) }, player.id);

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'join') {
        player.name = String(message.name || 'Palmon Player').trim().slice(0, 20) || 'Palmon Player';
        send(ws, { type: 'snapshot', players: snapshot() });
        broadcast({ type: 'playerUpdated', player: publicPlayer(player) });
      }
      if (message.type === 'state') {
        const x = Number(message.x);
        const y = Number(message.y);
        const angle = Number(message.angle);
        if (Number.isFinite(x)) player.x = Math.max(0, Math.min(WORLD_W, x));
        if (Number.isFinite(y)) player.y = Math.max(0, Math.min(WORLD_H, y));
        if (Number.isFinite(angle)) player.angle = angle;
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    players.delete(player.id);
    broadcast({ type: 'playerLeft', id: player.id });
  });
});

setInterval(() => {
  if (players.size) broadcast({ type: 'snapshot', players: snapshot() });
}, 100);

server.listen(PORT, HOST, () => {
  console.log(`Palmon server running at http://localhost:${PORT}`);
});
