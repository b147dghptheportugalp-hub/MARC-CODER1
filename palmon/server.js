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
function createTeamState() {
  return {
    players: new Map(),
    teams: new Map(),
  };
}

const state = createTeamState();
const players = state.players;
const builds = new Map();
const teams = state.teams;
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
    teamId: player.teamId,
    teamName: player.teamName,
    soldiers: player.soldiers || []
  };
}

function sameTeam(first, second) {
  return !!first && !!second && !!first.teamId && first.teamId === second.teamId;
}

function teamInfo(player) {
  return player.teamId ? { id: player.teamId, name: player.teamName } : null;
}

function teamRoster(state, teamId) {
  const team = state.teams.get(teamId);
  if (!team) return [];
  return [...team.members].map(id => {
    const member = state.players.get(id);
    return member ? { id: member.id, name: member.name, isOwner: team.ownerId === member.id } : null;
  }).filter(Boolean);
}

function teamListPayload(state) {
  return [...state.teams.values()].map(team => ({
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    memberCount: team.members.size,
    members: [...team.members].map(id => {
      const player = state.players.get(id);
      return player ? player.name : null;
    }).filter(Boolean)
  }));
}

function teamRequestsPayload(team) {
  return (team?.pendingRequests || []).map((request) => ({
    id: request.id,
    fromId: request.fromId,
    fromName: request.fromName,
    teamId: request.teamId,
    teamName: request.teamName
  }));
}

function sendTeamMenuState(player) {
  const team = teams.get(player.teamId);
  const roster = teamRoster({ players, teams }, player.teamId);
  const teamList = teamListPayload({ players, teams });
  const requests = team ? teamRequestsPayload(team) : [];
  send(player.ws, {
    type: 'teamUpdated',
    team: teamInfo(player),
    roster,
    requests,
    teamList
  });
}

function resolveTeamRequest(state, leaderId, teamId, memberId, accepted) {
  const team = state.teams.get(teamId);
  if (!team || team.ownerId !== leaderId) return false;
  const member = state.players.get(memberId);
  const leader = state.players.get(leaderId);
  if (!member) return false;
  const pendingIndex = (team.pendingRequests || []).findIndex(request => request.fromId === memberId && request.teamId === teamId);
  if (pendingIndex === -1) return false;

  const [request] = (team.pendingRequests || []).splice(pendingIndex, 1);
  if (accepted) {
    team.members.add(memberId);
    member.teamId = team.id;
    member.teamName = team.name;
    if (member.ws) {
      send(member.ws, {
        type: 'teamUpdated',
        team: teamInfo(member),
        roster: teamRoster(state, teamId),
        requests: teamRequestsPayload(team),
        teamList: teamListPayload(state)
      });
    }
    if (leader && leader.ws) {
      send(leader.ws, {
        type: 'teamUpdated',
        team: teamInfo(leader),
        roster: teamRoster(state, teamId),
        requests: teamRequestsPayload(team),
        teamList: teamListPayload(state)
      });
    }
    if (member.ws) {
      send(member.ws, { type: 'teamRequestResult', accepted: true, teamId: team.id, teamName: team.name, message: `You joined ${team.name}.` });
    }
    return true;
  }

  if (member.ws) {
    send(member.ws, { type: 'teamRequestResult', accepted: false, teamId: team.id, teamName: team.name, message: `Your request to join ${team.name} was declined.` });
  }
  return true;
}

function removeMemberFromTeam(state, leaderId, teamId, memberId) {
  const team = state.teams.get(teamId);
  if (!team || team.ownerId !== leaderId || memberId === leaderId) return false;
  if (!team.members.has(memberId)) return false;

  team.members.delete(memberId);
  const member = state.players.get(memberId);
  if (member) {
    member.teamId = null;
    member.teamName = null;
    send(member.ws, {
      type: 'teamUpdated',
      team: null,
      roster: [],
      requests: [],
      teamList: teamListPayload(state)
    });
  }

  if (team.members.size === 0) {
    state.teams.delete(teamId);
  }

  const leader = state.players.get(leaderId);
  if (leader) {
    send(leader.ws, {
      type: 'teamUpdated',
      team: teamInfo(leader),
      roster: teamRoster(state, teamId),
      requests: team ? teamRequestsPayload(team) : [],
      teamList: teamListPayload(state)
    });
  }
  broadcast({ type: 'teamList', teams: teamListPayload(state) });
  return true;
}

