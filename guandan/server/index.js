/* HTTP static server + WebSocket game server for Guandan online. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const STATIC = {
  '/': 'public/index.html',
  '/engine.js': 'shared/engine.js',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let rel = STATIC[url];
  if (!rel) {
    const p = path.normalize(url).replace(/^([/\\])+/, '');
    if (p.includes('..')) return notFound(res);
    rel = path.join('public', p);
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(path.join(ROOT, 'public')) && !Object.values(STATIC).map((x) => path.join(ROOT, x)).includes(file)) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

const rooms = new Map(); // code -> Room
const players = new Map(); // token -> Player

class Player {
  constructor(token) {
    this.token = token;
    this.name = '玩家';
    this.avatar = 0;
    this.ws = null;
    this.room = null;
    this.seat = -1;
  }
  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}

function newCode() {
  let c;
  do c = String(Math.floor(100000 + Math.random() * 900000));
  while (rooms.has(c));
  return c;
}

let roomOpts = {};

function createRoom() {
  const code = newCode();
  const room = new Room(code, roomOpts, {
    onEmpty: (r) => {
      rooms.delete(r.code);
      broadcastLobby();
    },
  });
  rooms.set(code, room);
  return room;
}

function lobbyList() {
  return [...rooms.values()]
    .filter((r) => r.isPublic)
    .map((r) => ({
      code: r.code,
      phase: r.phase,
      n: r.seats.filter(Boolean).length,
      humans: r.humans().length,
      host: r.seats[r.host] ? r.seats[r.host].name : '',
      levels: r.levels,
    }))
    .sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.n - a.n)
    .slice(0, 30);
}

function broadcastLobby() {
  const msg = { type: 'rooms', rooms: lobbyList(), online: [...players.values()].filter((p) => p.ws).length };
  for (const p of players.values()) if (!p.room) p.send(msg);
}

function roomOf(p) {
  return p.room ? rooms.get(p.room) : null;
}

function handle(p, m) {
  const room = roomOf(p);
  const seat = room ? room.seatOf(p) : -1;
  const err = (msg) => p.send({ type: 'error', msg });
  switch (m.type) {
    case 'profile':
      p.name = String(m.name || '玩家').replace(/[<>&"']/g, '').trim().slice(0, 10) || '玩家';
      p.avatar = Math.max(0, Math.min(11, Number(m.avatar) | 0));
      if (room && seat >= 0 && room.phase === 'lobby') {
        room.seats[seat].name = p.name;
        room.seats[seat].avatar = p.avatar;
        room.broadcast();
      }
      break;
    case 'list':
      p.send({ type: 'rooms', rooms: lobbyList(), online: [...players.values()].filter((x) => x.ws).length });
      break;
    case 'create': {
      if (room) room.leave(p);
      const r = createRoom();
      r.isPublic = m.public !== false;
      r.join(p, 0);
      if (m.fillBots) for (let i = 1; i < 4; i++) r.addBot(0, i);
      broadcastLobby();
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.code || '').trim());
      if (!r) return err('房间不存在');
      if (room && room !== r) room.leave(p);
      if (r.join(p, m.seat) < 0) return err(r.phase === 'lobby' ? '房间已满' : '游戏已开始');
      broadcastLobby();
      break;
    }
    case 'quick': {
      if (room) room.leave(p);
      let r = [...rooms.values()].find((x) => x.isPublic && x.phase === 'lobby' && x.seats.some((s) => !s));
      if (!r) {
        r = createRoom();
      }
      r.join(p);
      broadcastLobby();
      break;
    }
    case 'leave':
      if (room) room.leave(p);
      p.send({ type: 'left' });
      broadcastLobby();
      break;
    default:
      if (!room || seat < 0) return err('你不在房间中');
      roomAction(room, seat, p, m, err);
  }
}

function roomAction(room, seat, p, m, err) {
  let e = null;
  switch (m.type) {
    case 'ready':
      room.setReady(seat, m.on);
      break;
    case 'addBot':
      e = room.addBot(seat, m.seat);
      break;
    case 'kick':
      e = room.removeSeat(seat, m.seat);
      break;
    case 'sit':
      room.moveSeat(p, m.seat);
      break;
    case 'start':
      e = room.startGame(seat);
      break;
    case 'play':
      e = room.play(seat, m.ids);
      if (e) p.send(room.view(seat));
      break;
    case 'pass':
      e = room.pass(seat);
      break;
    case 'return':
      e = room.returnTribute(seat, m.card);
      break;
    case 'hosted':
      room.setHosted(seat, m.on);
      break;
    case 'chat':
      room.chat(seat, m.kind, m.v);
      break;
    default:
      e = 'unknown action';
  }
  if (e) err(e);
  broadcastLobby();
}

function start(port = PORT, opts = {}) {
  roomOpts = opts.room || {};
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    let p = null;
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m.type !== 'string') return;
      if (!p) {
        if (m.type !== 'hello') return;
        const tok = typeof m.token === 'string' && /^[a-f0-9]{32}$/.test(m.token) ? m.token : null;
        p = (tok && players.get(tok)) || new Player(tok || crypto.randomBytes(16).toString('hex'));
        players.set(p.token, p);
        if (p.ws && p.ws !== ws) {
          try {
            p.ws.send(JSON.stringify({ type: 'kicked', dup: true, msg: '账号已在其他页面登录' }));
            p.ws.close();
          } catch {}
        }
        p.ws = ws;
        if (m.name) p.name = String(m.name).replace(/[<>&"']/g, '').trim().slice(0, 10) || p.name;
        if (m.avatar !== undefined) p.avatar = Math.max(0, Math.min(11, Number(m.avatar) | 0));
        p.send({ type: 'welcome', token: p.token, name: p.name, avatar: p.avatar });
        const r = roomOf(p);
        if (r && r.seatOf(p) >= 0) r.attach(p);
        else {
          p.room = null;
          p.send({ type: 'rooms', rooms: lobbyList(), online: 0 });
        }
        broadcastLobby();
        return;
      }
      try {
        handle(p, m);
      } catch (e) {
        console.error('handler error', e);
      }
    });
    ws.on('close', () => {
      if (!p || p.ws !== ws) return;
      p.ws = null;
      const r = roomOf(p);
      if (r) r.detach(p);
      else setTimeout(() => !p.ws && !p.room && players.delete(p.token), 60000);
      broadcastLobby();
    });
  });
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);
  wss.on('close', () => clearInterval(hb));
  server.listen(port, () => {
    if (!opts.quiet) console.log(`掼蛋 server running at http://localhost:${server.address().port}`);
  });
  return { server, wss, rooms, players };
}

if (require.main === module) start();

module.exports = { start };
