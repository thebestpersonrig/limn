const SHIPS = [
  { type: "carrier",    size: 5 },
  { type: "battleship", size: 4 },
  { type: "cruiser",    size: 3 },
  { type: "submarine",  size: 3 },
  { type: "destroyer",  size: 2 },
];

const ABILITY_USES = {
  carrier: 1,       // Airstrike
  battleship: 2,    // Barrage
  cruiser: 4,       // Volley
  submarine: Infinity, // Sonar
  destroyer: 0,     // none
};

function emptyGrid() {
  return Array.from({ length: 10 }, () => Array(10).fill(null));
}

export class BattleshipRoom {
  constructor(code, io, mode = "classic") {
    this.code = code;
    this.io = io;
    this.mode = mode; // "classic" | "advanced"
    this.players = new Map(); // socketId -> player
    this.playerOrder = [];    // [socketId, socketId] insertion order
    this.phase = "lobby";     // lobby | placing | playing | ended
    this.turn = null;
    this.shotsRemaining = 0;
    this.abilityUsedThisTurn = false;
    this.winner = null;
    this.chat = [];           // [{sender, text, timestamp}]
  }

  // ── Players ────────────────────────────────────

  addPlayer(id, name) {
    if (this.players.size >= 2) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already started." };

    const player = {
      id,
      name,
      board: emptyGrid(),
      ships: [],
      ready: false,
      abilities: {},
      shotsReceived: emptyGrid(), // tracks what opponent fired at me
    };

    this.players.set(id, player);
    this.playerOrder.push(id);

    this.broadcast("battleship-room-state", this.getRoomState());
    this.broadcast("battleship-player-joined", { player: { id, name } });

    return {};
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if (this.phase === "playing" || this.phase === "placing") {
      // Forfeit -- other player wins
      const remaining = this.playerOrder[0];
      if (remaining) {
        this.winner = remaining;
        this.phase = "ended";
        const winnerPlayer = this.players.get(remaining);
        this.broadcast("battleship-game-over", {
          winnerId: remaining,
          winnerName: winnerPlayer?.name || "Unknown",
          reason: "forfeit",
        });
      }
    }

    this.broadcast("battleship-player-left", { playerId: id, name: player.name });
    this.broadcast("battleship-room-state", this.getRoomState());
  }

  isEmpty() { return this.players.size === 0; }

  // ── Game flow ──────────────────────────────────

  startGame(hostId) {
    if (this.playerOrder[0] !== hostId) return { error: "Only the host can start." };
    if (this.players.size !== 2) return { error: "Need exactly 2 players." };

    this.phase = "placing";
    for (const [, p] of this.players) {
      p.ready = false;
      p.board = emptyGrid();
      p.ships = [];
      p.abilities = {};
    }

    this.broadcast("battleship-phase", { phase: "placing", mode: this.mode });
    this.sendStateToAll();
    return {};
  }

  placeShips(id, ships) {
    if (this.phase !== "placing") return { error: "Not in placement phase." };
    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };
    if (player.ready) return { error: "Already placed ships." };

    const err = this.validateShips(ships);
    if (err) return { error: err };

    // Write ships onto board
    player.board = emptyGrid();
    player.ships = ships.map(s => ({
      type: s.type,
      size: s.cells.length,
      cells: s.cells.map(c => ({ r: c.r, c: c.c })),
      sunk: false,
    }));

    for (const ship of player.ships) {
      for (const cell of ship.cells) {
        player.board[cell.r][cell.c] = "ship";
      }
    }

    // Set abilities for advanced mode
    if (this.mode === "advanced") {
      player.abilities = {};
      for (const ship of player.ships) {
        player.abilities[ship.type] = ABILITY_USES[ship.type] ?? 0;
      }
    }

    player.ready = true;

