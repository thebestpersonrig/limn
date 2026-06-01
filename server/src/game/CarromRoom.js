// ---------------------------------------------------------------------------
// CarromRoom -- server-side game state for a 2-player carrom match
// ---------------------------------------------------------------------------

export class CarromRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();        // id -> { id, name, color, index }
    this.playerOrder = [];           // [socketId, socketId]
    this.phase = "lobby";            // lobby | playing | ended

    // Board state
    this.pieces = [];                // synced from client after each shot
    this.currentTurn = 0;            // index into playerOrder
    this.pocketedCount = { white: 0, black: 0 };
    this.queenPocketed = false;
    this.queenCoveredBy = null;      // player index who covered it
    this.needsCover = null;          // player index who must cover, or null
    this.hasOpened = [false, false];  // pocketed at least one own piece
    this.owedPieces = [0, 0];        // foul debt

    // Match state
    this.matchScores = [0, 0];
    this.boardNumber = 1;
    this.targetScore = 25;
  }

  addPlayer(id, name) {
    if (this.players.size >= 2) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };

    const index = this.players.size;
    const color = index === 0 ? "white" : "black";
    this.players.set(id, { id, name, color, index, disconnected: false });
    this.playerOrder.push(id);

    this.broadcast("carr-room-state", this.getRoomState());
    return {};
  }

  // Mark disconnected but keep in map so they can rejoin with new socket id
  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;
    this.broadcast("carr-player-disconnected", { playerId: id, name: player.name });
    this.broadcast("carr-room-state", this.getRoomState());
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

        return { success: true };
      }
    }
    return { error: "No disconnected player found with that name." };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if (this.phase === "playing") {
      const remaining = [...this.players.values()][0];
      if (remaining) {
        this.phase = "ended";
        this.broadcast("carr-match-over", {
          winner: remaining.name,
          winnerIndex: remaining.index,
          matchScores: this.matchScores,
          forfeit: true,
        });
      }
    }

    this.broadcast("carr-room-state", this.getRoomState());
  }

  startGame() {
    if (this.players.size !== 2) return { error: "Need exactly 2 players." };

    this.phase = "playing";
    this.boardNumber = 1;
    this.matchScores = [0, 0];
    this.currentTurn = Math.random() < 0.5 ? 0 : 1;

    this.resetBoard();

    // Broadcast game start to each player
    for (const p of this.players.values()) {
      this.io.to(p.id).emit("carr-game-start", {
        pieces: this.pieces,
        turn: this.currentTurn,
        myColor: p.color,
        myIndex: p.index,
        boardNumber: this.boardNumber,
        matchScores: this.matchScores,
        players: this.getPlayerList(),
      });
    }
  }

  resetBoard() {
    this.pieces = [];
    this.pocketedCount = { white: 0, black: 0 };
    this.queenPocketed = false;
    this.queenCoveredBy = null;
    this.needsCover = null;
    this.hasOpened = [false, false];
    this.owedPieces = [0, 0];
    // pieces are initialized client-side and synced back on first shot result
    // server just tracks pocketed state and game logic
  }

  handleShot(socketId, { strikerX, angle, force }) {
    const player = this.players.get(socketId);
    if (!player || player.index !== this.currentTurn) return;
    if (this.phase !== "playing") return;

    // Broadcast to opponent for replay
    const opponentId = this.playerOrder[1 - this.currentTurn];
    if (opponentId) {
      this.io.to(opponentId).emit("carr-opponent-shot", { strikerX, angle, force });
    }
  }

  handleShotResult(socketId, { pocketedIds, finalPositions, strikerPocketed, noPieceHit }) {
    const player = this.players.get(socketId);
    if (!player || player.index !== this.currentTurn) return;
    if (this.phase !== "playing") return;

    const turnIdx = this.currentTurn;
    const myColor = player.color;
    const oppColor = myColor === "white" ? "black" : "white";
    const messages = [];

    // Update piece positions from client
    this.pieces = finalPositions;

    // Categorize pocketed pieces
    const pocketed = pocketedIds.map(id => {
      const piece = this.pieces.find(p => p.id === id);
      return piece ? { id, type: piece.type } : null;
    }).filter(Boolean);

    const ownPocketed = pocketed.filter(p => p.type === myColor);
    const oppPocketed = pocketed.filter(p => p.type === oppColor);
    const queenPocketedThisShot = pocketed.some(p => p.type === "queen");

    let foul = false;
    let continuation = false;

    // ---------------------------------------------------------------
    // Foul checks
    // ---------------------------------------------------------------
    if (strikerPocketed || noPieceHit) {
      foul = true;
      if (strikerPocketed) messages.push("Foul! Striker pocketed.");
      if (noPieceHit) messages.push("Foul! No piece was hit.");

      // Queen pocketed during foul -- return it
      if (queenPocketedThisShot) {
        this.returnQueen();
        messages.push("Queen returned to center.");
      }

      // All pocketed pieces during a foul shot return to center
      for (const p of pocketed) {
        if (p.type !== "queen") {
          this.returnPiece(p.id);
          if (p.type === myColor) {
            this.pocketedCount[myColor] = Math.max(0, this.pocketedCount[myColor] - 1);
          } else {
            this.pocketedCount[oppColor] = Math.max(0, this.pocketedCount[oppColor] - 1);
          }
        }
      }

      // Foul penalty: return one of player's pocketed pieces
      if (this.pocketedCount[myColor] > 0) {
        this.returnOnePocketed(myColor);
        this.pocketedCount[myColor]--;
        messages.push("Penalty: one of your pieces returned to board.");
      } else {
        this.owedPieces[turnIdx]++;
        messages.push("Penalty owed -- will apply when you pocket a piece.");
      }

    } else {
      // ---------------------------------------------------------------
      // No foul -- process pocketed pieces normally
      // ---------------------------------------------------------------

      // Check needsCover from previous shot first
      if (this.needsCover === turnIdx) {
        if (ownPocketed.length > 0) {
          // Successfully covered
          this.queenCoveredBy = turnIdx;
          this.needsCover = null;
          messages.push("Queen covered!");
        } else {
          // Failed to cover
          this.returnQueen();
          this.needsCover = null;
          messages.push("Failed to cover the queen -- returned to center.");
        }
      }

      // Process own pocketed pieces
      for (const p of ownPocketed) {
        this.pocketedCount[myColor]++;
        this.hasOpened[turnIdx] = true;

        // Apply owed penalty if any
        if (this.owedPieces[turnIdx] > 0) {
          this.owedPieces[turnIdx]--;
          this.returnPiece(p.id);
          this.pocketedCount[myColor]--;
          messages.push("Owed penalty applied -- pocketed piece returned.");
        }
      }

      // Process opponent pocketed pieces (credited to opponent)
      for (const p of oppPocketed) {
        this.pocketedCount[oppColor]++;
        const oppIdx = 1 - turnIdx;
        this.hasOpened[oppIdx] = true;
      }
      if (oppPocketed.length > 0) {
        messages.push(`Opponent's piece pocketed -- credited to opponent.`);
      }

      // Process queen
      if (queenPocketedThisShot && this.needsCover === null) {
        if (!this.hasOpened[turnIdx]) {
          // Cannot pocket queen before opening
          this.returnQueen();
          messages.push("Cannot pocket queen before opening. Queen returned.");
        } else if (ownPocketed.length > 0) {
          // Queen + own piece in same shot = covered immediately
          this.queenPocketed = true;
          this.queenCoveredBy = turnIdx;
          messages.push("Queen pocketed and covered!");
        } else {
          // Queen pocketed, must cover next shot
          this.queenPocketed = true;
          this.needsCover = turnIdx;
          messages.push("Queen pocketed! Must cover it next shot.");
        }
      }

      // Determine continuation
      if (ownPocketed.length > 0) {
        continuation = true;
        messages.push("Continuation -- your turn again!");
      }
    }

    // Advance turn
    if (foul || !continuation) {
      this.currentTurn = 1 - this.currentTurn;

      // If needsCover was set and turn passes to same player, keep it
      // If turn passes to other player, needsCover should have been resolved above
      // But if foul happened on covering shot, queen already returned
    }

    // ---------------------------------------------------------------
    // Check board end
    // ---------------------------------------------------------------
    let boardEnd = null;
    const boardWinner = this.checkBoardEnd();

    if (boardWinner !== null) {
      const loserIdx = 1 - boardWinner;
      const loserColor = boardWinner === 0 ? "black" : "white";
      const loserRemaining = 9 - this.pocketedCount[loserColor];
      let boardScore = loserRemaining;

      // Queen bonus: only if winner covered queen AND loser has 4+ pieces remaining
      let queenBonus = 0;
      if (this.queenCoveredBy === boardWinner && loserRemaining >= 4) {
        queenBonus = 5;
      }

      boardScore += queenBonus;
      this.matchScores[boardWinner] += boardScore;

      boardEnd = {
        winnerIndex: boardWinner,
        winnerName: this.players.get(this.playerOrder[boardWinner])?.name,
        boardScore,
        queenBonus,
        loserRemaining,
        matchScores: [...this.matchScores],
      };

      // Check match end
      if (this.matchScores[boardWinner] >= this.targetScore) {
        this.phase = "ended";
        this.broadcast("carr-match-over", {
          winner: boardEnd.winnerName,
          winnerIndex: boardWinner,
          matchScores: [...this.matchScores],
          forfeit: false,
        });
        return;
      }

      // Start new board
      this.boardNumber++;
      this.currentTurn = loserIdx; // loser of board breaks next
      this.resetBoard();
    }

    // Broadcast turn result
    this.broadcast("carr-turn-result", {
      turn: this.currentTurn,
      pocketedCount: { ...this.pocketedCount },
      matchScores: [...this.matchScores],
      messages,
      pieces: this.pieces,
      needsCover: this.needsCover,
      foul,
      continuation,
      boardEnd,
      boardNumber: this.boardNumber,
      hasOpened: [...this.hasOpened],
      owedPieces: [...this.owedPieces],
    });
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  returnQueen() {
    const q = this.pieces.find(p => p.type === "queen");
    if (q) {
      q.pocketed = false;
      q.x = 350;
      q.y = 350;
    }
    this.queenPocketed = false;
  }

  returnPiece(pieceId) {
    const p = this.pieces.find(pc => pc.id === pieceId);
    if (p) {
      p.pocketed = false;
      // Place near center -- find open spot
      const occupied = this.pieces.filter(pc => !pc.pocketed && pc.id !== pieceId);
      const spot = this.findOpenSpot(occupied);
      p.x = spot.x;
      p.y = spot.y;
    }
  }

  returnOnePocketed(color) {
    // Find a pocketed piece of the given color and return it to the board
    const piece = this.pieces.find(p => p.pocketed && p.type === color);
    if (piece) {
      this.returnPiece(piece.id);
    }
  }

  findOpenSpot(occupied) {
    const cx = 350, cy = 350;
    function isFree(x, y) {
      for (const p of occupied) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < 30 * 30) return false;
      }
      return true;
    }
    if (isFree(cx, cy)) return { x: cx, y: cy };
    for (let r = 30; r < 120; r += 25) {
      for (let a = 0; a < 360; a += 30) {
        const x = cx + r * Math.cos(a * Math.PI / 180);
        const y = cy + r * Math.sin(a * Math.PI / 180);
        if (isFree(x, y)) return { x, y };
      }
    }
    return { x: cx + 40, y: cy + 40 };
  }

  checkBoardEnd() {
    // Board ends when all 9 of a player's color are pocketed
    // But if queen has not been covered, the last piece returns
    if (this.pocketedCount.white >= 9) {
      // Player 0 (white) wins the board
      if (!this.queenPocketed || this.queenCoveredBy === null) {
        // Queen not yet covered -- last piece returns, play continues
        // Actually, the rule is: queen must be pocketed and covered at some point
        // If neither player covered it, game continues
        // For simplicity: board can end without queen being covered if all pieces are in
        // The queen just does not award bonus points
      }
      return 0;
    }
    if (this.pocketedCount.black >= 9) {
      return 1;
    }
    return null;
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.getPlayerList(),
      pieces: this.pieces,
      turn: this.currentTurn,
      pocketedCount: { ...this.pocketedCount },
      matchScores: [...this.matchScores],
      boardNumber: this.boardNumber,
      needsCover: this.needsCover,
      hasOpened: [...this.hasOpened],
      owedPieces: [...this.owedPieces],
      queenPocketed: this.queenPocketed,
      queenCoveredBy: this.queenCoveredBy,
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
    return this.players.size === 0;
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }
}
