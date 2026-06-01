// ---------------------------------------------------------------------------
// Chess Logic Module
// ---------------------------------------------------------------------------
// Board: 8x8 array, board[row][col].
// row 0 = rank 8 (black back rank), row 7 = rank 1 (white back rank).
// col 0 = a-file, col 7 = h-file.
// Each cell: null (empty) or { type, color } where
//   type: "P"|"N"|"B"|"R"|"Q"|"K"
//   color: "w"|"b"
// ---------------------------------------------------------------------------

export function createInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];

  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "P", color: "b" };
    board[6][c] = { type: "P", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }

  return board;
}

export function createInitialState() {
  return {
    board: createInitialBoard(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true }, // can castle king/queen side
    enPassant: null, // { row, col } of the square that can be captured en passant
    halfMoves: 0,    // for 50-move rule
    fullMoves: 1,
    lastMove: null,  // { from, to, piece, captured, special }
    status: "playing", // playing | check | checkmate | stalemate | draw
    winner: null,
  };
}

// Deep copy
export function cloneState(state) {
  return {
    board: state.board.map(row => row.map(cell => cell ? { ...cell } : null)),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfMoves: state.halfMoves,
    fullMoves: state.fullMoves,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    status: state.status,
    winner: state.winner,
  };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function opponent(color) {
  return color === "w" ? "b" : "w";
}

// ---------------------------------------------------------------------------
// Find king position
// ---------------------------------------------------------------------------
function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === "K" && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Is a square attacked by the given color?
// ---------------------------------------------------------------------------
function isAttackedBy(board, row, col, byColor) {
  // Pawn attacks
  const pawnDir = byColor === "w" ? -1 : 1;
  const pr = row + pawnDir;
  if (inBounds(pr, col - 1)) {
    const p = board[pr][col - 1];
    if (p && p.type === "P" && p.color === byColor) return true;
  }
  if (inBounds(pr, col + 1)) {
    const p = board[pr][col + 1];
    if (p && p.type === "P" && p.color === byColor) return true;
  }

  // Knight attacks
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const nr = row + dr, nc = col + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.type === "N" && p.color === byColor) return true;
    }
  }

  // King attacks (adjacent squares)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.type === "K" && p.color === byColor) return true;
      }
    }
  }

  // Sliding attacks: rook/queen (straight), bishop/queen (diagonal)
  const straight = [[0,1],[0,-1],[1,0],[-1,0]];
  const diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];

  for (const [dr, dc] of straight) {
    for (let i = 1; i < 8; i++) {
      const nr = row + dr * i, nc = col + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "R" || p.type === "Q")) return true;
        break;
      }
    }
  }

  for (const [dr, dc] of diagonal) {
    for (let i = 1; i < 8; i++) {
      const nr = row + dr * i, nc = col + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "B" || p.type === "Q")) return true;
        break;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Is the given color in check?
// ---------------------------------------------------------------------------
export function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isAttackedBy(board, king.row, king.col, opponent(color));
}

