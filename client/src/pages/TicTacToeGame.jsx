import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./TicTacToeGame.css";

export default function TicTacToeGame() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const root = containerRef.current;
    if (!root) return;

    const WINNING_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const MOVE_PRIORITY = [4,0,2,6,8,1,3,5,7];
    const CORNERS = [0,2,6,8];
    const EDGES = [1,3,5,7];
    const STORAGE_KEY = "ttt-settings-v2";

    const defaults = { mode: "single", difficulty: "medium", playerSymbol: "X", firstTurn: "human" };
    const state = {
      board: Array(9).fill(""), currentPlayer: "X", gameOver: false, winningLine: null,
      isComputerThinking: false, scores: { X: 0, O: 0, ties: 0 },
      roundNumber: 1, playerWinStreak: 0, settings: { ...defaults },
    };

    const el = {
      setupScreen: root.querySelector("#setupScreen"),
      gameScreen: root.querySelector("#gameScreen"),
      startGameBtn: root.querySelector("#startGameBtn"),
      restartSameBtn: root.querySelector("#restartSameBtn"),
      changeSettingsBtn: root.querySelector("#changeSettingsBtn"),
      resetScoresBtn: root.querySelector("#resetScoresBtn"),
      playAgainBtn: root.querySelector("#playAgainBtn"),
      grid: root.querySelector("#grid"),
      status: root.querySelector("#status"),
      gameMeta: root.querySelector("#gameMeta"),
      scoreX: root.querySelector("#scoreX"),
      scoreO: root.querySelector("#scoreO"),
      scoreTies: root.querySelector("#scoreTies"),
      scoreLabelX: root.querySelector("#scoreLabelX"),
      scoreLabelO: root.querySelector("#scoreLabelO"),
      streakCard: root.querySelector("#streakCard"),
      roundCard: root.querySelector("#roundCard"),
      postgameBox: root.querySelector("#postgameBox"),
      postgameMessage: root.querySelector("#postgameMessage"),
      modeInputs: root.querySelectorAll('input[name="mode"]'),
      difficultyInputs: root.querySelectorAll('input[name="difficulty"]'),
      difficultyGroup: root.querySelector("#difficultyGroup"),
      symbolInputs: root.querySelectorAll('input[name="playerSymbol"]'),
      symbolGroup: root.querySelector("#symbolGroup"),
    };

    const cells = [];
    for (let i = 0; i < 9; i++) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "ttt-cell";
      button.setAttribute("role", "gridcell");
      button.addEventListener("click", () => handleCellClick(i));
      el.grid.appendChild(button);
      cells.push(button);
    }

    function showScreen(name) {
      el.setupScreen.classList.toggle("active", name === "setup");
      el.gameScreen.classList.toggle("active", name === "game");
    }
    function getInputValue(name) { return root.querySelector(`input[name="${name}"]:checked`).value; }
    function setInputValue(name, value) { const inp = root.querySelector(`input[name="${name}"][value="${value}"]`); if (inp) inp.checked = true; }
    function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); }
    function loadSettings() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (s) state.settings = { ...defaults, ...s }; } catch { state.settings = { ...defaults }; } }
    function syncSettingsFromInputs() { state.settings.mode = getInputValue("mode"); state.settings.difficulty = getInputValue("difficulty"); state.settings.playerSymbol = getInputValue("playerSymbol"); state.settings.firstTurn = getInputValue("firstTurn"); saveSettings(); }
    function applySettingsToInputs() { setInputValue("mode", state.settings.mode); setInputValue("difficulty", state.settings.difficulty); setInputValue("playerSymbol", state.settings.playerSymbol); setInputValue("firstTurn", state.settings.firstTurn); }

    function refreshSettingsUI() {
      const isSingle = getInputValue("mode") === "single";
      const symbol = getInputValue("playerSymbol");
      el.difficultyInputs.forEach(inp => { inp.disabled = !isSingle; });
      el.symbolInputs.forEach(inp => { inp.disabled = !isSingle; });
      el.difficultyGroup.style.opacity = isSingle ? "1" : "0.55";
      el.symbolGroup.style.opacity = isSingle ? "1" : "0.55";
      if (isSingle) {
        root.querySelector('label[for="firstHuman"]').textContent = symbol === "X" ? "You / X" : "You / O";
        root.querySelector('label[for="firstComputer"]').textContent = symbol === "X" ? "Computer / O" : "Computer / X";
      } else {
        root.querySelector('label[for="firstHuman"]').textContent = "Player X";
        root.querySelector('label[for="firstComputer"]').textContent = "Player O";
      }
    }

    function getHumanSymbol() { return state.settings.mode === "single" ? state.settings.playerSymbol : null; }
    function getComputerSymbol() { if (state.settings.mode !== "single") return null; return getHumanSymbol() === "X" ? "O" : "X"; }
    function getStartingSymbol() { if (state.settings.mode === "multi") return state.settings.firstTurn === "human" ? "X" : "O"; return state.settings.firstTurn === "human" ? getHumanSymbol() : getComputerSymbol(); }
    function isComputerTurn() { return state.settings.mode === "single" && state.currentPlayer === getComputerSymbol(); }
    function getAvailableMoves(board = state.board) { return board.reduce((m, c, i) => { if (c === "") m.push(i); return m; }, []); }
    function preferredMoveOrder(moves) { return [...moves].sort((a, b) => MOVE_PRIORITY.indexOf(a) - MOVE_PRIORITY.indexOf(b)); }

    function evaluateBoard(board = state.board) {
      for (const line of WINNING_LINES) { const [a, b, c] = line; if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line }; }
      if (board.every(c => c !== "")) return { winner: "Tie", line: null };
      return { winner: null, line: null };
    }
    function countImmediateWins(board, sym) { let c = 0; for (const m of getAvailableMoves(board)) { const nb = [...board]; nb[m] = sym; if (evaluateBoard(nb).winner === sym) c++; } return c; }
    function findImmediateMove(sym, board = state.board) { for (const m of preferredMoveOrder(getAvailableMoves(board))) { const nb = [...board]; nb[m] = sym; if (evaluateBoard(nb).winner === sym) return m; } return null; }
    function findForkMove(sym, board = state.board) { for (const m of preferredMoveOrder(getAvailableMoves(board))) { const nb = [...board]; nb[m] = sym; if (countImmediateWins(nb, sym) >= 2) return m; } return null; }

    function blockForkMove(symBlock, aiSym, board = state.board) {
      const avail = preferredMoveOrder(getAvailableMoves(board));
      const forks = [];
      for (const m of avail) { const nb = [...board]; nb[m] = symBlock; if (countImmediateWins(nb, symBlock) >= 2) forks.push(m); }
      if (!forks.length) return null;
      if (forks.length === 1) return forks[0];
      for (const m of avail) { const nb = [...board]; nb[m] = aiSym; if (evaluateBoard(nb).winner === aiSym) return m; if (countImmediateWins(nb, symBlock) === 0) return m; }
      return forks[0];
    }
    function getOppositeCorner(pSym, board = state.board) { for (const [p, o] of [[0,8],[2,6],[6,2],[8,0]]) if (board[p] === pSym && board[o] === "") return o; return null; }
    function getAnyCorner(board = state.board) { return CORNERS.find(i => board[i] === "") ?? null; }
    function getAnyEdge(board = state.board) { return EDGES.find(i => board[i] === "") ?? null; }

    function chooseStrategicMove(ai, human, board = state.board) {
      let m; m = findImmediateMove(ai, board); if (m !== null) return m;
      m = findImmediateMove(human, board); if (m !== null) return m;
      m = findForkMove(ai, board); if (m !== null) return m;
      m = blockForkMove(human, ai, board); if (m !== null) return m;
      if (board[4] === "") return 4;
      m = getOppositeCorner(human, board); if (m !== null) return m;
      m = getAnyCorner(board); if (m !== null) return m;
      return getAnyEdge(board);
    }

    function minimax(board, cur, ai, human, depth = 0) {
      const r = evaluateBoard(board);
      if (r.winner === ai) return { score: 10 - depth, move: null };
      if (r.winner === human) return { score: depth - 10, move: null };
      if (r.winner === "Tie") return { score: 0, move: null };
      const max = cur === ai; let best = max ? -Infinity : Infinity, bestMove = null;
      for (const m of preferredMoveOrder(getAvailableMoves(board))) {
        const nb = [...board]; nb[m] = cur;
        const next = minimax(nb, cur === "X" ? "O" : "X", ai, human, depth + 1);
        if (max ? next.score > best : next.score < best) { best = next.score; bestMove = m; }
      }
      return { score: best, move: bestMove };
    }

    function randomChoice(list) { return list[Math.floor(Math.random() * list.length)]; }

    function scoreHumanLikeMove(move, ai, human, board = state.board) {
      const nb = [...board]; nb[move] = ai;
      if (evaluateBoard(nb).winner === ai) return 100;
      if (countImmediateWins(nb, human) >= 2) return -100;
      if (findImmediateMove(human, nb) !== null) return -60;
      let s = 0;
      if (move === 4) s += 16; if (CORNERS.includes(move)) s += 10; if (EDGES.includes(move)) s += 5;
      if (countImmediateWins(nb, ai) >= 1) s += 18; if (findForkMove(ai, nb) !== null) s += 20;
      if (findForkMove(human, nb) === null) s += 12; else s -= 18;
      if (chooseStrategicMove(ai, human, board) === move) s += 10;
      return s;
    }

    function getSmartButImperfectMove(ai, human) {
      const avail = preferredMoveOrder(getAvailableMoves());
      const scored = avail.map(m => ({ move: m, score: scoreHumanLikeMove(m, ai, human) })).sort((a, b) => b.score - a.score);
      const safe = scored.filter(i => i.score > -20);
      const pool = safe.length ? safe : scored;
      if (Math.random() < 0.7) return pool[0].move;
      const top = pool.filter(i => i.score >= pool[0].score - 10);
      return randomChoice(top).move;
    }

    function getMediumMove(ai, human) {
      let m; m = findImmediateMove(ai); if (m !== null) return m;
      m = findImmediateMove(human); if (m !== null) return m;
      m = findForkMove(ai); if (m !== null) return m;
      m = blockForkMove(human, ai); if (m !== null) return m;
      const avail = preferredMoveOrder(getAvailableMoves());
      const scored = avail.map(mv => ({ move: mv, score: scoreHumanLikeMove(mv, ai, human) })).sort((a, b) => b.score - a.score);
      const safe = scored.filter(i => i.score >= scored[0].score - 8 && i.score > -10);
      const pool = safe.length ? safe : scored;
      if (Math.random() < 0.6) return pool[0].move;
      return randomChoice(pool.slice(0, Math.min(3, pool.length))).move;
    }

    function getComputerMove() {
      const avail = preferredMoveOrder(getAvailableMoves());
      if (!avail.length) return null;
      const d = state.settings.difficulty, ai = getComputerSymbol(), human = getHumanSymbol();
      if (d === "easy") return getSmartButImperfectMove(ai, human);
      if (d === "medium") return getMediumMove(ai, human);
      return minimax([...state.board], ai, ai, human).move;
    }

    function setStatus(msg, thinking = false) {
      if (thinking) el.status.innerHTML = `<span class="ttt-thinking">${msg}<span class="ttt-dots"><span></span><span></span><span></span></span></span>`;
      else el.status.textContent = msg;
    }

    function updateMeta() {
      const { mode, difficulty, firstTurn, playerSymbol } = state.settings;
      if (mode === "single") {
        const cs = playerSymbol === "X" ? "O" : "X";
        el.gameMeta.textContent = `Single Player | ${difficulty[0].toUpperCase() + difficulty.slice(1)} | You: ${playerSymbol} | Computer: ${cs}`;
        el.scoreLabelX.textContent = playerSymbol === "X" ? "You" : "Computer";
        el.scoreLabelO.textContent = playerSymbol === "O" ? "You" : "Computer";
      } else {
        el.gameMeta.textContent = `Multiplayer | ${firstTurn === "human" ? "Player X starts" : "Player O starts"}`;
        el.scoreLabelX.textContent = "Player X"; el.scoreLabelO.textContent = "Player O";
      }
    }

    function renderScores() {
      el.scoreX.textContent = state.scores.X; el.scoreO.textContent = state.scores.O; el.scoreTies.textContent = state.scores.ties;
      el.streakCard.textContent = state.settings.mode === "single" ? `Win streak: ${state.playerWinStreak}` : "Win streak: N/A";
      el.roundCard.textContent = `Round: ${state.roundNumber}`;
    }

    function renderBoard() {
      cells.forEach((cell, i) => {
        const v = state.board[i], isWin = state.winningLine && state.winningLine.includes(i);
        cell.textContent = v;
        cell.disabled = state.gameOver || state.isComputerThinking || v !== "";
        cell.classList.toggle("x", v === "X"); cell.classList.toggle("o", v === "O");
        cell.classList.toggle("winning", Boolean(isWin));
      });
    }
    function showPostgame(msg) { el.postgameMessage.textContent = msg; el.postgameBox.classList.add("show"); }
    function hidePostgame() { el.postgameBox.classList.remove("show"); el.postgameMessage.textContent = ""; }

    function updateTurnStatus() {
      if (state.gameOver) return;
      if (state.settings.mode === "multi") setStatus(`Player ${state.currentPlayer}'s turn.`);
      else if (state.currentPlayer === getHumanSymbol()) setStatus(`Your turn. You are ${getHumanSymbol()}.`);
      else setStatus("Computer is thinking", true);
    }
    function applyMove(i, sym) { if (state.board[i] !== "" || state.gameOver) return false; state.board[i] = sym; return true; }

    function finishRound(winner, line) {
      state.gameOver = true; state.winningLine = line;
      let msg = "";
      if (winner === "Tie") { state.scores.ties++; state.playerWinStreak = 0; msg = "It's a tie."; }
      else { state.scores[winner]++; if (state.settings.mode === "single") { if (winner === getHumanSymbol()) { state.playerWinStreak++; msg = "You win."; } else { state.playerWinStreak = 0; msg = "Computer wins."; } } else msg = `Player ${winner} wins.`; }
      setStatus(msg); showPostgame(msg + " Play again?"); renderScores(); renderBoard();
    }
    function checkRoundState() { const { winner, line } = evaluateBoard(); if (!winner) return false; finishRound(winner, line); return true; }

    function triggerComputerTurn() {
      if (!isComputerTurn() || state.gameOver) return;
      state.isComputerThinking = true; renderBoard(); updateTurnStatus();
      const delay = state.board.filter(Boolean).length <= 1 ? 360 : 220;
      setTimeout(() => {
        if (!state.isComputerThinking) return;
        const move = getComputerMove(); state.isComputerThinking = false;
        if (move === null || state.gameOver) { renderBoard(); return; }
        applyMove(move, getComputerSymbol()); renderBoard();
        if (checkRoundState()) return;
        state.currentPlayer = getHumanSymbol(); updateTurnStatus(); renderBoard();
      }, delay);
    }

    function handleCellClick(i) {
      if (state.gameOver || state.isComputerThinking || state.board[i] !== "") return;
      applyMove(i, state.currentPlayer); renderBoard();
      if (checkRoundState()) return;
      state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
      updateTurnStatus(); renderBoard();
      if (isComputerTurn()) triggerComputerTurn();
    }

    function resetBoard({ advanceRound = true } = {}) {
      if (advanceRound) state.roundNumber++;
      state.board = Array(9).fill(""); state.gameOver = false; state.winningLine = null;
      state.isComputerThinking = false; state.currentPlayer = getStartingSymbol();
      hidePostgame(); updateMeta(); renderScores(); renderBoard(); updateTurnStatus();
      if (isComputerTurn()) triggerComputerTurn();
    }

    el.startGameBtn.addEventListener("click", () => { syncSettingsFromInputs(); state.roundNumber = 1; state.playerWinStreak = 0; state.scores = { X: 0, O: 0, ties: 0 }; showScreen("game"); resetBoard({ advanceRound: false }); });
    el.restartSameBtn.addEventListener("click", () => resetBoard());
    el.playAgainBtn.addEventListener("click", () => resetBoard());
    el.changeSettingsBtn.addEventListener("click", () => { state.isComputerThinking = false; showScreen("setup"); applySettingsToInputs(); refreshSettingsUI(); });
    el.resetScoresBtn.addEventListener("click", () => { state.scores = { X: 0, O: 0, ties: 0 }; state.playerWinStreak = 0; state.roundNumber = 1; renderScores(); });

    [...el.modeInputs, ...el.difficultyInputs, ...el.symbolInputs, ...root.querySelectorAll('input[name="firstTurn"]')].forEach(inp => inp.addEventListener("change", refreshSettingsUI));

    loadSettings(); applySettingsToInputs(); refreshSettingsUI(); renderScores();
  }, []);

  return (
    <div className="ttt-page" ref={containerRef}>
      <button className="ttt-back" onClick={() => navigate("/")}>Back</button>
      <main className="ttt-app">
        <section className="ttt-screen ttt-setup-screen active" id="setupScreen">
          <div className="ttt-top"><h1>Tic-Tac-Toe</h1></div>
          <div className="ttt-panel ttt-options">
            <div className="ttt-option-row">
              <div className="ttt-option-label">Mode</div>
              <div className="ttt-segmented">
                <input type="radio" id="modeSingle" name="mode" defaultValue="single" defaultChecked />
                <label htmlFor="modeSingle">Single Player</label>
                <input type="radio" id="modeMulti" name="mode" defaultValue="multi" />
                <label htmlFor="modeMulti">Multiplayer</label>
              </div>
            </div>
            <div className="ttt-option-row">
              <div className="ttt-option-label">Difficulty</div>
              <div className="ttt-segmented" id="difficultyGroup">
                <input type="radio" id="difficultyEasy" name="difficulty" defaultValue="easy" />
                <label htmlFor="difficultyEasy">Easy</label>
                <input type="radio" id="difficultyMedium" name="difficulty" defaultValue="medium" defaultChecked />
                <label htmlFor="difficultyMedium">Medium</label>
                <input type="radio" id="difficultyHard" name="difficulty" defaultValue="hard" />
                <label htmlFor="difficultyHard">Impossible</label>
              </div>
            </div>
            <div className="ttt-option-row">
              <div className="ttt-option-label">Your symbol</div>
              <div className="ttt-segmented" id="symbolGroup">
                <input type="radio" id="symbolX" name="playerSymbol" defaultValue="X" defaultChecked />
                <label htmlFor="symbolX">Play as X</label>
                <input type="radio" id="symbolO" name="playerSymbol" defaultValue="O" />
                <label htmlFor="symbolO">Play as O</label>
              </div>
            </div>
            <div className="ttt-option-row">
              <div className="ttt-option-label">First turn</div>
              <div className="ttt-segmented">
                <input type="radio" id="firstHuman" name="firstTurn" defaultValue="human" defaultChecked />
                <label htmlFor="firstHuman">You / X</label>
                <input type="radio" id="firstComputer" name="firstTurn" defaultValue="computer" />
                <label htmlFor="firstComputer">Computer / O</label>
              </div>
            </div>
          </div>
          <button className="ttt-primary-action" id="startGameBtn" type="button">Start Game</button>
        </section>

        <section className="ttt-screen ttt-game-screen" id="gameScreen">
          <div className="ttt-game-header">
            <h2 className="ttt-game-title">Tic-Tac-Toe</h2>
            <div className="ttt-meta" id="gameMeta"></div>
          </div>
          <div className="ttt-scoreboard">
            <div className="ttt-score-card"><div id="scoreLabelX">Player X</div><strong id="scoreX">0</strong></div>
            <div className="ttt-score-card"><div>Ties</div><strong id="scoreTies">0</strong></div>
            <div className="ttt-score-card"><div id="scoreLabelO">Player O</div><strong id="scoreO">0</strong></div>
          </div>
          <div className="ttt-micro-stats">
            <div className="ttt-micro-card" id="streakCard">Win streak: 0</div>
            <div className="ttt-micro-card" id="roundCard">Round: 1</div>
          </div>
          <p className="ttt-status" id="status"></p>
          <div className="ttt-board-area"><div className="ttt-grid" id="grid" role="grid"></div></div>
          <div className="ttt-postgame" id="postgameBox">
            <div className="ttt-postgame-message" id="postgameMessage"></div>
            <div className="ttt-postgame-actions"><button className="ttt-btn-primary" id="playAgainBtn" type="button">Play Again</button></div>
          </div>
          <div className="ttt-controls">
            <button className="ttt-btn-primary" id="restartSameBtn" type="button">Restart</button>
            <button className="ttt-btn-secondary" id="changeSettingsBtn" type="button">Change Settings</button>
            <button className="ttt-btn-tertiary" id="resetScoresBtn" type="button">Reset Scores</button>
          </div>
        </section>
      </main>
    </div>
  );
}
