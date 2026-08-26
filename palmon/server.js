const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const WORLD_W = 4000;
const WORLD_H = 4000;
const MAP_ROTATE_MS = 150000;
const MAX_PLAYERS = 50;
const players = new Map();
const builds = new Map();
let nextId = 1;
let nextBuildId = 1;
let mapSeed = Date.now();
let lastMapResetAt = Date.now();

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

function publicBuild(build) {
  return {
    id: build.id,
    ownerId: build.ownerId,
    x: build.x,
    y: build.y,
    hp: build.hp,
    maxHp: build.maxHp,
    kind: build.kind,
    radius: build.radius
  };
}

function buildSnapshot() {
  return [...builds.values()].map(publicBuild);
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
  send(ws, { type: 'welcome', id: player.id, players: snapshot(), builds: buildSnapshot(), mapSeed });
  broadcast({ type: 'playerJoined', player: publicPlayer(player) }, player.id);

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'join') {
        player.name = String(message.name || 'Palmon Player').trim().slice(0, 20) || 'Palmon Player';
        send(ws, { type: 'snapshot', players: snapshot(), builds: buildSnapshot(), mapSeed });
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
      if (message.type === 'build' && message.build && typeof message.build.kind === 'string') {
        const b = message.build;
        const x = Number(b.x), y = Number(b.y), hp = Number(b.hp), maxHp = Number(b.maxHp), radius = Number(b.radius);
        if (![x, y, hp, maxHp, radius].every(Number.isFinite)) return;
        if (x < 0 || x > WORLD_W || y < 0 || y > WORLD_H) return;
        const kind = String(b.kind).slice(0, 32);
        const id = `b${nextBuildId++}`;
        const build = { id, ownerId: player.id, x, y, hp: Math.max(1, hp), maxHp: Math.max(1, maxHp), kind, radius: Math.max(1, Math.min(100, radius)) };
        builds.set(id, build);
        broadcast({ type: 'buildAdded', build: publicBuild(build) });
      }

      if (message.type === 'interact') {
        const targetId = String(message.targetId || '');
        const target = players.get(targetId);
        if (!target || target.id === player.id) return;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        if ((dx * dx) + (dy * dy) > 180 * 180) return;
        send(target.ws, { type: 'interact', fromId: player.id, fromName: player.name });
      }

      if (message.type === 'mapRequest') {
        const now = Date.now();
        if (now - lastMapResetAt < MAP_ROTATE_MS - 2000) return;
        mapSeed = Number.isFinite(Number(message.seed)) ? Math.floor(Number(message.seed)) : now;
        lastMapResetAt = now;
        builds.clear();
        broadcast({ type: 'mapReset', seed: mapSeed });
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    players.delete(player.id);
    for (const [buildId, build] of builds) {
      if (build.ownerId === player.id) {
        builds.delete(buildId);
        broadcast({ type: 'buildRemoved', id: buildId });
      }
    }
    broadcast({ type: 'playerLeft', id: player.id });
  });
});

setInterval(() => {
  if (players.size) broadcast({ type: 'snapshot', players: snapshot(), builds: buildSnapshot(), mapSeed });
}, 100);

server.listen(PORT, HOST, () => {
  console.log(`Palmon server running at http://localhost:${PORT}`);
});
