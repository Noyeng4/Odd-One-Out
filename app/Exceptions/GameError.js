class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

module.exports = GameError;
