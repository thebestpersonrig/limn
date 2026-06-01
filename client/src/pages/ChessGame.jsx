import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import {
  createInitialState, getValidMoves, makeMove, getPieceSymbol, isInCheck,
} from "./chessLogic";
import "./ChessGame.css";

export default function ChessGame() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [myColor, setMyColor] = useState(null);
  const [myIndex, setMyIndex] = useState(null);
  const [scores, setScores] = useState({ w: 0, b: 0, draws: 0 });
  const [gameNumber, setGameNumber] = useState(1);
  const [copied, setCopied] = useState(false);

  // Game state
  const [gameState, setGameState] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [gameOverData, setGameOverData] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [promotionPending, setPromotionPending] = useState(null);
  const [rematchSent, setRematchSent] = useState(false);

  const isMyTurn = gameState?.turn === myColor;
  const flipped = myColor === "b";

  // -----------------------------------------------------------------------
  // Socket listeners
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      setScores(state.scores || { w: 0, b: 0, draws: 0 });
      setGameNumber(state.gameNumber || 1);
      const me = (state.players || []).find(p => p.id === socket.id);
      if (me) { setMyColor(me.color); setMyIndex(me.index); }
    }

    function onGameStart(data) {
      setPhase("playing");
      setMyColor(data.myColor);
      setMyIndex(data.myIndex);
      setPlayers(data.players);
      setScores(data.scores);
      setGameNumber(data.gameNumber);
      setGameState(createInitialState());
      setSelectedSquare(null);
      setValidMoves([]);
      setGameOverData(null);
      setDrawOffered(false);
      setPromotionPending(null);
      setRematchSent(false);
    }

    function onOpponentMove({ from, to, promoteTo, status, winner }) {
      setGameState(prev => {
        if (!prev) return prev;
        const newState = makeMove(prev, from.row, from.col, to.row, to.col, promoteTo);
        return newState || prev;
      });
      setSelectedSquare(null);
      setValidMoves([]);
    }

    function onGameOver(data) {
      setPhase("ended");
      setGameOverData(data);
      setScores(data.scores);
    }

    function onDrawOffered({ from }) {
      setDrawOffered(true);
    }

    function onError({ message }) {
      if (message === "Room not found.") {
        clearSession();
        navigate("/chess");
      }
    }

    socket.on("chess-room-state", onRoomState);
    socket.on("chess-game-start", onGameStart);
    socket.on("chess-opponent-move", onOpponentMove);
    socket.on("chess-game-over", onGameOver);
    socket.on("chess-draw-offered", onDrawOffered);
    socket.on("chess-error", onError);

    socket.emit("chess-get-state");

    return () => {
      socket.off("chess-room-state", onRoomState);
      socket.off("chess-game-start", onGameStart);
      socket.off("chess-opponent-move", onOpponentMove);
      socket.off("chess-game-over", onGameOver);
      socket.off("chess-draw-offered", onDrawOffered);
      socket.off("chess-error", onError);
    };
  }, [socket, navigate]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  function handleLeave() {
    socket.emit("chess-leave");
    clearSession();
    navigate("/chess");
  }

  function handleStart() {
    socket.emit("chess-start-game");
  }

  function handleSquareClick(row, col) {
    if (!gameState || !isMyTurn || phase !== "playing") return;

    const piece = gameState.board[row][col];

    // If a square is selected and this is a valid move target
    if (selectedSquare) {
      const move = validMoves.find(m => m.row === row && m.col === col);
      if (move) {
        // Check if this is a promotion move
        if (move.special?.startsWith("promote")) {
          setPromotionPending({ fromRow: selectedSquare.row, fromCol: selectedSquare.col, toRow: row, toCol: col });
          return;
        }

        executeMove(selectedSquare.row, selectedSquare.col, row, col, null);
        return;
      }

      // Clicked on own piece -- select it instead
      if (piece && piece.color === myColor) {
        selectPiece(row, col);
        return;
      }

      // Deselect
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    // Select a piece
    if (piece && piece.color === myColor) {
      selectPiece(row, col);
    }
  }

  function selectPiece(row, col) {
    setSelectedSquare({ row, col });
    const moves = getValidMoves(gameState, row, col);
    setValidMoves(moves);
  }

  function executeMove(fromRow, fromCol, toRow, toCol, promoteTo) {
    const newState = makeMove(gameState, fromRow, fromCol, toRow, toCol, promoteTo);
    if (!newState) return;

    setGameState(newState);
    setSelectedSquare(null);
    setValidMoves([]);
    setPromotionPending(null);
    setDrawOffered(false);

    socket.emit("chess-move", {
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      promoteTo,
      resultState: { status: newState.status, winner: newState.winner },
    });
  }

  function handlePromotion(type) {
    if (!promotionPending) return;
    const { fromRow, fromCol, toRow, toCol } = promotionPending;
    executeMove(fromRow, fromCol, toRow, toCol, type);
  }

  function handleResign() {
    socket.emit("chess-resign");
  }

  function handleDrawOffer() {
    socket.emit("chess-draw-offer");
  }

  function handleAcceptDraw() {
    socket.emit("chess-draw-offer"); // sending draw offer when one exists = accept
    setDrawOffered(false);
  }

  function handleRematch() {
    setRematchSent(true);
    socket.emit("chess-rematch");
  }

  function copyCode() {
    const url = `${window.location.origin}/chess/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost = players.length > 0 && players[0]?.id === myId;
  const opponentName = players.find(p => p.index !== myIndex)?.name || "Opponent";
  const myName = players.find(p => p.index === myIndex)?.name || "You";

  // -----------------------------------------------------------------------
  // Lobby
  // -----------------------------------------------------------------------
  if (phase === "lobby") {
    return (
      <div className="chess-page">
        <div className="chess-lobby">
          <button className="chess-leave" onClick={handleLeave}>Back</button>
          <h2 className="chess-lobby-title">Chess</h2>
          <div className="chess-code-row">
            <span className="chess-code-label">Room code</span>
            <div className="chess-code-box">
              <span className="chess-code-badge">{code}</span>
              <button className="chess-copy-btn" onClick={copyCode}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
          <div className="chess-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="chess-player-row">
                <span className="chess-player-piece">{p.color === "w" ? "♔" : "♚"}</span>
                <span className="chess-player-name">{p.name}</span>
                <span className="chess-color-tag" data-color={p.color}>{p.color === "w" ? "White" : "Black"}</span>
                {i === 0 && <span className="chess-host-badge">host</span>}
              </div>
            ))}
          </div>
          {isHost ? (
            <button className="chess-start-btn" onClick={handleStart} disabled={players.length < 2}>
              {players.length < 2 ? "Waiting for opponent..." : "Start Game"}
            </button>
          ) : (
            <p className="chess-waiting-text">Waiting for the host to start...</p>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Game over overlay
  // -----------------------------------------------------------------------
  if (phase === "ended" && gameOverData) {
    let resultText = "";
    if (gameOverData.status === "checkmate") resultText = `Checkmate! ${gameOverData.winnerName} wins.`;
    else if (gameOverData.status === "resignation") resultText = `${gameOverData.winnerName} wins by resignation.`;
    else if (gameOverData.status === "forfeit") resultText = `${gameOverData.winnerName} wins by forfeit.`;
    else if (gameOverData.status === "stalemate") resultText = "Stalemate - draw.";
    else resultText = "Draw.";

    return (
      <div className="chess-page">
        <div className="chess-end">
          <h2 className="chess-end-title">Game Over</h2>
          <p className="chess-end-result">{resultText}</p>
          <div className="chess-end-scores">
            {players.map(p => (
              <div key={p.id} className={`chess-end-score-row ${gameOverData.winner === p.color ? "chess-end-winner" : ""}`}>
                <span className="chess-end-piece">{p.color === "w" ? "♔" : "♚"}</span>
                <span className="chess-end-name">{p.name}</span>
                <span className="chess-end-pts">{scores[p.color]} W / {scores.draws} D</span>
              </div>
            ))}
          </div>
          <p className="chess-end-moves">{gameOverData.moves} moves played</p>
          <div className="chess-end-actions">
            <button className="chess-btn chess-btn-primary" onClick={handleRematch} disabled={rematchSent}>
              {rematchSent ? "Waiting..." : "Rematch"}
            </button>
            <button className="chess-end-back" onClick={handleLeave}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Playing
  // -----------------------------------------------------------------------
  if (!gameState) return <div className="chess-page"><p style={{ color: "#666" }}>Loading...</p></div>;

  const board = gameState.board;
  const inCheck = isInCheck(board, gameState.turn);
  const lastMove = gameState.lastMove;

  // Build rows/cols based on flipped perspective
  const rows = flipped ? [0,1,2,3,4,5,6,7] : [0,1,2,3,4,5,6,7];
  const displayRows = flipped ? rows : rows;
  const displayCols = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
  const displayRowsOrdered = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  // Captured pieces
  const captured = { w: [], b: [] };
  // We can derive captured from initial vs current -- simplified: just track from moves
  // Skip for now, not critical

  return (
    <div className="chess-page">
      <div className="chess-game">
        {/* Header */}
        <div className="chess-game-header">
          <button className="chess-leave" onClick={handleLeave}>Leave</button>
          <span className="chess-game-info">Game {gameNumber}</span>
          <span className="chess-score-line">
            {myName} {scores[myColor]} - {scores[myColor === "w" ? "b" : "w"]} {opponentName}
            {scores.draws > 0 && ` (${scores.draws}D)`}
          </span>
        </div>

        {/* Opponent info (top) */}
        <div className="chess-player-bar chess-player-bar--opp">
          <span className="chess-bar-piece">{myColor === "w" ? "♚" : "♔"}</span>
          <span className="chess-bar-name">{opponentName}</span>
          {!isMyTurn && <span className="chess-bar-turn">Thinking...</span>}
        </div>

        {/* Board */}
        <div className="chess-board-wrapper">
          <div className="chess-board">
            {displayRowsOrdered.map(r => (
              <div key={r} className="chess-board-row">
                <span className="chess-rank-label">{8 - r}</span>
                {displayCols.map(c => {
                  const piece = board[r][c];
                  const isLight = (r + c) % 2 === 0;
                  const isSelected = selectedSquare?.row === r && selectedSquare?.col === c;
                  const isValidTarget = validMoves.some(m => m.row === r && m.col === c);
                  const isLastFrom = lastMove?.from.row === r && lastMove?.from.col === c;
                  const isLastTo = lastMove?.to.row === r && lastMove?.to.col === c;
                  const isCheckSquare = inCheck && piece?.type === "K" && piece?.color === gameState.turn;

                  let cls = `chess-square ${isLight ? "chess-sq-light" : "chess-sq-dark"}`;
                  if (isSelected) cls += " chess-sq-selected";
                  if (isLastFrom || isLastTo) cls += " chess-sq-last-move";
                  if (isCheckSquare) cls += " chess-sq-check";

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cls}
                      onClick={() => handleSquareClick(r, c)}
                    >
                      {piece && (
                        <span className={`chess-piece ${piece.color === "w" ? "chess-piece-white" : "chess-piece-black"}`}>
                          {getPieceSymbol(piece)}
                        </span>
                      )}
                      {isValidTarget && (
                        <span className={`chess-move-dot ${piece ? "chess-move-capture" : ""}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="chess-file-labels">
              <span className="chess-rank-label" />
              {displayCols.map(c => (
                <span key={c} className="chess-file-label">{"abcdefgh"[c]}</span>
              ))}
            </div>
          </div>
        </div>

        {/* My info (bottom) */}
        <div className="chess-player-bar chess-player-bar--me">
          <span className="chess-bar-piece">{myColor === "w" ? "♔" : "♚"}</span>
          <span className="chess-bar-name">{myName}</span>
          {isMyTurn && <span className="chess-bar-turn chess-bar-turn--active">Your turn</span>}
        </div>

        {/* Status bar */}
        <div className="chess-status-bar">
          {gameState.status === "check" && isMyTurn && (
            <span className="chess-status-check">Check!</span>
          )}
          {drawOffered && (
            <div className="chess-draw-offer">
              <span>{opponentName} offers a draw.</span>
              <button className="chess-draw-accept" onClick={handleAcceptDraw}>Accept</button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="chess-actions">
          <button className="chess-action-btn" onClick={handleDrawOffer} disabled={!isMyTurn}>
            Offer Draw
          </button>
          <button className="chess-action-btn chess-action-resign" onClick={handleResign}>
            Resign
          </button>
        </div>

        {/* Promotion modal */}
        {promotionPending && (
          <div className="chess-promo-overlay">
            <div className="chess-promo-card">
              <p className="chess-promo-title">Promote pawn to:</p>
              <div className="chess-promo-options">
                {["Q", "R", "B", "N"].map(type => (
                  <button
                    key={type}
                    className="chess-promo-btn"
                    onClick={() => handlePromotion(type)}
                  >
                    {getPieceSymbol({ type, color: myColor })}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
