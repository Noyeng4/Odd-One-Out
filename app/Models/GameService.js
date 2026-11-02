const { randomInt } = require('node:crypto');
const GameError = require('../Exceptions/GameError');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cleanName = (name) => String(name || '').trim().slice(0, 20);

class GameService {
  constructor() {
    this.rooms = Object.create(null);
    this.socketInfo = new Map();
  }

  createRoom({ name, pid, sid }) {
    const playerName = cleanName(name);
    if (!playerName || !pid) throw new GameError('Enter your name first.');

    const code = this.makeCode();
    const room = {
      code,
      players: [],
      modId: pid,
      phase: 'lobby',
      votes: {},
      inRound: [],
      round: 0,
      voteStarted: false,
    };
    this.rooms[code] = room;
    this.enterRoom(room, pid, playerName, sid);
    return room;
  }

  joinRoom({ code, name, pid, sid }) {
    const roomCode = String(code || '').toUpperCase().trim();
    const room = this.rooms[roomCode];
    if (!room) throw new GameError('Room not found. Check the code.');

    const known = room.players.some((player) => player.id === pid);
    const playerName = cleanName(name);
    if (!known && !playerName) throw new GameError('Enter your name first.');
    if (!known && room.players.length >= 20) throw new GameError('This room is full.');

    this.enterRoom(room, pid, playerName, sid);
    return room;
  }

  getContext(sid) {
    const context = this.socketInfo.get(sid);
    const room = context && this.rooms[context.code];
    return room ? { room, pid: context.pid } : {};
  }

  startRound(sid, cards) {
    const { room, pid } = this.requireRoom(sid);
    if (pid !== room.modId || room.phase === 'playing') return room;

    const { a, b } = cards || {};
    if (!this.isValidCard(a) || !this.isValidCard(b)) {
      throw new GameError('Add both cards: a picture or some text for each.');
    }

    const pool = room.players.filter((player) => player.id !== room.modId && player.online);
    if (pool.length < 3) throw new GameError('You need at least 3 players besides the moderator.');

    [a, b].forEach((card) => {
      if (card.t === 'txt') card.v = card.v.trim().slice(0, 300);
    });
    room.a = a;
    room.b = b;
    room.inRound = pool.map((player) => player.id);
    room.impostorId = pool[randomInt(pool.length)].id;
    room.votes = {};
    room.result = null;
    room.voteStarted = false;
    room.phase = 'playing';
    room.round++;
    return room;
  }

  startVote(sid) {
    const { room, pid } = this.requireRoom(sid);
    if (pid === room.modId && room.phase === 'playing' && !room.voteStarted) {
      room.voteStarted = true;
    }
    return room;
  }

  castVote(sid, target) {
    const { room, pid } = this.requireRoom(sid);
    if (room.phase !== 'playing' || !room.voteStarted || pid === target) return room;
    if (!room.inRound.includes(pid) || !room.inRound.includes(target)) return room;
    room.votes[pid] = target;
    return room;
  }

  revealVotes(sid) {
    const { room, pid } = this.requireRoom(sid);
    if (pid !== room.modId || room.phase !== 'playing') return room;
    if (!room.voteStarted) throw new GameError('Start voting before revealing the votes.');
    if (Object.keys(room.votes).length < room.inRound.length) {
      throw new GameError('Wait until every player has voted.');
    }
    this.finishRound(room);
    return room;
  }

  nextRound(sid) {
    const { room, pid } = this.requireRoom(sid);
    if (pid !== room.modId || room.phase !== 'results') return room;
    this.rotateModerator(room);
    room.phase = 'lobby';
    return room;
  }

  reorderPlayers(sid, playerIds) {
    const { room, pid } = this.requireRoom(sid);
    if (pid !== room.modId) throw new GameError('Only the moderator can change the player order.');
    if (room.phase === 'playing') throw new GameError('Player order cannot be changed during a round.');

    const currentIds = room.players.map((player) => player.id);
    if (!Array.isArray(playerIds) || playerIds.length !== currentIds.length ||
      playerIds.some((id) => typeof id !== 'string') ||
      new Set(playerIds).size !== currentIds.length ||
      playerIds.some((id) => !currentIds.includes(id))) {
      throw new GameError('Could not update the player order. Please try again.');
    }

    const playersById = new Map(room.players.map((player) => [player.id, player]));
    room.players = playerIds.map((id) => playersById.get(id));
    return room;
  }

