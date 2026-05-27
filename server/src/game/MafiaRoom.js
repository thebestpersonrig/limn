const CHAT_SLOWMODE_MS = 1000;

const ROLE_INFO = {
  civilian:  { alignment: "town",  label: "Civilian" },
  mafia:     { alignment: "mafia", label: "Mafia" },
  detective: { alignment: "town",  label: "Detective" },
  doctor:    { alignment: "town",  label: "Doctor" },
};

export class MafiaRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();       // id → MafiaPlayer
    this.phase = "lobby";           // lobby | roleReveal | day | vote | elimResult | night | nightResult | gameEnd
    this.day = 0;
    this.timeLeft = 0;
    this.timer = null;

    // Config (set by host on create or in lobby)
    this.roleConfig = { mafiaCount: 1, detective: true, doctor: true };
    this.dayDuration = 90;

    // Night action tracking
    this.mafiaVotes = new Map();    // mafiaId → targetId
    this.detectiveTarget = null;
    this.doctorTarget = null;
  }

  // ── Player lifecycle ──────────────────────────────────
  addPlayer(player) {
    this.players.set(player.id, player);
    this.broadcast("mafia-room-state", this.getRoomState());
    this.broadcast("mafia-player-joined", { player: player.toJSON() });
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.broadcast("mafia-player-left", { playerId: socketId, name: player.name });

    if (this.phase !== "lobby" && this.phase !== "gameEnd") {
      // If a player leaves mid-game, mark them dead
      player.isAlive = false;
      this.broadcast("mafia-room-state", this.getRoomState());

      // Check if their departure ends the game
      const winner = this.checkWin();
      if (winner) this.endGame(winner);
    }
  }

  isEmpty() { return this.players.size === 0; }

  // ── Start game ────────────────────────────────────────
  startGame(config = {}) {
    if (this.players.size < 4) return { error: "Need at least 4 players." };

    // Apply config
    if (config.mafiaCount) this.roleConfig.mafiaCount = config.mafiaCount;
    if (config.detective !== undefined) this.roleConfig.detective = config.detective;
    if (config.doctor !== undefined) this.roleConfig.doctor = config.doctor;
    if (config.dayDuration) this.dayDuration = config.dayDuration;

    const { mafiaCount, detective, doctor } = this.roleConfig;
    const specialCount = mafiaCount + (detective ? 1 : 0) + (doctor ? 1 : 0);
    if (specialCount >= this.players.size) {
      return { error: "Too many special roles for this player count." };
    }

    // Assign roles
    const ids = [...this.players.keys()];
    shuffleArray(ids);

    let idx = 0;
    const mafiaIds = [];
    for (let i = 0; i < mafiaCount; i++) {
      this.players.get(ids[idx]).role = "mafia";
      mafiaIds.push(ids[idx]);
      idx++;
    }
    if (detective) { this.players.get(ids[idx]).role = "detective"; idx++; }
    if (doctor)    { this.players.get(ids[idx]).role = "doctor";    idx++; }
    for (; idx < ids.length; idx++) {
      this.players.get(ids[idx]).role = "civilian";
    }

    // Build mafia team info (names + ids)
    const mafiaTeam = mafiaIds.map(id => ({
      id,
      name: this.players.get(id).name,
    }));

    // Send roles privately
    this.phase = "roleReveal";
    for (const p of this.players.values()) {
      this.io.to(p.id).emit("mafia-role-assigned", {
        role: p.role,
        mafiaTeam: p.role === "mafia" ? mafiaTeam : [],
      });
    }

    this.broadcast("mafia-phase", {
      phase: "roleReveal",
      day: 0,
      alivePlayers: this.getAlivePlayers(),
    });

    // Transition to day after 5 seconds
    setTimeout(() => this.startDay(), 5000);
  }

  // ── Day phase ─────────────────────────────────────────
  startDay() {
    this.day++;
    this.phase = "day";
    this.timeLeft = this.dayDuration;

    // Reset votes
    for (const p of this.players.values()) p.votedFor = null;

    this.broadcast("mafia-phase", {
      phase: "day",
      day: this.day,
      timeLeft: this.timeLeft,
      alivePlayers: this.getAlivePlayers(),
    });

    this.startTimer(() => this.startVote());
  }

  handleDayChat(socketId, text) {
    if (this.phase !== "day" && this.phase !== "vote") return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive || !text.trim()) return;

    // 1-second slowmode
    const now = Date.now();
    if (now - player.lastChatTime < CHAT_SLOWMODE_MS) return;
    player.lastChatTime = now;

    this.broadcast("mafia-day-message", {
      playerId: socketId,
      name: player.name,
      text: text.trim(),
    });
  }

  // ── Vote phase ────────────────────────────────────────
  startVote() {
    this.stopTimer();
    this.phase = "vote";
    this.timeLeft = 30;

    for (const p of this.players.values()) p.votedFor = null;

    this.broadcast("mafia-phase", {
      phase: "vote",
      day: this.day,
      timeLeft: this.timeLeft,
      alivePlayers: this.getAlivePlayers(),
    });

    this.startTimer(() => this.resolveVote());
  }

  submitVote(voterId, targetId) {
    if (this.phase !== "vote") return;
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);
    if (!voter || !voter.isAlive) return;
    if (!target || !target.isAlive) return;
    if (voterId === targetId) return; // can't vote for yourself

    voter.votedFor = targetId;

    this.broadcast("mafia-vote-update", { votes: this.getVoteTally() });

    // Check if all alive players have voted
    const alive = [...this.players.values()].filter(p => p.isAlive);
    if (alive.every(p => p.votedFor !== null)) {
      this.stopTimer();
      this.resolveVote();
    }
  }

  resolveVote() {
    this.stopTimer();
    this.phase = "elimResult";

    // Count votes
    const counts = new Map();
    for (const p of this.players.values()) {
      if (p.isAlive && p.votedFor) {
        counts.set(p.votedFor, (counts.get(p.votedFor) || 0) + 1);
      }
    }

    let eliminated = null;
    if (counts.size > 0) {
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      // Tie check: if top two have same count, no elimination
      if (sorted.length === 1 || sorted[0][1] > sorted[1][1]) {
        const targetId = sorted[0][0];
        const target = this.players.get(targetId);
        if (target) {
          target.isAlive = false;
          eliminated = { id: target.id, name: target.name, role: target.role };
        }
      }
    }

    this.broadcast("mafia-elim-result", { eliminated });

    // Check win after elimination
    const winner = this.checkWin();
    if (winner) {
      setTimeout(() => this.endGame(winner), 4000);
    } else {
      setTimeout(() => this.startNight(), 4000);
    }
  }

  // ── Night phase ───────────────────────────────────────
  startNight() {
    this.phase = "night";
    this.timeLeft = 30;

    // Reset night actions
    this.mafiaVotes.clear();
    this.detectiveTarget = null;
    this.doctorTarget = null;
    for (const p of this.players.values()) p.nightTarget = null;

    this.broadcast("mafia-phase", {
      phase: "night",
      day: this.day,
      timeLeft: this.timeLeft,
      alivePlayers: this.getAlivePlayers(),
    });

    this.startTimer(() => this.resolveNight());
  }

  handleNightChat(socketId, text) {
    if (this.phase !== "night") return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive || player.role !== "mafia") return;
    if (!text.trim()) return;

    // Send only to alive Mafia members
    for (const p of this.players.values()) {
      if (p.role === "mafia" && p.isAlive) {
        this.io.to(p.id).emit("mafia-night-message", {
          playerId: socketId,
          name: player.name,
          text: text.trim(),
        });
      }
    }
  }

  submitNightAction(socketId, targetId) {
    if (this.phase !== "night") return;
    const player = this.players.get(socketId);
    const target = this.players.get(targetId);
    if (!player || !player.isAlive || !target || !target.isAlive) return;

    player.nightTarget = targetId;

    if (player.role === "mafia") {
      this.mafiaVotes.set(socketId, targetId);
      // Notify other mafia of this vote
      for (const p of this.players.values()) {
        if (p.role === "mafia" && p.isAlive) {
          this.io.to(p.id).emit("mafia-night-vote-update", {
            votes: [...this.mafiaVotes.entries()].map(([vid, tid]) => ({ voterId: vid, targetId: tid })),
          });
        }
      }
    } else if (player.role === "detective") {
      this.detectiveTarget = targetId;
      // Immediately reveal result to detective
      const isMafia = target.role === "mafia";
      this.io.to(socketId).emit("mafia-detective-result", {
        targetId,
        targetName: target.name,
        isMafia,
      });
    } else if (player.role === "doctor") {
      this.doctorTarget = targetId;
    }

    // Confirm action to the player
    this.io.to(socketId).emit("mafia-action-confirmed", { targetId });

    // Check if all roles with night actions have acted
    this.checkNightComplete();
  }

  checkNightComplete() {
    const aliveMafia = [...this.players.values()].filter(p => p.role === "mafia" && p.isAlive);
    const aliveDetective = [...this.players.values()].find(p => p.role === "detective" && p.isAlive);
    const aliveDoctor = [...this.players.values()].find(p => p.role === "doctor" && p.isAlive);

    const mafiaReady = aliveMafia.every(p => p.nightTarget !== null);
    const detectiveReady = !aliveDetective || aliveDetective.nightTarget !== null;
    const doctorReady = !aliveDoctor || aliveDoctor.nightTarget !== null;

    if (mafiaReady && detectiveReady && doctorReady) {
      this.stopTimer();
      this.resolveNight();
    }
  }

  resolveNight() {
    this.stopTimer();
    this.phase = "nightResult";

    // Determine mafia kill target (most-voted among mafia, or first vote if tie)
    const killCounts = new Map();
    for (const tid of this.mafiaVotes.values()) {
      killCounts.set(tid, (killCounts.get(tid) || 0) + 1);
    }

    let killTarget = null;
    let maxVotes = 0;
    for (const [tid, count] of killCounts) {
      if (count > maxVotes) { maxVotes = count; killTarget = tid; }
    }

    // Doctor save check
    const saved = this.doctorTarget === killTarget;

    let killed = null;
    if (killTarget && !saved) {
      const target = this.players.get(killTarget);
      if (target && target.isAlive) {
        target.isAlive = false;
        killed = { id: target.id, name: target.name, role: target.role };
      }
    }

    this.broadcast("mafia-night-result", { killed, saved: saved && killTarget !== null });

    const winner = this.checkWin();
    if (winner) {
      setTimeout(() => this.endGame(winner), 4000);
    } else {
      setTimeout(() => this.startDay(), 4000);
    }
  }

  // ── Win condition ─────────────────────────────────────
  checkWin() {
    const alive = [...this.players.values()].filter(p => p.isAlive);
    const aliveMafia = alive.filter(p => p.role === "mafia").length;
    const aliveTown = alive.length - aliveMafia;

    if (aliveMafia === 0) return "town";
    if (aliveMafia >= aliveTown) return "mafia";
    return null;
  }

  endGame(winner) {
    this.stopTimer();
    this.phase = "gameEnd";
    // Reveal all roles
    const players = [...this.players.values()].map(p => p.toJSON(true));
    this.broadcast("mafia-game-end", { winner, players });
  }

  // ── Timer ─────────────────────────────────────────────
  startTimer(onExpire) {
    this.stopTimer();
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.broadcast("mafia-timer-tick", { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) {
        this.stopTimer();
        onExpire();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ── Helpers ───────────────────────────────────────────
  broadcast(event, data) { this.io.to(this.code).emit(event, data); }

  getAlivePlayers() {
    return [...this.players.values()]
      .filter(p => p.isAlive)
      .map(p => p.toJSON(false));
  }

  getVoteTally() {
    const votes = [];
    for (const p of this.players.values()) {
      if (p.isAlive && p.votedFor) {
        votes.push({ voterId: p.id, targetId: p.votedFor });
      }
    }
    return votes;
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      day: this.day,
      roleConfig: this.roleConfig,
      dayDuration: this.dayDuration,
      players: [...this.players.values()].map(p => p.toJSON(this.phase === "gameEnd")),
    };
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
