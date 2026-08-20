const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = 32;
const TICK_MS = 50;
const MATCH_SECONDS = 300;

const weapons = {
  w_vanguard: { damage: 24, fireRate: 0.15, range: 100 },
  w_rapid_fire: { damage: 14, fireRate: 0.07, range: 90 },
  w_demolition: { damage: 80, fireRate: 0.85, range: 45 },
  w_phantom: { damage: 100, fireRate: 1.5, range: 160 },
  w_pistol: { damage: 18, fireRate: 0.22, range: 80 },
  w_rocket: { damage: 65, fireRate: 1.0, range: 100 }
};

const classHp = { assault: 100, scout: 75, heavy: 150, sniper: 80 };
const players = new Map();
const rooms = new Map();
let nextId = 1;

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true, players: players.size });
  if (req.url === '/api/status') return json(res, 200, { ok: true, players: players.size, rooms: rooms.size });

  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(__dirname, '.' + pathname);
  if (!file.startsWith(path.resolve(__dirname))) return json(res, 403, { error: 'Forbidden' });

  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(roomId, message, exceptId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const id of room.players) {
    if (id === exceptId) continue;
    const p = players.get(id);
    if (p) send(p.ws, message);
  }
}

function roomIdFor(mode, map) { return `${mode || 'ffa'}:${map || 'default'}`; }

function leaveRoom(p) {
  if (!p.roomId) return;
  const room = rooms.get(p.roomId);
  if (room) {
    room.players.delete(p.id);
    if (!room.players.size) rooms.delete(p.roomId);
  }
  p.roomId = null;
}

function joinRoom(p, msg) {
  leaveRoom(p);
  const mode = msg.mode === 'team' ? 'team' : 'ffa';
  const map = String(msg.map || 'default').slice(0, 50);
  const roomId = roomIdFor(mode, map);
  if (!rooms.has(roomId)) rooms.set(roomId, { id: roomId, mode, map, players: new Set(), startedAt: Date.now() });
  const room = rooms.get(roomId);
  if (room.players.size >= MAX_PLAYERS) return send(p.ws, { type: 'error', message: 'Room is full.' });

  p.roomId = roomId;
  p.name = String(msg.username || `Player${p.id}`).slice(0, 20);
  p.classId = String(msg.classId || 'assault').slice(0, 20);
  p.weaponId = String(msg.weaponId || 'w_vanguard').slice(0, 30);
  p.team = mode === 'team' ? assignTeam(room) : null;
  p.hp = classHp[p.classId] || 100;
  p.maxHp = p.hp;
  p.kills = 0;
  p.deaths = 0;
  p.streak = 0;
  p.x = 0; p.y = 2; p.z = 60; p.yaw = 0;
  p.lastShot = 0;
  room.players.add(p.id);

  send(p.ws, { type: 'joined', id: p.id, roomId, team: p.team, mode, map, matchSeconds: MATCH_SECONDS });
  broadcast(roomId, { type: 'playerJoined', player: publicPlayer(p) }, p.id);
  sendSnapshot(p);
}

function assignTeam(room) {
  let blue = 0, red = 0;
  for (const id of room.players) {
    const p = players.get(id);
    if (p?.team === 'BLUE') blue++; else if (p?.team === 'RED') red++;
  }
  return blue <= red ? 'BLUE' : 'RED';
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, maxHp: p.maxHp, kills: p.kills, deaths: p.deaths, streak: p.streak, team: p.team, classId: p.classId, skinId: p.skinId };
}

function sendSnapshot(p) {
  const room = rooms.get(p.roomId);
  if (!room) return;
  const list = [...room.players].map(id => players.get(id)).filter(Boolean).map(publicPlayer);
  send(p.ws, { type: 'snapshot', players: list, serverTime: Date.now(), room: { mode: room.mode, map: room.map } });
}

function broadcastSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const list = [...room.players].map(id => players.get(id)).filter(Boolean).map(publicPlayer);
  for (const id of room.players) {
    const p = players.get(id);
    if (p) send(p.ws, { type: 'snapshot', players: list, serverTime: Date.now() });
  }
}

function validNumber(n, min, max) { return Number.isFinite(n) && n >= min && n <= max; }

