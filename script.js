/* ============================================================
   UNO FLIP — script.js
   Hot-seat multiplayer (2–7 players). Full official deck & rules.
   ============================================================ */

'use strict';

/* ---------- Colour definitions ---------- */
// light side colours
const LIGHT_COLORS = ['red', 'yellow', 'green', 'blue'];
// dark side colours
const DARK_COLORS = ['pink', 'teal', 'orange', 'purple'];

const COLOR_HEX = {
  red: '#e53935', yellow: '#f6c419', green: '#3fa748', blue: '#1e88e5',
  pink: '#e91e63', teal: '#00acc1', orange: '#fb8c00', purple: '#8e24aa',
};

/* ---------- Card types ---------- */
// light action types
const T = {
  number: 'number',
  drawOne: 'drawOne', skip: 'skip', reverse: 'reverse', flip: 'flip',
  wild: 'wild', wildDrawTwo: 'wildDrawTwo',
  // dark
  drawFive: 'drawFive', skipEveryone: 'skipEveryone', wildDrawColor: 'wildDrawColor',
};

const SIDE_COLORS = { light: LIGHT_COLORS, dark: DARK_COLORS };

/* ---------- Deck building ---------- */
function buildLightFaces() {
  const faces = [];
  for (const c of LIGHT_COLORS) {
    for (let v = 1; v <= 9; v++) {
      faces.push({ color: c, type: T.number, value: v });
      faces.push({ color: c, type: T.number, value: v }); // two of each
    }
    for (const t of [T.drawOne, T.skip, T.reverse, T.flip]) {
      faces.push({ color: c, type: t });
      faces.push({ color: c, type: t });
    }
  }
  for (let i = 0; i < 4; i++) faces.push({ color: null, type: T.wild });
  for (let i = 0; i < 4; i++) faces.push({ color: null, type: T.wildDrawTwo });
  return faces; // 72 + 32 + 8 = 112
}

function buildDarkFaces() {
  const faces = [];
  for (const c of DARK_COLORS) {
    for (let v = 1; v <= 9; v++) {
      faces.push({ color: c, type: T.number, value: v });
      faces.push({ color: c, type: T.number, value: v });
    }
    for (const t of [T.drawFive, T.skipEveryone, T.reverse, T.flip]) {
      faces.push({ color: c, type: t });
      faces.push({ color: c, type: t });
    }
  }
  for (let i = 0; i < 4; i++) faces.push({ color: null, type: T.wild });
  for (let i = 0; i < 4; i++) faces.push({ color: null, type: T.wildDrawColor });
  return faces; // 112
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const light = buildLightFaces();
  const dark = buildDarkFaces();

  // Pair light/dark faces by category so a Flip card never reveals a wild
  // face on the other side (which would leave no valid active colour).
  // Categories: number, non-flip action, flip, wild.
  const cat = (f) => (f.type === T.number ? 'num' : f.type === T.flip ? 'flip' : isWild(f.type) ? 'wild' : 'act');
  const lBy = { num: [], act: [], flip: [], wild: [] };
  const dBy = { num: [], act: [], flip: [], wild: [] };
  light.forEach((f) => lBy[cat(f)].push(f));
  dark.forEach((f) => dBy[cat(f)].push(f));
  Object.values(lBy).forEach((arr) => shuffle(arr));
  Object.values(dBy).forEach((arr) => shuffle(arr));

  const pairs = [];
  ['num', 'act', 'flip', 'wild'].forEach((k) => {
    lBy[k].forEach((lf, i) => pairs.push({ light: lf, dark: dBy[k][i] }));
  });
  const cards = pairs.map((p, i) => ({ id: 'c' + i, light: p.light, dark: p.dark }));
  return shuffle(cards);
}

/* ---------- State ---------- */
let state = null;
let chosenPlayerCount = 4;
let playerTypes = ['human', 'human', 'human', 'human'];

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const setupScreen = $('setupScreen');
const gameScreen = $('gameScreen');
const sideIndicator = $('sideIndicator');
const directionEl = $('direction');
const drawCountEl = $('drawCount');
const playersBar = $('playersBar');
const drawPileEl = $('drawPile');
const discardPileEl = $('discardPile');
const handEl = $('hand');
const logEl = $('log');
const drawBtn = $('drawBtn');
const endTurnBtn = $('endTurnBtn');
const unoBtn = $('unoBtn');
const passOverlay = $('passOverlay');
const passTitle = $('passTitle');
const passSub = $('passSub');
const colorOverlay = $('colorOverlay');
const colorGrid = $('colorGrid');
const overOverlay = $('overOverlay');
const winnerTitle = $('winnerTitle');
const winnerSub = $('winnerSub');
const aiThinking = $('aiThinking');
const aiThinkingText = $('aiThinkingText');
const soundToggle = $('soundToggle');

