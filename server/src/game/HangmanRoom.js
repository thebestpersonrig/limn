export class HangmanRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();         // id -> { id, name }
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
    this.players.set(id, { id, name });
    this.scores.set(id, 0);
    this.broadcast("hang-room-state", this.getRoomState());
    return {};
  }

  removePlayer(id) {
    this.players.delete(id);
    this.scores.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if (this.phase !== "lobby" && this.phase !== "ended") {
      // If the current picker left, skip to next round
      if (this.playerOrder.length < 2) {
        this.endGame();
        return;
      }
      const currentPicker = this.playerOrder[this.currentPickerIndex];
      if (!this.players.has(currentPicker)) {
        // Adjust index
        if (this.currentPickerIndex >= this.playerOrder.length) {
          this.currentPickerIndex = 0;
        }
        this.totalRounds = this.playerOrder.length;
        if (this.round >= this.totalRounds) {
          this.endGame();
        } else {
          this.startPickPhase();
        }
      }
    }

    this.broadcast("hang-room-state", this.getRoomState());
  }

  isEmpty() { return this.players.size === 0; }

  startGame() {
    if (this.players.size < 2) return { error: "Need at least 2 players." };

    this.playerOrder = [...this.players.keys()];
    shuffleArray(this.playerOrder);
    this.totalRounds = this.playerOrder.length;
    this.round = 0;
    this.currentPickerIndex = 0;

    // Reset scores
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

    // Give picker 60s to choose a word
    this.timeLeft = 60;
    this.startTimer(() => {
      // Auto-pick a default word if time runs out
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
    // Allow only letters, spaces, hyphens
    if (!/^[A-Z\s\-]+$/.test(cleaned)) return;

    this.secretWord = cleaned;
    this.hint = (hint || "").trim().slice(0, 60);
    this.stopTimer();

    // Auto-reveal non-letter chars (spaces, hyphens)
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
    if (socketId === pickerId) return; // picker can't guess

    const ch = letter.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    if (this.revealedLetters.has(ch) || this.wrongLetters.has(ch)) return;

    const guesser = this.players.get(socketId);
    const guesserName = guesser?.name || "Someone";

    if (this.secretWord.includes(ch)) {
      this.revealedLetters.add(ch);
      // Award points
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

      // Check win
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

      // Check loss
      if (this.wrongLetters.size >= this.maxWrong) {
        this.resolveRound(false);
      }
    }
  }

  resolveRound(won) {
    this.phase = "roundEnd";
    this.stopTimer();

    // Bonus points for winning
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

    // Advance to next picker or end game
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

    this.broadcast("hang-game-end", {
      finalScores: scoresList,
      winner,
    });
  }

  // Helpers
  getBlanks() {
    return [...this.secretWord].map(ch => {
      if (this.revealedLetters.has(ch)) return ch;
      if (!/[A-Z]/.test(ch)) return ch; // spaces, hyphens shown
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
      players: [...this.players.values()],
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