  leaveRoom(sid) {
    const { room, pid } = this.getContext(sid);
    if (!room) return null;

    const playerIndex = room.players.findIndex((player) => player.id === pid);
    if (playerIndex === -1) return null;
    const leavingModerator = pid === room.modId;
    room.players.splice(playerIndex, 1);
    room.inRound = room.inRound.filter((playerId) => playerId !== pid);
    delete room.votes[pid];
    Object.keys(room.votes).forEach((voterId) => {
      if (room.votes[voterId] === pid) delete room.votes[voterId];
    });
    this.socketInfo.delete(sid);

    if (leavingModerator) {
      const successor = room.players.find((player) => player.online);
      room.modId = successor ? successor.id : null;
      if (room.phase === 'playing') this.resetRound(room);
    }

    if (room.players.length) return room;
    delete this.rooms[room.code];
    return room;
  }

  disconnect(sid) {
    const context = this.getContext(sid);
    this.socketInfo.delete(sid);
    if (!context.room) return null;

    const { room, pid } = context;
    const player = room.players.find((item) => item.id === pid);
    if (!player || player.sid !== sid) return null;
    player.online = false;

    if (!room.players.some((item) => item.online)) {
      setTimeout(() => {
        if (this.rooms[room.code] === room && !room.players.some((item) => item.online)) {
          delete this.rooms[room.code];
        }
      }, 3600e3);
    }
    return room;
  }

  viewFor(room, pid) {
    const isModerator = room.modId === pid;
    const view = {
      code: room.code,
      me: pid,
      isMod: isModerator,
      phase: room.phase,
      modId: room.modId,
      round: room.round,
      players: room.players.map(({ id, name, online }) => ({ id, name, online })),
      inRound: room.inRound,
      voted: Object.keys(room.votes).length,
      voteStarted: room.voteStarted,
    };

    if (room.phase === 'playing') {
      if (isModerator) {
        view.cards = { a: room.a, b: room.b };
        view.impostorId = room.impostorId;
      } else if (room.inRound.includes(pid)) {
        view.card = pid === room.impostorId ? room.b : room.a;
        view.myVote = room.votes[pid] || null;
      }
    }
    if (room.phase === 'results') view.result = room.result;
    return view;
  }

  makeCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('');
    } while (this.rooms[code]);
    return code;
  }

  enterRoom(room, pid, name, sid) {
    const player = room.players.find((item) => item.id === pid);
    if (player) {
      player.online = true;
      player.sid = sid;
      if (name) player.name = name;
    } else {
      room.players.push({ id: pid, name, sid, online: true });
    }
    if (!room.modId) room.modId = pid;
    this.socketInfo.set(sid, { code: room.code, pid });
  }

  requireRoom(sid) {
    const context = this.getContext(sid);
    if (!context.room) throw new GameError('You are no longer connected to this room.');
    return context;
  }

  isValidCard(card) {
    return Boolean(card && (
      (card.t === 'img' && typeof card.v === 'string' && card.v.startsWith('data:image/')) ||
      (card.t === 'txt' && typeof card.v === 'string' && card.v.trim())
    ));
  }

  finishRound(room) {
    const tally = {};
    Object.values(room.votes).forEach((target) => {
      tally[target] = (tally[target] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((playerId) => tally[playerId] === max);
    room.result = {
      impostor: this.nameOf(room, room.impostorId),
      caught: max > 0 && top.length === 1 && top[0] === room.impostorId,
      a: room.a,
      b: room.b,
      tally: Object.entries(tally)
        .map(([id, votes]) => ({ name: this.nameOf(room, id), n: votes }))
        .sort((left, right) => right.n - left.n),
    };
    room.phase = 'results';
  }

  nameOf(room, playerId) {
    return (room.players.find((player) => player.id === playerId) || {}).name;
  }

  rotateModerator(room) {
    const currentIndex = room.players.findIndex((player) => player.id === room.modId);
    for (let offset = 1; offset <= room.players.length; offset++) {
      const player = room.players[(currentIndex + offset) % room.players.length];
      if (player.online) {
        room.modId = player.id;
        return;
      }
    }
  }

  resetRound(room) {
    room.phase = 'lobby';
    room.inRound = [];
    room.votes = {};
    room.voteStarted = false;
    room.result = null;
    delete room.a;
    delete room.b;
    delete room.impostorId;
  }
}

module.exports = GameService;