/* ============================================================
   SOUND (procedural Web Audio — no external files)
   ============================================================ */
const Sound = {
  ctx: null,
  enabled: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, start, dur, type, vol) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    const t0 = ctx.currentTime + start;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  sweep(f1, f2, start, dur, type, vol) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    const t0 = ctx.currentTime + start;
    o.type = type; o.frequency.setValueAtTime(f1, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  play(name) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return; this.resume();
    const s = this.sounds[name]; if (s) s.call(this);
  },
  sounds: {
    click() { this.tone(560, 0, 0.05, 'square', 0.06); },
    play() { this.tone(320, 0, 0.07, 'triangle', 0.16); this.tone(240, 0.04, 0.06, 'triangle', 0.12); },
    draw() { this.tone(220, 0, 0.12, 'sine', 0.12); },
    flip() { this.sweep(180, 950, 0, 0.32, 'sawtooth', 0.13); },
    skip() { this.sweep(520, 240, 0, 0.13, 'square', 0.12); },
    reverse() { this.tone(300, 0, 0.08, 'square', 0.12); this.tone(500, 0.09, 0.08, 'square', 0.12); },
    wild() { [330, 415, 494, 660].forEach((f, i) => this.tone(f, i * 0.05, 0.06, 'triangle', 0.12)); },
    uno() { this.tone(660, 0, 0.1, 'square', 0.16); this.tone(990, 0.11, 0.13, 'square', 0.16); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.12, 0.13, 'triangle', 0.18)); },
    error() { this.tone(130, 0, 0.16, 'square', 0.12); },
  },
};

/* ============================================================
   SETUP SCREEN
   ============================================================ */
