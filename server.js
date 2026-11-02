const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { randomInt } = require('node:crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6e6 });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static('public'));

const rooms = {};
const sockInfo = {}; // socket id -> { code, pid }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const clean = (n) => String(n || '').trim().slice(0, 20);
const makeCode = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); }
  while (rooms[c]);
  return c;
};
const nameOf = (r, id) => (r.players.find((p) => p.id === id) || {}).name;

// What each person is allowed to see. Hidden info is never sent to the wrong player.
function view(r, pid) {
  const isMod = r.modId === pid;
  const v = {
    code: r.code, me: pid, isMod, phase: r.phase, modId: r.modId, round: r.round,
    players: r.players.map((p) => ({ id: p.id, name: p.name, online: p.online })),
    inRound: r.inRound, voted: Object.keys(r.votes).length, voteStarted: r.voteStarted,
  };
  if (r.phase === 'playing') {
    if (isMod) { v.cards = { a: r.a, b: r.b }; v.impostorId = r.impostorId; }
    else if (r.inRound.includes(pid)) { v.card = pid === r.impostorId ? r.b : r.a; v.myVote = r.votes[pid] || null; }
  }
  if (r.phase === 'results') v.result = r.result;
  return v;
}

function sync(r) {
  r.players.forEach((p) => p.online && p.sid && io.to(p.sid).emit('state', view(r, p.id)));
}