function leaveTeam(state, player) {
  if (!player.teamId) return false;
  const team = state.teams.get(player.teamId);
  if (!team) {
    player.teamId = null;
    player.teamName = null;
    return true;
  }

  if (team.ownerId === player.id) {
    const nextOwner = [...team.members].find(id => id !== player.id && state.players.has(id));
    team.members.delete(player.id);
    if (nextOwner) {
      team.ownerId = nextOwner;
      const nextOwnerPlayer = state.players.get(nextOwner);
      if (nextOwnerPlayer) {
        nextOwnerPlayer.teamId = team.id;
        nextOwnerPlayer.teamName = team.name;
      }
    } else {
      state.teams.delete(team.id);
    }
  } else {
    team.members.delete(player.id);
  }

  player.teamId = null;
  player.teamName = null;

  if (team.members && team.members.size === 0) {
    state.teams.delete(team.id);
  }

  broadcast({ type: 'teamList', teams: teamListPayload(state) });
  return true;
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
    ownerTeamId: build.ownerTeamId,
    x: build.x,
    y: build.y,
    hp: build.hp,
    maxHp: build.maxHp,
    kind: build.kind,
    radius: build.radius,
    clientBuildId: build.clientBuildId
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
    teamId: null,
    teamName: null,
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
      if (message.type === 'requestTeamList') {
        send(ws, { type: 'teamList', teams: teamListPayload({ players, teams }) });
        if (player.teamId) {
          const team = teams.get(player.teamId);
          send(ws, {
            type: 'teamUpdated',
            team: teamInfo(player),
            roster: teamRoster({ players, teams }, player.teamId),
            requests: team ? teamRequestsPayload(team) : [],
            teamList: teamListPayload({ players, teams })
          });
        }
      }

      if (message.type === 'createTeam' || message.type === 'joinTeam' || message.type === 'leaveTeam' || message.type === 'kickTeamMember' || message.type === 'answerTeamRequest') {
        if (message.type === 'leaveTeam') {
          if (leaveTeam({ players, teams }, player)) {
            send(ws, { type: 'teamUpdated', team: null, roster: [], requests: [], teamList: teamListPayload({ players, teams }) });
          }
        } else if (message.type === 'createTeam') {
          if (player.teamId) return send(ws, { type: 'teamError', message: 'Leave your current team first.' });
          const name = String(message.name || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 24);
          if (!name) return send(ws, { type: 'teamError', message: 'Choose a team name.' });
          if ([...teams.values()].some(team => team.name.toLowerCase() === name.toLowerCase())) return send(ws, { type: 'teamError', message: 'That team name is already taken.' });
          const id = `team-${nextId++}`;
          const team = { id, name, ownerId: player.id, members: new Set([player.id]), pendingRequests: [] };
          teams.set(id, team);
          player.teamId = id; player.teamName = name;
          send(ws, { type: 'teamUpdated', team: { id, name }, roster: teamRoster({ players, teams }, id), requests: [], teamList: teamListPayload({ players, teams }) });
          broadcast({ type: 'teamList', teams: teamListPayload({ players, teams }) });
        } else if (message.type === 'kickTeamMember') {
          const memberId = String(message.memberId || '');
          if (!memberId || !removeMemberFromTeam({ players, teams }, player.id, player.teamId, memberId)) {
            return send(ws, { type: 'teamError', message: 'You can only kick members from your own team.' });
          }
          const currentTeam = teams.get(player.teamId);
          send(ws, {
            type: 'teamUpdated',
            team: teamInfo(player),
            roster: teamRoster({ players, teams }, player.teamId),
            requests: currentTeam ? teamRequestsPayload(currentTeam) : [],
            teamList: teamListPayload({ players, teams })
          });
        } else if (message.type === 'answerTeamRequest') {
          const requestId = String(message.requestId || '');
          const team = teams.get(player.teamId);
          if (!team || team.ownerId !== player.id) return send(ws, { type: 'teamError', message: 'Only the team leader can answer join requests.' });
          const request = (team.pendingRequests || []).find(item => item.id === requestId);
          if (!request) return send(ws, { type: 'teamError', message: 'Request not found.' });
          const accepted = Boolean(message.accept);
          const member = players.get(request.fromId);
          resolveTeamRequest({ players, teams }, player.id, team.id, request.fromId, accepted);
          if (accepted && member) {
            send(member.ws, { type: 'teamRequestResult', accepted: true, teamId: team.id, teamName: team.name, message: `You joined ${team.name}.` });
          }
          if (!accepted && member) {
            send(member.ws, { type: 'teamRequestResult', accepted: false, teamId: team.id, teamName: team.name, message: `Your request to join ${team.name} was declined.` });
          }
          send(ws, {
            type: 'teamUpdated',
            team: teamInfo(player),
            roster: teamRoster({ players, teams }, team.id),
            requests: teamRequestsPayload(team),
            teamList: teamListPayload({ players, teams })
          });
          broadcast({ type: 'teamList', teams: teamListPayload({ players, teams }) });
        } else {
          if (player.teamId) return send(ws, { type: 'teamError', message: 'Leave your current team first.' });
          const lookup = String(message.team || '').trim().toLowerCase();
          const team = [...teams.values()].find(item => item.id.toLowerCase() === lookup || item.name.toLowerCase() === lookup);
          if (!team) return send(ws, { type: 'teamError', message: 'Team not found. Use its name or code.' });
          if (team.members.has(player.id)) {
            player.teamId = team.id; player.teamName = team.name;
            return send(ws, { type: 'teamUpdated', team: teamInfo(player), roster: teamRoster({ players, teams }, team.id), requests: teamRequestsPayload(team), teamList: teamListPayload({ players, teams }) });
          }
          const request = { id: `req-${nextId++}`, fromId: player.id, fromName: player.name, teamId: team.id, teamName: team.name };
          team.pendingRequests = team.pendingRequests || [];
          team.pendingRequests.push(request);
          const leader = players.get(team.ownerId);
          if (leader) {
            send(leader.ws, { type: 'teamRequest', request, requester: { id: player.id, name: player.name }, teamList: teamListPayload({ players, teams }) });
          }
          send(ws, { type: 'teamRequestSent', teamId: team.id, teamName: team.name, message: `Join request sent to ${team.name}.` });
        }
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
        const build = { id: `b${nextBuildId++}`, clientBuildId: String(source.id || ''), ownerId: player.id, ownerTeamId: player.teamId, kind, x: Math.max(0, Math.min(WORLD_W, x)), y: Math.max(0, Math.min(WORLD_H, y)), hp, maxHp: hp, radius };
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
        broadcast({ type: 'buildRemoved', id: build.id, ownerId: build.ownerId, clientBuildId: build.clientBuildId });
      }

      if (message.type === 'buildDamage') {
        const buildId = String(message.id || message.buildId || '');
        const build = builds.get(buildId);
        const damage = Number(message.damage);
        const attacker = players.get(String(message.attackerId || player.id));
        if (!build || !attacker || sameTeam(attacker, players.get(build.ownerId)) || !Number.isFinite(damage) || damage <= 0 || damage > 500) return;
        build.hp = Math.max(0, build.hp - damage);
        if (build.hp <= 0) {
          builds.delete(build.id);
          const owner = players.get(build.ownerId);
          if (owner) owner.builds.delete(build.id);
          broadcast({ type: 'buildRemoved', id: build.id, ownerId: build.ownerId, clientBuildId: build.clientBuildId });
        } else {
          broadcast({ type: 'buildUpdated', build: publicBuild(build) });
        }
      }

      if (message.type === 'playerDamage') {
        const target = players.get(String(message.targetId || ''));
        const damage = Number(message.damage);
        if (!target || target.id === player.id || sameTeam(player, target) || !Number.isFinite(damage) || damage <= 0 || damage > 250) return;
        if (Math.hypot(target.x - player.x, target.y - player.y) > 950) return;
        send(target.ws, { type: 'playerDamage', damage, from: publicPlayer(player) });
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
        broadcast({ type: 'buildRemoved', id: buildId, ownerId: build.ownerId, clientBuildId: build.clientBuildId });
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

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Palmon server running on ${HOST}:${PORT}`);
  });
}

module.exports = {
  createTeamState,
  resolveTeamRequest,
  removeMemberFromTeam,
  teamListPayload,
  teamRequestsPayload,
  teamRoster,
  leaveTeam,
  state,
};