function initSetup() {
  // count buttons
  document.querySelectorAll('.count-btn').forEach((b) => {
    b.addEventListener('click', () => {
      Sound.play('click');
      document.querySelectorAll('.count-btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      chosenPlayerCount = parseInt(b.dataset.count, 10);
      // preserve existing types/names where possible
      while (playerTypes.length < chosenPlayerCount) playerTypes.push('human');
      if (playerTypes.length > chosenPlayerCount) playerTypes.length = chosenPlayerCount;
      renderNameInputs();
    });
  });
  renderNameInputs();

  $('startBtn').addEventListener('click', () => {
    Sound.init(); Sound.resume(); Sound.play('click');
    const inputs = document.querySelectorAll('.name-input');
    const names = Array.from(inputs).map((inp, i) => (inp.value.trim() || 'Player ' + (i + 1)));
    startGame(names, playerTypes.slice());
  });

  $('revealBtn').addEventListener('click', () => { Sound.play('click'); revealHand(); });
  drawBtn.addEventListener('click', () => { Sound.play('click'); playerDraw(); });
  drawPileEl.addEventListener('click', () => { Sound.play('click'); playerDraw(); });
  endTurnBtn.addEventListener('click', () => { Sound.play('click'); endTurnFromDrew(); });
  unoBtn.addEventListener('click', () => { Sound.play('click'); callUno(); });
  $('restartBtn').addEventListener('click', () => {
    Sound.play('click');
    const names = state.players.map((p) => p.name);
    const types = state.players.map((p) => (p.isAI ? 'ai' : 'human'));
    startGame(names, types);
  });
  $('newSetupBtn').addEventListener('click', () => {
    Sound.play('click');
    overOverlay.classList.add('hidden');
    gameScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
  });

  // sound toggle
  soundToggle.addEventListener('click', () => {
    Sound.enabled = !Sound.enabled;
    soundToggle.classList.toggle('muted', !Sound.enabled);
    soundToggle.setAttribute('aria-pressed', String(Sound.enabled));
    if (Sound.enabled) { Sound.init(); Sound.resume(); Sound.play('click'); }
  });
}

function renderNameInputs() {
  const list = $('nameList');
  list.innerHTML = '';
  // keep types array in sync with count
  while (playerTypes.length < chosenPlayerCount) playerTypes.push('human');
  if (playerTypes.length > chosenPlayerCount) playerTypes.length = chosenPlayerCount;
  for (let i = 0; i < chosenPlayerCount; i++) {
    const row = document.createElement('div');
    row.className = 'name-row';
    const inp = document.createElement('input');
    inp.className = 'name-input';
    inp.type = 'text';
    inp.maxLength = 14;
    inp.value = 'Player ' + (i + 1);
    inp.placeholder = 'Player ' + (i + 1);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'type-toggle' + (playerTypes[i] === 'ai' ? ' is-ai' : '');
    toggle.textContent = playerTypes[i] === 'ai' ? 'AI' : 'Human';
    toggle.addEventListener('click', () => {
      Sound.play('click');
      playerTypes[i] = playerTypes[i] === 'ai' ? 'human' : 'ai';
      renderNameInputs();
    });
    row.append(inp, toggle);
    list.appendChild(row);
  }
}

/* ============================================================
   START GAME
   ============================================================ */
function startGame(names, types) {
  const deck = buildDeck();
  const players = names.map((n, i) => ({ name: n, hand: [], calledUno: false, isAI: (types && types[i] === 'ai') }));

  // deal 7 each
  for (let r = 0; r < 7; r++) {
    for (const p of players) p.hand.push(deck.pop());
  }

  // starting discard: a number card on the light side
  let start = null;
  const rejected = [];
  while (deck.length) {
    const c = deck.pop();
    if (c.light.type === T.number) { start = c; break; }
    rejected.push(c);
  }
  // put rejected action cards back at bottom of the draw pile
  shuffle(rejected);
  rejected.forEach((c) => deck.unshift(c));
  if (!start) {
    start = { id: 'start', light: { color: 'red', type: T.number, value: 1 }, dark: { color: 'pink', type: T.number, value: 1 } };
  }

  state = {
    players,
    currentPlayer: 0,
    direction: 1,
    side: 'light',
    drawPile: deck,
    discardPile: [start],
    activeColor: start.light.color,
    phase: 'pass',
    justPlayed: null,
    drawnCardId: null,
    pendingWildCard: null,
    chosenColor: null,
    log: [],
  };

  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  overOverlay.classList.add('hidden');
  logEl.innerHTML = '';
  const aiCount = players.filter((p) => p.isAI).length;
  addLog('Game started — light side in play.' + (aiCount ? ` ${aiCount} AI opponent${aiCount > 1 ? 's' : ''}.` : ''));
  beginTurn();
}

/* ============================================================
   CORE HELPERS
   ============================================================ */
function activeFace(card) { return card[state.side]; }
function topCard() { return state.discardPile[state.discardPile.length - 1]; }
function isWild(t) { return t === T.wild || t === T.wildDrawTwo || t === T.wildDrawColor; }

function adv(steps) {
  const n = state.players.length;
  return ((state.currentPlayer + steps * state.direction) % n + n) % n;
}

function drawFor(playerIdx, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) recycle();
    if (state.drawPile.length === 0) break;
    const c = state.drawPile.pop();
    state.players[playerIdx].hand.push(c);
    out.push(c);
  }
  if (n > 0 && out.length) Sound.play('draw');
  if (state.players[playerIdx].hand.length > 1) state.players[playerIdx].calledUno = false;
  return out;
}

function recycle() {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile.pop();
  state.drawPile = shuffle(state.discardPile);
  state.discardPile = [top];
  addLog('Draw pile reshuffled.');
}

function drawUntilColor(playerIdx, color) {
  let count = 0;
  while (true) {
    if (state.drawPile.length === 0) recycle();
    if (state.drawPile.length === 0) break;
    const c = state.drawPile.pop();
    state.players[playerIdx].hand.push(c);
    count++;
    if (c[state.side].color === color) break; // wilds have color null -> never match
  }
  if (state.players[playerIdx].hand.length > 1) state.players[playerIdx].calledUno = false;
  addLog(`${state.players[playerIdx].name} drew ${count} card(s) until ${color}.`);
}

/* ---------- Move validation ---------- */
function canPlay(card) {
  const face = card[state.side];
  const tf = topCard()[state.side];
  if (isWild(face.type)) {
    if (face.type === T.wild) return true;
    // Wild Draw Two / Wild Draw Color: only if no card of active color in hand
    const hasColor = state.players[state.currentPlayer].hand.some((c) => c[state.side].color === state.activeColor);
    return !hasColor;
  }
  if (face.color === state.activeColor) return true;
  if (face.type === tf.type) {
    if (face.type === T.number) return face.value === tf.value;
    return true;
  }
  return false;
}

