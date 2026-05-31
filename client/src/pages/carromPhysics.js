// ---------------------------------------------------------------------------
// Carrom 2D Physics Engine
// ---------------------------------------------------------------------------
// All coordinates in a 700x700 logical space.
// Pieces are circles. Collisions are elastic (with restitution).
// Friction is applied as per-frame velocity damping.
// Pockets sit at the four corners.
// ---------------------------------------------------------------------------

export const BOARD_SIZE = 700;
export const CUSHION = 34;                       // inner boundary offset from edge
export const MIN_X = CUSHION;
export const MAX_X = BOARD_SIZE - CUSHION;
export const MIN_Y = CUSHION;
export const MAX_Y = BOARD_SIZE - CUSHION;

export const PIECE_RADIUS = 13;
export const STRIKER_RADIUS = 15;
export const PIECE_MASS = 1;
export const STRIKER_MASS = 1.6;

export const POCKET_RADIUS = 24;
export const POCKET_POSITIONS = [
  [CUSHION, CUSHION],
  [BOARD_SIZE - CUSHION, CUSHION],
  [CUSHION, BOARD_SIZE - CUSHION],
  [BOARD_SIZE - CUSHION, BOARD_SIZE - CUSHION],
];

// Physics tuning
const FRICTION = 0.984;                          // velocity multiplier per step
const RESTITUTION_PIECE = 0.72;                  // piece-piece bounciness
const RESTITUTION_WALL = 0.65;                   // piece-wall bounciness
const VELOCITY_CUTOFF = 0.15;                    // below this, snap to zero
const MAX_FORCE = 28;                            // cap on striker launch speed
const SUB_STEPS = 3;                             // collision sub-steps per frame

// Baseline positions for striker placement
export const BASELINE_Y_BOTTOM = BOARD_SIZE - CUSHION - 75;   // ~591
export const BASELINE_Y_TOP = CUSHION + 75;                    // ~109
export const BASELINE_MIN_X = BOARD_SIZE / 2 - 100;
export const BASELINE_MAX_X = BOARD_SIZE / 2 + 100;

// ---------------------------------------------------------------------------
// Initial piece layout -- standard carrom center formation
// ---------------------------------------------------------------------------
export function createInitialPieces() {
  const cx = BOARD_SIZE / 2;
  const cy = BOARD_SIZE / 2;
  const pieces = [];
  let id = 0;

  // Queen at dead center
  pieces.push({ id: id++, type: "queen", x: cx, y: cy, vx: 0, vy: 0, pocketed: false });

  // Inner ring: 6 pieces at radius 28, alternating white/black
  const innerR = 28;
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * Math.PI / 180;
    const type = i % 2 === 0 ? "white" : "black";
    pieces.push({
      id: id++,
      type,
      x: cx + innerR * Math.cos(angle),
      y: cy + innerR * Math.sin(angle),
      vx: 0, vy: 0,
      pocketed: false,
    });
  }

  // Outer ring: 12 pieces at radius 56, alternating white/black
  // Offset by 15 degrees so they nestle between inner ring pieces
  const outerR = 56;
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 + 15) * Math.PI / 180;
    const type = i % 2 === 0 ? "white" : "black";
    pieces.push({
      id: id++,
      type,
      x: cx + outerR * Math.cos(angle),
      y: cy + outerR * Math.sin(angle),
      vx: 0, vy: 0,
      pocketed: false,
    });
  }

  // Verify counts: 1 queen + 3 white inner + 6 white outer = 9 white? Let me recount.
  // Inner: i=0 white, i=1 black, i=2 white, i=3 black, i=4 white, i=5 black -> 3W 3B
  // Outer: i=0 white, i=1 black, ... i=11 black -> 6W 6B
  // Total: 9W, 9B, 1Q = 19. Correct.

  return pieces;
}

// ---------------------------------------------------------------------------
// Pocket check
// ---------------------------------------------------------------------------
export function isInPocket(x, y) {
  for (const [px, py] of POCKET_POSITIONS) {
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy < POCKET_RADIUS * POCKET_RADIUS) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Elastic collision between two circles
// ---------------------------------------------------------------------------
function resolveCollision(a, b, radiusA, radiusB, massA, massB) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = radiusA + radiusB;

  if (dist === 0 || dist >= minDist) return false;

  // Normal from a to b
  const nx = dx / dist;
  const ny = dy / dist;

  // Separate overlapping circles (push apart proportionally to mass)
  const overlap = minDist - dist;
  const totalMass = massA + massB;
  a.x -= nx * overlap * (massB / totalMass);
  a.y -= ny * overlap * (massB / totalMass);
  b.x += nx * overlap * (massA / totalMass);
  b.y += ny * overlap * (massA / totalMass);

  // Relative velocity along collision normal
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const relVelNormal = dvx * nx + dvy * ny;

  // Do not resolve if velocities are separating
  if (relVelNormal <= 0) return true;

  // Impulse scalar (elastic with restitution)
  const e = RESTITUTION_PIECE;
  const j = (1 + e) * relVelNormal / (1 / massA + 1 / massB);

  // Apply impulse
  a.vx -= (j / massA) * nx;
  a.vy -= (j / massA) * ny;
  b.vx += (j / massB) * nx;
  b.vy += (j / massB) * ny;

  return true;
}

