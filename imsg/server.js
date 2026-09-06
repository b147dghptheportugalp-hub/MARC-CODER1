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
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const defaultChannels = [{ id: 'general-chat', name: 'general-chat', ownerId: null }, { id: 'coding-help', name: 'coding-help', ownerId: null }, { id: 'voice-calls', name: 'voice-calls', ownerId: null }];
const clients = new Map();
const sessions = new Map();
const history = new Map(defaultChannels.map(channel => [channel.id, []]));
let channels = [...defaultChannels];
let nextId = 1;

fs.mkdirSync(DATA_DIR, { recursive: true });
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (_) { accounts = {}; }
let privateGroups = [];
try { privateGroups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch (_) { privateGroups = []; }
privateGroups.forEach(group => { channels.push({ id: group.id, name: group.name, ownerId: group.ownerId, private: true, members: group.members }); history.set(group.id, []); });
function saveAccounts() { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
function saveGroups() { fs.writeFileSync(GROUPS_FILE, JSON.stringify(privateGroups, null, 2)); }
function send(ws, message) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); }
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function validName(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24); }
function publicUser(client) { return { id: client.id, name: client.name }; }
function accountFriends(accountId) { return accounts[accountId]?.friends || []; }
function channelList(client) { return channels.filter(channel => !channel.private || channel.members.includes(client.account)).map(channel => ({ id: channel.id, name: channel.name, private: !!channel.private })); }
function getChannel(id) { return channels.find(channel => channel.id === id) || channels[0]; }
function canAccessChannel(client, channel) { return channel && (!channel.private || channel.members.includes(client.account)); }
function channelClients(channel) { return [...clients.values()].filter(client => client.channel === channel); }
function broadcast(channel, message) { for (const client of channelClients(channel)) send(client.ws, message); }
function authMessage(client) { return { type: 'authenticated', id: client.id, user: { username: client.name }, channels: channelList(client), friends: accountFriends(client.account), channel: client.channel, messages: history.get(client.channel) || [], users: channelClients(client.channel).map(publicUser) }; }

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
          const credentials = hashPassword(password); accounts[username.toLowerCase()] = { username, friends: [], ...credentials }; saveAccounts();
        } else {
          if (!existing) return send(ws, { type: 'authError', message: 'Username or password is incorrect.' });
          const attempt = hashPassword(password, existing.salt).hash;
          if (!crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(existing.hash, 'hex'))) return send(ws, { type: 'authError', message: 'Username or password is incorrect.' });
        }
        client.name = accounts[username.toLowerCase()].username; client.account = username.toLowerCase();
        if (!Array.isArray(accounts[client.account].friends)) { accounts[client.account].friends = []; saveAccounts(); }
        sessions.set(client.id, client.account); send(ws, authMessage(client)); broadcast(client.channel, { type: 'userJoined', user: publicUser(client) }); return;
      }
      if (!client.account) return send(ws, { type: 'authError', message: 'Please log in first.' });
      if (message.type === 'switchChannel') {
        const requestedChannel = getChannel(String(message.channel));
        if (!canAccessChannel(client, requestedChannel)) return send(ws, { type: 'error', message: 'That private group is invite-only.' });
        const previous = client.channel; client.channel = requestedChannel.id;
        send(ws, { type: 'channelJoined', channel: client.channel, messages: history.get(client.channel) || [], users: channelClients(client.channel).map(publicUser) });
        broadcast(previous, { type: 'userLeft', id: client.id }); broadcast(client.channel, { type: 'userJoined', user: publicUser(client) }); return;
      }
      if (message.type === 'addFriend') {
        const friendId = validName(message.username).toLowerCase();
        if (!friendId || !accounts[friendId] || friendId === client.account) return send(ws, { type: 'error', message: 'Enter an existing username other than your own.' });
        const friendList = accountFriends(client.account); const otherFriends = accountFriends(friendId);
        if (!friendList.includes(friendId)) friendList.push(friendId);
        if (!otherFriends.includes(client.account)) otherFriends.push(client.account);
        accounts[client.account].friends = friendList; accounts[friendId].friends = otherFriends; saveAccounts();
        send(ws, { type: 'friendsUpdated', friends: friendList });
        for (const friendClient of clients.values()) if (friendClient.account === friendId) send(friendClient.ws, { type: 'friendsUpdated', friends: otherFriends });
        return;
      }
      if (message.type === 'createPrivateGroup') {
        const name = String(message.name || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 30);
        const requestedMembers = Array.isArray(message.members) ? message.members : [];
        const memberIds = [...new Set([client.account, ...requestedMembers.map(validName).map(value => value.toLowerCase())])];
        if (!name || memberIds.length < 2 || memberIds.length > 12) return send(ws, { type: 'error', message: 'Choose a name and at least one friend (up to 11).' });
        if (memberIds.some(memberId => !accounts[memberId] || (memberId !== client.account && !accountFriends(client.account).includes(memberId)))) return send(ws, { type: 'error', message: 'Private groups can only include your friends.' });
        const id = `private-${crypto.randomBytes(6).toString('hex')}`; const group = { id, name, ownerId: client.account, members: memberIds };
        privateGroups.push(group); channels.push({ ...group, private: true }); history.set(id, []); saveGroups();
        for (const memberClient of clients.values()) if (memberIds.includes(memberClient.account)) send(memberClient.ws, { type: 'channelsUpdated', channels: channelList(memberClient) });
        client.channel = id; send(ws, { type: 'channelJoined', channel: id, messages: [], users: channelClients(id).map(publicUser) }); return;
      }
      if (message.type === 'createChannel') {
        const name = String(message.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
        if (!name || channels.some(channel => channel.id === name)) return send(ws, { type: 'error', message: 'Choose a new channel name.' });
        channels.push({ id: name, name, ownerId: client.account }); history.set(name, []);
        for (const connectedClient of clients.values()) if (connectedClient.account) send(connectedClient.ws, { type: 'channelsUpdated', channels: channelList(connectedClient) });
        return;
      }
      if (message.type === 'sendMessage') {
        if (!canAccessChannel(client, getChannel(client.channel))) return send(ws, { type: 'error', message: 'You are not a member of this private group.' });
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