// After a voluntary draw, only the just-drawn card may be played (if playable).
function canPlayThisPhase(card) {
  if (state.phase === 'play') return canPlay(card);
  if (state.phase === 'drew') return card.id === state.drawnCardId && canPlay(card);
  return false;
}

/* ============================================================
   TURN FLOW
   ============================================================ */
function beginTurn() {
  state.drawnCardId = null;
  const cp = state.players[state.currentPlayer];
  if (cp.hand.length > 1) cp.calledUno = false;

  if (cp.isAI) {
    state.phase = 'ai';
    render();
    setTimeout(aiTurn, 750);
    return;
  }

  state.phase = 'pass';
  render();
  showPassOverlay();
}

function showPassOverlay() {
  const cp = state.players[state.currentPlayer];
  passTitle.textContent = `${cp.name}'s turn`;
  passSub.textContent = `Side in play: ${state.side.toUpperCase()} — hand the device to ${cp.name}.`;
  passOverlay.classList.remove('hidden');
}

function revealHand() {
  passOverlay.classList.add('hidden');
  state.phase = 'play';
  render();
}

/* ---------- AI ---------- */
const ATTACK_TYPES = [T.drawOne, T.drawFive, T.skip, T.skipEveryone, T.reverse, T.wildDrawTwo, T.wildDrawColor];

function aiTurn() {
  if (state.phase !== 'ai') return;
  const p = state.players[state.currentPlayer];
  if (p.hand.length === 2) p.calledUno = true; // AI always remembers to call UNO

  const playable = p.hand.filter(canPlay);
  if (playable.length) {
    playCard(aiPickCard(playable, p));
    return;
  }

  // must draw
  const drawn = doDraw();
  if (drawn && canPlay(drawn)) {
    setTimeout(() => playCard(drawn), 450);
  } else {
    state.drawnCardId = null;
    setTimeout(endTurn, 450);
  }
}

function aiPickCard(playable, p) {
  const nonWild = playable.filter((c) => !isWild(c[state.side].type));
  let pool = nonWild.length ? nonWild : playable;
  // if the next player is close to winning, prefer an attack card
  const nextCards = state.players[adv(1)].hand.length;
  if (nextCards <= 2) {
    const attacks = pool.filter((c) => ATTACK_TYPES.includes(c[state.side].type));
    if (attacks.length) pool = attacks;
  }
  // otherwise prefer the colour we hold the most of (keep flexibility)
  const colorCount = (col) => p.hand.filter((c) => c[state.side].color === col).length;
  pool.sort((a, b) => colorCount(b[state.side].color) - colorCount(a[state.side].color));
  return pool[0];
}

function aiPickColor(p) {
  const counts = {};
  for (const c of p.hand) {
    const col = c[state.side].color;
    if (col) counts[col] = (counts[col] || 0) + 1;
  }
  let best = null, bestN = -1;
  for (const col of SIDE_COLORS[state.side]) {
    const n = counts[col] || 0;
    if (n > bestN) { best = col; bestN = n; }
  }
  return best || SIDE_COLORS[state.side][0];
}

/* ---------- Play a card ---------- */
function playCard(card) {
  if (state.phase !== 'play' && state.phase !== 'drew' && state.phase !== 'ai') return;
  if (state.phase === 'drew' && card.id !== state.drawnCardId) return; // only the drawn card may be played
  if (!canPlay(card)) return;

  const p = state.players[state.currentPlayer];
  p.hand = p.hand.filter((c) => c.id !== card.id);
  state.discardPile.push(card);
  state.drawnCardId = null;
  const face = card[state.side];
  Sound.play('play');

  if (isWild(face.type)) {
    state.pendingWildCard = card;
    if (p.isAI) {
      // AI chooses its colour automatically
      const color = aiPickColor(p);
      onColorChosen(color, face.type);
    } else {
      openColorChooser(face.type);
    }
    return;
  }

  state.activeColor = face.color;
  addLog(`${p.name} played ${describeFace(face)}.`);
  afterCardPlayed(face);
}