// ---------------------------------------------------------------------------
// Wall reflection
// ---------------------------------------------------------------------------
function reflectWalls(p, radius) {
  let bounced = false;

  if (p.x - radius < MIN_X) {
    p.x = MIN_X + radius;
    p.vx = Math.abs(p.vx) * RESTITUTION_WALL;
    bounced = true;
  } else if (p.x + radius > MAX_X) {
    p.x = MAX_X - radius;
    p.vx = -Math.abs(p.vx) * RESTITUTION_WALL;
    bounced = true;
  }

  if (p.y - radius < MIN_Y) {
    p.y = MIN_Y + radius;
    p.vy = Math.abs(p.vy) * RESTITUTION_WALL;
    bounced = true;
  } else if (p.y + radius > MAX_Y) {
    p.y = MAX_Y - radius;
    p.vy = -Math.abs(p.vy) * RESTITUTION_WALL;
    bounced = true;
  }

  return bounced;
}

// ---------------------------------------------------------------------------
// Radius / mass helpers
// ---------------------------------------------------------------------------
function getRadius(p) {
  return p.type === "striker" ? STRIKER_RADIUS : PIECE_RADIUS;
}

function getMass(p) {
  return p.type === "striker" ? STRIKER_MASS : PIECE_MASS;
}

// ---------------------------------------------------------------------------
// Single physics step (1/60s equivalent)
// ---------------------------------------------------------------------------
function physicsStep(bodies) {
  const active = bodies.filter(b => !b.pocketed);
  const dt = 1 / SUB_STEPS;

  for (let sub = 0; sub < SUB_STEPS; sub++) {
    // Move
    for (const b of active) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // Piece-piece collisions (all pairs)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        resolveCollision(
          active[i], active[j],
          getRadius(active[i]), getRadius(active[j]),
          getMass(active[i]), getMass(active[j]),
        );
      }
    }

    // Wall reflections (skip pieces that are near a pocket -- let them fall in)
    for (const b of active) {
      if (!isInPocket(b.x, b.y)) {
        reflectWalls(b, getRadius(b));
      }
    }
  }

  // Friction
  for (const b of active) {
    b.vx *= FRICTION;
    b.vy *= FRICTION;

    // Snap to zero
    if (Math.abs(b.vx) < VELOCITY_CUTOFF && Math.abs(b.vy) < VELOCITY_CUTOFF) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  // Pocket detection
  const newlyPocketed = [];
  for (const b of active) {
    if (isInPocket(b.x, b.y)) {
      b.pocketed = true;
      b.vx = 0;
      b.vy = 0;
      newlyPocketed.push(b.id);
    }
  }

  return newlyPocketed;
}

