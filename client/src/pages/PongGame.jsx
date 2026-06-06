import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./PongGame.css";

// Must match PongRoom server constants
const CANVAS_W = 800;
const CANVAS_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const LEFT_PADDLE_X = PADDLE_W + 10;
const RIGHT_PADDLE_X = CANVAS_W - PADDLE_W - 10;
const WIN_SCORE = 7;

export default function PongGame() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [myIndex, setMyIndex] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [copied, setCopied] = useState(false);

  // Game state (updated every tick)
  const gameStateRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const myPaddleYRef = useRef(CANVAS_H / 2 - PADDLE_H / 2);
  const lastSentPaddleRef = useRef(-1);
  const canvasRectRef = useRef(null);

  const myPlayer = players.find(p => p.id === myId);
  const isHost = players.length > 0 && players[0]?.id === myId;

  // -----------------------------------------------------------------------
  // Render loop
  // -----------------------------------------------------------------------
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const gs = gameStateRef.current;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Center line
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "#ffffff18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W / 2, 0);
    ctx.lineTo(CANVAS_W / 2, CANVAS_H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Top/bottom walls
    ctx.fillStyle = "#00e5ff22";
    ctx.fillRect(0, 0, CANVAS_W, 4);
    ctx.fillRect(0, CANVAS_H - 4, CANVAS_W, 4);
    ctx.fillStyle = "#00e5ffaa";
    ctx.fillRect(0, 0, CANVAS_W, 2);
    ctx.fillRect(0, CANVAS_H - 2, CANVAS_W, 2);

    if (!gs) return;

    // Paddles
    const paddles = gs.paddles || [];
    for (const p of paddles) {
      const isLeft = p.index === 0;
      const px = isLeft ? LEFT_PADDLE_X : RIGHT_PADDLE_X;
      const py = p.paddleY;
      const isMe = p.index === myIndex;

      // Glow
      ctx.shadowColor = isMe ? "#00e5ff" : "#ff6b6b";
      ctx.shadowBlur = 12;

      // Paddle body
      ctx.fillStyle = isMe ? "#00e5ff" : "#ff6b6b";
      ctx.beginPath();
      ctx.roundRect(px, py, PADDLE_W, PADDLE_H, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Ball
    const ball = gs.ball;
    if (ball) {
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Scores
    ctx.fillStyle = "#ffffff33";
    ctx.font = "bold 72px 'Georgia', serif";
    ctx.textAlign = "right";
    ctx.fillText(gs.scores?.[0] ?? 0, CANVAS_W / 2 - 30, 80);
    ctx.textAlign = "left";
    ctx.fillText(gs.scores?.[1] ?? 0, CANVAS_W / 2 + 30, 80);

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [myIndex]);

  useEffect(() => {
    if (phase === "playing") {
      animFrameRef.current = requestAnimationFrame(drawFrame);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, drawFrame]);

  // -----------------------------------------------------------------------
  // Mouse / touch paddle control
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "playing") return;

    function getCanvasRect() {
      canvasRectRef.current = canvasRef.current?.getBoundingClientRect();
    }
    getCanvasRect();
    window.addEventListener("resize", getCanvasRect);

    function updatePaddleFromClientY(clientY) {
      const rect = canvasRectRef.current;
      if (!rect) return;
      const scaleY = CANVAS_H / rect.height;
      const y = (clientY - rect.top) * scaleY - PADDLE_H / 2;
      const clamped = Math.max(0, Math.min(CANVAS_H - PADDLE_H, y));
      myPaddleYRef.current = clamped;

      // Throttle: send only if changed by >= 2px
      if (Math.abs(clamped - lastSentPaddleRef.current) >= 2) {
        socket.emit("pong-paddle-move", { paddleY: clamped });
        lastSentPaddleRef.current = clamped;

        // Update local gameState for immediate feedback
        if (gameStateRef.current) {
          const paddles = gameStateRef.current.paddles || [];
          const myP = paddles.find(p => p.index === myIndex);
          if (myP) myP.paddleY = clamped;
        }
      }
    }

    function onMouseMove(e) { updatePaddleFromClientY(e.clientY); }
    function onTouchMove(e) {
      e.preventDefault();
      updatePaddleFromClientY(e.touches[0].clientY);
    }

    const canvas = canvasRef.current;
    canvas?.addEventListener("mousemove", onMouseMove);
    canvas?.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      canvas?.removeEventListener("mousemove", onMouseMove);
      canvas?.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", getCanvasRect);
    };
  }, [phase, socket, myIndex]);

  // -----------------------------------------------------------------------
  // Socket listeners
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      setScores(state.scores || [0, 0]);
      setWinner(state.winner ?? null);

      const me = (state.players || []).find(p => p.id === myId);
      if (me) setMyIndex(me.index);
    }

    function onPlayerDisconnected() {
      setPhase(prev => prev === "playing" || prev === "countdown" ? "reconnecting" : prev);
    }

    function onCountdown({ seconds }) {
      setPhase("countdown");
      setCountdown(seconds);
      let c = seconds;
      const iv = setInterval(() => {
        c--;
        if (c <= 0) { clearInterval(iv); setCountdown(null); }
        else setCountdown(c);
      }, 1000);
    }

    function onGameState(gs) {
      gameStateRef.current = gs;
      setScores(gs.scores || [0, 0]);
      if (phase !== "playing") setPhase("playing");
    }

    function onScored({ scores: s, scorer }) {
      setScores(s);
    }

    function onGameOver({ winner: w, winnerName, scores: s, reason }) {
      setPhase("ended");
      setWinner(w);
      setScores(s || [0, 0]);
      setGameOver({ winner: w, winnerName, reason });
      gameStateRef.current = null;
    }

    function onError({ message }) {
      if (message === "Room not found.") { clearSession(); navigate("/pong"); }
    }

    socket.on("pong-room-state", onRoomState);
    socket.on("pong-countdown", onCountdown);
    socket.on("pong-game-state", onGameState);
    socket.on("pong-scored", onScored);
    socket.on("pong-game-over", onGameOver);
    socket.on("pong-player-disconnected", onPlayerDisconnected);
    socket.on("pong-error", onError);
    socket.emit("pong-get-state");

    return () => {
      socket.off("pong-room-state", onRoomState);
      socket.off("pong-countdown", onCountdown);
      socket.off("pong-game-state", onGameState);
      socket.off("pong-scored", onScored);
      socket.off("pong-game-over", onGameOver);
      socket.off("pong-player-disconnected", onPlayerDisconnected);
      socket.off("pong-error", onError);
    };
  }, [socket, navigate, myId, phase]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  function handleLeave() { socket.emit("pong-leave"); clearSession(); navigate("/pong"); }
  function handleStart() { socket.emit("pong-start-game"); }
  function handleRematch() { socket.emit("pong-rematch"); }
  function copyCode() {
    navigator.clipboard.writeText(`${window.location.origin}/pong/${code}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  // -----------------------------------------------------------------------
  // Lobby
  // -----------------------------------------------------------------------
  if (phase === "lobby") {
    return (
      <div className="pong-page">
        <div className="pong-lobby">
          <button className="pong-back-btn" onClick={handleLeave}>Back to Romp</button>
          <h2 className="pong-lobby-title">Pong</h2>

          <div className="pong-code-row">
            <span className="pong-code-label">Room</span>
            <span className="pong-code-val">{code}</span>
            <button className="pong-copy-btn" onClick={copyCode}>{copied ? "Copied!" : "Copy link"}</button>
          </div>

          <div className="pong-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="pong-player-row">
                <span className="pong-side-tag" style={{ color: i === 0 ? "#00e5ff" : "#ff6b6b" }}>
                  {i === 0 ? "Left" : "Right"}
                </span>
                <span className="pong-player-name">{p.name}</span>
                {p.id === myId && <span className="pong-you-tag">you</span>}
              </div>
            ))}
            {players.length < 2 && (
              <div className="pong-player-row pong-player-row--empty">
                <span className="pong-side-tag" style={{ color: "#555" }}>
                  {players.length === 0 ? "Left" : "Right"}
                </span>
                <span className="pong-player-name" style={{ color: "#444" }}>Waiting...</span>
              </div>
            )}
          </div>

          {isHost
            ? <button className="pong-start-btn" onClick={handleStart} disabled={players.length < 2}>
                {players.length < 2 ? "Waiting for opponent..." : "Start Game"}
              </button>
            : <p className="pong-wait-text">Waiting for host to start...</p>
          }
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------
  if (phase === "ended" && gameOver) {
    const iWon = gameOver.winner === myIndex;
    return (
      <div className="pong-page">
        <div className="pong-end">
          <div className="pong-end-result" style={{ color: iWon ? "#00e5ff" : "#ff6b6b" }}>
            {iWon ? "You Win!" : "You Lose"}
          </div>
          <div className="pong-end-winner">{gameOver.winnerName}</div>
          <div className="pong-end-score">
            <span style={{ color: "#00e5ff" }}>{players[0]?.name || "P1"}: {scores[0]}</span>
            <span className="pong-end-dash">—</span>
            <span style={{ color: "#ff6b6b" }}>{players[1]?.name || "P2"}: {scores[1]}</span>
          </div>
          {gameOver.reason === "forfeit" && (
            <p className="pong-forfeit-note">Opponent disconnected.</p>
          )}
          <div className="pong-end-btns">
            {isHost && (
              <button className="pbtn pbtn-primary pong-rematch-btn" onClick={handleRematch}>
                Play Again
              </button>
            )}
            <button className="pbtn pbtn-ghost" onClick={handleLeave}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Opponent reconnecting
  // -----------------------------------------------------------------------
  if (phase === "reconnecting") {
    return (
      <div className="pong-page">
        <div className="pong-end">
          <div className="pong-end-result" style={{ color: "#f0c040" }}>Opponent Disconnected</div>
          <p style={{ color: "#888", marginTop: 8 }}>Waiting up to 30 seconds for them to reconnect...</p>
          <div className="pong-end-btns" style={{ marginTop: 24 }}>
            <button className="pbtn pbtn-ghost" onClick={handleLeave}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Playing / countdown
  // -----------------------------------------------------------------------
  const p0 = players[0];
  const p1 = players[1];

  return (
    <div className="pong-game-wrap">
      {/* Score bar */}
      <div className="pong-scorebar">
        <div className="pong-scorebar-side">
          <span className="pong-sb-name" style={{ color: "#00e5ff" }}>{p0?.name || "P1"}</span>
          {myIndex === 0 && <span className="pong-sb-you">(you)</span>}
        </div>
        <div className="pong-sb-scores">
          <span style={{ color: "#00e5ff" }}>{scores[0]}</span>
          <span className="pong-sb-sep">—</span>
          <span style={{ color: "#ff6b6b" }}>{scores[1]}</span>
        </div>
        <div className="pong-scorebar-side pong-scorebar-side--right">
          {myIndex === 1 && <span className="pong-sb-you">(you)</span>}
          <span className="pong-sb-name" style={{ color: "#ff6b6b" }}>{p1?.name || "P2"}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="pong-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="pong-canvas"
        />

        {phase === "countdown" && countdown !== null && (
          <div className="pong-countdown">
            <span className="pong-countdown-num">{countdown}</span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <p className="pong-hint">Move your mouse over the board to control your paddle</p>
    </div>
  );
}