function openColorChooser(wildType) {
  const colors = SIDE_COLORS[state.side];
  colorGrid.innerHTML = '';
  colors.forEach((col) => {
    const b = document.createElement('button');
    b.className = 'color-pick';
    b.dataset.color = col;
    b.textContent = col.charAt(0).toUpperCase() + col.slice(1);
    b.addEventListener('click', () => onColorChosen(col, wildType));
    colorGrid.appendChild(b);
  });
  colorOverlay.classList.remove('hidden');
}

function onColorChosen(color, wildType) {
  const p = state.players[state.currentPlayer];
  const card = state.pendingWildCard;
  state.pendingWildCard = null;
  state.chosenColor = color;
  state.activeColor = color;
  colorOverlay.classList.add('hidden');
  Sound.play('wild');
  addLog(`${p.name} played ${wildLabel(wildType)} and chose ${color}.`);
  afterCardPlayed(card[state.side]);
}

function afterCardPlayed(face) {
  state.justPlayed = face;
  const p = state.players[state.currentPlayer];

  // win?
  if (p.hand.length === 0) { endGame(p); return; }

  // uno?
  if (p.hand.length === 1 && !p.calledUno) {
    // penalty: forgot to call UNO
    drawFor(state.currentPlayer, 2);
    addLog(`${p.name} forgot to call UNO — drew 2 penalty cards.`);
  }

  endTurn();
}

/* ---------- Draw voluntarily ---------- */
function doDraw() {
  const drawn = drawFor(state.currentPlayer, 1);
  if (!drawn.length) { addLog('Draw pile empty.'); return null; }
  state.drawnCardId = drawn[0].id;
  state.phase = 'drew';
  const p = state.players[state.currentPlayer];
  addLog(`${p.name} drew a card.`);
  render();
  return drawn[0];
}

function playerDraw() {
  if (state.phase !== 'play') return;
  doDraw();
}

function endTurnFromDrew() {
  if (state.phase !== 'drew') return;
  state.drawnCardId = null;
  endTurn();
}

/* ---------- UNO call ---------- */
function callUno() {
  const p = state.players[state.currentPlayer];
  if (p.hand.length > 2) return;
  p.calledUno = true;
  Sound.play('uno');
  addLog(`${p.name} called UNO!`);
  render();
}

/* ============================================================
   END TURN — apply effect of the card just played (if any)
   ============================================================ */
function endTurn() {
  const face = state.justPlayed;
  const n = state.players.length;
  let newCurrent;

  if (!face) {
    // player only drew, no effect
    newCurrent = adv(1);
  } else {
    switch (face.type) {
      case T.drawOne:
        drawFor(adv(1), 1);
        addLog(`${state.players[adv(1)].name} draws 1 and is skipped.`);
        newCurrent = adv(2); break;
      case T.drawFive:
        drawFor(adv(1), 5);
        addLog(`${state.players[adv(1)].name} draws 5 and is skipped.`);
        newCurrent = adv(2); break;
      case T.skip:
        addLog(`${state.players[adv(1)].name} is skipped.`);
        newCurrent = adv(2); break;
      case T.skipEveryone:
        addLog(`Skip Everyone — ${state.players[state.currentPlayer].name} plays again.`);
        newCurrent = state.currentPlayer; break;
      case T.reverse:
        state.direction *= -1;
        addLog(`Reverse — direction is now ${state.direction === 1 ? 'clockwise' : 'counter-clockwise'}.`);
        newCurrent = adv(n === 2 ? 2 : 1); break;
      case T.flip:
        flipSide();
        addLog(`FLIP — now playing the ${state.side.toUpperCase()} side!`);
        newCurrent = adv(1); break;
      case T.wildDrawTwo:
        drawFor(adv(1), 2);
        addLog(`${state.players[adv(1)].name} draws 2 and is skipped.`);
        newCurrent = adv(2); break;
      case T.wildDrawColor:
        drawUntilColor(adv(1), state.chosenColor);
        addLog(`${state.players[adv(1)].name} is skipped.`);
        newCurrent = adv(2); break;
      default: // number or plain wild
        newCurrent = adv(1);
    }
  }

  state.currentPlayer = newCurrent;
  state.justPlayed = null;
  state.chosenColor = null;
  state.phase = 'pass';
  beginTurn();
}

