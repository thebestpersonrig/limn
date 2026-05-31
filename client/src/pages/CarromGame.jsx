import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import CarromBoard from "./CarromBoard";
import {
  createInitialPieces, simulateAnimated, launchVector,
  BASELINE_Y_BOTTOM, BASELINE_Y_TOP,
  BASELINE_MIN_X, BASELINE_MAX_X, BOARD_SIZE,
} from "./carromPhysics";
import "./CarromGame.css";

export default function CarromGame() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  // Game state
  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [myColor, setMyColor] = useState(null);
  const [myIndex, setMyIndex] = useState(null);
  const [turn, setTurn] = useState(0);
  const [pocketedCount, setPocketedCount] = useState({ white: 0, black: 0 });
  const [matchScores, setMatchScores] = useState([0, 0]);
  const [boardNumber, setBoardNumber] = useState(1);
  const [needsCover, setNeedsCover] = useState(null);
  const [copied, setCopied] = useState(false);

  // Striker + aiming
  const [strikerPos, setStrikerPos] = useState(null);
  const [aimState, setAimState] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [animatingBodies, setAnimatingBodies] = useState(null);
  const cancelSimRef = useRef(null);

  // Toast messages
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Match result
  const [matchResult, setMatchResult] = useState(null);
  // Board end overlay
  const [boardEndData, setBoardEndData] = useState(null);

  const isMyTurn = myIndex === turn;
  const myBaseline = myColor === "white" ? "bottom" : "top";
  const baselineY = myBaseline === "bottom" ? BASELINE_Y_BOTTOM : BASELINE_Y_TOP;

  // -----------------------------------------------------------------------
  // Toast helper
  // -----------------------------------------------------------------------
  const addToast = useCallback((msg, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // -----------------------------------------------------------------------
  // Reset striker position
  // -----------------------------------------------------------------------
  const resetStriker = useCallback(() => {
    const cx = (BASELINE_MIN_X + BASELINE_MAX_X) / 2;
    setStrikerPos({ x: cx, y: baselineY });
  }, [baselineY]);

  // -----------------------------------------------------------------------
  // Socket listeners
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      if (state.pieces && state.pieces.length > 0) setPieces(state.pieces);
      setTurn(state.turn);
      setPocketedCount(state.pocketedCount || { white: 0, black: 0 });
      setMatchScores(state.matchScores || [0, 0]);
      setBoardNumber(state.boardNumber || 1);
      setNeedsCover(state.needsCover);

      // Figure out my color
      const me = (state.players || []).find(p => p.id === socket.id);
      if (me) {
        setMyColor(me.color);
        setMyIndex(me.index);
      }
    }

    function onGameStart(data) {
      setPhase("playing");
      setMyColor(data.myColor);
      setMyIndex(data.myIndex);
      setPlayers(data.players);
      setMatchScores(data.matchScores);
      setBoardNumber(data.boardNumber);
      setTurn(data.turn);
      setPocketedCount({ white: 0, black: 0 });
      setNeedsCover(null);
      setBoardEndData(null);
      setMatchResult(null);

      // Initialize pieces client-side
      const initialPieces = createInitialPieces();
      setPieces(initialPieces);
    }

    function onOpponentShot({ strikerX, angle, force }) {
      // Replay opponent's shot on our board
      setSimulating(true);
      const oppBaseline = myColor === "white" ? BASELINE_Y_TOP : BASELINE_Y_BOTTOM;
      const { vx, vy } = launchVector(angle, force);
      const striker = { x: strikerX, y: oppBaseline, vx, vy };

      setPieces(prev => {
        const cancel = simulateAnimated(
          prev, striker,
          (frameBodies) => {
            setAnimatingBodies(frameBodies);
          },
          (result) => {
            setAnimatingBodies(null);
            setSimulating(false);
            // Server will send turn-result with authoritative state
          },
        );
        cancelSimRef.current = cancel;
        return prev;
      });
    }

    function onTurnResult(data) {
      setPieces(data.pieces);
      setTurn(data.turn);
      setPocketedCount(data.pocketedCount);
      setMatchScores(data.matchScores);
      setBoardNumber(data.boardNumber);
      setNeedsCover(data.needsCover);

      // Show messages
      for (const msg of (data.messages || [])) {
        const type = data.foul ? "foul" : data.continuation ? "good" : "info";
        addToast(msg, type);
      }

      // Board end
      if (data.boardEnd) {
        setBoardEndData(data.boardEnd);
        // Auto-clear after 4 seconds
        setTimeout(() => {
          setBoardEndData(null);
          // Re-initialize pieces for next board
          const fresh = createInitialPieces();
          setPieces(fresh);
        }, 4000);
      }
    }

    function onMatchOver(data) {
      setPhase("ended");
      setMatchResult(data);
    }

    function onError({ message }) {
      if (message === "Room not found.") {
        clearSession();
        navigate("/carrom");
      } else {
        addToast(message, "foul");
      }
    }

    socket.on("carr-room-state", onRoomState);
    socket.on("carr-game-start", onGameStart);
    socket.on("carr-opponent-shot", onOpponentShot);
    socket.on("carr-turn-result", onTurnResult);
    socket.on("carr-match-over", onMatchOver);
    socket.on("carr-error", onError);

    socket.emit("carr-get-state");

    return () => {
      socket.off("carr-room-state", onRoomState);
      socket.off("carr-game-start", onGameStart);
      socket.off("carr-opponent-shot", onOpponentShot);
      socket.off("carr-turn-result", onTurnResult);
      socket.off("carr-match-over", onMatchOver);
      socket.off("carr-error", onError);
      if (cancelSimRef.current) cancelSimRef.current();
    };
  }, [socket, navigate, myColor, addToast]);

  // Reset striker when turn changes to me
  useEffect(() => {
    if (isMyTurn && phase === "playing" && !simulating) {
      resetStriker();
    }
  }, [isMyTurn, phase, simulating, resetStriker]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  function handleLeave() {
    socket.emit("carr-leave");
    clearSession();
    navigate("/carrom");
  }

  function handleStart() {
    socket.emit("carr-start-game");
  }

  function handleStrikerMove(x) {
    setStrikerPos(prev => prev ? { x, y: prev.y } : null);
  }

  function handleAimStart(x, y) {
    setAimState({ active: true, startX: x, startY: y, currentX: x, currentY: y });
  }

  function handleAimMove(x, y) {
    setAimState(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  }

  function handleAimEnd() {
    if (!aimState || !aimState.active || !strikerPos) {
      setAimState(null);
      return;
    }

    const dx = aimState.startX - aimState.currentX;
    const dy = aimState.startY - aimState.currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
      // Too short, cancel
      setAimState(null);
      return;
    }

    // Calculate shot
    const maxDrag = 150;
    const power = Math.min(dist / maxDrag, 1);
    const angle = Math.atan2(dy, dx);
    const force = power * 28; // MAX_FORCE

    setAimState(null);
    setSimulating(true);

    // Send shot to server
    socket.emit("carr-shot", { strikerX: strikerPos.x, angle, force });

    // Run local simulation for animation
    const { vx, vy } = launchVector(angle, force);
    const striker = { x: strikerPos.x, y: strikerPos.y, vx, vy };

    const cancel = simulateAnimated(
      pieces, striker,
      (frameBodies) => {
        setAnimatingBodies(frameBodies);
      },
      (result) => {
        setAnimatingBodies(null);
        setSimulating(false);
        setStrikerPos(null);

        // Send result to server
        socket.emit("carr-shot-result", {
          pocketedIds: result.pocketedIds,
          finalPositions: result.finalPositions,
          strikerPocketed: result.strikerPocketed,
          noPieceHit: !result.hitSomething,
        });
      },
    );
    cancelSimRef.current = cancel;
  }

  function copyCode() {
    const url = `${window.location.origin}/carrom/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost = players.length > 0 && players[0]?.id === myId;

  // -----------------------------------------------------------------------
  // Lobby
  // -----------------------------------------------------------------------
  if (phase === "lobby") {
    return (
      <div className="carr-page">
        <div className="carr-lobby">
          <button className="carr-leave" onClick={handleLeave}>Back</button>
          <h2 className="carr-lobby-title">Carrom</h2>
          <div className="carr-code-row">
            <span className="carr-code-label">Room code</span>
            <div className="carr-code-box">
              <span className="carr-code-badge">{code}</span>
              <button className="carr-copy-btn" onClick={copyCode}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
          <div className="carr-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="carr-player-row">
                <span className="carr-player-avatar" style={{
                  background: p.color === "white" ? "#f5f0e0" : "#1a1a2e",
                  color: p.color === "white" ? "#333" : "#fff",
                }}>{p.name[0].toUpperCase()}</span>
                <span className="carr-player-name">{p.name}</span>
                <span className="carr-color-badge" data-color={p.color}>{p.color}</span>
                {i === 0 && <span className="carr-host-badge">host</span>}
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="carr-start-btn"
              onClick={handleStart}
              disabled={players.length < 2}
            >
              {players.length < 2 ? "Waiting for opponent..." : "Start Game"}
            </button>
          ) : (
            <p className="carr-waiting-text">Waiting for the host to start...</p>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Match ended
  // -----------------------------------------------------------------------
  if (phase === "ended" && matchResult) {
    return (
      <div className="carr-page">
        <div className="carr-end">
          <h2 className="carr-end-title">Match Over!</h2>
          <div className="carr-end-winner">
            <strong>{matchResult.winner}</strong> wins!
            {matchResult.forfeit && <span className="carr-end-forfeit"> (forfeit)</span>}
          </div>
          <div className="carr-end-scores">
            {players.map((p, i) => (
              <div key={p.id} className={`carr-end-score-row ${matchResult.winnerIndex === i ? "carr-end-first" : ""}`}>
                <span className="carr-end-color" data-color={p.color} />
                <span className="carr-end-name">{p.name}</span>
                <span className="carr-end-points">{matchResult.matchScores[i]} pts</span>
              </div>
            ))}
          </div>
          <button className="carr-end-back" onClick={handleLeave}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Playing
  // -----------------------------------------------------------------------
  const opponentName = players.find(p => p.index !== myIndex)?.name || "Opponent";
  const myName = players.find(p => p.index === myIndex)?.name || "You";

  return (
    <div className="carr-page">
      <div className="carr-game">
        {/* Header */}
        <div className="carr-game-header">
          <button className="carr-leave" onClick={handleLeave}>Leave</button>
          <span className="carr-board-info">Board {boardNumber}</span>
          <span className="carr-match-score">
            {myName} {matchScores[myIndex] || 0} - {matchScores[1 - myIndex] || 0} {opponentName}
          </span>
        </div>

        {/* Turn indicator */}
        <div className="carr-turn-bar">
          <div className={`carr-turn-player ${isMyTurn ? "carr-turn-active" : ""}`}>
            <span className="carr-turn-disc" data-color={myColor} />
            <span>{myName}</span>
            {isMyTurn && <span className="carr-turn-arrow">Your turn</span>}
          </div>
          <div className="carr-turn-vs">vs</div>
          <div className={`carr-turn-player ${!isMyTurn ? "carr-turn-active" : ""}`}>
            <span className="carr-turn-disc" data-color={myColor === "white" ? "black" : "white"} />
            <span>{opponentName}</span>
            {!isMyTurn && <span className="carr-turn-arrow">Their turn</span>}
          </div>
        </div>

        {/* Pocketed counts */}
        <div className="carr-pocketed-bar">
          <div className="carr-pocketed-side">
            <span className="carr-pocketed-label">{myColor === "white" ? "White" : "Black"}</span>
            <span className="carr-pocketed-count">{pocketedCount[myColor] || 0}/9</span>
          </div>
          <div className="carr-pocketed-side">
            <span className="carr-pocketed-label">{myColor === "white" ? "Black" : "White"}</span>
            <span className="carr-pocketed-count">{pocketedCount[myColor === "white" ? "black" : "white"] || 0}/9</span>
          </div>
        </div>

        {/* Board */}
        <CarromBoard
          pieces={pieces}
          animatingBodies={animatingBodies}
          isMyTurn={isMyTurn}
          myBaseline={myBaseline}
          strikerPos={strikerPos}
          onStrikerMove={handleStrikerMove}
          aimState={aimState}
          onAimStart={handleAimStart}
          onAimMove={handleAimMove}
          onAimEnd={handleAimEnd}
          simulating={simulating}
        />

        {/* Instructions */}
        {isMyTurn && !simulating && (
          <p className="carr-instructions">
            Drag the striker along the baseline to position. Click and pull back to aim and shoot.
          </p>
        )}
        {!isMyTurn && !simulating && (
          <p className="carr-instructions carr-instructions--waiting">
            Waiting for {opponentName} to shoot...
          </p>
        )}

        {/* Need cover warning */}
        {needsCover === myIndex && (
          <div className="carr-cover-warning">You must cover the queen this shot!</div>
        )}

        {/* Toasts */}
        <div className="carr-toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`carr-toast carr-toast--${t.type}`}>{t.msg}</div>
          ))}
        </div>

        {/* Board end overlay */}
        {boardEndData && (
          <div className="carr-board-end-overlay">
            <div className="carr-board-end-card">
              <h3>Board {boardNumber - 1} Complete</h3>
              <p className="carr-board-end-winner">{boardEndData.winnerName} wins the board!</p>
              <p className="carr-board-end-score">+{boardEndData.boardScore} points
                {boardEndData.queenBonus > 0 && ` (includes +${boardEndData.queenBonus} queen bonus)`}
              </p>
              <p className="carr-board-end-match">
                Match: {matchScores[0]} - {matchScores[1]}
              </p>
              <p className="carr-board-end-next">Next board starting...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
