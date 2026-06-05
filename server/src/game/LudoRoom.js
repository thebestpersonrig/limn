// ---------------------------------------------------------------------------
// LudoRoom -- server-side game state for a 2-6 player Ludo match
// ---------------------------------------------------------------------------
// Standard 4-player Ludo rules, extended to support 5 and 6 players with
// custom home areas placed around a larger board.
// ---------------------------------------------------------------------------

const TOKENS_PER_PLAYER = 4;

// Main track has 52 squares. Home column has 5 steps. Finish at step 57.
const FULL_CIRCUIT = 52;
const HOME_COLUMN_STEPS = 5;

// Player colours in seating order (up to 6)
export const PLAYER_COLORS = ["red", "blue", "green", "yellow", "purple", "orange"];

// For each colour, the step index (0-55) on the main track where a token
// enters the track from the yard. These are evenly spaced for up to 6 players.
const ENTRY_STEPS = {
  red:    0,
  blue:   13,
  green:  26,
  yellow: 39,
  purple: 7,   // 5th player between red and blue
  orange: 20,  // 6th player between blue and green
};

// Safe squares on the main track (standard positions + extended for 5/6p)
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47, 7, 20]);

export class LudoRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();   // id -> { id, name, color, index, tokens }
    this.playerOrder = [];      // [id, id, ...]
    this.phase = "lobby";       // lobby | playing | ended
    this.currentTurn = 0;       // index into playerOrder
    this.dice = null;           // current roll value or null
    this.diceRolled = false;    // has this turn's dice been rolled
    this.winner = null;
    this.maxPlayers = 4;        // can be changed to 5 or 6 by host before start
    this.consecutiveSixes = 0;  // track consecutive sixes for forfeit rule
  }

  // -------------------------------------------------------------------------
  // Lobby management
  // -------------------------------------------------------------------------

  addPlayer(id, name) {
    if (this.players.size >= this.maxPlayers) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };

    const index = this.players.size;
    const color = PLAYER_COLORS[index];
    const tokens = this._makeTokens(color);

    this.players.set(id, { id, name, color, index, tokens, finished: false });
    this.playerOrder.push(id);

    this.broadcast("ludo-room-state", this.getRoomState());
    return {};
  }

  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;
    this.broadcast("ludo-room-state", this.getRoomState());
  }

  rejoinPlayer(newId, name) {
    for (const [oldId, player] of this.players) {
      if (player.name === name) {
        this.players.delete(oldId);
        player.id = newId;
        player.disconnected = false;
        this.players.set(newId, player);
        const idx = this.playerOrder.indexOf(oldId);
        if (idx !== -1) this.playerOrder[idx] = newId;
        return { success: true };
      }
    }
    return { error: "No player found with that name." };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    if (this.phase === "playing") {
      // Skip disconnected player's turns
      player.disconnected = true;
      this.broadcast("ludo-room-state", this.getRoomState());
      // If it was their turn, advance
      if (this.playerOrder[this.currentTurn] === id) {
        this._advanceTurn();
      }
      return;
    }

    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);
    // Re-index remaining players
    let i = 0;
    for (const p of this.players.values()) {
      p.index = i++;
      p.color = PLAYER_COLORS[p.index];
      p.tokens = this._makeTokens(p.color);
    }
    this.broadcast("ludo-room-state", this.getRoomState());
  }

  setMaxPlayers(id, n) {
    if (this.phase !== "lobby") return { error: "Game already started." };
    const p = this.players.get(id);
    if (!p || p.index !== 0) return { error: "Only the host can change settings." };
    if (![2, 3, 4, 5, 6].includes(n)) return { error: "Invalid player count." };
    this.maxPlayers = n;
    this.broadcast("ludo-room-state", this.getRoomState());
    return {};
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------

  startGame(id) {
    if (this.phase !== "lobby") return { error: "Game already started." };
    const host = this.players.get(id);
    if (!host || host.index !== 0) return { error: "Only the host can start." };
    if (this.players.size < 2) return { error: "Need at least 2 players." };

    this.phase = "playing";
    this.currentTurn = 0;
    this.dice = null;
    this.diceRolled = false;
    this.winner = null;
    this.consecutiveSixes = 0;

    this.broadcast("ludo-game-start", this.getRoomState());
    this._emitTurnStart();
    return {};
  }

  rollDice(id) {
    if (this.phase !== "playing") return { error: "Game not active." };
    const p = this.players.get(id);
    if (!p) return { error: "Not in game." };
    if (this.playerOrder[this.currentTurn] !== id) return { error: "Not your turn." };
    if (this.diceRolled) return { error: "Already rolled." };

    const roll = Math.floor(Math.random() * 6) + 1;
    this.dice = roll;
    this.diceRolled = true;

    if (roll === 6) {
      this.consecutiveSixes++;
    } else {
      this.consecutiveSixes = 0;
    }

    // Check for 3 consecutive sixes — forfeit turn
    if (this.consecutiveSixes >= 3) {
      this.consecutiveSixes = 0;
      this.dice = null;
      this.diceRolled = false;
      this.broadcast("ludo-dice-rolled", { playerId: id, roll, forfeit: true });
      this._advanceTurn();
      return {};
    }

    const moves = this._getValidMoves(p, roll);
    this.broadcast("ludo-dice-rolled", {
      playerId: id,
      roll,
      forfeit: false,
      validMoves: moves,
    });

    // If no valid moves, auto-advance turn
    if (moves.length === 0) {
      this.dice = null;
      this.diceRolled = false;
      this._advanceTurn();
    }

    return {};
  }

  moveToken(id, tokenIndex) {
    if (this.phase !== "playing") return { error: "Game not active." };
    const p = this.players.get(id);
    if (!p) return { error: "Not in game." };
    if (this.playerOrder[this.currentTurn] !== id) return { error: "Not your turn." };
    if (!this.diceRolled || this.dice === null) return { error: "Roll first." };

    const token = p.tokens[tokenIndex];
    if (!token) return { error: "Invalid token." };

    const roll = this.dice;
    const moves = this._getValidMoves(p, roll);
    if (!moves.includes(tokenIndex)) return { error: "Invalid move." };

    const events = [];

    // Move the token
    if (token.state === "yard") {
      // Enter the track
      token.state = "track";
      token.step = 0; // step 0 = entry square
      events.push({ type: "entered", tokenIndex, color: p.color });
    } else if (token.state === "track") {
      const newStep = token.step + roll;
      if (newStep >= FULL_CIRCUIT + HOME_COLUMN_STEPS) {
        // Reached home
        token.state = "home";
        token.step = FULL_CIRCUIT + HOME_COLUMN_STEPS;
        events.push({ type: "finished", tokenIndex, color: p.color });
      } else {
        token.step = newStep;
        events.push({ type: "moved", tokenIndex, color: p.color, step: newStep });
      }
    }

    // Check for captures (only on main track, not on home column or safe squares)
    const captures = this._checkCaptures(p, token);
    for (const cap of captures) {
      events.push({ type: "captured", color: cap.color, tokenIndex: cap.tokenIndex });
    }

    // Check if player has finished all tokens
    const allHome = p.tokens.every(t => t.state === "home");
    if (allHome) {
      p.finished = true;
      events.push({ type: "playerFinished", color: p.color, name: p.name });
    }

    // Check for game over (all but one finished, or first to finish wins)
    const finishedPlayers = [...this.players.values()].filter(pl => pl.finished);
    let gameOver = false;
    if (finishedPlayers.length === 1 && !this.winner) {
      // First finisher wins
      this.winner = p.color;
      this.phase = "ended";
      gameOver = true;
    } else if (finishedPlayers.length >= this.players.size - 1) {
      // All but one done
      if (!this.winner) this.winner = finishedPlayers[0].color;
      this.phase = "ended";
      gameOver = true;
    }

    this.broadcast("ludo-move-result", {
      events,
      players: this.getPlayerList(),
      gameOver,
      winner: this.winner,
    });

    if (gameOver) {
      this.broadcast("ludo-game-over", {
        winner: this.winner,
        winnerName: [...this.players.values()].find(pl => pl.color === this.winner)?.name,
      });
      return {};
    }

    // Extra turn on 6, otherwise advance
    this.dice = null;
    this.diceRolled = false;
    if (roll === 6 && !allHome) {
      this._emitTurnStart(); // same player rolls again
    } else {
      this._advanceTurn();
    }

    return {};
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _makeTokens(color) {
    return Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => ({
      id: i,
      state: "yard",  // yard | track | home
      step: -1,       // step along track (0 = entry, 56+6 = home)
    }));
  }

  // Returns the absolute track position (0-55) for a token given its owner color and step
  _absoluteStep(color, step) {
    if (step < 0) return -1;
    if (step >= FULL_CIRCUIT) return -1; // in home column, not on track
    const entry = ENTRY_STEPS[color] ?? 0;
    return (entry + step) % FULL_CIRCUIT;
  }

  _getValidMoves(player, roll) {
    const valid = [];
    for (let i = 0; i < player.tokens.length; i++) {
      const t = player.tokens[i];
      if (t.state === "home") continue;
      if (t.state === "yard") {
        // Can enter track only on a 6
        if (roll === 6) valid.push(i);
      } else {
        // Track token — check it won't overshoot home column
        const newStep = t.step + roll;
        if (newStep <= FULL_CIRCUIT + HOME_COLUMN_STEPS) {
          valid.push(i);
        }
      }
    }
    return valid;
  }

  _checkCaptures(attacker, movedToken) {
    if (movedToken.state !== "track") return [];
    const attackerAbs = this._absoluteStep(attacker.color, movedToken.step);
    if (attackerAbs < 0) return [];

    // Safe square — no captures
    if (SAFE_SQUARES.has(attackerAbs)) return [];

    const captured = [];
    for (const [, defender] of this.players) {
      if (defender.id === attacker.id) continue;
      for (let i = 0; i < defender.tokens.length; i++) {
        const dt = defender.tokens[i];
        if (dt.state !== "track") continue;
        const defAbs = this._absoluteStep(defender.color, dt.step);
        if (defAbs === attackerAbs) {
          // Send token back to yard
          dt.state = "yard";
          dt.step = -1;
          captured.push({ color: defender.color, tokenIndex: i });
        }
      }
    }
    return captured;
  }

  _advanceTurn() {
    const total = this.playerOrder.length;
    let next = (this.currentTurn + 1) % total;
    // Skip finished or disconnected players
    let safety = 0;
    while (safety < total) {
      const pid = this.playerOrder[next];
      const pl = this.players.get(pid);
      if (pl && !pl.finished && !pl.disconnected) break;
      next = (next + 1) % total;
      safety++;
    }
    this.currentTurn = next;
    this.consecutiveSixes = 0;
    this.dice = null;
    this.diceRolled = false;
    this._emitTurnStart();
  }

  _emitTurnStart() {
    const pid = this.playerOrder[this.currentTurn];
    this.broadcast("ludo-turn-start", {
      currentTurn: this.currentTurn,
      playerId: pid,
    });
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.getPlayerList(),
      currentTurn: this.currentTurn,
      dice: this.dice,
      diceRolled: this.diceRolled,
      winner: this.winner,
      maxPlayers: this.maxPlayers,
    };
  }

  getPlayerList() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      index: p.index,
      tokens: p.tokens.map(t => ({ ...t })),
      finished: p.finished,
      disconnected: !!p.disconnected,
    }));
  }

  isEmpty() {
    return this.players.size === 0;
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }
}
