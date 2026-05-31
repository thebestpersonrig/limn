const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

export class TicTacToeRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();   // id -> { id, name, symbol }
    this.phase = "lobby";       // lobby | playing | ended
    this.board = Array(9).fill("");
    this.currentTurn = "X";
    this.playerX = null;
    this.playerO = null;
    this.scores = { X: 0, O: 0, ties: 0 };
    this.round = 1;
    this.winner = null;
    this.winningLine = null;
    this.firstSymbol = "X";     // alternates each round
    this.rematchVotes = new Set();
  }

  addPlayer(id, name) {
    if (this.players.size >= 2) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };

    const symbol = this.players.size === 0 ? "X" : "O";
    this.players.set(id, { id, name, symbol });

    if (symbol === "X") this.playerX = id;
    else this.playerO = id;

    this.broadcast("ttt-room-state", this.getRoomState());
    return {};
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);

    if (this.phase === "playing") {
      // Other player wins by forfeit
      const remaining = [...this.players.values()][0];
      if (remaining) {
        this.winner = remaining.symbol;
        this.phase = "ended";
        this.broadcast("ttt-game-over", {
          winner: remaining.symbol,
          winnerName: remaining.name,
          board: this.board,
          winningLine: null,
          forfeit: true,
          scores: this.scores,
        });
      }
    }

    this.broadcast("ttt-room-state", this.getRoomState());
  }

  startGame() {
    if (this.players.size !== 2) return { error: "Need exactly 2 players." };

    this.phase = "playing";
    this.board = Array(9).fill("");
    this.currentTurn = this.firstSymbol;
    this.winner = null;
    this.winningLine = null;
    this.rematchVotes.clear();

    this.broadcastState();
  }

  makeMove(socketId, cellIndex) {
    if (this.phase !== "playing") return;
    if (cellIndex < 0 || cellIndex > 8) return;
    if (this.board[cellIndex] !== "") return;

    const player = this.players.get(socketId);
    if (!player) return;
    if (player.symbol !== this.currentTurn) return;

    this.board[cellIndex] = player.symbol;

    // Check win
    const result = this.checkResult();
    if (result.winner) {
      this.winner = result.winner;
      this.winningLine = result.line;

      if (result.winner === "Tie") {
        this.scores.ties++;
      } else {
        this.scores[result.winner]++;
      }

      this.broadcast("ttt-game-over", {
        winner: result.winner,
        winnerName: result.winner === "Tie" ? null : player.name,
        board: this.board,
        winningLine: result.line,
        forfeit: false,
        scores: this.scores,
      });
      return;
    }

    // Advance turn
    this.currentTurn = this.currentTurn === "X" ? "O" : "X";
    this.broadcastState();
  }

  requestRematch(socketId) {
    if (!this.winner) return;
    this.rematchVotes.add(socketId);

    if (this.rematchVotes.size >= 2) {
      this.round++;
      this.firstSymbol = this.firstSymbol === "X" ? "O" : "X";
      this.startGame();
    } else {
      this.broadcast("ttt-rematch-waiting", {
        from: this.players.get(socketId)?.name || "Opponent",
      });
    }
  }

  checkResult() {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        return { winner: this.board[a], line };
      }
    }
    if (this.board.every(c => c !== "")) {
      return { winner: "Tie", line: null };
    }
    return { winner: null, line: null };
  }

  broadcastState() {
    for (const p of this.players.values()) {
      this.io.to(p.id).emit("ttt-game-state", this.getPlayerState(p.id));
    }
  }

  getPlayerState(socketId) {
    const player = this.players.get(socketId);
    const opponent = [...this.players.values()].find(p => p.id !== socketId);
    return {
      board: this.board,
      mySymbol: player?.symbol || null,
      currentTurn: this.currentTurn,
      isMyTurn: player?.symbol === this.currentTurn,
      scores: this.scores,
      round: this.round,
      opponentName: opponent?.name || null,
      phase: this.phase,
      winner: this.winner,
      winningLine: this.winningLine,
    };
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, symbol: p.symbol })),
      round: this.round,
      scores: this.scores,
    };
  }

  isEmpty() { return this.players.size === 0; }

  broadcast(event, data) { this.io.to(this.code).emit(event, data); }
}
