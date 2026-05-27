import { getRandomWords } from "./wordList.js";

const ROUND_DURATION = 80; // seconds
const ROUNDS_PER_GAME = 3;

export class GameRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map(); // socketId → Player
    this.state = "lobby"; // lobby | choosing | drawing | roundEnd | gameEnd
    this.currentDrawerId = null;
    this.currentWord = null;
    this.wordChoices = [];
    this.round = 0;
    this.drawerQueue = []; // ordered list of socket ids for this game
    this.timer = null;
    this.timeLeft = ROUND_DURATION;
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
      this.endRound(true); // drawer left, skip round
    }

    this.broadcast("room-state", this.getRoomState());
  }

  isEmpty() {
    return this.players.size === 0;
  }

  startGame() {
    if (this.players.size < 2) return { error: "Need at least 2 players." };
    this.round = 0;
    this.drawerQueue = [...this.players.keys()];
    shuffleArray(this.drawerQueue);
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.round > ROUNDS_PER_GAME * this.drawerQueue.length) {
      return this.endGame();
    }

    // Cycle through drawer queue
    const drawerIndex = (this.round - 1) % this.drawerQueue.length;
    this.currentDrawerId = this.drawerQueue[drawerIndex];

    // Reset guess flags
    for (const p of this.players.values()) {
      p.hasGuessedCorrectly = false;
      p.isDrawing = p.id === this.currentDrawerId;
    }

    this.wordChoices = getRandomWords(3);
    this.currentWord = null;
    this.state = "choosing";

    this.broadcast("round-start", {
      round: this.round,
      totalRounds: ROUNDS_PER_GAME * this.drawerQueue.length,
      drawerId: this.currentDrawerId,
      players: this.getPlayersArray(),
    });

    // Send word choices only to drawer
    this.io.to(this.currentDrawerId).emit("choose-word", { words: this.wordChoices });

    // Auto-pick after 15s if drawer doesn't choose
    this.choiceTimer = setTimeout(() => {
      if (!this.currentWord) this.wordChosen(this.wordChoices[0]);
    }, 15000);
  }

  wordChosen(word) {
    clearTimeout(this.choiceTimer);
    this.currentWord = word;
    this.state = "drawing";
    this.timeLeft = ROUND_DURATION;

    const hint = buildHint(word);

    // Tell drawer the real word; everyone else gets the hint
    this.io.to(this.currentDrawerId).emit("word-for-drawer", { word });
    this.broadcastExcept(this.currentDrawerId, "word-hint", { hint, length: word.length });
    this.broadcast("drawing-started", { drawerId: this.currentDrawerId });

    this.startTimer();
  }

  handleGuess(socketId, guess) {
    if (this.state !== "drawing") return;
    if (socketId === this.currentDrawerId) return;

    const player = this.players.get(socketId);
    if (!player || player.hasGuessedCorrectly) return;

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedWord = this.currentWord.toLowerCase();

    if (normalizedGuess === normalizedWord) {
      player.hasGuessedCorrectly = true;
      const timeBonus = Math.floor(this.timeLeft / ROUND_DURATION * 500);
      const basePoints = 300;
      player.score += basePoints + timeBonus;

      // Drawer earns points per correct guess
      const drawer = this.players.get(this.currentDrawerId);
      if (drawer) drawer.score += 50;

      this.broadcast("correct-guess", {
        playerId: socketId,
        name: player.name,
        players: this.getPlayersArray(),
      });

      // Check if everyone guessed
      const nonDrawers = [...this.players.values()].filter(p => !p.isDrawing);
      if (nonDrawers.every(p => p.hasGuessedCorrectly)) {
        this.endRound(false);
      }
    } else {
      // Broadcast as a chat message (wrong guess visible to all)
      this.broadcast("chat-message", { name: player.name, text: guess, playerId: socketId });
    }
  }

  endRound(skipReveal = false) {
    this.stopTimer();
    this.state = "roundEnd";

    this.broadcast("round-end", {
      word: this.currentWord,
      players: this.getPlayersArray(),
    });

    setTimeout(() => this.nextRound(), 4000);
  }

  endGame() {
    this.stopTimer();
    this.state = "gameEnd";
    this.broadcast("game-end", { players: this.getPlayersArray() });
  }

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.broadcast("timer-tick", { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) this.endRound(false);
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  broadcastExcept(excludeId, event, data) {
    this.io.to(this.code).except(excludeId).emit(event, data);
  }

  getRoomState() {
    return {
      code: this.code,
      state: this.state,
      round: this.round,
      players: this.getPlayersArray(),
      drawerId: this.currentDrawerId,
    };
  }

  getPlayersArray() {
    return [...this.players.values()].map(p => p.toJSON());
  }
}

function buildHint(word) {
  return word.split("").map(c => (c === " " ? " " : "_")).join(" ");
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