function flipSide() {
  state.side = state.side === 'light' ? 'dark' : 'light';
  const f = topCard()[state.side];
  if (f.color) state.activeColor = f.color;
  Sound.play('flip');
  // visual flash
  const t = $('table');
  t.classList.remove('side-changed');
  void t.offsetWidth;
  t.classList.add('side-changed');
}

/* ============================================================
   GAME OVER
   ============================================================ */
function endGame(winner) {
  state.phase = 'over';
  winnerTitle.textContent = `${winner.name} wins!`;
  winnerSub.textContent = `${winner.name} emptied their hand on the ${state.side.toUpperCase()} side.`;
  addLog(`★ ${winner.name} wins the game!`);
  Sound.play('win');
  overOverlay.classList.remove('hidden');
  render();
}

/* ============================================================
   RENDERING
   ============================================================ */
function render() {
  // top bar
  sideIndicator.textContent = state.side.toUpperCase();
  sideIndicator.className = 'side-indicator ' + state.side;
  directionEl.textContent = state.direction === 1 ? '↻' : '↺';
  drawCountEl.textContent = 'Deck ' + state.drawPile.length;

  renderPlayers();
  renderDiscard();
  renderDrawPile();
  renderHand();
  renderActions();
}

function renderPlayers() {
  playersBar.innerHTML = '';
  state.players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (i === state.currentPlayer ? ' is-current' : '');
    const back = document.createElement('span');
    back.className = 'mini-back';
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = p.name;
    const count = document.createElement('span');
    count.className = 'pcards';
    count.textContent = p.hand.length + ' card' + (p.hand.length === 1 ? '' : 's');
    const ptype = document.createElement('span');
    ptype.className = 'ptype ' + (p.isAI ? 'ai' : 'human');
    ptype.textContent = p.isAI ? 'AI' : 'Human';
    chip.append(back, name, ptype, count);
    playersBar.appendChild(chip);
  });
}

function renderDiscard() {
  discardPileEl.innerHTML = '';
  const top = topCard();
  const cardEl = buildCardEl(top, state.side, false);
  cardEl.style.width = '100%';
  cardEl.style.height = '100%';
  discardPileEl.appendChild(cardEl);
}

function renderDrawPile() {
  drawPileEl.innerHTML = '';
  const back = document.createElement('div');
  back.className = 'card-back';
  back.style.width = '100%';
  back.style.height = '100%';
  drawPileEl.appendChild(back);
}

function renderHand() {
  const p = state.players[state.currentPlayer];
  // AI hands are never shown to humans
  if (p.isAI) {
    handEl.innerHTML = '';
    aiThinkingText.textContent = `${p.name} (AI) is thinking…`;
    aiThinking.classList.remove('hidden');
    return;
  }
  aiThinking.classList.add('hidden');
  handEl.innerHTML = '';
  // sort: playable first
  const cards = [...p.hand];
  const playable = (c) => canPlayThisPhase(c);
  cards.sort((a, b) => (playable(a) ? -1 : 0) - (playable(b) ? -1 : 0));

  cards.forEach((card) => {
    const slot = document.createElement('div');
    slot.className = 'card-slot';
    const isPlayable = playable(card);
    const isDrawn = state.phase === 'drew' && card.id === state.drawnCardId && canPlay(card);
    if (isPlayable && !isDrawn) slot.classList.add('is-playable');
    if (isDrawn) slot.classList.add('is-drawable', 'is-playable');
    if (!isPlayable && !isDrawn) slot.classList.add('is-dim');

    const cardEl = buildCardEl(card, state.side, true);
    cardEl.style.width = '100%';
    cardEl.style.height = '100%';
    slot.appendChild(cardEl);

    if (isPlayable) {
      slot.addEventListener('click', () => playCard(card));
    }
    handEl.appendChild(slot);
  });
}

function renderActions() {
  const p = state.players[state.currentPlayer];
  const isHumanTurn = !p.isAI;
  drawBtn.classList.toggle('hidden', !(state.phase === 'play' && isHumanTurn));
  endTurnBtn.classList.toggle('hidden', !(state.phase === 'drew' && isHumanTurn));
  const showUno = isHumanTurn && (state.phase === 'play' || state.phase === 'drew') && p.hand.length <= 2 && !p.calledUno;
  unoBtn.classList.toggle('hidden', !showUno);
}