function finish(r) {
  const tally = {};
  Object.values(r.votes).forEach((t) => { tally[t] = (tally[t] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === max);
  r.result = {
    impostor: nameOf(r, r.impostorId),
    caught: max > 0 && top.length === 1 && top[0] === r.impostorId,
    a: r.a, b: r.b,
    tally: Object.entries(tally).map(([id, n]) => ({ name: nameOf(r, id), n })).sort((x, y) => y.n - x.n),
  };
  r.phase = 'results';
}

function rotateMod(r) {
  const i = r.players.findIndex((p) => p.id === r.modId);
  for (let k = 1; k <= r.players.length; k++) {
    const p = r.players[(i + k) % r.players.length];
    if (p.online) { r.modId = p.id; return; }
  }
}

io.on('connection', (s) => {
  const ctx = () => {
    const c = sockInfo[s.id];
    return c && rooms[c.code] ? { r: rooms[c.code], pid: c.pid } : {};
  };
  const enter = (r, pid, name) => {
    const p = r.players.find((x) => x.id === pid);
    if (p) { p.online = true; p.sid = s.id; if (name) p.name = name; }
    else r.players.push({ id: pid, name, sid: s.id, online: true });
    if (!r.modId) r.modId = pid;
    sockInfo[s.id] = { code: r.code, pid };
    sync(r);
  };

  s.on('create', ({ name, pid }) => {
    name = clean(name);
    if (!name || !pid) return s.emit('err', 'Enter your name first.');
    const r = { code: makeCode(), players: [], modId: pid, phase: 'lobby', votes: {}, inRound: [], round: 0, voteStarted: false };
    rooms[r.code] = r;
    enter(r, pid, name);
  });

  s.on('join', ({ code, name, pid }) => {
    const r = rooms[String(code || '').toUpperCase().trim()];
    if (!r) return s.emit('err', 'Room not found. Check the code.');
    const known = r.players.some((x) => x.id === pid);
    name = clean(name);
    if (!known && !name) return s.emit('err', 'Enter your name first.');
    if (!known && r.players.length >= 20) return s.emit('err', 'This room is full.');
    enter(r, pid, name);
  });

  s.on('start', ({ a, b }) => {
    const { r, pid } = ctx();
    if (!r || pid !== r.modId || r.phase === 'playing') return;
    const ok = (c) => c && ((c.t === 'img' && typeof c.v === 'string' && c.v.startsWith('data:image/')) ||
      (c.t === 'txt' && typeof c.v === 'string' && c.v.trim()));
    if (!ok(a) || !ok(b)) return s.emit('err', 'Add both cards: a picture or some text for each.');
    const pool = r.players.filter((p) => p.id !== r.modId && p.online);
    if (pool.length < 3) return s.emit('err', 'You need at least 3 players besides the moderator.');
    [a, b].forEach((c) => { if (c.t === 'txt') c.v = c.v.trim().slice(0, 300); });
    r.a = a; r.b = b;
    r.inRound = pool.map((p) => p.id);
    r.impostorId = pool[randomInt(pool.length)].id;
    r.votes = {}; r.result = null; r.voteStarted = false; r.phase = 'playing'; r.round++;
    sync(r);
  });

  s.on('startVote', () => {
    const { r, pid } = ctx();
    if (!r || pid !== r.modId || r.phase !== 'playing' || r.voteStarted) return;
    r.voteStarted = true;
    sync(r);
  });

  s.on('vote', (target) => {
    const { r, pid } = ctx();
    if (!r || r.phase !== 'playing' || !r.voteStarted || pid === target) return;
    if (!r.inRound.includes(pid) || !r.inRound.includes(target)) return;
    r.votes[pid] = target;
    sync(r);
  });

  s.on('reveal', () => {
    const { r, pid } = ctx();
    if (!r || pid !== r.modId || r.phase !== 'playing') return;
    if (!r.voteStarted) return s.emit('err', 'Start voting before revealing the votes.');
    if (Object.keys(r.votes).length < r.inRound.length) {
      return s.emit('err', 'Wait until every player has voted.');
    }
    finish(r); sync(r);
  });

  s.on('next', () => {
    const { r, pid } = ctx();
    if (!r || pid !== r.modId || r.phase !== 'results') return;
    rotateMod(r); r.phase = 'lobby'; sync(r);
  });

  s.on('reorderPlayers', (playerIds) => {
    const { r, pid } = ctx();
    if (!r || pid !== r.modId) return s.emit('err', 'Only the moderator can change the player order.');
    if (r.phase === 'playing') return s.emit('err', 'Player order cannot be changed during a round.');
    const currentIds = r.players.map((p) => p.id);
    if (!Array.isArray(playerIds) || playerIds.length !== currentIds.length ||
      playerIds.some((id) => typeof id !== 'string') ||
      new Set(playerIds).size !== currentIds.length ||
      playerIds.some((id) => !currentIds.includes(id))) {
      return s.emit('err', 'Could not update the player order. Please try again.');
    }
    const playersById = new Map(r.players.map((p) => [p.id, p]));
    r.players = playerIds.map((id) => playersById.get(id));
    sync(r);
  });

  s.on('leaveRoom', (ack) => {
    const { r, pid } = ctx();
    if (!r) return ack?.();

    const playerIndex = r.players.findIndex((p) => p.id === pid);
    if (playerIndex === -1) return ack?.();
    const leavingMod = pid === r.modId;
    r.players.splice(playerIndex, 1);
    r.inRound = r.inRound.filter((playerId) => playerId !== pid);
    delete r.votes[pid];
    Object.keys(r.votes).forEach((voterId) => {
      if (r.votes[voterId] === pid) delete r.votes[voterId];
    });
    delete sockInfo[s.id];

    if (leavingMod) {
      const successor = r.players.find((p) => p.online);
      r.modId = successor ? successor.id : null;
      if (r.phase === 'playing') {
        r.phase = 'lobby';
        r.inRound = [];
        r.votes = {};
        r.voteStarted = false;
        r.result = null;
        delete r.a;
        delete r.b;
        delete r.impostorId;
      }
    }

    if (r.players.length) sync(r);
    else delete rooms[r.code];
    ack?.();
  });

  s.on('disconnect', () => {
    const { r, pid } = ctx();
    delete sockInfo[s.id];
    if (!r) return;
    const p = r.players.find((x) => x.id === pid);
    if (!p || p.sid !== s.id) return;
    p.online = false;
    sync(r);
    if (!r.players.some((x) => x.online)) {
      setTimeout(() => { if (!r.players.some((x) => x.online)) delete rooms[r.code]; }, 3600e3);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Impostor game running on port ' + PORT));
