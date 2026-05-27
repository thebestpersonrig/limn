import { getRandomWords } from "./wordList.js";
import { MAX_GUESSES } from "./Player.js";

const DEFAULT_DURATION = 80;
const DEFAULT_ROUNDS = 3;

export class GameRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.state = "lobby";
    this.currentDrawerId = null;
    this.currentWord = null;
    this.wordChoices = [];
    this.round = 0;
    this.drawerQueue = [];
    this.timer = null;
    this.choiceTimer = null;
    this.timeLeft = DEFAULT_DURATION;
    this.roundDuration = DEFAULT_DURATION;
    this.roundsPerGame = DEFAULT_ROUNDS;
    this.revealedIndices = [];
  }

  addPlayer(player) {
    this.players.set(player.id, player);
    this.broadcast("room-state", this.getRoomState());
    this.broadcast("player-joined", { player: player.toJSON() });
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.broadcast("player-left", { playerId: socketId, name: player.name });

    if (this.state !== "lobby" && socketId === this.currentDrawerId) {
      this.endRound(true);
    }

    this.broadcast("room-state", this.getRoomState());
  }

  isEmpty() { return this.players.size === 0; }

  startGame(settings = {}) {
    if (this.players.size < 2) return { error: "Need at least 2 players." };
    this.roundsPerGame = settings.rounds ?? DEFAULT_ROUNDS;
    this.roundDuration = settings.timer ?? DEFAULT_DURATION;
    this.round = 0;
    this.drawerQueue = [...this.players.keys()];
    shuffleArray(this.drawerQueue);
    this.nextRound();
  }

  nextRound() {
    this.round++;
    const totalRounds = this.roundsPerGame * this.drawerQueue.length;
    if (this.round > totalRounds) return this.endGame();

    const drawerIndex = (this.round - 1) % this.drawerQueue.length;
    this.currentDrawerId = this.drawerQueue[drawerIndex];

    for (const p of this.players.values()) {
      p.hasGuessedCorrectly = false;
      p.guessesUsed = 0;
      p.isDrawing = p.id === this.currentDrawerId;
    }

    this.wordChoices = getRandomWords();
    this.currentWord = null;
    this.state = "choosing";

    const base = {
      round: this.round,
      totalRounds,
      roundDuration: this.roundDuration,
      drawerId: this.currentDrawerId,
      players: this.getPlayersArray(),
    };

    this.io.to(this.currentDrawerId).emit("round-start", { ...base, wordChoices: this.wordChoices });
    this.broadcastExcept(this.currentDrawerId, "round-start", base);

    this.choiceTimer = setTimeout(() => {
      if (!this.currentWord) this.wordChosen(this.wordChoices[0]);
    }, 15000);
  }

  wordChosen(word) {
    clearTimeout(this.choiceTimer);
    this.currentWord = word;
    this.state = "drawing";
    this.timeLeft = this.roundDuration;
    this.revealedIndices = [];

    this.io.to(this.currentDrawerId).emit("word-for-drawer", { word });
    this.broadcastExcept(this.currentDrawerId, "word-hint", { hint: buildHint(word) });
    this.broadcast("drawing-started", { drawerId: this.currentDrawerId });
    this.startTimer();
  }

  handleGuess(socketId, guess) {
    if (this.state !== "drawing") return;
    if (socketId === this.currentDrawerId) return;

    const player = this.players.get(socketId);
    if (!player || player.hasGuessedCorrectly || player.guessesLeft <= 0) return;

    player.guessesUsed++;

    if (guess.trim().toLowerCase() === this.currentWord.toLowerCase()) {
      player.hasGuessedCorrectly = true;
      // 50–500 pts depending on how early the guess was
      player.score += Math.round(50 + (this.timeLeft / this.roundDuration) * 450);

      const drawer = this.players.get(this.currentDrawerId);
      if (drawer) drawer.score += 50;

      this.broadcast("correct-guess", {
        playerId: socketId,
        name: player.name,
        players: this.getPlayersArray(),
      });

      const nonDrawers = [...this.players.values()].filter(p => !p.isDrawing);
      if (nonDrawers.every(p => p.hasGuessedCorrectly)) this.endRound(false);
    } else {
      const close = levenshtein(normalizedGuess, normalizedWord) === 1;
      this.broadcast("guess-attempt", {
        playerId: socketId,
        name: player.name,
        text: guess,
        guessesLeft: player.guessesLeft,
        close,
      });
    }
  }

  handleChat(socketId, text) {
    if (socketId === this.currentDrawerId) return;
    const player = this.players.get(socketId);
    if (!player || !text.trim()) return;
    this.broadcast("chat-message", { name: player.name, text: text.trim(), playerId: socketId });
  }

  endRound() {
    this.stopTimer();
    this.state = "roundEnd";
    this.broadcast("round-end", { word: this.currentWord, players: this.getPlayersArray() });
    setTimeout(() => this.nextRound(), 4000);
  }

  endGame() {
    this.stopTimer();
    this.state = "gameEnd";
    this.broadcast("game-end", { players: this.getPlayersArray() });
  }

  startTimer() {
    this.stopTimer();
    const half    = Math.floor(this.roundDuration / 2);
    const quarter = Math.floor(this.roundDuration / 4);

    this.timer = setInterval(() => {
      this.timeLeft--;
      this.broadcast("timer-tick", { timeLeft: this.timeLeft });

      if (this.timeLeft === half)    this.revealNextLetter();
      if (this.timeLeft === quarter) this.revealNextLetter();

      if (this.timeLeft <= 0) this.endRound();
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  revealNextLetter() {
    if (!this.currentWord) return;
    const eligible = [];
    this.currentWord.split("").forEach((c, i) => {
      if (c !== " " && !this.revealedIndices.includes(i)) eligible.push(i);
    });
    if (eligible.length === 0) return;
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    this.revealedIndices.push(pick);
    const hint = buildHintWithReveals(this.currentWord, this.revealedIndices);
    this.broadcastExcept(this.currentDrawerId, "word-hint", { hint });
  }

  broadcast(event, data)              { this.io.to(this.code).emit(event, data); }
  broadcastExcept(id, event, data)    { this.io.to(this.code).except(id).emit(event, data); }

  getRoomState() {
    return {
      code: this.code,
      state: this.state,
      round: this.round,
      players: this.getPlayersArray(),
      drawerId: this.currentDrawerId,
      roundDuration: this.roundDuration,
      roundsPerGame: this.roundsPerGame,
    };
  }

  getPlayersArray() {
    return [...this.players.values()].map(p => p.toJSON());
  }
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function buildHint(word) {
  return word.split("").map(c => c === " " ? " " : "_").join(" ");
}

function buildHintWithReveals(word, revealed) {
  return word.split("").map((c, i) => {
    if (c === " ") return " ";
    return revealed.includes(i) ? c : "_";
  }).join(" ");
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
