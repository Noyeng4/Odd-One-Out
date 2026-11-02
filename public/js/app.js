import GameViewModel from './viewmodels/game-view-model.js';

const root = document.getElementById('app');
const viewModel = new GameViewModel(root, window.io());

viewModel.render();
