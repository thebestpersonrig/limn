// ---------------------------------------------------------------------------
// ChessRoom -- server-side game state for a 2-player chess match
// ---------------------------------------------------------------------------
// The chess logic (move validation, check/checkmate) runs on the client.
// The server is authoritative on turn order, game phase, and relays moves.
// It trusts the client's move validation since both players run the same logic.
// ---------------------------------------------------------------------------

export class ChessRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();   // id -> { id, name, color, index }
    this.playerOrder = [];      // [whiteId, blackId]
    this.phase = "lobby";       // lobby | playing | ended

    this.moves = [];            // full move history [{ from, to, promoteTo, resultStatus }]
    this.currentTurn = "w";
    this.status = "playing";    // playing | check | checkmate | stalemate | draw
    this.winner = null;         // "w" | "b" | null

    this.drawOffer = null;      // player index who offered draw, or null
    this.scores = { w: 0, b: 0, draws: 0 };
    this.gameNumber = 1;
    this._forfeitTimers = new Map(); // id -> timeoutId
  }

  addPlayer(id, name) {
    if (this.players.size >= 2) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };

    const index = this.players.size;
    const color = index === 0 ? "w" : "b";
    this.players.set(id, { id, name, color, index, disconnected: false });
    this.playerOrder.push(id);

    this.broadcast("chess-room-state", this.getRoomState());
    return {};
  }

  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;
    this.broadcast("chess-player-disconnected", { playerId: id, name: player.name });

    if (this.phase === "playing") {
      // Give 30s to reconnect before forfeiting
      const timer = setTimeout(() => {
        if (player.disconnected && this.phase === "playing") {
          const remaining = [...this.players.values()].find(p => p.id !== id);
          if (remaining) {
            this.phase = "ended";
            this.status = "checkmate";
            this.winner = remaining.color;
            this.scores[remaining.color]++;
            this.broadcast("chess-game-over", {
              status: "forfeit",
              winner: remaining.color,
              winnerName: remaining.name,
              scores: { ...this.scores },
            });
          }
        }
        this._forfeitTimers.delete(id);
      }, 30000);
      this._forfeitTimers.set(id, timer);
    }

    this.broadcast("chess-room-state", this.getRoomState());
  }

  rejoinPlayer(newId, name) {
    for (const [oldId, player] of this.players) {
      if (player.name === name && player.disconnected) {
        clearTimeout(this._forfeitTimers.get(oldId));
        this._forfeitTimers.delete(oldId);

        this.players.delete(oldId);
        player.id = newId;
        player.disconnected = false;
        this.players.set(newId, player);

        const idx = this.playerOrder.indexOf(oldId);
        if (idx !== -1) this.playerOrder[idx] = newId;

        return { success: true };
      }
    }
    return { error: "No disconnected player found with that name." };
  }

  removePlayer(id) {
    clearTimeout(this._forfeitTimers.get(id));
    this._forfeitTimers.delete(id);

    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if (this.phase === "playing") {
      const remaining = [...this.players.values()][0];
      if (remaining) {
        this.phase = "ended";
        this.status = "checkmate";
        this.winner = remaining.color;
        this.scores[remaining.color]++;
        this.broadcast("chess-game-over", {
          status: "forfeit",
          winner: remaining.color,
          winnerName: remaining.name,
          scores: { ...this.scores },
        });
      }
    }

    this.broadcast("chess-room-state", this.getRoomState());
  }

  startGame() {
    if (this.players.size !== 2) return { error: "Need exactly 2 players." };

    this.phase = "playing";
    this.moves = [];
    this.currentTurn = "w";
    this.status = "playing";
    this.winner = null;
    this.drawOffer = null;

    for (const p of this.players.values()) {
      this.io.to(p.id).emit("chess-game-start", {
        myColor: p.color,
        myIndex: p.index,
        players: this.getPlayerList(),
        gameNumber: this.gameNumber,
        scores: { ...this.scores },
      });
    }
  }

  handleMove(socketId, { from, to, promoteTo, resultState }) {
    const player = this.players.get(socketId);
    if (!player || player.color !== this.currentTurn) return;
    if (this.phase !== "playing") return;

    this.moves.push({ from, to, promoteTo });
    this.currentTurn = this.currentTurn === "w" ? "b" : "w";
    this.status = resultState.status;
    this.winner = resultState.winner;

    // Relay the move to opponent
    const opponentId = this.playerOrder[player.index === 0 ? 1 : 0];
    if (opponentId) {
      this.io.to(opponentId).emit("chess-opponent-move", {
        from, to, promoteTo,
        status: resultState.status,
        winner: resultState.winner,
      });
    }

    // Broadcast updated status to both
    this.broadcast("chess-status", {
      turn: this.currentTurn,
      status: this.status,
      moveCount: this.moves.length,
    });

    // Check for game over
    if (this.status === "checkmate" || this.status === "stalemate" || this.status === "draw") {
      this.phase = "ended";
      if (this.status === "checkmate") {
        this.scores[this.winner]++;
      } else {
        this.scores.draws++;
      }

      this.broadcast("chess-game-over", {
        status: this.status,
        winner: this.winner,
        winnerName: this.winner ? this.players.get(this.playerOrder[this.winner === "w" ? 0 : 1])?.name : null,
        scores: { ...this.scores },
        moves: this.moves.length,
      });
    }

    // Clear draw offer on any move
    this.drawOffer = null;
  }

  handleResign(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    if (this.phase !== "playing") return;

    this.phase = "ended";
    this.status = "checkmate";
    const winnerColor = player.color === "w" ? "b" : "w";
    this.winner = winnerColor;
    this.scores[winnerColor]++;

    const winnerPlayer = [...this.players.values()].find(p => p.color === winnerColor);

    this.broadcast("chess-game-over", {
      status: "resignation",
      winner: winnerColor,
      winnerName: winnerPlayer?.name || "Opponent",
      scores: { ...this.scores },
      moves: this.moves.length,
    });
  }

  handleDrawOffer(socketId) {
    const player = this.players.get(socketId);
    if (!player || this.phase !== "playing") return;

    if (this.drawOffer === player.index) return; // already offered

    if (this.drawOffer !== null && this.drawOffer !== player.index) {
      // Opponent already offered -- accept
      this.phase = "ended";
      this.status = "draw";
      this.winner = null;
      this.scores.draws++;

      this.broadcast("chess-game-over", {
        status: "draw",
        winner: null,
        winnerName: null,
        scores: { ...this.scores },
        moves: this.moves.length,
      });
    } else {
      this.drawOffer = player.index;
      const opponentId = this.playerOrder[1 - player.index];
      if (opponentId) {
        this.io.to(opponentId).emit("chess-draw-offered", { from: player.name });
      }
    }
  }

  handleRematch(socketId) {
    if (this.phase !== "ended") return;
    if (this.players.size !== 2) return;
    // Swap colors
    for (const p of this.players.values()) {
      p.color = p.color === "w" ? "b" : "w";
    }
    this.gameNumber++;
    this.phase = "lobby";
    this.startGame();
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.getPlayerList(),
      turn: this.currentTurn,
      status: this.status,
      winner: this.winner,
      scores: { ...this.scores },
      gameNumber: this.gameNumber,
      moveCount: this.moves.length,
    };
  }

  getPlayerList() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      index: p.index,
    }));
  }

  isEmpty() {
    return this.players.size === 0 || [...this.players.values()].every(p => p.disconnected);
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  destroy() {
    for (const timer of this._forfeitTimers.values()) clearTimeout(timer);
    this._forfeitTimers.clear();
  }
}
