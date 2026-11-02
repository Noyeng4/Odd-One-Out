function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function cardHTML(card) {
  return card.t === 'img'
    ? `<img class="pic" alt="Card" src="${card.v}">`
    : `<div class="txt">${escapeHTML(card.v)}</div>`;
}

export default class GameView {
  constructor(root) {
    this.root = root;
    this.actionHandler = null;
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
  }

  setActionHandler(handler) {
    this.actionHandler = handler;
  }

  render(state) {
    this.root.innerHTML = state.room
      ? this.renderRoom(state)
      : this.renderEntry(state);
  }

  handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || !this.root.contains(button) || !this.actionHandler) return;
    this.actionHandler(button.dataset.action, button.dataset);
  }

  handleInput(event) {
    const textarea = event.target.closest('[data-card-text]');
    if (textarea && this.actionHandler) {
      this.actionHandler('update-card-text', {
        card: textarea.dataset.cardText,
        value: textarea.value,
      });
    }
  }

  handleChange(event) {
    const input = event.target.closest('[data-card-file]');
    if (input && this.actionHandler && input.files[0]) {
      this.actionHandler('select-card-image', {
        card: input.dataset.cardFile,
        file: input.files[0],
      });
    }
  }

  renderEntry(state) {
    let entry;
    if (state.entryMode === 'host') {
      entry = `<section class="card">
        <h2>Host a room</h2>
        <input data-field="name" maxlength="20" placeholder="Your name" autocomplete="nickname">
        <button data-action="create-room">Host Room</button>
        <button class="ghost" data-action="show-entry" data-mode="">Back</button>
      </section>`;
    } else if (state.entryMode === 'join') {
      entry = `<section class="card">
        <h2>Join a room</h2>
        <input data-field="name" maxlength="20" placeholder="Your name" autocomplete="nickname">
        <input data-field="code" maxlength="4" placeholder="Room code" style="text-transform:uppercase">
        <button data-action="join-room">Join Room</button>
        <button class="ghost" data-action="show-entry" data-mode="">Back</button>
      </section>`;
    } else {
      entry = `<section class="card">
        <button data-action="show-entry" data-mode="host">Host Room</button>
        <button class="ghost" data-action="show-entry" data-mode="join">Join Room</button>
      </section>`;
    }

    return `<h1>Impostor</h1>
      <p class="mute">One moderator, two cards, one impostor.</p>
      ${entry}
      ${this.renderError(state.error)}`;
  }

  renderRoom(state) {
    const room = state.room;
    const isModerator = room.isMod;
    const canReorder = isModerator && room.phase !== 'playing';
    const players = room.players.map((player, index) => `
      <div class="player-row ${player.id === room.modId ? 'is-mod' : ''}">
        <span class="player-number">${index + 1}</span>
        <span class="player-avatar" aria-hidden="true">${escapeHTML(player.name.slice(0, 1).toUpperCase())}</span>
        <span class="player-info">
          <span class="player-name">${escapeHTML(player.name)}</span>
          <span class="player-meta">
            <span class="online-dot ${player.online ? '' : 'offline'}"></span>
            ${player.online ? 'Online' : 'Offline'}
            ${player.id === room.modId ? '<span class="role-tag">Moderator</span>' : ''}
          </span>
        </span>
        ${canReorder ? this.renderPlayerControls(player, index, room.players.length) : ''}
      </div>`).join('');

    let content = `<p class="mute" style="text-align:center">Room code</p>
      <div class="code">${escapeHTML(room.code)}</div>
      <section class="card player-list" aria-label="Player list">
        <div class="player-list-heading">
          <h2>Players</h2><span class="mute">${room.players.length} total</span>
        </div>
        ${players}
        ${isModerator ? `<p class="order-hint">${room.phase === 'playing'
          ? 'Player order is locked during a round.'
          : 'Use the arrows to arrange the order. The order also determines who becomes moderator next.'}</p>` : ''}
      </section>`;

    if (room.phase === 'lobby') content += this.renderLobby(state);
    if (room.phase === 'playing') content += this.renderRound(state);
    if (room.phase === 'results') content += this.renderResults(state);

    return `${content}${this.renderError(state.error)}
      <button class="ghost" style="margin-top:24px" data-action="leave-room">Leave room</button>`;
  }

  renderPlayerControls(player, index, total) {
    const name = escapeHTML(player.name);
    return `<span class="player-controls">
      <button class="order-button" aria-label="Move ${name} up" title="Move up"
        data-action="move-player" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>&#9650;</button>
      <button class="order-button" aria-label="Move ${name} down" title="Move down"
        data-action="move-player" data-index="${index}" data-direction="1" ${index === total - 1 ? 'disabled' : ''}>&#9660;</button>
    </span>`;
  }

  renderLobby(state) {
    if (!state.room.isMod) {
      return `<section class="card">
        <h2>Waiting for ${escapeHTML(this.playerName(state.room, state.room.modId))}</h2>
        <p class="mute">The moderator is setting up the cards. Keep this screen open.</p>
      </section>`;
    }

    return `<h2 style="margin-top:18px">You are the moderator</h2>
      <p class="mute">Players get the main card. One random player gets the impostor card. You sit this round out.</p>
      ${this.renderCardEditor(state, 'a', 'Main card (most players see this)')}
      ${this.renderCardEditor(state, 'b', 'Impostor card (one player sees this)')}
      <button data-action="start-round">Start round</button>`;
  }

  renderCardEditor(state, key, title) {
    const draft = state.draft[key];
    const editor = draft.t === 'img'
      ? `${cardHTML(draft)}<button class="ghost" data-action="clear-card" data-card="${key}">Remove picture</button>`
      : `<textarea data-card-text="${key}" placeholder="Type a word, name or question">${escapeHTML(draft.v)}</textarea>
         <p class="mute">or choose a picture:</p>
         <input type="file" accept="image/*" data-card-file="${key}">`;
    return `<section class="card"><p class="lbl">${title}</p>${editor}</section>`;
  }

  renderRound(state) {
    const room = state.room;
    if (room.isMod) {
      return `<section class="card"><p class="lbl">Main card</p>${cardHTML(room.cards.a)}</section>
        <section class="card"><p class="lbl">Impostor card</p>${cardHTML(room.cards.b)}
          <p class="big">Impostor: ${escapeHTML(this.playerName(room, room.impostorId))}</p>
        </section>
        ${room.voteStarted ? '' : '<button data-action="start-vote">Start voting</button>'}
        <p class="mute">Votes in: ${room.voted} of ${room.inRound.length}</p>
        <button class="ghost" data-action="reveal-votes" ${!room.voteStarted || room.voted < room.inRound.length ? 'disabled' : ''}>
          ${!room.voteStarted ? 'Start voting first' : room.voted < room.inRound.length ? 'Waiting for all players to vote' : 'Reveal votes'}
        </button>`;
    }

    if (!room.card) {
      return `<section class="card"><h2>Round in progress</h2>
        <p class="mute">You joined mid-round. You will play in the next one.</p></section>`;
    }

    const otherPlayers = room.players.filter((player) => room.inRound.includes(player.id) && player.id !== state.playerId);
    const voting = room.voteStarted
      ? `${otherPlayers.map((player) => `<button class="vote ${room.myVote === player.id ? 'on' : ''}"
          data-action="vote" data-player-id="${escapeHTML(player.id)}">${escapeHTML(player.name)}</button>`).join('')}
         <p class="mute">Votes in: ${room.voted} of ${room.inRound.length}. You can change your vote until the moderator reveals the votes.</p>`
      : '<p class="mute">Wait for the moderator to start voting.</p>';
    return `<section class="card">${cardHTML(room.card)}</section>
      <p class="mute">Describe your card out loud without giving it away.</p>${voting}`;
  }

  renderResults(state) {
    const room = state.room;
    const result = room.result;
    const tally = result.tally.length
      ? result.tally.map((item) => `<p>${escapeHTML(item.name)}: ${item.n}</p>`).join('')
      : '<p class="mute">No votes were cast.</p>';
    const nextRound = room.isMod
      ? '<button data-action="next-round">Next round (moderator passes on)</button>'
      : '<p class="mute">Waiting for the moderator to continue.</p>';
    return `<section class="card result-banner ${result.caught ? 'caught' : 'escaped'}" role="status">
        <p class="result-label">ROUND RESULT</p>
        <p class="result-title">${result.caught ? 'IMPOSTOR CAUGHT!' : 'IMPOSTOR NOT CAUGHT!'}</p>
        <p class="result-detail">The impostor was <b>${escapeHTML(result.impostor)}</b>.</p>
      </section>
      <div class="row">
        <section class="card"><p class="lbl">Main</p>${cardHTML(result.a)}</section>
        <section class="card"><p class="lbl">Impostor</p>${cardHTML(result.b)}</section>
      </div>
      <section class="card"><p class="lbl">Votes</p>${tally}</section>${nextRound}`;
  }

  playerName(room, playerId) {
    const player = room.players.find((item) => item.id === playerId);
    return player ? player.name : '?';
  }

  renderError(message) {
    return message ? `<p class="err" role="alert">${escapeHTML(message)}</p>` : '';
  }
}
