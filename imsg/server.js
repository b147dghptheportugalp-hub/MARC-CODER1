const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_CLIENTS = 100;
const MAX_HISTORY = 100;
const CHANNELS = ['general-chat', 'coding-help', 'voice-calls'];
const clients = new Map();
const history = new Map(CHANNELS.map(channel => [channel, []]));
let nextId = 1;

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function publicClient(client) {
  return { id: client.id, name: client.name };
}

function channelClients(channel) {
  return [...clients.values()].filter(client => client.channel === channel);
}

function broadcast(channel, message) {
  for (const client of channelClients(channel)) send(client.ws, message);
}

function validChannel(channel) {
  return CHANNELS.includes(channel) ? channel : CHANNELS[0];
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/health' || pathname === '/api/status') {
    return json(res, 200, { ok: true, clients: clients.size, channels: CHANNELS });
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const root = path.resolve(__dirname);
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep)) return json(res, 403, { error: 'Forbidden' });

  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  if (clients.size >= MAX_CLIENTS) return ws.close(1013, 'Server full');

  const client = { id: `u${nextId++}`, ws, name: 'Guest', channel: CHANNELS[0] };
  clients.set(client.id, client);
  send(ws, { type: 'welcome', id: client.id, channels: CHANNELS, channel: client.channel, messages: history.get(client.channel), users: channelClients(client.channel).map(publicClient) });

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'join') {
        client.name = String(message.name || 'Guest').trim().slice(0, 24) || 'Guest';
        client.channel = validChannel(message.channel);
        send(ws, { type: 'channelJoined', channel: client.channel, messages: history.get(client.channel), users: channelClients(client.channel).map(publicClient) });
        broadcast(client.channel, { type: 'userUpdated', user: publicClient(client) });
        return;
      }

      if (message.type === 'switchChannel') {
        const previousChannel = client.channel;
        client.channel = validChannel(message.channel);
        send(ws, { type: 'channelJoined', channel: client.channel, messages: history.get(client.channel), users: channelClients(client.channel).map(publicClient) });
        broadcast(previousChannel, { type: 'userLeft', id: client.id });
        broadcast(client.channel, { type: 'userJoined', user: publicClient(client) });
        return;
      }

      if (message.type === 'sendMessage') {
        const text = String(message.text || '').trim().slice(0, 2000);
        if (!text) return;
        const item = { id: `m${Date.now()}-${client.id}`, userId: client.id, name: client.name, text, timestamp: new Date().toISOString() };
        const messages = history.get(client.channel);
        messages.push(item);
        if (messages.length > MAX_HISTORY) messages.shift();
        broadcast(client.channel, { type: 'message', message: item });
      }
    } catch (_) {
      send(ws, { type: 'error', message: 'Invalid message.' });
    }
  });

  ws.on('close', () => {
    clients.delete(client.id);
    broadcast(client.channel, { type: 'userLeft', id: client.id });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`iMsg server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
