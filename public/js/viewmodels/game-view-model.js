import GameState from '../models/game-state.js';
import GameView from '../views/game-view.js';

export default class GameViewModel {
  constructor(root, socket) {
    this.state = new GameState();
    this.view = new GameView(root);
    this.socket = socket;
    this.view.setActionHandler((action, data) => this.handleAction(action, data));

    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('state', (room) => {
      this.state.setRoom(room);
      this.render();
    });
    this.socket.on('err', (message) => {
      this.state.setError(message);
      this.render();
    });
  }

  render() {
    this.view.render(this.state);
  }

  handleConnect() {
    const savedRoom = this.state.getSavedRoom();
    if (savedRoom) {
      this.socket.emit('join', { ...savedRoom, pid: this.state.playerId });
      return;
    }
    this.render();
  }

  handleAction(action, data = {}) {
    switch (action) {
      case 'show-entry':
        this.state.entryMode = data.mode;
        this.state.setError('');
        this.render();
        break;
      case 'create-room':
        this.socket.emit('create', {
          name: this.fieldValue('name'),
          pid: this.state.playerId,
        });
        break;
      case 'join-room':
        this.socket.emit('join', {
          code: this.fieldValue('code'),
          name: this.fieldValue('name'),
          pid: this.state.playerId,
        });
        break;
      case 'start-round':
        this.socket.emit('start', this.state.draft);
        break;
      case 'start-vote':
        this.socket.emit('startVote');
        break;
      case 'vote':
        this.socket.emit('vote', data.playerId);
        break;
      case 'reveal-votes':
        this.socket.emit('reveal');
        break;
      case 'next-round':
        this.socket.emit('next');
        break;
      case 'move-player':
        this.movePlayer(Number(data.index), Number(data.direction));
        break;
      case 'update-card-text':
        this.state.setCardText(data.card, data.value);
        break;
      case 'select-card-image':
        this.selectCardImage(data.card, data.file);
        break;
      case 'clear-card':
        this.state.clearCard(data.card);
        this.render();
        break;
      case 'leave-room':
        this.leaveRoom();
        break;
      default:
        break;
    }
  }

  fieldValue(name) {
    return this.view.root.querySelector(`[data-field="${name}"]`).value;
  }

  movePlayer(index, direction) {
    const players = [...this.state.room.players];
    const destination = index + direction;
    if (!this.state.room.isMod || this.state.room.phase === 'playing' ||
      destination < 0 || destination >= players.length) return;

    [players[index], players[destination]] = [players[destination], players[index]];
    this.socket.emit('reorderPlayers', players.map((player) => player.id));
  }

  async selectCardImage(cardKey, file) {
    try {
      const image = await this.shrinkImage(file);
      this.state.setCardImage(cardKey, image);
      this.render();
    } catch (error) {
      this.state.setError('Could not load that picture. Please choose another image.');
      this.render();
    }
  }

  shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Could not process the selected image.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not load the selected image.'));
      };
      image.src = objectUrl;
    });
  }

  leaveRoom() {
    this.socket.timeout(1500).emit('leaveRoom', (error) => {
      if (error) {
        this.state.setError('Could not leave the room. Check your connection and try again.');
        this.render();
        return;
      }
      this.state.storage.removeItem('room');
      window.location.reload();
    });
  }
}
