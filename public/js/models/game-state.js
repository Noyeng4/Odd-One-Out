const STORAGE_KEYS = {
  playerId: 'pid',
  room: 'room',
};

export default class GameState {
  constructor(storage = window.localStorage) {
    this.storage = storage;
    this.playerId = this.getOrCreatePlayerId();
    this.room = null;
    this.error = '';
    this.entryMode = '';
    this.draft = {
      a: { t: 'txt', v: '' },
      b: { t: 'txt', v: '' },
    };
  }

  getSavedRoom() {
    const saved = this.storage.getItem(STORAGE_KEYS.room);
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch (error) {
      this.storage.removeItem(STORAGE_KEYS.room);
      return null;
    }
  }

  setRoom(room) {
    this.room = room;
    this.error = '';
    const player = room.players.find((item) => item.id === this.playerId);
    this.storage.setItem(STORAGE_KEYS.room, JSON.stringify({
      code: room.code,
      name: player ? player.name : '',
    }));
  }

  setError(message) {
    this.error = message;
  }

  setCardText(cardKey, value) {
    if (this.draft[cardKey]) this.draft[cardKey].v = value;
  }

  setCardImage(cardKey, value) {
    if (this.draft[cardKey]) this.draft[cardKey] = { t: 'img', v: value };
  }

  clearCard(cardKey) {
    if (this.draft[cardKey]) this.draft[cardKey] = { t: 'txt', v: '' };
  }

  getOrCreatePlayerId() {
    const savedId = this.storage.getItem(STORAGE_KEYS.playerId);
    if (savedId) return savedId;
    const playerId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    this.storage.setItem(STORAGE_KEYS.playerId, playerId);
    return playerId;
  }
}