// ---------------------------------------------------------------------------
// Generate raw moves for a piece (ignoring check legality)
// ---------------------------------------------------------------------------
function rawMoves(board, row, col, state) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  const color = piece.color;
  const opp = opponent(color);

  function addIfValid(r, c, special) {
    if (!inBounds(r, c)) return false;
    const target = board[r][c];
    if (target && target.color === color) return false; // blocked by own piece
    moves.push({ row: r, col: c, special: special || null });
    return !target; // return true if square was empty (can continue sliding)
  }

  switch (piece.type) {
    case "P": {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoRow = color === "w" ? 0 : 7;

      // Forward one
      const fr = row + dir;
      if (inBounds(fr, col) && !board[fr][col]) {
        if (fr === promoRow) {
          moves.push({ row: fr, col, special: "promoteQ" });
          moves.push({ row: fr, col, special: "promoteR" });
          moves.push({ row: fr, col, special: "promoteB" });
          moves.push({ row: fr, col, special: "promoteN" });
        } else {
          moves.push({ row: fr, col, special: null });
        }

        // Forward two from start
        const fr2 = row + dir * 2;
        if (row === startRow && !board[fr2][col]) {
          moves.push({ row: fr2, col, special: "doublePush" });
        }
      }

      // Captures
      for (const dc of [-1, 1]) {
        const cr = row + dir, cc = col + dc;
        if (!inBounds(cr, cc)) continue;
        const target = board[cr][cc];
        if (target && target.color === opp) {
          if (cr === promoRow) {
            moves.push({ row: cr, col: cc, special: "promoteQ" });
            moves.push({ row: cr, col: cc, special: "promoteR" });
            moves.push({ row: cr, col: cc, special: "promoteB" });
            moves.push({ row: cr, col: cc, special: "promoteN" });
          } else {
            moves.push({ row: cr, col: cc, special: null });
          }
        }
        // En passant
        if (state.enPassant && cr === state.enPassant.row && cc === state.enPassant.col) {
          moves.push({ row: cr, col: cc, special: "enPassant" });
        }
      }
      break;
    }

    case "N": {
      const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of jumps) addIfValid(row + dr, col + dc);
      break;
    }

    case "B": {
      for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        for (let i = 1; i < 8; i++) {
          if (!addIfValid(row + dr * i, col + dc * i)) break;
        }
      }
      break;
    }

    case "R": {
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        for (let i = 1; i < 8; i++) {
          if (!addIfValid(row + dr * i, col + dc * i)) break;
        }
      }
      break;
    }

    case "Q": {
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        for (let i = 1; i < 8; i++) {
          if (!addIfValid(row + dr * i, col + dc * i)) break;
        }
      }
      break;
    }

    case "K": {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          addIfValid(row + dr, col + dc);
        }
      }

      // Castling
      const backRow = color === "w" ? 7 : 0;
      if (row === backRow && col === 4) {
        // Kingside
        const canK = color === "w" ? state.castling.wK : state.castling.bK;
        if (canK &&
            !board[backRow][5] && !board[backRow][6] &&
            board[backRow][7]?.type === "R" && board[backRow][7]?.color === color &&
            !isAttackedBy(board, backRow, 4, opp) &&
            !isAttackedBy(board, backRow, 5, opp) &&
            !isAttackedBy(board, backRow, 6, opp)) {
          moves.push({ row: backRow, col: 6, special: "castleK" });
        }

        // Queenside
        const canQ = color === "w" ? state.castling.wQ : state.castling.bQ;
        if (canQ &&
            !board[backRow][1] && !board[backRow][2] && !board[backRow][3] &&
            board[backRow][0]?.type === "R" && board[backRow][0]?.color === color &&
            !isAttackedBy(board, backRow, 4, opp) &&
            !isAttackedBy(board, backRow, 3, opp) &&
            !isAttackedBy(board, backRow, 2, opp)) {
          moves.push({ row: backRow, col: 2, special: "castleQ" });
        }
      }
      break;
    }
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Filter moves that leave own king in check
// ---------------------------------------------------------------------------
function legalMoves(board, row, col, state) {
  const piece = board[row][col];
  if (!piece) return [];

  const raw = rawMoves(board, row, col, state);
  const legal = [];

  for (const move of raw) {
    // Simulate the move
    const newBoard = board.map(r => r.map(c => c ? { ...c } : null));
    const from = board[row][col];

    newBoard[move.row][move.col] = { ...from };
    newBoard[row][col] = null;

    // Handle en passant capture
    if (move.special === "enPassant") {
      const capturedRow = piece.color === "w" ? move.row + 1 : move.row - 1;
      newBoard[capturedRow][move.col] = null;
    }

    // Handle castling -- move the rook too
    if (move.special === "castleK") {
      const r = move.row;
      newBoard[r][5] = newBoard[r][7];
      newBoard[r][7] = null;
    }
    if (move.special === "castleQ") {
      const r = move.row;
      newBoard[r][3] = newBoard[r][0];
      newBoard[r][0] = null;
    }

    // Handle promotion
    if (move.special?.startsWith("promote")) {
      const promoType = move.special.slice(7); // "Q", "R", "B", "N"
      newBoard[move.row][move.col] = { type: promoType, color: piece.color };
    }

    // Check if own king is in check after the move
    if (!isInCheck(newBoard, piece.color)) {
      legal.push(move);
    }
  }

  return legal;
}

// ---------------------------------------------------------------------------
// Public: get valid moves for a piece
// ---------------------------------------------------------------------------
export function getValidMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) return [];
  return legalMoves(state.board, row, col, state);
}

