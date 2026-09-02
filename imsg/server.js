const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_CLIENTS = 100;
const MAX_HISTORY = 100;
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const defaultChannels = [{ id: 'general-chat', name: 'general-chat', ownerId: null }, { id: 'coding-help', name: 'coding-help', ownerId: null }, { id: 'voice-calls', name: 'voice-calls', ownerId: null }];
const clients = new Map();
const sessions = new Map();
const history = new Map(defaultChannels.map(channel => [channel.id, []]));
let channels = [...defaultChannels];
let nextId = 1;

fs.mkdirSync(DATA_DIR, { recursive: true });
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (_) { accounts = {}; }
function saveAccounts() { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
function send(ws, message) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); }
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function validName(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24); }
function publicUser(client) { return { id: client.id, name: client.name }; }
function channelList() { return channels.map(channel => ({ id: channel.id, name: channel.name })); }
function getChannel(id) { return channels.find(channel => channel.id === id) || channels[0]; }
function channelClients(channel) { return [...clients.values()].filter(client => client.channel === channel); }
function broadcast(channel, message) { for (const client of channelClients(channel)) send(client.ws, message); }
function authMessage(client) { return { type: 'authenticated', id: client.id, user: { username: client.name }, channels: channelList(), channel: client.channel, messages: history.get(client.channel) || [], users: channelClients(client.channel).map(publicUser) }; }

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/health' || pathname === '/api/status') return json(res, 200, { ok: true, clients: clients.size, channels: channels.length });
  const requested = pathname === '/' ? '/index.html' : pathname;
  const root = path.resolve(__dirname); const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep)) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  if (clients.size >= MAX_CLIENTS) return ws.close(1013, 'Server full');
  const client = { id: `u${nextId++}`, ws, name: '', channel: defaultChannels[0].id, account: null };
  clients.set(client.id, client);
  send(ws, { type: 'hello' });

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString()); if (!message || typeof message.type !== 'string') return;
      if (message.type === 'auth') {
        const username = validName(message.username); const password = String(message.password || '');
        if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username) || password.length < 6) return send(ws, { type: 'authError', message: 'Use a username of 3-24 letters/numbers and a password of at least 6 characters.' });
        const existing = accounts[username.toLowerCase()];
        if (message.mode === 'create') {
          if (existing) return send(ws, { type: 'authError', message: 'That username is already taken.' });
          const credentials = hashPassword(password); accounts[username.toLowerCase()] = { username, ...credentials }; saveAccounts();
        } else {
          if (!existing) return send(ws, { type: 'authError', message: 'Username or password is incorrect.' });
          const attempt = hashPassword(password, existing.salt).hash;
          if (!crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(existing.hash, 'hex'))) return send(ws, { type: 'authError', message: 'Username or password is incorrect.' });
        }
        client.name = accounts[username.toLowerCase()].username; client.account = username.toLowerCase();
        sessions.set(client.id, client.account); send(ws, authMessage(client)); broadcast(client.channel, { type: 'userJoined', user: publicUser(client) }); return;
      }
      if (!client.account) return send(ws, { type: 'authError', message: 'Please log in first.' });
      if (message.type === 'switchChannel') {
        const previous = client.channel; client.channel = getChannel(String(message.channel)).id;
        send(ws, { type: 'channelJoined', channel: client.channel, messages: history.get(client.channel) || [], users: channelClients(client.channel).map(publicUser) });
        broadcast(previous, { type: 'userLeft', id: client.id }); broadcast(client.channel, { type: 'userJoined', user: publicUser(client) }); return;
      }
      if (message.type === 'createChannel') {
        const name = String(message.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
        if (!name || channels.some(channel => channel.id === name)) return send(ws, { type: 'error', message: 'Choose a new channel name.' });
        channels.push({ id: name, name, ownerId: client.account }); history.set(name, []); broadcast(client.channel, { type: 'channelsUpdated', channels: channelList() }); send(ws, { type: 'channelsUpdated', channels: channelList() }); return;
      }
      if (message.type === 'sendMessage') {
        const text = String(message.text || '').trim().slice(0, 2000); if (!text) return;
        const item = { id: `m${Date.now()}-${client.id}`, userId: client.id, name: client.name, text, timestamp: new Date().toISOString() }; const messages = history.get(client.channel) || [];
        messages.push(item); if (messages.length > MAX_HISTORY) messages.shift(); history.set(client.channel, messages); broadcast(client.channel, { type: 'message', message: item }); return;
      }
      if (['callOffer', 'callAnswer', 'iceCandidate', 'callEnd'].includes(message.type)) {
        const target = clients.get(String(message.targetId)); if (!target) return;
        send(target.ws, { ...message, fromId: client.id, fromName: client.name }); return;
      }
    } catch (_) { send(ws, { type: 'error', message: 'Invalid message.' }); }
  });
  ws.on('close', () => { clients.delete(client.id); sessions.delete(client.id); if (client.account) broadcast(client.channel, { type: 'userLeft', id: client.id }); });
});
server.listen(PORT, HOST, () => { console.log(`iMsg server running at http://localhost:${PORT}`); });
