const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const ARENA_RADIUS = 42;
const MIN_PLAYERS = 2;
const RESPAWN_DELAY = 3000;
const KART_COLLISION_RADIUS = 2.4;
const KART_BUMP_DAMAGE = 8;
const KART_BUMP_FORCE = 6;
const KART_BUMP_COOLDOWN = 600;
const IDLE_TIMEOUT = 45000;
const SURVIVAL_POINTS_INTERVAL = 10000;
const SURVIVAL_POINTS = 10;

const WEAPONS = {
  rocket: { ammo: 3, cooldown: 700, damage: 55, speed: 34, radius: 4.8, lifetime: 2600 },
  machineGun: { ammo: 24, cooldown: 90, damage: 9, speed: 58, radius: 1.1, lifetime: 900 },
  mine: { ammo: 3, cooldown: 650, damage: 65, speed: 0, radius: 5.4, lifetime: 14000 },
};

const COLORS = ["#ff477e", "#ffd166", "#06d6a0", "#4cc9f0", "#b517ff", "#ff7a00"];
const WEAPON_TYPES = Object.keys(WEAPONS);
const PICKUP_POSITIONS = [
  [-22, -18], [-8, -27], [14, -20], [27, -3], [19, 18], [-2, 26], [-24, 10],
];
const BOOST_PADS = [[-14, 18], [15, -16], [26, 3], [-27, -4]];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function defaultInput() {
  return { sequence: 0, throttle: 0, steer: 0, drift: false, boost: false, fire: false, dt: 1 / TICK_RATE };
}

export class KartArena {
  constructor(code, io) {
    this.code = code;
    this.channel = `kart-${code}`;
    this.io = null;
    this.started = false;
    this.tickTimer = null;
    this.snapshotTimer = null;
    this.players = new Map();
    this.projectiles = new Map();
    this.explosions = [];
    this.killFeed = [];
    this.phase = "lobby";
    this.countdownEndsAt = 0;
    this.nextProjectileId = 1;
    this.nextExplosionId = 1;
    this.pickups = PICKUP_POSITIONS.map(([x, z], index) => ({
      id: `kart-pickup-${index}`,
      type: index % 3 === 0 ? "boost" : "weapon",
      position: { x, y: 1, z },
      availableAt: 0,
    }));
    if (io) this.attach(io);
  }

  attach(io) {
    this.io = io;
    if (this.started) return;
    this.started = true;
    this.tickTimer = setInterval(() => this.tick(1 / TICK_RATE), 1000 / TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcast(), 1000 / SNAPSHOT_RATE);
  }

  stop() {
    clearInterval(this.tickTimer);
    clearInterval(this.snapshotTimer);
    this.started = false;
  }

  addPlayer(id, name) {
    if (this.players.has(id)) {
      const existing = this.players.get(id);
      existing.username = String(name || existing.username || "Racer").slice(0, 18);
      return existing;
    }
    const spawn = this.spawnPoint(this.players.size);
    const player = {
      id,
      username: String(name || "Racer").slice(0, 18),
      position: spawn,
      velocity: { x: 0, y: 0, z: 0 },
      rotationY: Math.atan2(-spawn.x, -spawn.z),
      health: 100,
      boost: 100,
      kills: 0,
      deaths: 0,
      score: 0,
      weapon: null,
      ammo: 0,
      alive: true,
      respawnAt: 0,
      color: COLORS[this.players.size % COLORS.length],
      lastProcessedInput: 0,
      input: defaultInput(),
      lastFireAt: 0,
      lastBumpAt: 0,
      lastInputAt: Date.now(),
      lastSurvivalAt: Date.now(),
      damageEvents: [],
    };
    this.players.set(id, player);
    this.checkStart();
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    for (const [projectileId, projectile] of this.projectiles) {
      if (projectile.ownerId === id) this.projectiles.delete(projectileId);
    }
    if (this.players.size < MIN_PLAYERS) {
      this.phase = "lobby";
      this.countdownEndsAt = 0;
    }
  }

