import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import {
  createInitialState, getValidMoves, makeMove, getPieceSymbol,
  isInCheck, getCapturedSorted, getMaterialAdvantage, PIECE_MINI,
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

  const [gameState, setGameState] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [gameOverData, setGameOverData] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [promotionPending, setPromotionPending] = useState(null);
  const [rematchSent, setRematchSent] = useState(false);

  // Drag state
  const [dragging, setDragging] = useState(null); // { row, col, piece }
  const [dragPos, setDragPos] = useState(null);   // { x, y } screen coords
  const [dragMoves, setDragMoves] = useState([]);
  const boardRef = useRef(null);

  // Move list scroll
  const moveListRef = useRef(null);

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

    function onOpponentMove({ from, to, promoteTo }) {
      setGameState(prev => {
        if (!prev) return prev;
        return makeMove(prev, from.row, from.col, to.row, to.col, promoteTo) || prev;
      });
      setSelectedSquare(null);
      setValidMoves([]);
    }

    function onGameOver(data) {
      setPhase("ended");
      setGameOverData(data);
      setScores(data.scores);
    }

    function onDrawOffered() { setDrawOffered(true); }

    function onError({ message }) {
      if (message === "Room not found.") { clearSession(); navigate("/chess"); }
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

  // Auto-scroll move list
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [gameState?.moveList?.length]);

  // -----------------------------------------------------------------------
  // Execute a move
  // -----------------------------------------------------------------------
  const executeMove = useCallback((fromRow, fromCol, toRow, toCol, promoteTo) => {
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
  }, [gameState, socket]);

  // -----------------------------------------------------------------------
  // Click to select / move
  // -----------------------------------------------------------------------
  function handleSquareClick(row, col) {
    if (!gameState || !isMyTurn || phase !== "playing" || dragging) return;

    const piece = gameState.board[row][col];

    if (selectedSquare) {
      const move = validMoves.find(m => m.row === row && m.col === col);
      if (move) {
        if (move.special?.startsWith("promote")) {
          setPromotionPending({ fromRow: selectedSquare.row, fromCol: selectedSquare.col, toRow: row, toCol: col });
          return;
        }
        executeMove(selectedSquare.row, selectedSquare.col, row, col, null);
        return;
      }
      if (piece && piece.color === myColor) { selectPiece(row, col); return; }
      setSelectedSquare(null); setValidMoves([]); return;
    }

    if (piece && piece.color === myColor) selectPiece(row, col);
  }

  function selectPiece(row, col) {
    setSelectedSquare({ row, col });
    setValidMoves(getValidMoves(gameState, row, col));
  }

  // -----------------------------------------------------------------------
  // Drag and drop
  // -----------------------------------------------------------------------
  function handleDragStart(e, row, col) {
    if (!gameState || !isMyTurn || phase !== "playing") return;
    const piece = gameState.board[row][col];
    if (!piece || piece.color !== myColor) return;

    e.preventDefault();
    const moves = getValidMoves(gameState, row, col);
    setDragging({ row, col, piece });
    setDragMoves(moves);
    setSelectedSquare({ row, col });
    setValidMoves(moves);

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragPos({ x: clientX, y: clientY });
  }

  useEffect(() => {
    if (!dragging) return;

    function onMove(e) {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setDragPos({ x: clientX, y: clientY });
    }

    function onEnd(e) {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

      // Find which square the drop landed on
      const target = getSquareFromPoint(clientX, clientY);
      if (target) {
        const move = dragMoves.find(m => m.row === target.row && m.col === target.col);
        if (move) {
          if (move.special?.startsWith("promote")) {
            setPromotionPending({ fromRow: dragging.row, fromCol: dragging.col, toRow: target.row, toCol: target.col });
          } else {
            executeMove(dragging.row, dragging.col, target.row, target.col, null);
          }
        }
      }

      setDragging(null);
      setDragPos(null);
      setDragMoves([]);
      if (!promotionPending) {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging, dragMoves, executeMove, promotionPending]);

  function getSquareFromPoint(x, y) {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const relX = x - rect.left;
    const relY = y - rect.top;
    if (relX < 0 || relY < 0 || relX >= rect.width || relY >= rect.height) return null;
    let col = Math.floor(relX / sqSize);
    let row = Math.floor(relY / sqSize);
    if (flipped) { col = 7 - col; row = 7 - row; }
    return { row, col };
  }

  // -----------------------------------------------------------------------
  // Other handlers
  // -----------------------------------------------------------------------
  function handleLeave() { socket.emit("chess-leave"); clearSession(); navigate("/chess"); }
  function handleStart() { socket.emit("chess-start-game"); }
  function handlePromotion(type) {
    if (!promotionPending) return;
    const { fromRow, fromCol, toRow, toCol } = promotionPending;
    executeMove(fromRow, fromCol, toRow, toCol, type);
  }
  function handleResign() { socket.emit("chess-resign"); }
  function handleDrawOffer() { socket.emit("chess-draw-offer"); }
  function handleAcceptDraw() { socket.emit("chess-draw-offer"); setDrawOffered(false); }
  function handleRematch() { setRematchSent(true); socket.emit("chess-rematch"); }
  function copyCode() {
    navigator.clipboard.writeText(`${window.location.origin}/chess/${code}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost = players.length > 0 && players[0]?.id === myId;
  const oppIndex = myIndex === 0 ? 1 : 0;
  const opponentName = players.find(p => p.index === oppIndex)?.name || "Opponent";
  const myName = players.find(p => p.index === myIndex)?.name || "You";
  const oppColor = myColor === "w" ? "b" : "w";

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
              <button className="chess-copy-btn" onClick={copyCode}>{copied ? "Copied!" : "Copy link"}</button>
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
            {players.length < 2 && (
              <div className="chess-player-row chess-player-row--empty">
                <span className="chess-player-piece chess-player-piece--empty">?</span>
                <span className="chess-player-name chess-player-name--empty">Waiting for opponent...</span>
              </div>
            )}
          </div>
          {isHost ? (
            <button className="chess-start-btn" onClick={handleStart} disabled={players.length < 2}>
              {players.length < 2 ? "Need 1 more player" : "Start Game"}
            </button>
          ) : (
            <p className="chess-waiting-text">Waiting for the host to start...</p>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------
  if (phase === "ended" && gameOverData) {
    let resultText = "";
    const s = gameOverData.status;
    if (s === "checkmate") resultText = `Checkmate! ${gameOverData.winnerName} wins.`;
    else if (s === "resignation") resultText = `${gameOverData.winnerName} wins by resignation.`;
    else if (s === "forfeit") resultText = `${gameOverData.winnerName} wins by forfeit.`;
    else if (s === "stalemate") resultText = "Stalemate. Draw.";
    else resultText = "Draw.";

    const isWinner = gameOverData.winner === myColor;

    return (
      <div className="chess-page">
        <div className="chess-end">
          <h2 className="chess-end-title">{isWinner ? "Victory!" : gameOverData.winner ? "Defeat" : "Draw"}</h2>
          <p className="chess-end-result">{resultText}</p>
          <div className="chess-end-scores">
            {players.map(p => (
              <div key={p.id} className={`chess-end-score-row ${gameOverData.winner === p.color ? "chess-end-winner" : ""}`}>
                <span className="chess-end-piece">{p.color === "w" ? "♔" : "♚"}</span>
                <span className="chess-end-name">{p.name}</span>
                <span className="chess-end-pts">{scores[p.color]}W {scores.draws}D</span>
              </div>
            ))}
          </div>
          {gameOverData.moves > 0 && <p className="chess-end-moves">{gameOverData.moves} moves played</p>}
          <div className="chess-end-actions">
            <button className="chess-btn chess-btn-primary" onClick={handleRematch} disabled={rematchSent}>
              {rematchSent ? "Waiting..." : "Rematch (swap colors)"}
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
  const moveList = gameState.moveList || [];
  const capturedByMe = getCapturedSorted(gameState.capturedPieces?.[myColor] || []);
  const capturedByOpp = getCapturedSorted(gameState.capturedPieces?.[oppColor] || []);
  const myAdvantage = getMaterialAdvantage(capturedByMe, capturedByOpp);
  const oppAdvantage = getMaterialAdvantage(capturedByOpp, capturedByMe);

  const displayRows = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
  const displayCols = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  // Group moves into pairs for display
  const movePairs = [];
  for (let i = 0; i < moveList.length; i += 2) {
    movePairs.push({ num: Math.floor(i / 2) + 1, white: moveList[i], black: moveList[i + 1] || "" });
  }

  function renderCaptured(list, color, advantage) {
    if (list.length === 0 && advantage <= 0) return null;
    return (
      <div className="chess-captured">
        {list.map((type, i) => (
          <span key={i} className="chess-captured-piece">
            {PIECE_MINI[color === "w" ? "b" + type : "w" + type]}
          </span>
        ))}
        {advantage > 0 && <span className="chess-captured-adv">+{advantage}</span>}
      </div>
    );
  }

  return (
    <div className="chess-page">
      <div className="chess-game">
        {/* Header */}
        <div className="chess-game-header">
          <button className="chess-leave" onClick={handleLeave}>Leave</button>
          <span className="chess-game-info">Game {gameNumber}</span>
          <span className="chess-score-line">
            {scores[myColor]}W - {scores[oppColor]}W
            {scores.draws > 0 && ` / ${scores.draws}D`}
          </span>
        </div>

        <div className="chess-main-layout">
          {/* Board column */}
          <div className="chess-board-col">
            {/* Opponent bar */}
            <div className={`chess-player-bar ${!isMyTurn ? "chess-player-bar--active" : ""}`}>
              <span className="chess-bar-piece">{oppColor === "w" ? "♔" : "♚"}</span>
              <span className="chess-bar-name">{opponentName}</span>
              {renderCaptured(capturedByOpp, oppColor, oppAdvantage)}
              {!isMyTurn && phase === "playing" && <span className="chess-bar-thinking" />}
            </div>

            {/* Board */}
            <div className="chess-board" ref={boardRef}>
              {displayRows.map((r, ri) => (
                displayCols.map((c, ci) => {
                  const piece = board[r][c];
                  const isLight = (r + c) % 2 === 0;
                  const isSelected = selectedSquare?.row === r && selectedSquare?.col === c;
                  const isValidTarget = validMoves.some(m => m.row === r && m.col === c);
                  const isLastFrom = lastMove?.from.row === r && lastMove?.from.col === c;
                  const isLastTo = lastMove?.to.row === r && lastMove?.to.col === c;
                  const isCheckSquare = inCheck && piece?.type === "K" && piece?.color === gameState.turn;
                  const isDragSource = dragging?.row === r && dragging?.col === c;

                  let cls = `chess-square ${isLight ? "chess-sq-light" : "chess-sq-dark"}`;
                  if (isSelected) cls += " chess-sq-selected";
                  if (isLastFrom || isLastTo) cls += " chess-sq-last-move";
                  if (isCheckSquare) cls += " chess-sq-check";

                  // Coordinates inside squares
                  const showRank = ci === 0;
                  const showFile = ri === 7;

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cls}
                      onClick={() => handleSquareClick(r, c)}
                      onMouseDown={(e) => handleDragStart(e, r, c)}
                      onTouchStart={(e) => handleDragStart(e, r, c)}
                    >
                      {showRank && <span className={`chess-coord chess-coord-rank ${isLight ? "chess-coord-dark" : "chess-coord-light"}`}>{8 - r}</span>}
                      {showFile && <span className={`chess-coord chess-coord-file ${isLight ? "chess-coord-dark" : "chess-coord-light"}`}>{"abcdefgh"[c]}</span>}

                      {piece && !isDragSource && (
                        <span className={`chess-piece ${piece.color === "w" ? "chess-piece-w" : "chess-piece-b"}`}>
                          {getPieceSymbol(piece)}
                        </span>
                      )}

                      {isValidTarget && !piece && <span className="chess-move-dot" />}
                      {isValidTarget && piece && <span className="chess-move-ring" />}
                    </div>
                  );
                })
              ))}
            </div>

            {/* My bar */}
            <div className={`chess-player-bar ${isMyTurn ? "chess-player-bar--active" : ""}`}>
              <span className="chess-bar-piece">{myColor === "w" ? "♔" : "♚"}</span>
              <span className="chess-bar-name">{myName}</span>
              {renderCaptured(capturedByMe, myColor, myAdvantage)}
              {isMyTurn && phase === "playing" && <span className="chess-bar-turn-dot" />}
            </div>
          </div>

          {/* Side panel */}
          <div className="chess-side-panel">
            {/* Move list */}
            <div className="chess-move-list" ref={moveListRef}>
              <div className="chess-move-list-header">Moves</div>
              {movePairs.map(p => (
                <div key={p.num} className="chess-move-pair">
                  <span className="chess-move-num">{p.num}.</span>
                  <span className="chess-move-w">{p.white}</span>
                  <span className="chess-move-b">{p.black}</span>
                </div>
              ))}
              {movePairs.length === 0 && <p className="chess-move-empty">No moves yet</p>}
            </div>

            {/* Status */}
            <div className="chess-side-status">
              {gameState.status === "check" && <span className="chess-status-check">Check!</span>}
              {drawOffered && (
                <div className="chess-draw-offer">
                  <span>Draw offered</span>
                  <button className="chess-draw-accept" onClick={handleAcceptDraw}>Accept</button>
                  <button className="chess-draw-decline" onClick={() => setDrawOffered(false)}>Decline</button>
                </div>
              )}
              {isMyTurn && phase === "playing" && !drawOffered && <span className="chess-your-turn">Your turn</span>}
              {!isMyTurn && phase === "playing" && !drawOffered && <span className="chess-opp-turn">{opponentName}'s turn</span>}
            </div>

            {/* Actions */}
            <div className="chess-actions">
              <button className="chess-action-btn" onClick={handleDrawOffer} title="Offer draw">Draw</button>
              <button className="chess-action-btn chess-action-resign" onClick={handleResign} title="Resign">Resign</button>
            </div>
          </div>
        </div>

        {/* Drag ghost */}
        {dragging && dragPos && (
          <div className="chess-drag-ghost" style={{ left: dragPos.x, top: dragPos.y }}>
            <span className={`chess-piece ${dragging.piece.color === "w" ? "chess-piece-w" : "chess-piece-b"}`}>
              {getPieceSymbol(dragging.piece)}
            </span>
          </div>
        )}

        {/* Promotion modal */}
        {promotionPending && (
          <div className="chess-promo-overlay" onClick={() => setPromotionPending(null)}>
            <div className="chess-promo-card" onClick={e => e.stopPropagation()}>
              <p className="chess-promo-title">Promote to</p>
              <div className="chess-promo-options">
                {["Q", "R", "B", "N"].map(type => (
                  <button key={type} className="chess-promo-btn" onClick={() => handlePromotion(type)}>
                    <span className="chess-promo-piece">{getPieceSymbol({ type, color: myColor })}</span>
                    <span className="chess-promo-label">{{ Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }[type]}</span>
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