function updateState(p, msg) {
  if (!p.roomId) return;
  const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), yaw = Number(msg.yaw);
  if (validNumber(x, -110, 110)) p.x = x;
  if (validNumber(y, -5, 80)) p.y = y;
  if (validNumber(z, -110, 110)) p.z = z;
  if (validNumber(yaw, -1000, 1000)) p.yaw = yaw;
  if (msg.weaponId && weapons[msg.weaponId]) p.weaponId = msg.weaponId;
  if (msg.classId && classHp[msg.classId]) {
    p.classId = msg.classId;
    p.maxHp = classHp[msg.classId];
    p.hp = Math.min(p.hp, p.maxHp);
  }
}

function canDamage(a, b) {
  if (!b || a.id === b.id) return false;
  if (!a.roomId || a.roomId !== b.roomId) return false;
  return !(rooms.get(a.roomId)?.mode === 'team' && a.team && b.team && a.team === b.team);
}

function shot(p, msg) {
  if (!p.roomId) return;
  const weapon = weapons[p.weaponId] || weapons.w_vanguard;
  const now = Date.now();
  if (now - p.lastShot < weapon.fireRate * 1000 * 0.85) return;
  p.lastShot = now;

  let dx = Number(msg.dx), dy = Number(msg.dy), dz = Number(msg.dz);
  const len = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(len) || len < 0.5 || len > 2) return;
  dx /= len; dy /= len; dz /= len;

  const room = rooms.get(p.roomId);
  let target = null, best = Infinity;
  for (const id of room.players) {
    const b = players.get(id);
    if (!canDamage(p, b)) continue;
    const vx = b.x - p.x, vy = (b.y + 1) - (p.y + 1), vz = b.z - p.z;
    const dist = Math.hypot(vx, vy, vz);
    if (dist > weapon.range || dist < 0.5) continue;
    const dot = (vx * dx + vy * dy + vz * dz) / dist;
    if (dot < 0.985) continue;
    const perp = Math.sqrt(Math.max(0, dist * dist - Math.pow(vx * dx + vy * dy + vz * dz, 2)));
    if (perp > 1.6) continue;
    if (dist < best) { best = dist; target = b; }
  }

  broadcast(p.roomId, { type: 'shot', shooterId: p.id, x: p.x, y: p.y, z: p.z, dx, dy, dz, weaponId: p.weaponId }, null);

  if (!target) return;
  target.hp -= weapon.damage;
  send(target.ws, { type: 'damage', amount: weapon.damage, attackerId: p.id, hp: Math.max(0, target.hp), maxHp: target.maxHp });
  broadcast(p.roomId, { type: 'hit', attackerId: p.id, targetId: target.id, amount: weapon.damage, hp: Math.max(0, target.hp) });

  if (target.hp <= 0) {
    p.kills++; p.streak++;
    target.deaths++; target.streak = 0;
    broadcast(p.roomId, { type: 'kill', killerId: p.id, victimId: target.id, killerName: p.name, victimName: target.name });
    setTimeout(() => {
      if (!players.has(target.id) || target.roomId !== p.roomId) return;
      target.hp = target.maxHp;
      target.x = (Math.random() - 0.5) * 90;
      target.z = (Math.random() - 0.5) * 90;
      target.y = 2;
      send(target.ws, { type: 'respawn', x: target.x, y: target.y, z: target.z, hp: target.hp, maxHp: target.maxHp });
    }, 1500);
  }
}

wss.on('connection', (ws, req) => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Server full');
  const p = { id: `p${nextId++}`, ws, roomId: null, name: 'Player', classId: 'assault', weaponId: 'w_vanguard', x: 0, y: 2, z: 60, yaw: 0, hp: 100, maxHp: 100, kills: 0, deaths: 0, streak: 0, team: null, skinId: Math.floor(Math.random() * 7), lastShot: 0 };
  players.set(p.id, p);
  send(ws, { type: 'welcome', id: p.id, maxPlayers: MAX_PLAYERS });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'join') joinRoom(p, msg);
      else if (msg.type === 'state') updateState(p, msg);
      else if (msg.type === 'shot') shot(p, msg);
      else if (msg.type === 'ping') send(ws, { type: 'pong', t: msg.t });
      else if (msg.type === 'leave') leaveRoom(p);
    } catch (_) {}
  });

  ws.on('close', () => {
    const roomId = p.roomId;
    leaveRoom(p);
    players.delete(p.id);
    if (roomId) broadcast(roomId, { type: 'playerLeft', id: p.id });
  });
});

setInterval(() => {
  for (const roomId of rooms.keys()) broadcastSnapshot(roomId);
}, TICK_MS);

server.listen(PORT, HOST, () => {
  console.log(`Shooter FPS server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