  isEmpty() {
    return this.players.size === 0;
  }

  setInput(id, input = {}) {
    const player = this.players.get(id);
    if (!player || input.sequence <= player.lastProcessedInput) return;
    player.input = {
      sequence: input.sequence,
      throttle: clamp(Number(input.throttle) || 0, -1, 1),
      steer: clamp(Number(input.steer) || 0, -1, 1),
      drift: !!input.drift,
      boost: !!input.boost,
      fire: !!input.fire,
      dt: clamp(Number(input.dt) || 1 / TICK_RATE, 1 / 120, 1 / 15),
    };
    player.lastProcessedInput = input.sequence;
    if (input.throttle !== 0 || input.steer !== 0 || input.fire) {
      player.lastInputAt = Date.now();
    }
  }

  tick(dt) {
    const now = Date.now();
    if (this.phase === "countdown" && now >= this.countdownEndsAt) this.phase = "playing";

    for (const player of this.players.values()) {
      if (!player.alive) {
        if (player.respawnAt <= now) this.respawn(player);
        continue;
      }
      this.updatePlayer(player, dt);
      this.resolvePickups(player, now);
      if (this.phase === "playing" && player.input.fire) this.tryFire(player, now);
    }

    // Kart-to-kart collisions
    if (this.phase === "playing") {
      const playerArr = [...this.players.values()].filter(p => p.alive);
      for (let i = 0; i < playerArr.length; i++) {
        for (let j = i + 1; j < playerArr.length; j++) {
          const a = playerArr[i], b = playerArr[j];
          const dist = distance2d(a.position, b.position);
          if (dist < KART_COLLISION_RADIUS && dist > 0.01) {
            const nx = (b.position.x - a.position.x) / dist;
            const nz = (b.position.z - a.position.z) / dist;
            const overlap = KART_COLLISION_RADIUS - dist;
            a.position.x -= nx * overlap * 0.5;
            a.position.z -= nz * overlap * 0.5;
            b.position.x += nx * overlap * 0.5;
            b.position.z += nz * overlap * 0.5;

            const relSpeed = Math.abs(
              (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz
            );
            if (relSpeed > 4) {
              a.velocity.x -= nx * KART_BUMP_FORCE * 0.5;
              a.velocity.z -= nz * KART_BUMP_FORCE * 0.5;
              b.velocity.x += nx * KART_BUMP_FORCE * 0.5;
              b.velocity.z += nz * KART_BUMP_FORCE * 0.5;
              const speedA = Math.hypot(a.velocity.x, a.velocity.z);
              const speedB = Math.hypot(b.velocity.x, b.velocity.z);
              if (now - a.lastBumpAt > KART_BUMP_COOLDOWN && speedB > speedA) {
                a.health -= KART_BUMP_DAMAGE;
                a.lastBumpAt = now;
                a.damageEvents.push({ amount: KART_BUMP_DAMAGE, from: b.id, at: now });
                if (a.health <= 0) this.damagePlayer(a, 0, b.id, "ram", now);
              }
              if (now - b.lastBumpAt > KART_BUMP_COOLDOWN && speedA > speedB) {
                b.health -= KART_BUMP_DAMAGE;
                b.lastBumpAt = now;
                b.damageEvents.push({ amount: KART_BUMP_DAMAGE, from: a.id, at: now });
                if (b.health <= 0) this.damagePlayer(b, 0, a.id, "ram", now);
              }
            } else {
              const bounce = 0.3;
              a.velocity.x -= nx * bounce;
              a.velocity.z -= nz * bounce;
              b.velocity.x += nx * bounce;
              b.velocity.z += nz * bounce;
            }
          }
        }
      }

      // Survival scoring
      for (const player of this.players.values()) {
        if (!player.alive) continue;
        if (now - player.lastSurvivalAt >= SURVIVAL_POINTS_INTERVAL) {
          player.score += SURVIVAL_POINTS;
          player.lastSurvivalAt = now;
        }
      }
    }

    // Clean up old damage events
    for (const player of this.players.values()) {
      player.damageEvents = player.damageEvents.filter(e => now - e.at < 2000);
    }

    this.updateProjectiles(dt, now);
    this.explosions = this.explosions.filter((explosion) => now - explosion.createdAt < 520);
    this.killFeed = this.killFeed.filter((event) => now - event.at < 9000);
  }

  snapshot() {
    return {
      serverTime: Date.now(),
      phase: this.phase,
      countdownEndsAt: this.countdownEndsAt,
      players: [...this.players.values()].map(({ input, lastFireAt, lastBumpAt, lastInputAt, lastSurvivalAt, ...player }) => player),
      projectiles: [...this.projectiles.values()],
      pickups: this.pickups,
      explosions: this.explosions,
      killFeed: this.killFeed,
    };
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      playerCount: this.players.size,
      minPlayers: MIN_PLAYERS,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.username,
        score: player.score,
        kills: player.kills,
        deaths: player.deaths,
        color: player.color,
      })),
    };
  }

  broadcast() {
    if (!this.io) return;
    this.io.to(this.channel).emit("kart-snapshot", this.snapshot());
  }

  updatePlayer(player, dt) {
    const input = player.input;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const boosting = input.boost && player.boost > 4;
    const acceleration = boosting ? 42 : 27;
    const maxSpeed = boosting ? 24 : 17;
    const drag = input.throttle === 0 ? 7.5 : 3.8;
    const turnRate = (input.drift ? 2.6 : 1.9) * clamp(speed / 8, 0.25, 1.25);
    player.rotationY += input.steer * turnRate * dt;

    const forward = { x: Math.sin(player.rotationY), z: Math.cos(player.rotationY) };
    player.velocity.x += forward.x * input.throttle * acceleration * dt;
    player.velocity.z += forward.z * input.throttle * acceleration * dt;
    player.velocity.x -= player.velocity.x * drag * dt * (1 - 0.35 * Math.abs(input.throttle));
    player.velocity.z -= player.velocity.z * drag * dt * (1 - 0.35 * Math.abs(input.throttle));

    const nextSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    if (nextSpeed > maxSpeed) {
      player.velocity.x = (player.velocity.x / nextSpeed) * maxSpeed;
      player.velocity.z = (player.velocity.z / nextSpeed) * maxSpeed;
    }

    player.position.x += player.velocity.x * dt;
    player.position.z += player.velocity.z * dt;
    const radius = Math.hypot(player.position.x, player.position.z);
    if (radius > ARENA_RADIUS - 2) {
      player.position.x = (player.position.x / radius) * (ARENA_RADIUS - 2);
      player.position.z = (player.position.z / radius) * (ARENA_RADIUS - 2);
      player.velocity.x *= -0.25;
      player.velocity.z *= -0.25;
    }

    for (const [x, z] of BOOST_PADS) {
      if (Math.hypot(player.position.x - x, player.position.z - z) < 3.7) {
        player.velocity.x += forward.x * 1.1;
        player.velocity.z += forward.z * 1.1;
        player.boost = clamp(player.boost + 0.5, 0, 100);
      }
    }
    player.boost = clamp(player.boost + (boosting ? -32 : 12) * dt, 0, 100);
  }

  resolvePickups(player, now) {
    for (const pickup of this.pickups) {
      if (pickup.availableAt > now || distance2d(player.position, pickup.position) > 2.5) continue;
      pickup.availableAt = now + 6500;
      if (pickup.type === "boost") {
        player.boost = 100;
        continue;
      }
      const weapon = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
      player.weapon = weapon;
      player.ammo = WEAPONS[weapon].ammo;
    }
  }

  tryFire(player, now) {
    if (!player.weapon || player.ammo <= 0) return;
    const stats = WEAPONS[player.weapon];
    if (now - player.lastFireAt < stats.cooldown) return;
    player.lastFireAt = now;
    player.ammo -= 1;

    const forward = { x: Math.sin(player.rotationY), z: Math.cos(player.rotationY) };
    const position = {
      x: player.position.x + forward.x * 2.3,
      y: 0.45,
      z: player.position.z + forward.z * 2.3,
    };
    if (player.weapon === "mine") {
      position.x = player.position.x - forward.x * 2.4;
      position.z = player.position.z - forward.z * 2.4;
    }

    const id = `kart-projectile-${this.nextProjectileId++}`;
    this.projectiles.set(id, {
      id,
      ownerId: player.id,
      type: player.weapon,
      position,
      velocity: {
        x: forward.x * stats.speed + player.velocity.x * 0.25,
        y: 0,
        z: forward.z * stats.speed + player.velocity.z * 0.25,
      },
      expiresAt: now + stats.lifetime,
    });
    if (player.ammo <= 0) player.weapon = null;
  }

  updateProjectiles(dt, now) {
    for (const [id, projectile] of [...this.projectiles]) {
      if (projectile.expiresAt <= now) {
        if (projectile.type === "mine") this.explode(projectile, now);
        this.projectiles.delete(id);
        continue;
      }

      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.z += projectile.velocity.z * dt;
      if (Math.hypot(projectile.position.x, projectile.position.z) > ARENA_RADIUS - 1) {
        this.explode(projectile, now);
        this.projectiles.delete(id);
        continue;
      }

      for (const player of this.players.values()) {
        if (!player.alive || player.id === projectile.ownerId) continue;
        const hitDistance = projectile.type === "machineGun" ? 1.55 : 2.15;
        if (distance2d(player.position, projectile.position) <= hitDistance) {
          this.explode(projectile, now);
          this.projectiles.delete(id);
          break;
        }
      }
    }
  }

  explode(projectile, now) {
    const stats = WEAPONS[projectile.type];
    this.explosions.push({
      id: `kart-explosion-${this.nextExplosionId++}`,
      position: projectile.position,
      radius: stats.radius,
      createdAt: now,
    });

    for (const player of this.players.values()) {
      if (!player.alive || player.id === projectile.ownerId) continue;
      const dist = distance2d(player.position, projectile.position);
      if (dist > stats.radius) continue;
      const damage = Math.ceil(stats.damage * Math.max(0.35, 1 - dist / stats.radius));
      player.damageEvents.push({ amount: damage, from: projectile.ownerId, at: now });
      this.damagePlayer(player, damage, projectile.ownerId, projectile.type, now);
    }
  }

  damagePlayer(victim, damage, attackerId, weapon, now) {
    victim.health -= damage;
    if (victim.health > 0) return;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnAt = now + RESPAWN_DELAY;
    victim.velocity = { x: 0, y: 0, z: 0 };
    const attacker = this.players.get(attackerId);
    if (!attacker) return;
    attacker.kills += 1;
    attacker.score += 100;
    this.killFeed.push({
      id: `kart-kill-${now}-${victim.id}`,
      killer: attacker.username,
      victim: victim.username,
      weapon,
      at: now,
    });
  }

  respawn(player) {
    const spawn = this.spawnPoint(Math.floor(Math.random() * 12));
    player.position = spawn;
    player.velocity = { x: 0, y: 0, z: 0 };
    player.rotationY = Math.atan2(-spawn.x, -spawn.z);
    player.health = 100;
    player.boost = 70;
    player.weapon = null;
    player.ammo = 0;
    player.alive = true;
  }

  checkStart() {
    if (this.players.size >= MIN_PLAYERS && this.phase === "lobby") {
      this.phase = "countdown";
      this.countdownEndsAt = Date.now() + 3500;
    }
  }

  spawnPoint(index) {
    const angle = (index / 8) * Math.PI * 2;
    return { x: Math.sin(angle) * 25, y: 0, z: Math.cos(angle) * 25 };
  }
}