/* ---------- Card element builder ---------- */
function buildCardEl(card, side, isHand) {
  const face = card[side];
  const el = document.createElement('div');
  el.className = 'card';

  const isWildCard = isWild(face.type);
  const ink = side === 'light' ? '#ffffff' : '#0a0a0a';
  const cHex = isWildCard ? '#15151c' : COLOR_HEX[face.color];

  el.style.setProperty('--ink', ink);
  el.style.setProperty('--c', cHex);

  // oval (hidden for wilds — they use the wild circle)
  if (!isWildCard) {
    const oval = document.createElement('div');
    oval.className = 'card-oval';
    el.appendChild(oval);
  }

  // corners
  const cornerLabel = cornerText(face);
  const tl = document.createElement('span');
  tl.className = 'card-corner tl';
  tl.innerHTML = cornerLabel;
  const br = document.createElement('span');
  br.className = 'card-corner br';
  br.innerHTML = cornerLabel;
  el.append(tl, br);

  // center
  const center = document.createElement('div');
  center.className = 'card-center';
  center.innerHTML = centerHTML(face, side);
  el.appendChild(center);

  return el;
}

function cornerText(face) {
  switch (face.type) {
    case T.number: return String(face.value);
    case T.drawOne: return '+1';
    case T.drawFive: return '+5';
    case T.skip: case T.skipEveryone: return '⊘';
    case T.reverse: return '⇄';
    case T.flip: return '⟲';
    case T.wild: return wildDotHTML();
    case T.wildDrawTwo: return wildDotHTML() + '<span style="font-size:0.7rem;margin-left:2px">+2</span>';
    case T.wildDrawColor: return wildDotHTML();
    default: return '';
  }
}

function wildDotHTML() {
  // small 4-colour dot using the currently active side's colours
  const colors = state && state.side === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const [a, b, c2, d] = colors;
  return `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;background:conic-gradient(var(--c-${a}) 0 25%,var(--c-${b}) 0 50%,var(--c-${c2}) 0 75%,var(--c-${d}) 0 100%);box-shadow:0 0 0 1px rgba(255,255,255,0.4)"></span>`;
}

function centerHTML(face, side) {
  const colors = side === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const [a, b, c2, d] = colors;
  const wildCircle = `<div class="wild-circle" style="--wc1:var(--c-${a});--wc2:var(--c-${b});--wc3:var(--c-${c2});--wc4:var(--c-${d})"></div>`;
  switch (face.type) {
    case T.number: return `<span class="big">${face.value}</span>`;
    case T.drawOne: return `<span class="big">+1</span>`;
    case T.drawFive: return `<span class="big">+5</span>`;
    case T.skip: return `<span class="big">⊘</span>`;
    case T.skipEveryone: return `<span class="big">⊘</span><span class="big tiny">ALL</span>`;
    case T.reverse: return `<span class="big">⇄</span>`;
    case T.flip: return `<span class="big small">FLIP</span>`;
    case T.wild: return wildCircle;
    case T.wildDrawTwo: return wildCircle.replace('></div>', `><span class="wc-overlay big">+2</span></div>`);
    case T.wildDrawColor: return wildCircle.replace('></div>', `><span class="wc-overlay">COLOR</span></div>`);
    default: return '';
  }
}

/* ---------- Describe face for log ---------- */
function describeFace(face) {
  if (face.type === T.number) return `${face.color} ${face.value}`;
  return `${face.color ? face.color + ' ' : ''}${wildLabel(face.type)}`;
}
function wildLabel(t) {
  switch (t) {
    case T.drawOne: return 'Draw One';
    case T.drawFive: return 'Draw Five';
    case T.skip: return 'Skip';
    case T.skipEveryone: return 'Skip Everyone';
    case T.reverse: return 'Reverse';
    case T.flip: return 'Flip';
    case T.wild: return 'Wild';
    case T.wildDrawTwo: return 'Wild Draw Two';
    case T.wildDrawColor: return 'Wild Draw Color';
    default: return t;
  }
}

/* ---------- Log ---------- */
function addLog(msg) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="turn">${state ? state.players[state.currentPlayer].name : ''}</span> ${msg}`;
  logEl.prepend(li);
  state && state.log.push(msg);
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
(function () {
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  let d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  r.setAttribute('data-theme', d);
  function syncIcon() {
    t.innerHTML = d === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  syncIcon();
  t && t.addEventListener('click', () => { d = d === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', d); syncIcon(); });
})();

/* ============================================================
   BOOT
   ============================================================ */
initSetup();
