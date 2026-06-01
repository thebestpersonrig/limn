export class HangmanRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();         // id -> { id, name, disconnected }
    this.playerOrder = [];            // ordered ids
    this.phase = "lobby";             // lobby | picking | guessing | roundEnd | ended
    this.currentPickerIndex = 0;
    this.secretWord = "";
    this.hint = "";
    this.revealedLetters = new Set();
    this.wrongLetters = new Set();
    this.maxWrong = 6;
    this.scores = new Map();          // id -> points
    this.round = 0;
    this.totalRounds = 0;
    this.timer = null;
    this.timeLeft = 0;
  }

  addPlayer(id, name) {
    if (this.players.size >= 6) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };
    this.players.set(id, { id, name, disconnected: false });
    this.scores.set(id, 0);
    this.broadcast("hang-room-state", this.getRoomState());
    return {};
  }

  // Mark disconnected but keep in map so they can rejoin with new socket id
  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;

    if (this.phase !== "lobby" && this.phase !== "ended") {
      // If the active picker disconnects, auto-advance after 15s if they haven't reconnected
      const currentPicker = this.playerOrder[this.currentPickerIndex];
      if (currentPicker === id) {
        setTimeout(() => {
          try {
            if (this.players.get(id)?.disconnected) {
              this._advancePickerOrEnd();
            }
          } catch (err) { console.error("[HangmanRoom picker timeout]", err); }
        }, 15000);
      }
    }

    this.broadcast("hang-player-disconnected", { playerId: id, name: player.name });
    this.broadcast("hang-room-state", this.getRoomState());
  }

  // Restore a disconnected player by name, updating their socket id
  rejoinPlayer(newId, name) {
    for (const [oldId, player] of this.players) {
      if (player.name === name && player.disconnected) {
        this.players.delete(oldId);
        player.id = newId;
        player.disconnected = false;
        this.players.set(newId, player);

        const idx = this.playerOrder.indexOf(oldId);
        if (idx !== -1) this.playerOrder[idx] = newId;

        const score = this.scores.get(oldId) ?? 0;
        this.scores.delete(oldId);
        this.scores.set(newId, score);

        return { success: true };
      }
    }
    return { error: "No disconnected player found with that name." };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    // Capture whether this player is the current picker BEFORE modifying playerOrder
    const currentPicker = this.playerOrder[this.currentPickerIndex];
    const wasCurrentPicker = currentPicker === id;

    this.players.delete(id);
    this.scores.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if (this.phase !== "lobby" && this.phase !== "ended") {
      if (this.playerOrder.length < 2) {
        this.endGame();
        return;
      }
      if (wasCurrentPicker) {
        this._advancePickerOrEnd();
        return; // _advancePickerOrEnd broadcasts
      }
    }

    this.broadcast("hang-room-state", this.getRoomState());
  }

  _advancePickerOrEnd() {
    if (this.currentPickerIndex >= this.playerOrder.length) {
      this.currentPickerIndex = 0;
    }
    // One fewer picker means one fewer total round
    this.totalRounds = Math.max(this.totalRounds - 1, this.round);
    if (this.round >= this.totalRounds) {
      this.endGame();
    } else {
      this.startPickPhase();
    }
  }

  isEmpty() { return this.players.size === 0; }

  startGame() {
    if (this.players.size < 2) return { error: "Need at least 2 players." };

    this.playerOrder = [...this.players.keys()];
    shuffleArray(this.playerOrder);
    this.totalRounds = this.playerOrder.length;
    this.round = 0;
    this.currentPickerIndex = 0;

    for (const id of this.players.keys()) this.scores.set(id, 0);

    this.startPickPhase();
  }

  startPickPhase() {
    this.round++;
    this.phase = "picking";
    this.secretWord = "";
    this.hint = "";
    this.revealedLetters.clear();
    this.wrongLetters.clear();
    this.stopTimer();

    const pickerId = this.playerOrder[this.currentPickerIndex];
    const picker = this.players.get(pickerId);

    this.broadcast("hang-phase", {
      phase: "picking",
      round: this.round,
      totalRounds: this.totalRounds,
      pickerName: picker?.name || "Someone",
      pickerId,
    });

    this.timeLeft = 60;
    this.startTimer(() => {
      if (!this.secretWord) {
        this.submitWord(pickerId, "HANGMAN", "");
      }
    });
  }

  submitWord(socketId, word, hint) {
    if (this.phase !== "picking") return;
    const pickerId = this.playerOrder[this.currentPickerIndex];
    if (socketId !== pickerId) return;

    const cleaned = word.toUpperCase().trim();
    if (cleaned.length < 2 || cleaned.length > 30) return;
    if (!/^[A-Z\s\-]+$/.test(cleaned)) return;

    this.secretWord = cleaned;
    this.hint = (hint || "").trim().slice(0, 60);
    this.stopTimer();

    for (const ch of this.secretWord) {
      if (!/[A-Z]/.test(ch)) this.revealedLetters.add(ch);
    }

    this.phase = "guessing";
    this.timeLeft = 0;

    const blanks = this.getBlanks();
    const pickerName = this.players.get(pickerId)?.name || "Someone";

    this.broadcast("hang-phase", {
      phase: "guessing",
      round: this.round,
      totalRounds: this.totalRounds,
      blanks,
      hint: this.hint,
      pickerName,
      pickerId,
      wrongLetters: [],
      stage: 0,
    });
  }

  guessLetter(socketId, letter) {
    if (this.phase !== "guessing") return;
    const pickerId = this.playerOrder[this.currentPickerIndex];
    if (socketId === pickerId) return;

    const ch = letter.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    if (this.revealedLetters.has(ch) || this.wrongLetters.has(ch)) return;

    const guesser = this.players.get(socketId);
    const guesserName = guesser?.name || "Someone";

    if (this.secretWord.includes(ch)) {
      this.revealedLetters.add(ch);
      const count = [...this.secretWord].filter(c => c === ch).length;
      const points = count * 100;
      this.scores.set(socketId, (this.scores.get(socketId) || 0) + points);

      this.broadcast("hang-letter-result", {
        letter: ch,
        correct: true,
        blanks: this.getBlanks(),
        wrongLetters: [...this.wrongLetters],
        guesserName,
        points,
        stage: this.wrongLetters.size,
      });

      if (this.isWordRevealed()) {
        this.resolveRound(true);
      }
    } else {
      this.wrongLetters.add(ch);

      this.broadcast("hang-letter-result", {
        letter: ch,
        correct: false,
        blanks: this.getBlanks(),
        wrongLetters: [...this.wrongLetters],
        guesserName,
        points: 0,
        stage: this.wrongLetters.size,
      });

      if (this.wrongLetters.size >= this.maxWrong) {
        this.resolveRound(false);
      }
    }
  }

  resolveRound(won) {
    this.phase = "roundEnd";
    this.stopTimer();

    if (won) {
      for (const [id] of this.players) {
        if (id !== this.playerOrder[this.currentPickerIndex]) {
          this.scores.set(id, (this.scores.get(id) || 0) + 200);
        }
      }
    }

    this.broadcast("hang-round-end", {
      won,
      word: this.secretWord,
      scores: this.getScoresList(),
      round: this.round,
      totalRounds: this.totalRounds,
    });

    setTimeout(() => {
      try {
        this.currentPickerIndex++;
        if (this.currentPickerIndex >= this.playerOrder.length || this.round >= this.totalRounds) {
          this.endGame();
        } else {
          this.startPickPhase();
        }
      } catch (err) { console.error("[HangmanRoom error]", err); }
    }, 5000);
  }

  endGame() {
    this.phase = "ended";
    this.stopTimer();

    const scoresList = this.getScoresList();
    const winner = scoresList.length > 0 ? scoresList[0] : null;

    this.broadcast("hang-game-end", { finalScores: scoresList, winner });
  }

  getBlanks() {
    return [...this.secretWord].map(ch => {
      if (this.revealedLetters.has(ch)) return ch;
      if (!/[A-Z]/.test(ch)) return ch;
      return "_";
    }).join("");
  }

  isWordRevealed() {
    for (const ch of this.secretWord) {
      if (/[A-Z]/.test(ch) && !this.revealedLetters.has(ch)) return false;
    }
    return true;
  }

  getScoresList() {
    return [...this.scores.entries()]
      .map(([id, points]) => ({
        id,
        name: this.players.get(id)?.name || "Player",
        points,
      }))
      .sort((a, b) => b.points - a.points);
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, disconnected: p.disconnected,
      })),
      scores: this.getScoresList(),
      round: this.round,
      totalRounds: this.totalRounds,
    };
  }

  startTimer(onExpire) {
    this.stopTimer();
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.broadcast("hang-timer-tick", { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) {
        this.stopTimer();
        try { onExpire(); }
        catch (err) { console.error("[HangmanRoom timer error]", err); }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  broadcast(event, data) { this.io.to(this.code).emit(event, data); }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