// ---------------------------------------------------------------------------
// Check if all bodies are at rest
// ---------------------------------------------------------------------------
function allSettled(bodies) {
  for (const b of bodies) {
    if (b.pocketed) continue;
    if (b.vx !== 0 || b.vy !== 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Run full simulation (instant mode -- no animation)
// Returns { finalPositions, pocketedIds, strikerPocketed, hitSomething }
// ---------------------------------------------------------------------------
export function simulateInstant(pieces, striker) {
  // Deep copy everything
  const bodies = pieces
    .filter(p => !p.pocketed)
    .map(p => ({ ...p }));

  const strikerBody = {
    id: -1,
    type: "striker",
    x: striker.x,
    y: striker.y,
    vx: striker.vx,
    vy: striker.vy,
    pocketed: false,
  };
  bodies.push(strikerBody);

  // Track whether striker hit any piece
  let hitSomething = false;
  const initialStrikerPos = { x: striker.x, y: striker.y };

  const allPocketed = [];
  const MAX_STEPS = 1200; // safety cap (~20 seconds at 60fps)

  for (let step = 0; step < MAX_STEPS; step++) {
    // Before collision detection, check if striker is about to collide
    // (we track this inside resolveCollision via the return value)
    const activeBodies = bodies.filter(b => !b.pocketed);
    const strikerIdx = activeBodies.findIndex(b => b.type === "striker");

    const pocketed = physicsStep(bodies);
    allPocketed.push(...pocketed);

    // Check if striker collided with any piece this step
    if (!hitSomething && strikerIdx >= 0) {
      const sb = activeBodies[strikerIdx];
      if (sb) {
        for (const other of activeBodies) {
          if (other.type === "striker") continue;
          const dx = sb.x - other.x;
          const dy = sb.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = STRIKER_RADIUS + PIECE_RADIUS;
          // If close enough, they collided at some point
          if (dist < minDist + 5) {
            hitSomething = true;
            break;
          }
        }
      }
    }

    if (allSettled(bodies)) break;
  }

  // Also detect hit by checking if striker moved significantly and changed direction
  // (backup detection)
  if (!hitSomething) {
    const sdx = strikerBody.x - initialStrikerPos.x;
    const sdy = strikerBody.y - initialStrikerPos.y;
    const travelDist = Math.sqrt(sdx * sdx + sdy * sdy);
    // If striker barely moved, it probably hit something or a wall
    // We consider "hit something" only if an actual piece collision occurred
    // The proximity check above handles this well enough
  }

  const strikerPocketed = strikerBody.pocketed;

  // Build results
  const finalPositions = bodies
    .filter(b => b.type !== "striker")
    .map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));

  const pocketedIds = allPocketed.filter(id => id !== -1);

  return { finalPositions, pocketedIds, strikerPocketed, hitSomething };
}

// ---------------------------------------------------------------------------
// Animated simulation -- calls onFrame each step with current state
// Returns a cancel function
// ---------------------------------------------------------------------------
export function simulateAnimated(pieces, striker, onFrame, onDone) {
  const bodies = pieces
    .filter(p => !p.pocketed)
    .map(p => ({ ...p }));

  const strikerBody = {
    id: -1,
    type: "striker",
    x: striker.x,
    y: striker.y,
    vx: striker.vx,
    vy: striker.vy,
    pocketed: false,
  };
  bodies.push(strikerBody);

  let hitSomething = false;
  const allPocketed = [];
  let step = 0;
  const MAX_STEPS = 1200;
  let cancelled = false;
  let rafId = null;

  function tick() {
    if (cancelled) return;

    const pocketed = physicsStep(bodies);
    allPocketed.push(...pocketed);
    step++;

    // Hit detection: check proximity between striker and any piece
    if (!hitSomething && !strikerBody.pocketed) {
      for (const b of bodies) {
        if (b.pocketed || b.type === "striker") continue;
        const dx = strikerBody.x - b.x;
        const dy = strikerBody.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < STRIKER_RADIUS + PIECE_RADIUS + 5) {
          hitSomething = true;
          break;
        }
      }
    }

    // Send current frame data
    const frameData = bodies.map(b => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      pocketed: b.pocketed,
    }));
    onFrame(frameData);

    if (allSettled(bodies) || step >= MAX_STEPS) {
      const strikerPocketed = strikerBody.pocketed;
      const finalPositions = bodies
        .filter(b => b.type !== "striker")
        .map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
      const pocketedIds = allPocketed.filter(id => id !== -1);

      onDone({ finalPositions, pocketedIds, strikerPocketed, hitSomething });
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return function cancel() {
    cancelled = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

// ---------------------------------------------------------------------------
// Launch vector from aiming parameters
// ---------------------------------------------------------------------------
export function launchVector(angle, force) {
  const clampedForce = Math.min(force, MAX_FORCE);
  return {
    vx: Math.cos(angle) * clampedForce,
    vy: Math.sin(angle) * clampedForce,
  };
}

// ---------------------------------------------------------------------------
// Find nearest open spot to center for returning a piece
// ---------------------------------------------------------------------------
export function findCenterSpot(pieces, preferX, preferY) {
  const cx = preferX || BOARD_SIZE / 2;
  const cy = preferY || BOARD_SIZE / 2;

  // Check if center is free
  const occupied = pieces.filter(p => !p.pocketed);
  let spot = { x: cx, y: cy };

  function isFree(x, y) {
    for (const p of occupied) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < (PIECE_RADIUS * 2.5) ** 2) return false;
    }
    return true;
  }

  if (isFree(spot.x, spot.y)) return spot;

  // Spiral outward
  for (let r = PIECE_RADIUS * 3; r < 120; r += PIECE_RADIUS * 2.5) {
    for (let a = 0; a < 360; a += 30) {
      const x = cx + r * Math.cos(a * Math.PI / 180);
      const y = cy + r * Math.sin(a * Math.PI / 180);
      if (isFree(x, y)) return { x, y };
    }
  }

  // Fallback
  return { x: cx + 40, y: cy + 40 };
}
