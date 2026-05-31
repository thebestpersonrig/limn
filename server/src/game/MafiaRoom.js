const CHAT_SLOWMODE_MS = 1000;

const ROLE_INFO = {
  civilian:  { alignment: "town",    label: "Civilian" },
  mafia:     { alignment: "mafia",   label: "Mafia" },
  detective: { alignment: "town",    label: "Detective" },
  doctor:    { alignment: "town",    label: "Doctor" },
  hunter:    { alignment: "town",    label: "Hunter" },
  jester:    { alignment: "neutral", label: "Jester" },
  witch:     { alignment: "town",    label: "Witch" },
};

export class MafiaRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();       // id -> MafiaPlayer
    this.phase = "lobby";           // lobby | roleReveal | day | vote | elimResult | hunterShot | night | nightResult | gameEnd
    this.day = 0;
    this.timeLeft = 0;
    this.timer = null;

    // Config (set by host on create or in lobby)
    this.roleConfig = {
      mafiaCount: 1,
      detective: true,
      doctor: true,
      hunter: false,
      jester: false,
      witch: false,
    };
    this.dayDuration = 90;

    // Night action tracking
    this.mafiaVotes = new Map();    // mafiaId -> targetId
    this.detectiveTarget = null;
    this.doctorTarget = null;

    // Hunter state
    this.hunterPending = false;
    this.hunterDeadId = null;
    this.hunterTimer = null;
    this.hunterResumeCallback = null;

    // Witch state
    this.witchHealUsed = false;
    this.witchKillUsed = false;
    this.witchHealTarget = null;
    this.witchKillTarget = null;
    this.witchSubmitted = false;

    // Jester
    this.jesterWon = false;
  }

  // -- Player lifecycle --
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
      player.isAlive = false;
      this.broadcast("mafia-room-state", this.getRoomState());

      const winner = this.checkWin();
      if (winner) this.endGame(winner);
    }
  }

  isEmpty() { return this.players.size === 0; }

  // -- Start game --
  startGame(config = {}) {
    if (this.players.size < 4) return { error: "Need at least 4 players." };

    if (config.mafiaCount) this.roleConfig.mafiaCount = config.mafiaCount;
    if (config.detective !== undefined) this.roleConfig.detective = config.detective;
    if (config.doctor !== undefined) this.roleConfig.doctor = config.doctor;
    if (config.hunter !== undefined) this.roleConfig.hunter = config.hunter;
    if (config.jester !== undefined) this.roleConfig.jester = config.jester;
    if (config.witch !== undefined) this.roleConfig.witch = config.witch;
    if (config.dayDuration) this.dayDuration = config.dayDuration;

    const { mafiaCount, detective, doctor, hunter, jester, witch } = this.roleConfig;
    const specialCount = mafiaCount
      + (detective ? 1 : 0) + (doctor ? 1 : 0)
      + (hunter ? 1 : 0) + (jester ? 1 : 0) + (witch ? 1 : 0);
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
    if (hunter)    { this.players.get(ids[idx]).role = "hunter";    idx++; }
    if (witch)     { this.players.get(ids[idx]).role = "witch";     idx++; }
    if (jester)    { this.players.get(ids[idx]).role = "jester";    idx++; }
    for (; idx < ids.length; idx++) {
      this.players.get(ids[idx]).role = "civilian";
    }

    const mafiaTeam = mafiaIds.map(id => ({
      id,
      name: this.players.get(id).name,
    }));

    // Reset per-game witch potions
    this.witchHealUsed = false;
    this.witchKillUsed = false;
    this.jesterWon = false;

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
      players: this.getAllPlayers(),
    });

    setTimeout(() => {
      try { this.startDay(); }
      catch (err) { console.error("[MafiaRoom startDay error]", err); }
    }, 5000);
  }

  // -- Day phase --
  startDay() {
    this.day++;
    this.phase = "day";
    this.timeLeft = this.dayDuration;

    for (const p of this.players.values()) p.votedFor = null;

    this.broadcast("mafia-phase", {
      phase: "day",
      day: this.day,
      timeLeft: this.timeLeft,
      players: this.getAllPlayers(),
    });

    // System message in chat
    this.broadcast("mafia-day-message", {
      system: true,
      text: this.day === 1
        ? "The town wakes up. Discuss who you think the Mafia might be."
        : "A new day begins. Who is suspicious?",
    });

    this.startTimer(() => this.startVote());
  }

  handleDayChat(socketId, text) {
    if (this.phase !== "day" && this.phase !== "vote") return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive || !text.trim()) return;

    const now = Date.now();
    if (now - player.lastChatTime < CHAT_SLOWMODE_MS) return;
    player.lastChatTime = now;

    this.broadcast("mafia-day-message", {
      playerId: socketId,
      name: player.name,
      text: text.trim(),
    });
  }

  // -- Vote phase --
  startVote() {
    this.stopTimer();
    this.phase = "vote";
    this.timeLeft = 30;

    for (const p of this.players.values()) p.votedFor = null;

    this.broadcast("mafia-phase", {
      phase: "vote",
      day: this.day,
      timeLeft: this.timeLeft,
      players: this.getAllPlayers(),
    });

    this.broadcast("mafia-day-message", {
      system: true,
      text: "Voting has begun! Click a player to vote them out.",
    });

    this.startTimer(() => this.resolveVote());
  }

  submitVote(voterId, targetId) {
    if (this.phase !== "vote") return;
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);
    if (!voter || !voter.isAlive) return;
    if (!target || !target.isAlive) return;
    if (voterId === targetId) return;

    const previousVote = voter.votedFor;
    voter.votedFor = targetId;

    // Broadcast vote with voter name for transparency
    this.broadcast("mafia-vote-update", {
      votes: this.getVoteTally(),
      latestVote: {
        voterId,
        voterName: voter.name,
        targetId,
        targetName: target.name,
        changed: previousVote !== null,
      },
    });

    // Check if all alive players have voted
    const alive = [...this.players.values()].filter(p => p.isAlive);
    if (alive.every(p => p.votedFor !== null)) {
      this.stopTimer();
      // Small delay so players see the final vote
      setTimeout(() => {
        try { this.resolveVote(); }
        catch (err) { console.error("[MafiaRoom resolveVote error]", err); }
      }, 1500);
    }
  }

  resolveVote() {
    this.stopTimer();
    this.phase = "elimResult";

    const counts = new Map();
    for (const p of this.players.values()) {
      if (p.isAlive && p.votedFor) {
        counts.set(p.votedFor, (counts.get(p.votedFor) || 0) + 1);
      }
    }

    let eliminated = null;
    if (counts.size > 0) {
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted.length === 1 || sorted[0][1] > sorted[1][1]) {
        const targetId = sorted[0][0];
        const target = this.players.get(targetId);
        if (target) {
          target.isAlive = false;
          eliminated = { id: target.id, name: target.name, role: target.role };
        }
      }
    }

    // Jester win check
    if (eliminated && eliminated.role === "jester") {
      this.jesterWon = true;
      this.broadcast("mafia-jester-win", {
        jesterId: eliminated.id,
        jesterName: eliminated.name,
      });
    }

    this.broadcast("mafia-elim-result", {
      eliminated,
      players: this.getAllPlayers(),
    });

    // Hunter death shot (from day vote)
    if (eliminated && eliminated.role === "hunter") {
      this.startHunterShot(eliminated.id, () => {
        const winner = this.checkWin();
        if (winner) {
          this.endGame(winner);
        } else {
          this.startNight();
        }
      });
      return;
    }

    const winner = this.checkWin();
    if (winner) {
      setTimeout(() => {
        try { this.endGame(winner); }
        catch (err) { console.error("[MafiaRoom endGame error]", err); }
      }, 4000);
    } else {
      setTimeout(() => {
        try { this.startNight(); }
        catch (err) { console.error("[MafiaRoom startNight error]", err); }
      }, 4000);
    }
  }

  // -- Hunter shot --
  startHunterShot(hunterId, resumeCallback) {
    this.hunterPending = true;
    this.hunterDeadId = hunterId;
    this.hunterResumeCallback = resumeCallback;

    // Give hunter 10s to pick a target
    this.phase = "hunterShot";
    this.timeLeft = 10;

    const alivePlayers = [...this.players.values()]
      .filter(p => p.isAlive)
      .map(p => ({ id: p.id, name: p.name }));

    this.io.to(hunterId).emit("mafia-hunter-shot", { targets: alivePlayers, timeLeft: 10 });
    this.broadcast("mafia-phase", {
      phase: "hunterShot",
      day: this.day,
      timeLeft: 10,
      players: this.getAllPlayers(),
      hunterId,
      hunterName: this.players.get(hunterId)?.name,
    });

    this.hunterTimer = setTimeout(() => {
      try { this.resolveHunterShot(null); }
      catch (err) { console.error("[MafiaRoom hunterShot timeout error]", err); }
    }, 10000);

    // Tick the timer
    let ticks = 10;
    this.timer = setInterval(() => {
      ticks--;
      this.broadcast("mafia-timer-tick", { timeLeft: ticks });
      if (ticks <= 0) this.stopTimer();
    }, 1000);
  }

  handleHunterAction(socketId, targetId) {
    if (!this.hunterPending || socketId !== this.hunterDeadId) return;
    const target = this.players.get(targetId);
    if (!target || !target.isAlive) return;

    clearTimeout(this.hunterTimer);
    this.hunterTimer = null;
    this.stopTimer();

    this.resolveHunterShot(targetId);
  }

  resolveHunterShot(targetId) {
    this.hunterPending = false;
    this.stopTimer();
    if (this.hunterTimer) { clearTimeout(this.hunterTimer); this.hunterTimer = null; }

    let shotPlayer = null;
    if (targetId) {
      const target = this.players.get(targetId);
      if (target && target.isAlive) {
        target.isAlive = false;
        shotPlayer = { id: target.id, name: target.name, role: target.role };
      }
    }

    const hunterName = this.players.get(this.hunterDeadId)?.name || "Hunter";
    this.broadcast("mafia-hunter-result", {
      hunterId: this.hunterDeadId,
      hunterName,
      target: shotPlayer,
    });

    this.hunterDeadId = null;

    // Resume after showing result
    setTimeout(() => {
      try {
        if (this.hunterResumeCallback) {
          const cb = this.hunterResumeCallback;
          this.hunterResumeCallback = null;
          cb();
        }
      } catch (err) { console.error("[MafiaRoom hunterResume error]", err); }
    }, 3000);
  }

  // -- Night phase --
  startNight() {
    this.phase = "night";
    this.timeLeft = 30;

    this.mafiaVotes.clear();
    this.detectiveTarget = null;
    this.doctorTarget = null;
    this.witchHealTarget = null;
    this.witchKillTarget = null;
    this.witchSubmitted = false;
    for (const p of this.players.values()) p.nightTarget = null;

    this.broadcast("mafia-phase", {
      phase: "night",
      day: this.day,
      timeLeft: this.timeLeft,
      players: this.getAllPlayers(),
    });

    this.startTimer(() => this.resolveNight());
  }

  handleNightChat(socketId, text) {
    if (this.phase !== "night") return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive || player.role !== "mafia") return;
    if (!text.trim()) return;

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

  submitNightAction(socketId, targetId, extra = {}) {
    if (this.phase !== "night") return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive) return;

    // Witch action uses a different path
    if (player.role === "witch") {
      this.handleWitchAction(socketId, extra);
      return;
    }

    const target = this.players.get(targetId);
    if (!target || !target.isAlive) return;

    player.nightTarget = targetId;

    if (player.role === "mafia") {
      this.mafiaVotes.set(socketId, targetId);
      // Notify all mafia of the vote
      for (const p of this.players.values()) {
        if (p.role === "mafia" && p.isAlive) {
          this.io.to(p.id).emit("mafia-night-vote-update", {
            votes: [...this.mafiaVotes.entries()].map(([vid, tid]) => ({ voterId: vid, targetId: tid })),
          });
        }
      }
      // Reveal mafia target to witch once all mafia have voted
      this.tryRevealToWitch();
    } else if (player.role === "detective") {
      this.detectiveTarget = targetId;
      const isMafia = target.role === "mafia";
      this.io.to(socketId).emit("mafia-detective-result", {
        targetId,
        targetName: target.name,
        isMafia,
      });
    } else if (player.role === "doctor") {
      this.doctorTarget = targetId;
    }

    this.io.to(socketId).emit("mafia-action-confirmed", { targetId });
    this.checkNightComplete();
  }

  tryRevealToWitch() {
    const aliveMafia = [...this.players.values()].filter(p => p.role === "mafia" && p.isAlive);
    const mafiaReady = aliveMafia.every(p => p.nightTarget !== null);
    if (!mafiaReady) return;

    const aliveWitch = [...this.players.values()].find(p => p.role === "witch" && p.isAlive);
    if (!aliveWitch) return;

    // Determine mafia target
    const killCounts = new Map();
    for (const tid of this.mafiaVotes.values()) {
      killCounts.set(tid, (killCounts.get(tid) || 0) + 1);
    }
    let mafiaTarget = null;
    let maxVotes = 0;
    for (const [tid, count] of killCounts) {
      if (count > maxVotes) { maxVotes = count; mafiaTarget = tid; }
    }

    if (mafiaTarget) {
      const target = this.players.get(mafiaTarget);
      this.io.to(aliveWitch.id).emit("mafia-witch-reveal", {
        targetId: mafiaTarget,
        targetName: target?.name || "Unknown",
      });
    }
  }

  handleWitchAction(socketId, { action, targetId }) {
    const player = this.players.get(socketId);
    if (!player || player.role !== "witch" || !player.isAlive) return;
    if (this.witchSubmitted) return;

    if (action === "heal") {
      if (this.witchHealUsed) return;
      this.witchHealTarget = targetId || "__mafia_target__";
      this.witchHealUsed = true;
    } else if (action === "kill") {
      if (this.witchKillUsed) return;
      const target = this.players.get(targetId);
      if (!target || !target.isAlive) return;
      this.witchKillTarget = targetId;
      this.witchKillUsed = true;
    }
    // "skip" does nothing, just marks submitted

    this.witchSubmitted = true;
    player.nightTarget = "done";
    this.io.to(socketId).emit("mafia-action-confirmed", { targetId: targetId || "skip" });
    this.checkNightComplete();
  }

  checkNightComplete() {
    const aliveMafia = [...this.players.values()].filter(p => p.role === "mafia" && p.isAlive);
    const aliveDetective = [...this.players.values()].find(p => p.role === "detective" && p.isAlive);
    const aliveDoctor = [...this.players.values()].find(p => p.role === "doctor" && p.isAlive);
    const aliveWitch = [...this.players.values()].find(p => p.role === "witch" && p.isAlive);

    const mafiaReady = aliveMafia.every(p => p.nightTarget !== null);
    const detectiveReady = !aliveDetective || aliveDetective.nightTarget !== null;
    const doctorReady = !aliveDoctor || aliveDoctor.nightTarget !== null;
    const witchReady = !aliveWitch || this.witchSubmitted;

    if (mafiaReady && detectiveReady && doctorReady && witchReady) {
      this.stopTimer();
      this.resolveNight();
    }
  }

  resolveNight() {
    this.stopTimer();
    this.phase = "nightResult";

    // Determine mafia kill target
    const killCounts = new Map();
    for (const tid of this.mafiaVotes.values()) {
      killCounts.set(tid, (killCounts.get(tid) || 0) + 1);
    }
    let killTarget = null;
    let maxVotes = 0;
    for (const [tid, count] of killCounts) {
      if (count > maxVotes) { maxVotes = count; killTarget = tid; }
    }

    // Doctor save
    const doctorSaved = this.doctorTarget === killTarget;

    // Witch heal (saves the mafia target)
    const witchSaved = this.witchHealTarget && killTarget;

    const saved = doctorSaved || witchSaved;

    let killed = null;
    if (killTarget && !saved) {
      const target = this.players.get(killTarget);
      if (target && target.isAlive) {
        target.isAlive = false;
        killed = { id: target.id, name: target.name, role: target.role };
      }
    }

    // Witch kill (separate from mafia kill)
    let witchKilled = null;
    if (this.witchKillTarget) {
      const wTarget = this.players.get(this.witchKillTarget);
      if (wTarget && wTarget.isAlive) {
        wTarget.isAlive = false;
        witchKilled = { id: wTarget.id, name: wTarget.name, role: wTarget.role };
      }
    }

    this.broadcast("mafia-night-result", {
      killed,
      witchKilled,
      saved: saved && killTarget !== null,
      witchSaved: !!witchSaved && killTarget !== null,
      players: this.getAllPlayers(),
    });

    // Check if hunter was killed at night (by mafia or witch)
    const hunterDied = (killed && killed.role === "hunter") || (witchKilled && witchKilled.role === "hunter");
    const hunterId = hunterDied
      ? (killed?.role === "hunter" ? killed.id : witchKilled.id)
      : null;

    if (hunterId) {
      // Show night result first, then hunter shot
      setTimeout(() => {
        try {
          this.startHunterShot(hunterId, () => {
            const winner = this.checkWin();
            if (winner) {
              this.endGame(winner);
            } else {
              this.startDay();
            }
          });
        } catch (err) { console.error("[MafiaRoom hunterShot night error]", err); }
      }, 4000);
      return;
    }

    const winner = this.checkWin();
    if (winner) {
      setTimeout(() => {
        try { this.endGame(winner); }
        catch (err) { console.error("[MafiaRoom endGame error]", err); }
      }, 4000);
    } else {
      setTimeout(() => {
        try { this.startDay(); }
        catch (err) { console.error("[MafiaRoom startDay error]", err); }
      }, 4000);
    }
  }

  // -- Win condition --
  checkWin() {
    const alive = [...this.players.values()].filter(p => p.isAlive);
    // Jester is neutral, exclude from both counts
    const aliveMafia = alive.filter(p => p.role === "mafia").length;
    const aliveTown = alive.filter(p => ROLE_INFO[p.role]?.alignment === "town" || p.role === "civilian").length;

    if (aliveMafia === 0) return "town";
    if (aliveMafia >= aliveTown) return "mafia";
    return null;
  }

  endGame(winner) {
    this.stopTimer();
    this.phase = "gameEnd";
    const players = [...this.players.values()].map(p => p.toJSON(true));
    this.broadcast("mafia-game-end", { winner, players, jesterWon: this.jesterWon });
  }

  // -- Timer --
  startTimer(onExpire) {
    this.stopTimer();
    this.timer = setInterval(() => {
      try {
        this.timeLeft--;
        this.broadcast("mafia-timer-tick", { timeLeft: this.timeLeft });
        if (this.timeLeft <= 0) {
          this.stopTimer();
          onExpire();
        }
      } catch (err) {
        console.error("[MafiaRoom timer error]", err);
        this.stopTimer();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // -- Helpers --
  broadcast(event, data) { this.io.to(this.code).emit(event, data); }

  getAllPlayers() {
    return [...this.players.values()].map(p => p.toJSON(this.phase === "gameEnd"));
  }

  getAlivePlayers() {
    return [...this.players.values()]
      .filter(p => p.isAlive)
      .map(p => p.toJSON(false));
  }

  getVoteTally() {
    const votes = [];
    for (const p of this.players.values()) {
      if (p.isAlive && p.votedFor) {
        votes.push({
          voterId: p.id,
          voterName: p.name,
          targetId: p.votedFor,
        });
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
      witchHealUsed: this.witchHealUsed,
      witchKillUsed: this.witchKillUsed,
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
