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
const MAX_BUILDS_PER_PLAYER = 120;
const players = new Map();
const builds = new Map();
let nextId = 1;
let nextBuildId = 1;
let mapSeed = Math.floor(Math.random() * 2147483647);
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
    color: player.color,
    soldiers: player.soldiers || []
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
    id: build.id, ownerId: build.ownerId, kind: build.kind,
    x: build.x, y: build.y, hp: build.hp,
    maxHp: build.maxHp, radius: build.radius
  };
}

function buildSnapshot() {
  return [...builds.values()].map(publicBuild);
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
  if (req.url === '/health') return json(res, 200, { ok: true, players: players.size, builds: builds.size, mapSeed, mapRotateMs: MAP_ROTATE_MS });
  if (req.url === '/api/status') return json(res, 200, { ok: true, players: players.size, builds: builds.size, mapSeed, mapRotateMs: MAP_ROTATE_MS });

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
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 55%)`,
    builds: new Set(),
    soldiers: []
  };
  players.set(player.id, player);
  send(ws, { type: 'welcome', id: player.id, players: snapshot(), builds: buildSnapshot(), mapSeed, mapRotateMs: MAP_ROTATE_MS });
  broadcast({ type: 'playerJoined', player: publicPlayer(player) }, player.id);

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'join') {
        player.name = String(message.name || 'Palmon Player').trim().slice(0, 20) || 'Palmon Player';
        send(ws, { type: 'snapshot', players: snapshot(), builds: buildSnapshot(), mapSeed, mapRotateMs: MAP_ROTATE_MS });
        broadcast({ type: 'playerUpdated', player: publicPlayer(player) });
      }
      if (message.type === 'state') {
        const x = Number(message.x);
        const y = Number(message.y);
        const angle = Number(message.angle);
        if (Number.isFinite(x)) player.x = Math.max(0, Math.min(WORLD_W, x));
        if (Number.isFinite(y)) player.y = Math.max(0, Math.min(WORLD_H, y));
        if (Number.isFinite(angle)) player.angle = angle;
        if (Array.isArray(message.soldiers)) {
          player.soldiers = message.soldiers.slice(0, 40).map(soldier => ({
            id: String(soldier.id || '').slice(0, 40),
            type: String(soldier.type || 'Recruit').slice(0, 30),
            x: Math.max(0, Math.min(WORLD_W, Number(soldier.x) || player.x)),
            y: Math.max(0, Math.min(WORLD_H, Number(soldier.y) || player.y)),
            angle: Number(soldier.angle) || 0,
            hp: Math.max(0, Number(soldier.hp) || 0),
            maxHp: Math.max(1, Number(soldier.maxHp) || 1)
          }));
        }
        broadcast({ type: 'playerUpdated', player: publicPlayer(player) }, player.id);
      }

      if (message.type === 'worldRequest') {
        send(ws, { type: 'worldSnapshot', players: snapshot(), builds: buildSnapshot(), mapSeed, mapRotateMs: MAP_ROTATE_MS });
      }

      if (message.type === 'build' || message.type === 'buildPlaced') {
        if (player.builds && player.builds.size >= MAX_BUILDS_PER_PLAYER) return;
        const allowed = new Set(['wood','stone','turret','spike','heal_beacon','weapon_smith']);
        const source = message.build && typeof message.build === 'object' ? message.build : message;
        const kind = String(source.kind || '');
        const x = Number(source.x), y = Number(source.y);
        if (!allowed.has(kind) || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const radius = kind === 'weapon_smith' ? 25 : (kind === 'turret' ? 25 : 22);
        const hp = kind === 'stone' ? 180 : kind === 'wood' ? 100 : kind === 'turret' ? 120 : kind === 'spike' ? 80 : kind === 'heal_beacon' ? 100 : 140;
        const build = { id: `b${nextBuildId++}`, ownerId: player.id, kind, x: Math.max(0, Math.min(WORLD_W, x)), y: Math.max(0, Math.min(WORLD_H, y)), hp, maxHp: hp, radius };
        builds.set(build.id, build);
        player.builds.add(build.id);
        broadcast({ type: 'buildAdded', build: publicBuild(build) });
      }

      if (message.type === 'buildRemove' || message.type === 'buildRemoved' || message.type === 'destroyBuild') {
        const buildId = String(message.id || message.buildId || '');
        const build = builds.get(buildId);
        if (!build || build.ownerId !== player.id) return;
        builds.delete(build.id);
        player.builds.delete(build.id);
        broadcast({ type: 'buildRemoved', id: build.id });
      }

      if (message.type === 'buildDamage') {
        const buildId = String(message.id || message.buildId || '');
        const build = builds.get(buildId);
        const damage = Number(message.damage);
        if (!build || !Number.isFinite(damage) || damage <= 0 || damage > 500) return;
        build.hp = Math.max(0, build.hp - damage);
        if (build.hp <= 0) {
          builds.delete(build.id);
          const owner = players.get(build.ownerId);
          if (owner) owner.builds.delete(build.id);
          broadcast({ type: 'buildRemoved', id: build.id });
        } else {
          broadcast({ type: 'buildUpdated', build: publicBuild(build) });
        }
      }

      if (message.type === 'interactPlayer' || message.type === 'playerInteract' || message.type === 'interact') {
        const targetId = String(message.targetId || '');
        const target = players.get(targetId);
        if (!target || target.id === player.id) return;
        if (Math.hypot(target.x - player.x, target.y - player.y) > 140) return;
        const action = String(message.action || 'interact').slice(0, 32);
        send(target.ws, { type: 'playerInteraction', from: publicPlayer(player), action });
        send(ws, { type: 'interactionConfirmed', target: publicPlayer(target), action });
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
  if (players.size) broadcast({ type: 'snapshot', players: snapshot(), builds: buildSnapshot(), mapSeed, mapRotateMs: MAP_ROTATE_MS });
}, 100);

setInterval(() => {
  mapSeed = Math.floor(Math.random() * 2147483647);
  lastMapResetAt = Date.now();
  builds.clear();
  broadcast({ type: 'mapReset', mapSeed, seed: mapSeed, mapRotateMs: MAP_ROTATE_MS });
}, MAP_ROTATE_MS);

server.listen(PORT, HOST, () => {
  console.log(`Palmon server running on ${HOST}:${PORT}`);
});
