import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./LudoGame.css";

// ---------------------------------------------------------------------------
// Board constants — must match server LudoRoom constants
// ---------------------------------------------------------------------------

const BOARD_PX = 600;
const CELL = BOARD_PX / 15; // 40px

const COLOR_HEX = {
  red:    "#e85d5d",
  blue:   "#5b8ef0",
  green:  "#4caf6b",
  yellow: "#f0c040",
  purple: "#9b59b6",
  orange: "#e67e22",
};

// 52-cell clockwise main track, step 0 = red's entry square
// Each entry is [row, col] on the 15×15 grid
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],       // 0-4   left arm top (red exit)
  [5,6],[4,6],[3,6],[2,6],[1,6],       // 5-9   top arm left col going up
  [0,6],[0,7],[0,8],                    // 10-12 top-left corner
  [1,8],[2,8],[3,8],[4,8],[5,8],       // 13-17 top arm right col going down (blue entry=13)
  [6,9],[6,10],[6,11],[6,12],[6,13],   // 18-22 right arm top going right
  [6,14],[7,14],[8,14],                 // 23-25 right corner
  [8,13],[8,12],[8,11],[8,10],[8,9],   // 26-30 right arm bottom going left (green entry=26)
  [9,8],[10,8],[11,8],[12,8],[13,8],   // 31-35 bottom arm right col going down
  [14,8],[14,7],[14,6],                 // 36-38 bottom-right corner
  [13,6],[12,6],[11,6],[10,6],[9,6],   // 39-43 bottom arm left col going up (yellow entry=39)
  [8,5],[8,4],[8,3],[8,2],[8,1],       // 44-48 left arm bottom going left
  [8,0],[7,0],[6,0],                    // 49-51 left corner
];
const TRACK_LEN = TRACK.length; // 52

// Home-column cells per color (5 steps, index 0 = first step after full circuit)
const HOME_COL = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7]],
  green:  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  purple: [[7,1],[7,2],[7,3],[7,4],[7,5]], // fallback to red col
  orange: [[7,13],[7,12],[7,11],[7,10],[7,9]], // fallback to green col
};

// Entry step on the main track for each color
const ENTRY_STEP = {
  red: 0, blue: 13, green: 26, yellow: 39, purple: 7, orange: 20,
};

// Yard token slot positions [row, col] for the 4 standard colors
const YARD_SLOTS = {
  red:    [[1.5,1.5],[1.5,4],[4,1.5],[4,4]],
  blue:   [[1.5,10],[1.5,12.5],[4,10],[4,12.5]],
  green:  [[10,10],[10,12.5],[12.5,10],[12.5,12.5]],
  yellow: [[10,1.5],[10,4],[12.5,1.5],[12.5,4]],
  purple: [[7,1.5],[7,2.5],[7,3.5],[7,4.5]],  // left arm middle
  orange: [[7,10.5],[7,11.5],[7,12.5],[7,13.5]], // right arm middle
};

// Safe squares (absolute track positions) — no captures here
const SAFE_STEPS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Entry squares for coloring
const ENTRY_SQUARES = { 0:"red", 13:"blue", 26:"green", 39:"yellow" };

