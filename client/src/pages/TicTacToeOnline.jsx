import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./TicTacToeOnline.css";

export default function TicTacToeOnline() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [board, setBoard] = useState(Array(9).fill(""));
  const [mySymbol, setMySymbol] = useState(null);
  const [currentTurn, setCurrentTurn] = useState("X");
  const [scores, setScores] = useState({ X: 0, O: 0, ties: 0 });
  const [round, setRound] = useState(1);
  const [opponentName, setOpponentName] = useState(null);
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState(null);
  const [forfeit, setForfeit] = useState(false);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      setScores(state.scores);
      setRound(state.round);
      // Determine my symbol from players
      const me = (state.players || []).find(p => p.id === socket.id);
      if (me) setMySymbol(me.symbol);
      const opp = (state.players || []).find(p => p.id !== socket.id);
      if (opp) setOpponentName(opp.name);
    }

    function onGameState(state) {
      setBoard(state.board);
      setMySymbol(state.mySymbol);
      setCurrentTurn(state.currentTurn);
      setScores(state.scores);
      setRound(state.round);
      setOpponentName(state.opponentName);
      setPhase(state.phase);
      setWinner(null);
      setWinningLine(null);
      setForfeit(false);
      setRematchWaiting(false);
    }

    function onGameOver(data) {
      setBoard(data.board);
      setWinner(data.winner);
      setWinningLine(data.winningLine);
      setScores(data.scores);
      setForfeit(data.forfeit || false);
      setRematchWaiting(false);
    }

    function onRematchWaiting({ from }) {
      setRematchWaiting(true);
    }

    function onError({ message }) {
      // If room not found, go back
      if (message === "Room not found.") {
        clearSession();
        navigate("/tictactoe");
      }
    }

    socket.on("ttt-room-state", onRoomState);
    socket.on("ttt-game-state", onGameState);
    socket.on("ttt-game-over", onGameOver);
    socket.on("ttt-rematch-waiting", onRematchWaiting);
    socket.on("ttt-error", onError);

    socket.emit("ttt-get-state");

    return () => {
      socket.off("ttt-room-state", onRoomState);
      socket.off("ttt-game-state", onGameState);
      socket.off("ttt-game-over", onGameOver);
      socket.off("ttt-rematch-waiting", onRematchWaiting);
      socket.off("ttt-error", onError);
    };
  }, []);

  function handleCellClick(index) {
    if (winner) return;
    if (board[index] !== "") return;
    if (mySymbol !== currentTurn) return;
    socket.emit("ttt-make-move", { cellIndex: index });
  }

  function handleRematch() {
    socket.emit("ttt-rematch");
    setRematchWaiting(true);
  }

  function handleLeave() {
    socket.emit("ttt-leave");
    clearSession();
    navigate("/tictactoe");
  }

  function copyCode() {
    const url = `${window.location.origin}/tictactoe/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isMyTurn = mySymbol === currentTurn && !winner;
  const myScore = scores[mySymbol] || 0;
  const oppScore = scores[mySymbol === "X" ? "O" : "X"] || 0;

  // Status text
  let statusText = "";
  if (phase === "lobby") {
    statusText = "Waiting for opponent...";
  } else if (winner) {
    if (forfeit) statusText = "Opponent left. You win!";
    else if (winner === "Tie") statusText = "It's a tie!";
    else if (winner === mySymbol) statusText = "You win!";
    else statusText = "You lose!";
  } else if (isMyTurn) {
    statusText = "Your turn";
  } else {
    statusText = `${opponentName || "Opponent"}'s turn`;
  }

  // Lobby view
  if (phase === "lobby") {
    return (
      <div className="ttt-ol">
        <div className="ttt-ol-lobby">
          <button className="ttt-ol-back" onClick={handleLeave}>Back</button>
          <h2 className="ttt-ol-title">Tic-Tac-Toe</h2>
          <div className="ttt-ol-code-row">
            <span className="ttt-ol-code-label">Room code</span>
            <div className="ttt-ol-code-box">
              <span className="ttt-ol-code-badge">{code}</span>
              <button className="ttt-ol-copy-btn" onClick={copyCode}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
          <div className="ttt-ol-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="ttt-ol-player-row">
                <span className="ttt-ol-player-symbol">{p.symbol}</span>
                <span className="ttt-ol-player-name">{p.name}</span>
                {p.id === myId && <span className="ttt-ol-you-badge">you</span>}
              </div>
            ))}
            {players.length < 2 && (
              <div className="ttt-ol-player-row ttt-ol-player-row--empty">
                <span className="ttt-ol-player-symbol">?</span>
                <span className="ttt-ol-player-name">Waiting for opponent...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ttt-ol">
      <div className="ttt-ol-game">
        {/* Header */}
        <div className="ttt-ol-header">
          <button className="ttt-ol-back" onClick={handleLeave}>Leave</button>
          <div className="ttt-ol-header-info">
            <span className="ttt-ol-round">Round {round}</span>
            <span className="ttt-ol-symbol-badge">You are <strong>{mySymbol}</strong></span>
          </div>
        </div>

        {/* Scoreboard */}
        <div className="ttt-ol-scoreboard">
          <div className={`ttt-ol-score-card ${mySymbol === "X" ? "ttt-ol-score--you" : ""}`}>
            <div className="ttt-ol-score-label">{mySymbol === "X" ? "You" : opponentName || "Opponent"}</div>
            <strong className="ttt-ol-score-val">{mySymbol === "X" ? myScore : oppScore}</strong>
          </div>
          <div className="ttt-ol-score-card ttt-ol-score--tie">
            <div className="ttt-ol-score-label">Ties</div>
            <strong className="ttt-ol-score-val">{scores.ties}</strong>
          </div>
          <div className={`ttt-ol-score-card ${mySymbol === "O" ? "ttt-ol-score--you" : ""}`}>
            <div className="ttt-ol-score-label">{mySymbol === "O" ? "You" : opponentName || "Opponent"}</div>
            <strong className="ttt-ol-score-val">{mySymbol === "O" ? myScore : oppScore}</strong>
          </div>
        </div>

        {/* Status */}
        <p className={`ttt-ol-status ${isMyTurn ? "ttt-ol-status--myturn" : ""} ${winner ? "ttt-ol-status--done" : ""}`}>
          {statusText}
        </p>

        {/* Board */}
        <div className="ttt-ol-board">
          {board.map((cell, i) => {
            const isWin = winningLine && winningLine.includes(i);
            return (
              <button
                key={i}
                className={`ttt-ol-cell ${cell === "X" ? "ttt-ol-cell--x" : ""} ${cell === "O" ? "ttt-ol-cell--o" : ""} ${isWin ? "ttt-ol-cell--win" : ""} ${!cell && isMyTurn ? "ttt-ol-cell--clickable" : ""}`}
                onClick={() => handleCellClick(i)}
                disabled={!!cell || !!winner || !isMyTurn}
              >
                {cell}
              </button>
            );
          })}
        </div>

        {/* Post-game */}
        {winner && (
          <div className="ttt-ol-postgame">
            {rematchWaiting ? (
              <p className="ttt-ol-waiting-rematch">Waiting for opponent...</p>
            ) : (
              <button className="ttt-ol-rematch-btn" onClick={handleRematch}>
                Play Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