// ---------------------------------------------------------------------------
// Public: check if any legal move exists for a color
// ---------------------------------------------------------------------------
function hasAnyLegalMove(state, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === color) {
        const moves = legalMoves(state.board, r, c, state);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Insufficient material check
// ---------------------------------------------------------------------------
function isInsufficientMaterial(board) {
  const pieces = { w: [], b: [] };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type !== "K") {
        pieces[p.color].push({ type: p.type, row: r, col: c });
      }
    }
  }

  const wc = pieces.w.length;
  const bc = pieces.b.length;

  // K vs K
  if (wc === 0 && bc === 0) return true;
  // K+B vs K or K+N vs K
  if (wc === 0 && bc === 1 && (pieces.b[0].type === "B" || pieces.b[0].type === "N")) return true;
  if (bc === 0 && wc === 1 && (pieces.w[0].type === "B" || pieces.w[0].type === "N")) return true;
  // K+B vs K+B on same color squares
  if (wc === 1 && bc === 1 && pieces.w[0].type === "B" && pieces.b[0].type === "B") {
    const wSquareColor = (pieces.w[0].row + pieces.w[0].col) % 2;
    const bSquareColor = (pieces.b[0].row + pieces.b[0].col) % 2;
    if (wSquareColor === bSquareColor) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public: make a move, return updated state
// ---------------------------------------------------------------------------
export function makeMove(state, fromRow, fromCol, toRow, toCol, promoteTo) {
  const piece = state.board[fromRow][fromCol];
  if (!piece || piece.color !== state.turn) return null;

  // Find the matching legal move
  const moves = legalMoves(state.board, fromRow, fromCol, state);
  let move = null;

  if (promoteTo) {
    move = moves.find(m =>
      m.row === toRow && m.col === toCol &&
      m.special === "promote" + promoteTo
    );
  } else {
    move = moves.find(m =>
      m.row === toRow && m.col === toCol &&
      (!m.special || !m.special.startsWith("promote"))
    );
    // If the move requires promotion but none specified, default to queen
    if (!move) {
      move = moves.find(m =>
        m.row === toRow && m.col === toCol && m.special === "promoteQ"
      );
    }
  }

  if (!move) return null; // illegal move

  // Clone state
  const newState = cloneState(state);
  const board = newState.board;
  const captured = board[toRow][toCol];

  // Execute move
  board[toRow][toCol] = { ...piece };
  board[fromRow][fromCol] = null;

  // Special moves
  if (move.special === "enPassant") {
    const capturedRow = piece.color === "w" ? toRow + 1 : toRow - 1;
    board[capturedRow][toCol] = null;
  }

  if (move.special === "castleK") {
    board[toRow][5] = board[toRow][7];
    board[toRow][7] = null;
  }

  if (move.special === "castleQ") {
    board[toRow][3] = board[toRow][0];
    board[toRow][0] = null;
  }

  if (move.special?.startsWith("promote")) {
    const promoType = move.special.slice(7);
    board[toRow][toCol] = { type: promoType, color: piece.color };
  }

  // Update en passant
  if (move.special === "doublePush") {
    const epRow = piece.color === "w" ? fromRow - 1 : fromRow + 1;
    newState.enPassant = { row: epRow, col: fromCol };
  } else {
    newState.enPassant = null;
  }

  // Update castling rights
  // King moved
  if (piece.type === "K") {
    if (piece.color === "w") { newState.castling.wK = false; newState.castling.wQ = false; }
    else { newState.castling.bK = false; newState.castling.bQ = false; }
  }
  // Rook moved or captured
  if (piece.type === "R") {
    if (piece.color === "w") {
      if (fromRow === 7 && fromCol === 7) newState.castling.wK = false;
      if (fromRow === 7 && fromCol === 0) newState.castling.wQ = false;
    } else {
      if (fromRow === 0 && fromCol === 7) newState.castling.bK = false;
      if (fromRow === 0 && fromCol === 0) newState.castling.bQ = false;
    }
  }
  // Rook captured on its starting square
  if (toRow === 0 && toCol === 0) newState.castling.bQ = false;
  if (toRow === 0 && toCol === 7) newState.castling.bK = false;
  if (toRow === 7 && toCol === 0) newState.castling.wQ = false;
  if (toRow === 7 && toCol === 7) newState.castling.wK = false;

  // Half-move clock
  if (piece.type === "P" || captured) {
    newState.halfMoves = 0;
  } else {
    newState.halfMoves++;
  }

  // Full moves
  if (piece.color === "b") newState.fullMoves++;

  // Last move
  newState.lastMove = {
    from: { row: fromRow, col: fromCol },
    to: { row: toRow, col: toCol },
    piece: piece.type,
    color: piece.color,
    captured: captured?.type || null,
    special: move.special,
  };

  // Switch turn
  newState.turn = opponent(piece.color);

  // Check game status
  const oppColor = newState.turn;
  const inCheck = isInCheck(board, oppColor);
  const hasLegal = hasAnyLegalMove(newState, oppColor);

  if (inCheck && !hasLegal) {
    newState.status = "checkmate";
    newState.winner = piece.color;
  } else if (!inCheck && !hasLegal) {
    newState.status = "stalemate";
    newState.winner = null;
  } else if (inCheck) {
    newState.status = "check";
  } else if (newState.halfMoves >= 100) {
    newState.status = "draw";
    newState.winner = null;
  } else if (isInsufficientMaterial(board)) {
    newState.status = "draw";
    newState.winner = null;
  } else {
    newState.status = "playing";
  }

  return newState;
}

// ---------------------------------------------------------------------------
// Unicode piece symbols for rendering
// ---------------------------------------------------------------------------
export const PIECE_SYMBOLS = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

export function getPieceSymbol(piece) {
  if (!piece) return "";
  return PIECE_SYMBOLS[piece.color + piece.type] || "";
}
