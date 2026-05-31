import { useRef, useEffect, useCallback } from "react";
import {
  BOARD_SIZE, CUSHION, PIECE_RADIUS, STRIKER_RADIUS,
  POCKET_POSITIONS, POCKET_RADIUS,
  BASELINE_Y_BOTTOM, BASELINE_Y_TOP,
  BASELINE_MIN_X, BASELINE_MAX_X,
} from "./carromPhysics";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const BOARD_BG = "#d4a056";
const BOARD_BORDER = "#5c3a1e";
const CUSHION_COLOR = "#8b5e34";
const POCKET_COLOR = "#1a1008";
const LINE_COLOR = "#c4904680";
const WHITE_PIECE = "#f5f0e0";
const BLACK_PIECE = "#1a1a2e";
const QUEEN_COLOR = "#dc2626";
const STRIKER_COLOR = "#e8d8b8";
const STRIKER_OUTLINE = "#8b7355";
const AIM_LINE_COLOR = "#ffffff";
const AIM_DOT_COLOR = "#ffffff60";

// ---------------------------------------------------------------------------
// CarromBoard -- canvas rendering + input
// ---------------------------------------------------------------------------
export default function CarromBoard({
  pieces,
  animatingBodies,       // during animation: array of { id, type, x, y, pocketed }
  isMyTurn,
  myBaseline,            // "bottom" or "top"
  strikerPos,            // { x, y } or null
  onStrikerMove,         // (x) => void
  aimState,              // { active, startX, startY, currentX, currentY } or null
  onAimStart,            // (x, y) => void
  onAimMove,             // (x, y) => void
  onAimEnd,              // () => void
  simulating,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const scaleRef = useRef(1);

  // Convert canvas pixel coords to board coords
  const toBoard = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = scaleRef.current;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, []);

  // -----------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = BOARD_SIZE;
    const h = BOARD_SIZE;

    ctx.clearRect(0, 0, w, h);

    // Board background
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);

    // Outer border
    ctx.strokeStyle = BOARD_BORDER;
    ctx.lineWidth = CUSHION * 2;
    ctx.strokeRect(CUSHION, CUSHION, w - CUSHION * 2, h - CUSHION * 2);

    // Inner playing area
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(CUSHION, CUSHION, w - CUSHION * 2, h - CUSHION * 2);

    // Cushion edge line
    ctx.strokeStyle = CUSHION_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(CUSHION, CUSHION, w - CUSHION * 2, h - CUSHION * 2);

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 25, 0, Math.PI * 2);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Larger center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 65, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = LINE_COLOR;
    ctx.fill();

    // Diagonal lines from corners toward center (arrow markings)
    const diags = [
      [CUSHION + 30, CUSHION + 30],
      [w - CUSHION - 30, CUSHION + 30],
      [CUSHION + 30, h - CUSHION - 30],
      [w - CUSHION - 30, h - CUSHION - 30],
    ];
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    for (const [dx, dy] of diags) {
      const angle = Math.atan2(h / 2 - dy, w / 2 - dx);
      const len = 50;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx + Math.cos(angle) * len, dy + Math.sin(angle) * len);
      ctx.stroke();
    }

    // Baseline circles (4 small circles at baseline intersections)
    const baselineCircles = [
      [BASELINE_MIN_X, BASELINE_Y_TOP],
      [BASELINE_MAX_X, BASELINE_Y_TOP],
      [BASELINE_MIN_X, BASELINE_Y_BOTTOM],
      [BASELINE_MAX_X, BASELINE_Y_BOTTOM],
    ];
    for (const [bx, by] of baselineCircles) {
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Baselines
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    // Top baseline
    ctx.beginPath();
    ctx.moveTo(BASELINE_MIN_X, BASELINE_Y_TOP);
    ctx.lineTo(BASELINE_MAX_X, BASELINE_Y_TOP);
    ctx.stroke();
    // Bottom baseline
    ctx.beginPath();
    ctx.moveTo(BASELINE_MIN_X, BASELINE_Y_BOTTOM);
    ctx.lineTo(BASELINE_MAX_X, BASELINE_Y_BOTTOM);
    ctx.stroke();

    // Pockets
    for (const [px, py] of POCKET_POSITIONS) {
      ctx.beginPath();
      ctx.arc(px, py, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = POCKET_COLOR;
      ctx.fill();
    }

    // ---------------------------------------------------------------
    // Pieces
    // ---------------------------------------------------------------
    const displayPieces = animatingBodies || pieces;
    if (displayPieces) {
      for (const p of displayPieces) {
        if (p.pocketed) continue;
        if (p.type === "striker") continue; // draw striker separately

        const r = PIECE_RADIUS;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);

        if (p.type === "white") {
          ctx.fillStyle = WHITE_PIECE;
          ctx.fill();
          ctx.strokeStyle = "#c4b99a";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (p.type === "black") {
          ctx.fillStyle = BLACK_PIECE;
          ctx.fill();
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (p.type === "queen") {
          ctx.fillStyle = QUEEN_COLOR;
          ctx.fill();
          ctx.strokeStyle = "#991b1b";
          ctx.lineWidth = 1;
          ctx.stroke();
          // Small inner circle
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
          ctx.strokeStyle = "#fca5a5";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Shadow
        ctx.beginPath();
        ctx.arc(p.x + 1, p.y + 1, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fill();
      }

      // Striker during animation
      if (animatingBodies) {
        const sb = animatingBodies.find(b => b.type === "striker");
        if (sb && !sb.pocketed) {
          drawStriker(ctx, sb.x, sb.y);
        }
      }
    }

    // ---------------------------------------------------------------
    // Striker (when not animating, only on my turn)
    // ---------------------------------------------------------------
    if (!animatingBodies && strikerPos && isMyTurn && !simulating) {
      drawStriker(ctx, strikerPos.x, strikerPos.y);
    }

    // ---------------------------------------------------------------
    // Aim line
    // ---------------------------------------------------------------
    if (aimState && aimState.active && strikerPos) {
      const dx = aimState.startX - aimState.currentX;
      const dy = aimState.startY - aimState.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDrag = 150;
      const power = Math.min(dist / maxDrag, 1);

      if (dist > 5) {
        const angle = Math.atan2(dy, dx);
        const lineLen = 60 + power * 80;

        // Direction line
        ctx.beginPath();
        ctx.moveTo(strikerPos.x, strikerPos.y);
        ctx.lineTo(
          strikerPos.x + Math.cos(angle) * lineLen,
          strikerPos.y + Math.sin(angle) * lineLen,
        );
        ctx.strokeStyle = AIM_LINE_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Power dots
        const dotCount = Math.floor(power * 5) + 1;
        for (let i = 1; i <= dotCount; i++) {
          const t = i / (dotCount + 1);
          ctx.beginPath();
          ctx.arc(
            strikerPos.x + Math.cos(angle) * lineLen * t,
            strikerPos.y + Math.sin(angle) * lineLen * t,
            2, 0, Math.PI * 2,
          );
          ctx.fillStyle = AIM_DOT_COLOR;
          ctx.fill();
        }

        // Power indicator arc around striker
        ctx.beginPath();
        ctx.arc(strikerPos.x, strikerPos.y, STRIKER_RADIUS + 6, angle - 0.5, angle + 0.5);
        ctx.strokeStyle = `rgba(212, 160, 23, ${0.3 + power * 0.7})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }, [pieces, animatingBodies, isMyTurn, strikerPos, aimState, simulating]);

  function drawStriker(ctx, x, y) {
    // Shadow
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 1.5, STRIKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fill();

    // Striker body
    ctx.beginPath();
    ctx.arc(x, y, STRIKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = STRIKER_COLOR;
    ctx.fill();
    ctx.strokeStyle = STRIKER_OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(x, y, STRIKER_RADIUS * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = STRIKER_OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // -----------------------------------------------------------------------
  // Render loop
  // -----------------------------------------------------------------------
  useEffect(() => {
    let rafId;
    function loop() {
      draw();
      rafId = requestAnimationFrame(loop);
    }
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------
  useEffect(() => {
    function resize() {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const size = Math.min(container.clientWidth, container.clientHeight, 700);
      const scale = size / BOARD_SIZE;
      scaleRef.current = scale;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // -----------------------------------------------------------------------
  // Mouse / touch input
  // -----------------------------------------------------------------------
  const draggingStriker = useRef(false);
  const aiming = useRef(false);

  function handlePointerDown(e) {
    if (!isMyTurn || simulating || animatingBodies) return;
    const { x, y } = toBoard(e.clientX, e.clientY);
    if (!strikerPos) return;

    const dx = x - strikerPos.x;
    const dy = y - strikerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < STRIKER_RADIUS * 2.5) {
      // Start aiming from striker
      aiming.current = true;
      onAimStart(x, y);
    } else {
      // Maybe drag striker along baseline
      const baseY = myBaseline === "bottom" ? BASELINE_Y_BOTTOM : BASELINE_Y_TOP;
      if (Math.abs(y - baseY) < 30) {
        draggingStriker.current = true;
        const clampedX = Math.max(BASELINE_MIN_X, Math.min(BASELINE_MAX_X, x));
        onStrikerMove(clampedX);
      }
    }
  }

  function handlePointerMove(e) {
    if (!isMyTurn || simulating) return;
    const { x, y } = toBoard(e.clientX, e.clientY);

    if (aiming.current) {
      onAimMove(x, y);
    } else if (draggingStriker.current) {
      const clampedX = Math.max(BASELINE_MIN_X, Math.min(BASELINE_MAX_X, x));
      onStrikerMove(clampedX);
    }
  }

  function handlePointerUp() {
    if (aiming.current) {
      aiming.current = false;
      onAimEnd();
    }
    draggingStriker.current = false;
  }

  return (
    <div ref={containerRef} className="carr-board-container">
      <canvas
        ref={canvasRef}
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        className="carr-board-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
