// ---------------------------------------------------------------------------
// PongRoom -- server-side game state for a 2-player Pong match
// ---------------------------------------------------------------------------
// Physics run server-side at ~60 fps; clients receive state updates and
// send paddle positions. First to 7 points wins.
// ---------------------------------------------------------------------------

const CANVAS_W = 800;
const CANVAS_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const BALL_SPEED_INIT = 5;
const BALL_SPEED_MAX = 14;
const BALL_SPEED_INC = 0.25; // speed up on each paddle hit
const PADDLE_SPEED = 7;
const WIN_SCORE = 7;
const TICK_MS = 16;          // ~60 fps physics
const BROADCAST_EVERY = 3;   // send state every 3rd tick (~20 fps)

export class PongRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();   // id -> { id, name, index, paddleY, score }
    this.playerOrder = [];
    this.phase = "lobby";       // lobby | countdown | playing | ended

    this.ball = { x: CANVAS_W / 2, y: CANVAS_H / 2, vx: 0, vy: 0 };
    this.scores = [0, 0];
    this.winner = null;
    this.gameNumber = 1;
    this._tickInterval = null;
    this._countdownTimeout = null;
    this._forfeitTimers = new Map(); // id -> timeoutId
    this._tickCount = 0;
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  addPlayer(id, name) {
    if (this.players.size >= 2) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already in progress." };

    const index = this.players.size;
    this.players.set(id, {
      id, name, index,
      paddleY: CANVAS_H / 2 - PADDLE_H / 2,
      score: 0,
      disconnected: false,
    });
    this.playerOrder.push(id);
    this.broadcast("pong-room-state", this.getRoomState());
    return {};
  }

  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.disconnected = true;
    this.broadcast("pong-player-disconnected", { playerId: id, name: player.name });

    if (this.phase === "playing" || this.phase === "countdown") {
      this._stopTick();
      // Give 30s to reconnect before forfeiting
      const timer = setTimeout(() => {
        if (player.disconnected) {
          const remaining = [...this.players.values()].find(p => p.id !== id);
          if (remaining && this.phase !== "ended") {
            this.phase = "ended";
            this.winner = remaining.index;
            this.broadcast("pong-game-over", {
              winner: remaining.index,
              winnerName: remaining.name,
              scores: [...this.scores],
              reason: "forfeit",
            });
          }
        }
        this._forfeitTimers.delete(id);
      }, 30000);
      this._forfeitTimers.set(id, timer);
    }

    this.broadcast("pong-room-state", this.getRoomState());
  }

  removePlayer(id) {
    clearTimeout(this._forfeitTimers.get(id));
    this._forfeitTimers.delete(id);

    const player = this.players.get(id);
    if (!player) return;

    if (this.phase === "playing" || this.phase === "countdown") {
      this._stopTick();
      const remaining = [...this.players.values()].find(p => p.id !== id);
      if (remaining) {
        this.phase = "ended";
        this.winner = remaining.index;
        this.broadcast("pong-game-over", {
          winner: remaining.index,
          winnerName: remaining.name,
          scores: [...this.scores],
          reason: "forfeit",
        });
      }
    }

    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);
    this.broadcast("pong-room-state", this.getRoomState());
  }

  rejoinPlayer(newId, name) {
    for (const [oldId, player] of this.players) {
      if (player.name === name) {
        clearTimeout(this._forfeitTimers.get(oldId));
        this._forfeitTimers.delete(oldId);

        this.players.delete(oldId);
        player.id = newId;
        player.disconnected = false;
        this.players.set(newId, player);
        const idx = this.playerOrder.indexOf(oldId);
        if (idx !== -1) this.playerOrder[idx] = newId;

        // Resume game if it was interrupted by the disconnect
        if (this.phase === "playing" || this.phase === "countdown") {
          this._beginCountdown();
        }

        return { success: true };
      }
    }
    return { error: "No player found with that name." };
  }

  // -------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------

  startGame() {
    if (this.players.size !== 2) return { error: "Need exactly 2 players." };
    if (this.phase !== "lobby") return { error: "Game already started." };

    this.scores = [0, 0];
    this.winner = null;
    this._beginCountdown();
    return {};
  }

  _beginCountdown() {
    this.phase = "countdown";
    this._resetBall();
    // Reset paddles
    for (const p of this.players.values()) {
      p.paddleY = CANVAS_H / 2 - PADDLE_H / 2;
    }
    this.broadcast("pong-countdown", { seconds: 3 });
    this._countdownTimeout = setTimeout(() => {
      this._startPlaying();
    }, 3000);
  }

  _startPlaying() {
    this.phase = "playing";
    this.broadcast("pong-game-state", this._getGameState());
    this._startTick();
  }

  _resetBall(side = null) {
    this.ball.x = CANVAS_W / 2;
    this.ball.y = CANVAS_H / 2 + (Math.random() - 0.5) * 80;
    const angle = (Math.random() * 0.5 - 0.25); // small vertical deviation
    // side=0 → serve toward player 0 (left, dir=-1), side=1 → serve toward player 1 (right, dir=+1)
    const dir = side !== null ? (side === 0 ? -1 : 1) : (Math.random() < 0.5 ? 1 : -1);
    this.ball.vx = dir * BALL_SPEED_INIT * Math.cos(angle);
    this.ball.vy = BALL_SPEED_INIT * Math.sin(angle);
  }

  updatePaddle(id, paddleY) {
    const p = this.players.get(id);
    if (!p || this.phase !== "playing") return;
    // Clamp paddle within canvas
    p.paddleY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, paddleY));
  }

  _startTick() {
    this._tickInterval = setInterval(() => this._tick(), TICK_MS);
  }

  _stopTick() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this._countdownTimeout) {
      clearTimeout(this._countdownTimeout);
      this._countdownTimeout = null;
    }
  }

  _tick() {
    if (this.phase !== "playing") return;

    const b = this.ball;
    const players = [...this.players.values()].sort((a, b) => a.index - b.index);
    const p0 = players[0]; // left paddle
    const p1 = players[1]; // right paddle

    // Move ball
    b.x += b.vx;
    b.y += b.vy;

    // Top / bottom wall bounce
    if (b.y - BALL_R <= 0) {
      b.y = BALL_R;
      b.vy = Math.abs(b.vy);
    } else if (b.y + BALL_R >= CANVAS_H) {
      b.y = CANVAS_H - BALL_R;
      b.vy = -Math.abs(b.vy);
    }

    // Paddle collision - left (p0)
    const leftPaddleX = PADDLE_W + 10;
    if (b.vx < 0 && b.x - BALL_R <= leftPaddleX + PADDLE_W &&
        b.x - BALL_R > leftPaddleX - 2 &&
        p0 && b.y + BALL_R >= p0.paddleY && b.y - BALL_R <= p0.paddleY + PADDLE_H) {
      b.x = leftPaddleX + PADDLE_W + BALL_R;
      const relY = (b.y - (p0.paddleY + PADDLE_H / 2)) / (PADDLE_H / 2);
      const bounceAngle = relY * (Math.PI / 3.5); // max ~51°
      const speed = Math.min(Math.sqrt(b.vx * b.vx + b.vy * b.vy) + BALL_SPEED_INC, BALL_SPEED_MAX);
      b.vx = speed * Math.cos(bounceAngle);
      b.vy = speed * Math.sin(bounceAngle);
    }

    // Paddle collision - right (p1)
    const rightPaddleX = CANVAS_W - PADDLE_W - 10;
    if (b.vx > 0 && b.x + BALL_R >= rightPaddleX &&
        b.x + BALL_R < rightPaddleX + PADDLE_W + 2 &&
        p1 && b.y + BALL_R >= p1.paddleY && b.y - BALL_R <= p1.paddleY + PADDLE_H) {
      b.x = rightPaddleX - BALL_R;
      const relY = (b.y - (p1.paddleY + PADDLE_H / 2)) / (PADDLE_H / 2);
      const bounceAngle = relY * (Math.PI / 3.5);
      const speed = Math.min(Math.sqrt(b.vx * b.vx + b.vy * b.vy) + BALL_SPEED_INC, BALL_SPEED_MAX);
      b.vx = -speed * Math.cos(bounceAngle);
      b.vy = speed * Math.sin(bounceAngle);
    }

    // Score - ball exits left
    if (b.x + BALL_R < 0) {
      this.scores[1]++;
      this._handleScore(1);
      return;
    }

    // Score - ball exits right
    if (b.x - BALL_R > CANVAS_W) {
      this.scores[0]++;
      this._handleScore(0);
      return;
    }

    // Broadcast at ~20 fps (physics still run at ~60 fps)
    this._tickCount++;
    if (this._tickCount % BROADCAST_EVERY === 0) {
      this.broadcast("pong-game-state", this._getGameState());
    }
  }

  _handleScore(scoringIndex) {
    this._stopTick();
    this.broadcast("pong-scored", {
      scores: [...this.scores],
      scorer: scoringIndex,
    });

    if (this.scores[scoringIndex] >= WIN_SCORE) {
      this.phase = "ended";
      this.winner = scoringIndex;
      const winnerPlayer = [...this.players.values()].find(p => p.index === scoringIndex);
      this.broadcast("pong-game-over", {
        winner: scoringIndex,
        winnerName: winnerPlayer?.name || "Player",
        scores: [...this.scores],
        reason: "normal",
      });
      return;
    }

    // Resume after brief pause — serve toward the player who was scored against (the loser)
    setTimeout(() => {
      if (this.phase !== "ended") {
        this._resetBall(1 - scoringIndex);
        this.phase = "playing";
        this._startTick();
      }
    }, 1500);
  }

  handleRematch(id) {
    if (this.phase !== "ended") return;
    this.phase = "lobby";
    this.scores = [0, 0];
    this.winner = null;
    this.gameNumber++;
    this.startGame();
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  _getGameState() {
    return {
      ball: { ...this.ball },
      paddles: [...this.players.values()]
        .sort((a, b) => a.index - b.index)
        .map(p => ({ index: p.index, paddleY: p.paddleY })),
      scores: [...this.scores],
    };
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.getPlayerList(),
      scores: [...this.scores],
      winner: this.winner,
      gameNumber: this.gameNumber,
    };
  }

  getPlayerList() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      index: p.index,
      score: p.score,
    }));
  }

  isEmpty() {
    return this.players.size === 0 || [...this.players.values()].every(p => p.disconnected);
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  destroy() {
    this._stopTick();
    for (const timer of this._forfeitTimers.values()) clearTimeout(timer);
    this._forfeitTimers.clear();
  }
}
