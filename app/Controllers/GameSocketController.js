const GameError = require('../Exceptions/GameError');

class GameSocketController {
  constructor(io, gameService) {
    this.io = io;
    this.gameService = gameService;
  }

  register() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  handleConnection(socket) {
    socket.on('create', (data) => this.run(socket, () => {
      const room = this.gameService.createRoom({ ...data, sid: socket.id });
      this.sync(room);
    }));

    socket.on('join', (data) => this.run(socket, () => {
      const room = this.gameService.joinRoom({ ...data, sid: socket.id });
      this.sync(room);
    }));

    this.registerRoomAction(socket, 'start', (cards) => this.gameService.startRound(socket.id, cards));
    this.registerRoomAction(socket, 'startVote', () => this.gameService.startVote(socket.id));
    this.registerRoomAction(socket, 'vote', (target) => this.gameService.castVote(socket.id, target));
    this.registerRoomAction(socket, 'reveal', () => this.gameService.revealVotes(socket.id));
    this.registerRoomAction(socket, 'next', () => this.gameService.nextRound(socket.id));
    this.registerRoomAction(socket, 'reorderPlayers', (playerIds) => this.gameService.reorderPlayers(socket.id, playerIds));

    socket.on('leaveRoom', (ack) => this.run(socket, () => {
      const room = this.gameService.leaveRoom(socket.id);
      if (room) this.sync(room);
      if (typeof ack === 'function') ack();
    }));

    socket.on('disconnect', () => {
      const room = this.gameService.disconnect(socket.id);
      if (room) this.sync(room);
    });
  }

  registerRoomAction(socket, event, action) {
    socket.on(event, (data) => this.run(socket, () => {
      this.sync(action(data));
    }));
  }

  run(socket, action) {
    try {
      action();
    } catch (error) {
      if (error instanceof GameError) {
        socket.emit('err', error.message);
        return;
      }
      throw error;
    }
  }

  sync(room) {
    room.players.forEach((player) => {
      if (player.online && player.sid) {
        this.io.to(player.sid).emit('state', this.gameService.viewFor(room, player.id));
      }
    });
  }
}

module.exports = GameSocketController;
