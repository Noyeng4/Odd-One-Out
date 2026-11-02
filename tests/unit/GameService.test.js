const assert = require('node:assert/strict');
const test = require('node:test');
const GameService = require('../../app/Models/GameService');

function createGame() {
  const service = new GameService();
  const room = service.createRoom({ name: 'Moderator', pid: 'mod', sid: 's-mod' });
  const players = ['p1', 'p2', 'p3'].map((pid) => {
    service.joinRoom({ code: room.code, name: pid, pid, sid: `s-${pid}` });
    return pid;
  });
  return { service, room, players };
}

function startRound(service) {
  service.startRound('s-mod', {
    a: { t: 'txt', v: 'main card' },
    b: { t: 'txt', v: 'impostor card' },
  });
}

test('room views keep the impostor identity private from players', () => {
  const { service, room, players } = createGame();
  startRound(service);

  assert.ok(players.includes(room.impostorId));
  assert.equal(service.viewFor(room, 'mod').impostorId, room.impostorId);
  for (const playerId of players) {
    assert.equal(service.viewFor(room, playerId).impostorId, undefined);
  }
});

test('only the moderator can reorder players and the next moderator follows that order', () => {
  const { service, room } = createGame();
  const orderedIds = ['mod', 'p3', 'p2', 'p1'];

  service.reorderPlayers('s-mod', orderedIds);
  assert.deepEqual(room.players.map((player) => player.id), orderedIds);
  assert.throws(
    () => service.reorderPlayers('s-p1', ['p1', 'mod', 'p3', 'p2']),
    /Only the moderator/,
  );

  startRound(service);
  room.inRound.forEach((voter, index) => {
    service.startVote('s-mod');
    service.castVote(`s-${voter}`, room.inRound[(index + 1) % room.inRound.length]);
  });
  service.revealVotes('s-mod');
  service.nextRound('s-mod');

  assert.equal(room.modId, 'p3');
  assert.equal(room.phase, 'lobby');
});

test('voting waits for moderator and all players before revealing results', () => {
  const { service, room, players } = createGame();
  startRound(service);

  service.castVote('s-p1', 'p2');
  assert.equal(Object.keys(room.votes).length, 0);
  service.startVote('s-p1');
  assert.equal(room.voteStarted, false);
  assert.throws(() => service.revealVotes('s-mod'), /Start voting/);

  service.startVote('s-mod');
  service.castVote('s-p1', 'p2');
  assert.throws(() => service.revealVotes('s-mod'), /every player has voted/);
  service.castVote('s-p2', 'p1');
  service.castVote('s-p3', 'p1');
  service.revealVotes('s-mod');

  assert.equal(room.phase, 'results');
  assert.equal(room.result.tally.reduce((total, item) => total + item.n, 0), players.length);
});

test('leaving moderator is replaced and the active round resets', () => {
  const { service, room } = createGame();
  startRound(service);

  service.leaveRoom('s-mod');

  assert.equal(room.modId, 'p1');
  assert.equal(room.phase, 'lobby');
  assert.deepEqual(room.inRound, []);
  assert.equal(room.voteStarted, false);
  assert.equal(room.players.some((player) => player.id === 'mod'), false);
});