// Cell center in pixels
function cellPx(row, col) {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

// Absolute track index for a token (given its owner's color and step on track)
function absTrackStep(color, step) {
  return (ENTRY_STEP[color] + step) % TRACK_LEN;
}

// Get pixel position for a token
function tokenPx(player, tokenIndex) {
  const t = player.tokens[tokenIndex];
  const color = player.color;
  const slots = YARD_SLOTS[color] || YARD_SLOTS.red;

  if (t.state === "yard") {
    const sl = slots[tokenIndex] || slots[0];
    return { x: sl[1] * CELL, y: sl[0] * CELL };
  }
  if (t.state === "home") {
    return { x: 7.5 * CELL, y: 7.5 * CELL };
  }
  // on track / home column
  const step = t.step;
  if (step >= TRACK_LEN) {
    // home column
    const hStep = step - TRACK_LEN;
    const cols = HOME_COL[color] || HOME_COL.red;
    const cell = cols[Math.min(hStep, cols.length - 1)];
    return cell ? cellPx(cell[0], cell[1]) : { x: 7.5 * CELL, y: 7.5 * CELL };
  }
  const abs = absTrackStep(color, step);
  const cell = TRACK[abs];
  return cell ? cellPx(cell[0], cell[1]) : { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Canvas board renderer
// ---------------------------------------------------------------------------
function LudoBoard({ players, myId, validMoves, onTokenClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    draw(ctx);
  });

  function draw(ctx) {
    const W = BOARD_PX;
    const C = CELL;
    ctx.clearRect(0, 0, W, W);

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = "#16161f";
    ctx.fillRect(0, 0, W, W);

    // ── Home yards ──────────────────────────────────────────────────────────
    const yards = [
      { color:"red",    r:0, c:0  },
      { color:"blue",   r:0, c:9  },
      { color:"green",  r:9, c:9  },
      { color:"yellow", r:9, c:0  },
    ];
    for (const yd of yards) {
      const x = yd.c * C, y = yd.r * C, sz = 6 * C;
      // Soft fill
      ctx.fillStyle = COLOR_HEX[yd.color] + "18";
      ctx.fillRect(x, y, sz, sz);
      // Border
      ctx.strokeStyle = COLOR_HEX[yd.color] + "55";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, sz - 2, sz - 2);
      // Inner circle background
      ctx.beginPath();
      ctx.arc(x + sz / 2, y + sz / 2, C * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_HEX[yd.color] + "28";
      ctx.fill();
      ctx.strokeStyle = COLOR_HEX[yd.color] + "44";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── Track cells ──────────────────────────────────────────────────────────
    for (let i = 0; i < TRACK.length; i++) {
      const [r, c] = TRACK[i];
      const x = c * C, y = r * C;
      const entryColor = ENTRY_SQUARES[i];
      const isSafe = SAFE_STEPS.has(i);

      ctx.fillStyle = entryColor ? COLOR_HEX[entryColor] + "44" : isSafe ? "#1e3a28" : "#222230";
      roundRect(ctx, x + 1, y + 1, C - 2, C - 2, 4);
      ctx.fill();

      ctx.strokeStyle = "#333345";
      ctx.lineWidth = 0.5;
      roundRect(ctx, x + 1, y + 1, C - 2, C - 2, 4);
      ctx.stroke();

      if (isSafe) {
        ctx.fillStyle = "#4caf6b88";
        ctx.font = `${C * 0.5}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("★", x + C / 2, y + C / 2);
      }
    }

    // ── Home columns ─────────────────────────────────────────────────────────
    const standardColors = ["red","blue","green","yellow"];
    for (const color of standardColors) {
      const cells = HOME_COL[color];
      for (let i = 0; i < cells.length; i++) {
        const [r, c] = cells[i];
        const x = c * C, y = r * C;
        const alpha = 0.2 + (i / cells.length) * 0.55;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR_HEX[color];
        roundRect(ctx, x + 1, y + 1, C - 2, C - 2, 4);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "#333345";
        ctx.lineWidth = 0.5;
        roundRect(ctx, x + 1, y + 1, C - 2, C - 2, 4);
        ctx.stroke();
      }
    }

    // ── Center finish area ──────────────────────────────────────────────────
    const cx = 7.5 * C, cy = 7.5 * C, cr = C * 1.5;
    // Four triangles
    const tris = [
      { color:"red",    pts:[[6*C,9*C],[9*C,9*C]] },
      { color:"blue",   pts:[[6*C,6*C],[6*C,9*C]] },
      { color:"green",  pts:[[6*C,6*C],[9*C,6*C]] },
      { color:"yellow", pts:[[9*C,6*C],[9*C,9*C]] },
    ];
    for (const tri of tris) {
      ctx.beginPath();
      ctx.moveTo(tri.pts[0][0], tri.pts[0][1]);
      ctx.lineTo(tri.pts[1][0], tri.pts[1][1]);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = COLOR_HEX[tri.color] + "77";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a28";
    ctx.fill();
    ctx.strokeStyle = "#444460";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Star in center
    ctx.fillStyle = "#ffffff44";
    ctx.font = `bold ${C * 1.2}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", cx, cy);

    // ── Yard token slots ─────────────────────────────────────────────────────
    for (const color of standardColors) {
      const slots = YARD_SLOTS[color];
      for (const sl of slots) {
        const x = sl[1] * C, y = sl[0] * C;
        ctx.beginPath();
        ctx.arc(x, y, C * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = "#111118";
        ctx.fill();
        ctx.strokeStyle = COLOR_HEX[color] + "77";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // ── Tokens ──────────────────────────────────────────────────────────────
    // Group by pixel position for stacking
    const byPos = new Map();
    for (const player of players) {
      for (let ti = 0; ti < (player.tokens || []).length; ti++) {
        const pos = tokenPx(player, ti);
        const key = `${Math.round(pos.x)},${Math.round(pos.y)}`;
        if (!byPos.has(key)) byPos.set(key, []);
        byPos.get(key).push({ player, ti, pos });
      }
    }

    for (const [, group] of byPos) {
      const n = group.length;
      for (let i = 0; i < n; i++) {
        const { player, ti, pos } = group[i];
        let dx = 0, dy = 0;
        if (n > 1) {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const spread = n <= 2 ? C * 0.17 : C * 0.22;
          dx = Math.cos(angle) * spread;
          dy = Math.sin(angle) * spread;
        }

        const tx = pos.x + dx, ty = pos.y + dy;
        const isValid = player.id === myId && (validMoves || []).includes(ti);
        const isMe = player.id === myId;
        const r = C * 0.31;

        if (isValid) {
          // Pulsing glow ring
          ctx.beginPath();
          ctx.arc(tx, ty, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = COLOR_HEX[player.color] + "44";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(tx, ty, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = COLOR_HEX[player.color] + "cc";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Token body
        ctx.beginPath();
        ctx.arc(tx, ty, r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(tx - r*0.3, ty - r*0.3, r*0.1, tx, ty, r);
        grad.addColorStop(0, lighten(COLOR_HEX[player.color], 30));
        grad.addColorStop(1, COLOR_HEX[player.color]);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = isMe ? "#ffffffcc" : "#ffffff55";
        ctx.lineWidth = isValid ? 2 : 1.5;
        ctx.stroke();

        // Number label
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ti + 1, tx, ty);
      }
    }
  }

  function handleClick(e) {
    if (!validMoves || validMoves.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = BOARD_PX / rect.width;
    const scaleY = BOARD_PX / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const me = players.find(p => p.id === myId);
    if (!me) return;

    // Group positions to handle stacking (same logic as draw)
    const byPos = new Map();
    for (const player of players) {
      for (let ti = 0; ti < (player.tokens || []).length; ti++) {
        const pos = tokenPx(player, ti);
        const key = `${Math.round(pos.x)},${Math.round(pos.y)}`;
        if (!byPos.has(key)) byPos.set(key, []);
        byPos.get(key).push({ player, ti, pos });
      }
    }

    // Check click on my valid tokens
    for (const [, group] of byPos) {
      const n = group.length;
      for (let i = 0; i < n; i++) {
        const { player, ti, pos } = group[i];
        if (player.id !== myId || !validMoves.includes(ti)) continue;
        let dx = 0, dy = 0;
        if (n > 1) {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const spread = n <= 2 ? CELL * 0.17 : CELL * 0.22;
          dx = Math.cos(angle) * spread;
          dy = Math.sin(angle) * spread;
        }
        const dist = Math.sqrt((mx - pos.x - dx) ** 2 + (my - pos.y - dy) ** 2);
        if (dist < CELL * 0.5) { onTokenClick(ti); return; }
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_PX}
      height={BOARD_PX}
      className="ludo-canvas"
      onClick={handleClick}
      style={{ cursor: (validMoves && validMoves.length > 0) ? "pointer" : "default" }}
    />
  );
}

// Helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function lighten(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Dice face component
// ---------------------------------------------------------------------------
function DieFace({ value, rolling }) {
  const dots = {
    1: [[50, 50]],
    2: [[25, 25],[75, 75]],
    3: [[25, 25],[50, 50],[75, 75]],
    4: [[25, 25],[75, 25],[25, 75],[75, 75]],
    5: [[25, 25],[75, 25],[50, 50],[25, 75],[75, 75]],
    6: [[25, 20],[75, 20],[25, 50],[75, 50],[25, 80],[75, 80]],
  };
  const positions = value ? (dots[value] || []) : [];

  return (
    <div className={`ludo-die-face ${rolling ? "ludo-die-face--rolling" : ""} ${value === 6 ? "ludo-die-face--six" : ""}`}>
      {positions.map(([cx, cy], i) => (
        <div
          key={i}
          className="ludo-dot"
          style={{ left: `${cx}%`, top: `${cy}%` }}
        />
      ))}
      {!value && <span className="ludo-die-question">?</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main game component
// ---------------------------------------------------------------------------
export default function LudoGame() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [dice, setDice] = useState(null);
  const [diceRolled, setDiceRolled] = useState(false);
  const [validMoves, setValidMoves] = useState([]);
  const [winner, setWinner] = useState(null);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [copied, setCopied] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [log, setLog] = useState([]);
  const [gameOver, setGameOver] = useState(null);

  const myPlayer = players.find(p => p.id === myId);
  const isMyTurn = !!myPlayer && players[currentTurn]?.id === myId;
  const isHost = players.length > 0 && players[0]?.id === myId;

  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const addLog = useCallback((msg) => {
    setLog(prev => [...prev.slice(-12), msg]);
  }, []);

  // -----------------------------------------------------------------------
  // Socket
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      setCurrentTurn(state.currentTurn ?? 0);
      setDice(state.dice ?? null);
      setDiceRolled(state.diceRolled ?? false);
      setWinner(state.winner ?? null);
      setMaxPlayers(state.maxPlayers ?? 4);
    }

    function onGameStart(state) {
      setPlayers(state.players || []);
      setPhase("playing");
      setCurrentTurn(state.currentTurn ?? 0);
      setDice(null); setDiceRolled(false); setValidMoves([]);
      setWinner(null); setGameOver(null); setLog([]);
      addLog("Game started!");
    }

    function onTurnStart({ currentTurn: ct }) {
      setCurrentTurn(ct);
      setDice(null); setDiceRolled(false);
      setValidMoves([]); setRolling(false);
    }

    function onDiceRolled({ playerId, roll, forfeit, validMoves: vm }) {
      setDice(roll); setRolling(false);
      const name = playersRef.current.find(p => p.id === playerId)?.name || "Someone";
      if (forfeit) {
        addLog(`${name} rolled three 6s — turn forfeited!`);
        setValidMoves([]);
      } else {
        addLog(`${name} rolled a ${roll}.`);
        if (playerId === myId) {
          setValidMoves(vm || []);
          if (!vm?.length) addLog("No valid moves — skipping.");
        } else {
          setValidMoves([]);
        }
        setDiceRolled(true);
      }
    }

    function onMoveResult({ events, players: newPlayers, gameOver: go }) {
      setPlayers(newPlayers || []);
      setValidMoves([]); setDiceRolled(false);
      for (const ev of (events || [])) {
        if (ev.type === "entered")       addLog(`${ev.color} #${ev.tokenIndex+1} entered the board!`);
        if (ev.type === "captured")      addLog(`${ev.color} #${ev.tokenIndex+1} was sent home!`);
        if (ev.type === "finished")      addLog(`${ev.color} #${ev.tokenIndex+1} reached home!`);
        if (ev.type === "playerFinished") addLog(`${ev.name} finished all tokens!`);
      }
      if (go) setGameOver({ winner: go.winner });
    }

    function onGameOver({ winner: w, winnerName }) {
      setPhase("ended"); setWinner(w);
      setGameOver({ winner: w, winnerName });
      addLog(`${winnerName} wins!`);
    }

    function onError({ message }) {
      if (message === "Room not found.") { clearSession(); navigate("/ludo"); }
    }

    socket.on("ludo-room-state", onRoomState);
    socket.on("ludo-game-start", onGameStart);
    socket.on("ludo-turn-start", onTurnStart);
    socket.on("ludo-dice-rolled", onDiceRolled);
    socket.on("ludo-move-result", onMoveResult);
    socket.on("ludo-game-over", onGameOver);
    socket.on("ludo-error", onError);
    socket.emit("ludo-get-state");

    return () => {
      socket.off("ludo-room-state", onRoomState);
      socket.off("ludo-game-start", onGameStart);
      socket.off("ludo-turn-start", onTurnStart);
      socket.off("ludo-dice-rolled", onDiceRolled);
      socket.off("ludo-move-result", onMoveResult);
      socket.off("ludo-game-over", onGameOver);
      socket.off("ludo-error", onError);
    };
  }, [socket, navigate, myId, addLog]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  function handleLeave() { socket.emit("ludo-leave"); clearSession(); navigate("/ludo"); }
  function handleStart() { socket.emit("ludo-start-game"); }
  function handleRoll() {
    if (!isMyTurn || diceRolled || rolling) return;
    setRolling(true);
    socket.emit("ludo-roll-dice");
  }
  function handleTokenClick(ti) {
    if (!isMyTurn || !diceRolled) return;
    socket.emit("ludo-move-token", { tokenIndex: ti });
    setValidMoves([]);
  }
  function handleSetMax(n) { socket.emit("ludo-set-max-players", { n }); }
  function copyCode() {
    navigator.clipboard.writeText(`${window.location.origin}/ludo/${code}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  // -----------------------------------------------------------------------
  // Lobby
  // -----------------------------------------------------------------------
  if (phase === "lobby") {
    return (
      <div className="ludo-page">
        <div className="ludo-lobby">
          <button className="ludo-back-btn" onClick={handleLeave}>Back to Romp</button>
          <h2 className="ludo-lobby-title">Ludo</h2>

          <div className="ludo-code-row">
            <span className="ludo-code-label">Room</span>
            <span className="ludo-code-val">{code}</span>
            <button className="ludo-copy-btn" onClick={copyCode}>{copied ? "Copied!" : "Copy link"}</button>
          </div>

          {isHost && (
            <div className="ludo-config">
              <span className="ludo-config-label">Players</span>
              <div className="ludo-config-btns">
                {[2,3,4,5,6].map(n => (
                  <button
                    key={n}
                    className={`ludo-cfg-btn ${maxPlayers === n ? "active" : ""}`}
                    onClick={() => handleSetMax(n)}
                  >{n}</button>
                ))}
              </div>
            </div>
          )}

          <div className="ludo-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="ludo-player-row">
                <span className="ludo-color-dot" style={{ background: COLOR_HEX[p.color] }} />
                <span className="ludo-player-name">{p.name}</span>
                {i === 0 && <span className="ludo-badge ludo-badge--host">host</span>}
                {p.id === myId && <span className="ludo-badge ludo-badge--you">you</span>}
              </div>
            ))}
            {players.length < maxPlayers && (
              <div className="ludo-player-row ludo-player-row--empty">
                <span className="ludo-color-dot" style={{ background: "#333" }} />
                <span className="ludo-player-name" style={{ color:"#444" }}>Waiting for player...</span>
              </div>
            )}
          </div>

          {isHost
            ? <button className="ludo-start-btn" onClick={handleStart} disabled={players.length < 2}>
                {players.length < 2 ? "Waiting for players..." : "Start Game"}
              </button>
            : <p className="ludo-wait-text">Waiting for the host to start...</p>
          }
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------
  if (phase === "ended" && gameOver) {
    const winnerPlayer = players.find(p => p.color === gameOver.winner);
    return (
      <div className="ludo-page">
        <div className="ludo-end">
          <div className="ludo-end-trophy">🏆</div>
          <h2 className="ludo-end-title">Game Over</h2>
          <div className="ludo-end-winner" style={{ color: COLOR_HEX[gameOver.winner] }}>
            {gameOver.winnerName || winnerPlayer?.name || "Winner"} wins!
          </div>
          <div className="ludo-end-list">
            {players.map(p => (
              <div key={p.id} className="ludo-end-row">
                <span className="ludo-color-dot" style={{ background: COLOR_HEX[p.color] }} />
                <span>{p.name}</span>
                {p.finished && <span className="ludo-end-done">Finished</span>}
              </div>
            ))}
          </div>
          <button className="ludo-back-btn" style={{ marginTop: 24 }} onClick={handleLeave}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Playing
  // -----------------------------------------------------------------------
  const turnPlayer = players[currentTurn];

  return (
    <div className="ludo-game-layout">
      {/* Left sidebar */}
      <aside className="ludo-aside ludo-aside--left">
        <div className="ludo-turn-card" style={{ borderColor: COLOR_HEX[turnPlayer?.color] + "66" }}>
          <div className="ludo-turn-label">Turn</div>
          <div className="ludo-turn-name" style={{ color: COLOR_HEX[turnPlayer?.color] }}>
            {isMyTurn ? "Your turn" : `${turnPlayer?.name || "..."}'s`}
          </div>
        </div>

        <div className="ludo-scores">
          {players.map((p, i) => (
            <div key={p.id} className={`ludo-score-row ${i === currentTurn ? "ludo-score-row--active" : ""}`}>
              <span className="ludo-color-dot ludo-color-dot--sm" style={{ background: COLOR_HEX[p.color] }} />
              <span className="ludo-score-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
              <span className="ludo-score-val">{(p.tokens || []).filter(t => t.state === "home").length}/4</span>
              {p.finished && <span className="ludo-done-tag">done</span>}
            </div>
          ))}
        </div>

        <button className="ludo-leave-sm" onClick={handleLeave}>Leave</button>
      </aside>

      {/* Board */}
      <main className="ludo-board-area">
        <LudoBoard
          players={players}
          myId={myId}
          validMoves={validMoves}
          onTokenClick={handleTokenClick}
        />
      </main>

      {/* Right sidebar */}
      <aside className="ludo-aside ludo-aside--right">
        <div className="ludo-dice-area">
          <DieFace value={dice} rolling={rolling} />

          {isMyTurn && !diceRolled && (
            <button className="ludo-roll-btn" onClick={handleRoll} disabled={rolling}>
              {rolling ? "Rolling..." : "Roll Dice"}
            </button>
          )}
          {isMyTurn && diceRolled && validMoves.length > 0 && (
            <p className="ludo-pick-hint">Click a token to move</p>
          )}
          {!isMyTurn && (
            <p className="ludo-opp-hint">{turnPlayer?.name || "..."} is rolling...</p>
          )}
        </div>

        <div className="ludo-log-panel">
          <div className="ludo-log-title">Events</div>
          {log.slice().reverse().map((msg, i) => (
            <div key={i} className="ludo-log-line" style={{ opacity: 1 - i * 0.07 }}>{msg}</div>
          ))}
        </div>
      </aside>
    </div>
  );
}