    // Check if both ready
    const allReady = [...this.players.values()].every(p => p.ready);
    if (allReady) {
      this.phase = "playing";
      this.turn = this.playerOrder[0]; // host goes first
      this.shotsRemaining = this.mode === "advanced" ? 3 : 1;
      this.broadcast("battleship-phase", { phase: "playing", turn: this.turn, mode: this.mode });
    } else {
      this.sendToPlayer(id, "battleship-ready-ack", {});
    }

    this.sendStateToAll();
    return {};
  }

  // ── Firing ─────────────────────────────────────

  fire(id, row, col) {
    if (this.phase !== "playing") return { error: "Game not in progress." };
    if (this.turn !== id) return { error: "Not your turn." };
    if (row < 0 || row > 9 || col < 0 || col > 9) return { error: "Out of bounds." };

    const opponent = this.getOpponent(id);
    if (!opponent) return { error: "No opponent." };

    // Check already fired
    if (opponent.shotsReceived[row][col] !== null) {
      return { error: "Already fired at this cell." };
    }

    const result = this.resolveShot(opponent, row, col);

    // Check game over
    const gameOver = opponent.ships.every(s => s.sunk);
    if (gameOver) {
      this.winner = id;
      this.phase = "ended";
    }

    // Send to firing player
    this.sendToPlayer(id, "battleship-fire-result", {
      cells: [{ row, col, result: result.hit ? "hit" : "miss" }],
      sunk: result.sunkShip,
      gameOver,
      shotsLeft: this.shotsRemaining - 1,
    });

    // Send to opponent
    this.sendToPlayer(opponent.id, "battleship-opponent-fire", {
      cells: [{ row, col, result: result.hit ? "hit" : "miss" }],
      sunk: result.sunkShip,
    });

    if (gameOver) {
      const me = this.players.get(id);
      this.broadcast("battleship-game-over", {
        winnerId: id,
        winnerName: me?.name || "Unknown",
        reason: "all_sunk",
      });
    } else {
      this.shotsRemaining--;
      if (this.shotsRemaining <= 0) {
        this.endTurn();
      }
    }

    this.sendStateToAll();
    return {};
  }

  // ── Abilities (advanced mode) ──────────────────

  useAbility(id, abilityType, params) {
    if (this.mode !== "advanced") return { error: "Abilities only in advanced mode." };
    if (this.phase !== "playing") return { error: "Game not in progress." };
    if (this.turn !== id) return { error: "Not your turn." };
    if (this.abilityUsedThisTurn) return { error: "Already used an ability this turn." };

    const me = this.players.get(id);
    if (!me) return { error: "Not in this room." };

    // Map ability to ship type
    const abilityShipMap = {
      airstrike: "carrier",
      barrage: "battleship",
      volley: "cruiser",
      sonar: "submarine",
    };
    const shipType = abilityShipMap[abilityType];
    if (!shipType) return { error: "Unknown ability." };

    // Check ship alive
    const ship = me.ships.find(s => s.type === shipType);
    if (!ship || ship.sunk) return { error: "Ship is sunk, ability unavailable." };

    // Check uses
    const uses = me.abilities[shipType];
    if (uses === undefined || uses <= 0) return { error: "No uses remaining." };

    const opponent = this.getOpponent(id);
    if (!opponent) return { error: "No opponent." };

    let resultCells = [];
    let scanData = null;
    let sunkShip = null;

    if (abilityType === "airstrike") {
      const { direction, index } = params;
      if (index < 0 || index > 9) return { error: "Invalid index." };
      if (direction !== "row" && direction !== "col") return { error: "Invalid direction." };

      for (let i = 0; i < 10; i++) {
        const r = direction === "row" ? index : i;
        const c = direction === "row" ? i : index;
        if (opponent.shotsReceived[r][c] !== null) continue;
        const res = this.resolveShot(opponent, r, c);
        resultCells.push({ row: r, col: c, result: res.hit ? "hit" : "miss" });
        if (res.sunkShip) sunkShip = res.sunkShip; // last sunk wins
      }
    } else if (abilityType === "barrage") {
      const { row, col } = params;
      const offsets = [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r > 9 || c < 0 || c > 9) continue;
        if (opponent.shotsReceived[r][c] !== null) continue;
        const res = this.resolveShot(opponent, r, c);
        resultCells.push({ row: r, col: c, result: res.hit ? "hit" : "miss" });
        if (res.sunkShip) sunkShip = res.sunkShip;
      }
    } else if (abilityType === "volley") {
      const { row, col } = params;
      const offsets = [[0, 0], [0, 1], [1, 0], [1, 1]];
      for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r > 9 || c < 0 || c > 9) continue;
        if (opponent.shotsReceived[r][c] !== null) continue;
        const res = this.resolveShot(opponent, r, c);
        resultCells.push({ row: r, col: c, result: res.hit ? "hit" : "miss" });
        if (res.sunkShip) sunkShip = res.sunkShip;
      }
    } else if (abilityType === "sonar") {
      const { row, col } = params;
      scanData = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r > 9 || c < 0 || c > 9) continue;
          scanData.push({ row: r, col: c, hasShip: opponent.board[r][c] === "ship" });
        }
      }
    }

    // Decrement uses (not for Infinity/sonar -- handled via check)
    if (me.abilities[shipType] !== Infinity) {
      me.abilities[shipType]--;
    }
    this.abilityUsedThisTurn = true;

    const gameOver = opponent.ships.every(s => s.sunk);
    if (gameOver) {
      this.winner = id;
      this.phase = "ended";
    }

    // Send to firing player
    this.sendToPlayer(id, "battleship-ability-result", {
      type: abilityType,
      cells: resultCells,
      sunk: sunkShip,
      gameOver,
      scanData,
      shotsLeft: this.shotsRemaining - 1,
    });

    // Send to opponent (no scan data)
    this.sendToPlayer(opponent.id, "battleship-opponent-ability", {
      type: abilityType,
      cells: resultCells,
      sunk: sunkShip,
      scanData: null,
    });

    if (gameOver) {
      const mePlayer = this.players.get(id);
      this.broadcast("battleship-game-over", {
        winnerId: id,
        winnerName: mePlayer?.name || "Unknown",
        reason: "all_sunk",
      });
    } else {
      // Ability consumes 1 shot, not the whole turn
      this.shotsRemaining--;
      if (this.shotsRemaining <= 0) {
        this.endTurn();
      }
    }

    this.sendStateToAll();
    return {};
  }

  // ── Chat ───────────────────────────────────────

  addChat(id, text) {
    const player = this.players.get(id);
    if (!player) return;
    const msg = {
      sender: player.name,
      senderId: id,
      text: String(text).slice(0, 200),
      timestamp: Date.now(),
    };
    this.chat.push(msg);
    if (this.chat.length > 50) this.chat.shift();
    this.broadcast("battleship-chat-msg", msg);
  }

  // ── Helpers ────────────────────────────────────

  resolveShot(opponent, row, col) {
    const isShip = opponent.board[row][col] === "ship";
    opponent.shotsReceived[row][col] = isShip ? "hit" : "miss";
    if (isShip) {
      opponent.board[row][col] = "hit";
    }

    let sunkShip = null;
    if (isShip) {
      for (const ship of opponent.ships) {
        if (ship.sunk) continue;
        const allHit = ship.cells.every(c => opponent.board[c.r][c.c] === "hit");
        if (allHit) {
          ship.sunk = true;
          sunkShip = ship.type;

          // Disable opponent's ability for this ship
          if (this.mode === "advanced") {
            opponent.abilities[ship.type] = 0;
          }
        }
      }
    }

    return { hit: isShip, sunkShip };
  }

  endTurn() {
    const idx = this.playerOrder.indexOf(this.turn);
    this.turn = this.playerOrder[(idx + 1) % 2];
    this.shotsRemaining = this.mode === "advanced" ? 3 : 1;
    this.abilityUsedThisTurn = false;
    this.broadcast("battleship-turn", { turn: this.turn, shotsRemaining: this.shotsRemaining });
  }

  getOpponent(id) {
    for (const [pid, p] of this.players) {
      if (pid !== id) return p;
    }
    return null;
  }

  validateShips(ships) {
    if (!Array.isArray(ships) || ships.length !== 5) return "Must place exactly 5 ships.";

    const expected = SHIPS.map(s => ({ type: s.type, size: s.size }));
    const occupied = new Set();

    for (const exp of expected) {
      const ship = ships.find(s => s.type === exp.type);
      if (!ship) return `Missing ship: ${exp.type}`;
      if (!Array.isArray(ship.cells) || ship.cells.length !== exp.size) {
        return `${exp.type} must have ${exp.size} cells.`;
      }

      // Validate cells in bounds
      for (const c of ship.cells) {
        if (c.r < 0 || c.r > 9 || c.c < 0 || c.c > 9) return `${exp.type} cell out of bounds.`;
        const key = `${c.r},${c.c}`;
        if (occupied.has(key)) return "Ships overlap.";
        occupied.add(key);
      }

      // Validate contiguous line
      const rows = ship.cells.map(c => c.r);
      const cols = ship.cells.map(c => c.c);
      const sameRow = rows.every(r => r === rows[0]);
      const sameCol = cols.every(c => c === cols[0]);
      if (!sameRow && !sameCol) return `${exp.type} must be in a straight line.`;

      if (sameRow) {
        cols.sort((a, b) => a - b);
        for (let i = 1; i < cols.length; i++) {
          if (cols[i] !== cols[i - 1] + 1) return `${exp.type} cells must be contiguous.`;
        }
      } else {
        rows.sort((a, b) => a - b);
        for (let i = 1; i < rows.length; i++) {
          if (rows[i] !== rows[i - 1] + 1) return `${exp.type} cells must be contiguous.`;
        }
      }
    }

    return null; // valid
  }

  // ── State ──────────────────────────────────────

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      turn: this.turn,
      shotsRemaining: this.shotsRemaining,
      winner: this.winner,
      players: this.playerOrder.map(id => {
        const p = this.players.get(id);
        return { id: p.id, name: p.name, ready: p.ready };
      }),
      chat: this.chat,
    };
  }

  getPlayerState(socketId) {
    const me = this.players.get(socketId);
    if (!me) return null;

    const opponent = this.getOpponent(socketId);

    // My board: full visibility
    const myBoard = me.board.map(row => [...row]);
    const myShips = me.ships.map(s => ({
      type: s.type,
      size: s.size,
      cells: s.cells,
      sunk: s.sunk,
    }));

    // Opponent board: fog of war (only hits/misses visible)
    let opponentBoard = null;
    let opponentShips = null;
    if (opponent) {
      opponentBoard = opponent.shotsReceived.map(row => [...row]);
      opponentShips = opponent.ships.map(s => ({
        type: s.type,
        size: s.size,
        sunk: s.sunk,
        cells: s.sunk ? s.cells : [], // reveal cells only if sunk
      }));
    }

    return {
      myBoard,
      myShips,
      myHits: me.shotsReceived.map(row => [...row]),
      opponentBoard,
      opponentShips,
      abilities: this.mode === "advanced" ? { ...me.abilities } : null,
      abilityUsedThisTurn: this.abilityUsedThisTurn,
      turn: this.turn,
      phase: this.phase,
      mode: this.mode,
      shotsRemaining: this.shotsRemaining,
      winner: this.winner,
    };
  }

  sendStateToAll() {
    for (const [id] of this.players) {
      this.sendToPlayer(id, "battleship-game-state", this.getPlayerState(id));
    }
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  sendToPlayer(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }
}
