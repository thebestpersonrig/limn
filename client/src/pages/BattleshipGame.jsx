import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./BattleshipGame.css";

const ROWS = 10;
const COLS = 10;
const ROW_LABELS = "ABCDEFGHIJ".split("");

const SHIP_DEFS = [
  { type: "carrier",    size: 5, label: "Carrier",    emoji: "\u{1F6A2}" },
  { type: "battleship", size: 4, label: "Battleship", emoji: "⛵" },
  { type: "cruiser",    size: 3, label: "Cruiser",    emoji: "\u{1F6E5}️" },
  { type: "submarine",  size: 3, label: "Submarine",  emoji: "\u{1F691}" },
  { type: "destroyer",  size: 2, label: "Destroyer",  emoji: "\u{1F6A4}" },
];

const ABILITY_INFO = {
  carrier:    { name: "Airstrike", desc: "Fire entire row or column" },
  battleship: { name: "Barrage",   desc: "Fire X pattern (5 cells)" },
  cruiser:    { name: "Volley",    desc: "Fire 2x2 square (4 cells)" },
  submarine:  { name: "Sonar",     desc: "Scan 3x3 area (no damage)" },
};

const TAUNTS = ["Good luck!", "Nice shot!", "You sunk my battleship!"];

// ── Helpers ─────────────────────────────────────

function getShipCells(type, startR, startC, horizontal) {
  const def = SHIP_DEFS.find(s => s.type === type);
  if (!def) return [];
  const cells = [];
  for (let i = 0; i < def.size; i++) {
    cells.push({ r: startR + (horizontal ? 0 : i), c: startC + (horizontal ? i : 0) });
  }
  return cells;
}

function cellsInBounds(cells) {
  return cells.every(c => c.r >= 0 && c.r < ROWS && c.c >= 0 && c.c < COLS);
}

function cellsOverlap(cells, placed) {
  const occupied = new Set();
  for (const ship of placed) {
    for (const c of ship.cells) occupied.add(`${c.r},${c.c}`);
  }
  return cells.some(c => occupied.has(`${c.r},${c.c}`));
}

function randomPlacement() {
  const placed = [];
  for (const def of SHIP_DEFS) {
    let attempts = 0;
    while (attempts < 200) {
      const horizontal = Math.random() < 0.5;
      const maxR = horizontal ? 9 : 10 - def.size;
      const maxC = horizontal ? 10 - def.size : 9;
      const startR = Math.floor(Math.random() * (maxR + 1));
      const startC = Math.floor(Math.random() * (maxC + 1));
      const cells = getShipCells(def.type, startR, startC, horizontal);
      if (cellsInBounds(cells) && !cellsOverlap(cells, placed)) {
        placed.push({ type: def.type, cells });
        break;
      }
      attempts++;
    }
  }
  return placed.length === SHIP_DEFS.length ? placed : null;
}

function coordLabel(r, c) {
  return `${ROW_LABELS[r]}${c + 1}`;
}

function getAbilityPreview(ability, row, col) {
  if (ability === "barrage") {
    return [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]]
      .map(([dr,dc]) => ({ r: row+dr, c: col+dc }))
      .filter(c => c.r >= 0 && c.r < 10 && c.c >= 0 && c.c < 10);
  }
  if (ability === "volley") {
    return [[0,0],[0,1],[1,0],[1,1]]
      .map(([dr,dc]) => ({ r: row+dr, c: col+dc }))
      .filter(c => c.r >= 0 && c.r < 10 && c.c >= 0 && c.c < 10);
  }
  if (ability === "sonar") {
    const cells = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const r = row+dr, c = col+dc;
        if (r >= 0 && r < 10 && c >= 0 && c < 10) cells.push({ r, c });
      }
    return cells;
  }
  return [];
}

// ── Grid Component ──────────────────────────────

function Grid({ board, isOwn, onCellClick, onCellHover, hoverCells, hoverValid,
                sunkShips, scanData, disabled, label, lastFired }) {
  const scanMap = useMemo(() => {
    if (!scanData) return {};
    const m = {};
    for (const s of scanData) m[`${s.row},${s.col}`] = s.hasShip;
    return m;
  }, [scanData]);

  return (
    <div className="bship-grid-wrapper">
      <div className="bship-grid-label">{label}</div>
      <div className="bship-grid">
        {/* Column headers */}
        <div className="bship-grid-corner" />
        {Array.from({ length: COLS }, (_, c) => (
          <div key={c} className="bship-grid-col-header">{c + 1}</div>
        ))}

        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} className="bship-grid-row">
            <div className="bship-grid-row-header">{ROW_LABELS[r]}</div>
            {Array.from({ length: COLS }, (_, c) => {
              const val = board?.[r]?.[c];
              const isHover = hoverCells?.some(h => h.r === r && h.c === c);
              const sunkHere = sunkShips?.some(s => s.cells?.some(sc => sc.r === r && sc.c === c));
              const scanKey = `${r},${c}`;
              const scanned = scanKey in scanMap;
              const scanShip = scanMap[scanKey];

              const isLastFired = lastFired?.some(f => f.r === r && f.c === c);

              let cellClass = "bship-cell";
              if (val === "ship" && isOwn) cellClass += " bship-cell--ship";
              else if (val === "hit") cellClass += " bship-cell--hit";
              else if (val === "miss") cellClass += " bship-cell--miss";
              else if (sunkHere && !isOwn) cellClass += " bship-cell--sunk";
              if (isHover) cellClass += hoverValid !== false ? " bship-cell--hover-valid" : " bship-cell--hover-invalid";
              if (scanned && !val) cellClass += scanShip ? " bship-cell--scan-ship" : " bship-cell--scan-empty";
              if (isLastFired) cellClass += " bship-cell--just-fired";
              if (disabled) cellClass += " bship-cell--disabled";

              return (
                <div
                  key={c}
                  className={cellClass}
                  onClick={() => !disabled && onCellClick?.(r, c)}
                  onMouseEnter={() => onCellHover?.(r, c)}
                  onMouseLeave={() => onCellHover?.(null, null)}
                  title={coordLabel(r, c)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Component ──────────────────────────────

function Chat({ socket }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    function onMsg(msg) {
      setMessages(prev => {
        const next = [...prev, msg];
        return next.length > 50 ? next.slice(-50) : next;
      });
      if (!open) setUnread(u => u + 1);
    }
    socket.on("battleship-chat-msg", onMsg);
    return () => socket.off("battleship-chat-msg", onMsg);
  }, [socket, open]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    socket.emit("battleship-chat", { text });
    setInput("");
  }

  function sendTaunt(text) {
    socket.emit("battleship-chat", { text });
  }

  if (!open) {
    return (
      <button className="bship-chat-toggle" onClick={() => { setOpen(true); setUnread(0); }}>
        Chat {unread > 0 && <span className="bship-chat-unread">{unread}</span>}
      </button>
    );
  }

  return (
    <div className="bship-chat">
      <div className="bship-chat-header">
        <span>Chat</span>
        <button className="bship-chat-close" onClick={() => setOpen(false)}>_</button>
      </div>
      <div className="bship-chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="bship-chat-empty">No messages yet</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bship-chat-msg${m.senderId === socket.id ? " bship-chat-msg--me" : ""}`}>
            <strong>{m.sender}</strong>: {m.text}
          </div>
        ))}
      </div>
      <div className="bship-chat-taunts">
        {TAUNTS.map(t => (
          <button key={t} className="bship-chat-taunt" onClick={() => sendTaunt(t)}>{t}</button>
        ))}
      </div>
      <div className="bship-chat-input-row">
        <input
          className="bship-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button className="bship-chat-send" onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ── Ship Placement Phase ────────────────────────

function PlacementPhase({ socket, mode, onReady }) {
  const [placed, setPlaced] = useState([]);
  const [currentShipIdx, setCurrentShipIdx] = useState(0);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCells, setHoverCells] = useState(null);
  const [hoverValid, setHoverValid] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const currentShip = SHIP_DEFS[currentShipIdx] || null;

  function handleHover(r, c) {
    if (!currentShip || r === null || waiting) { setHoverCells(null); return; }
    const cells = getShipCells(currentShip.type, r, c, horizontal);
    const valid = cellsInBounds(cells) && !cellsOverlap(cells, placed);
    setHoverCells(cells);
    setHoverValid(valid);
  }

  function handleClick(r, c) {
    if (!currentShip || waiting) return;
    const cells = getShipCells(currentShip.type, r, c, horizontal);
    if (!cellsInBounds(cells) || cellsOverlap(cells, placed)) return;

    const newPlaced = [...placed, { type: currentShip.type, cells }];
    setPlaced(newPlaced);
    setHoverCells(null);

    if (currentShipIdx + 1 < SHIP_DEFS.length) {
      setCurrentShipIdx(currentShipIdx + 1);
    }
  }

  function handleUndo() {
    if (placed.length === 0 || waiting) return;
    const newPlaced = placed.slice(0, -1);
    setPlaced(newPlaced);
    setCurrentShipIdx(newPlaced.length);
  }

  function handleRandom() {
    if (waiting) return;
    const result = randomPlacement();
    if (result) {
      setPlaced(result);
      setCurrentShipIdx(SHIP_DEFS.length);
      setHoverCells(null);
    }
  }

  function handleReady() {
    if (placed.length !== SHIP_DEFS.length) return;
    setWaiting(true);
    socket.emit("battleship-place-ships", {
      ships: placed.map(s => ({ type: s.type, cells: s.cells })),
    });
  }

  // Build display board from placed ships
  const board = Array.from({ length: 10 }, () => Array(10).fill(null));
  for (const ship of placed) {
    for (const c of ship.cells) board[c.r][c.c] = "ship";
  }

  return (
    <div className="bship-placement">
      <div className="bship-placement-header">
        <h2>Place Your Ships</h2>
        <span className="bship-placement-count">{placed.length}/{SHIP_DEFS.length} placed</span>
        {mode === "advanced" && <span className="bship-placement-mode">Advanced Mode</span>}
      </div>

      <div className="bship-placement-body">
        <Grid
          board={board}
          isOwn={true}
          onCellClick={handleClick}
          onCellHover={handleHover}
          hoverCells={hoverCells}
          hoverValid={hoverValid}
          disabled={waiting}
          label="Your Board"
        />

        <div className="bship-ship-tray">
          <h3>Ships</h3>
          {SHIP_DEFS.map((def, i) => {
            const isPlaced = i < placed.length;
            const isCurrent = i === currentShipIdx && !waiting;
            return (
              <div key={def.type} className={`bship-ship-item${isPlaced ? " placed" : ""}${isCurrent ? " current" : ""}`}>
                <span className="bship-ship-item-emoji">{def.emoji}</span>
                <div className="bship-ship-item-info">
                  <span className="bship-ship-item-name">{def.label}</span>
                  <span className="bship-ship-item-size">
                    {"#".repeat(def.size)} ({def.size})
                    {mode === "advanced" && ABILITY_INFO[def.type] && (
                      <span className="bship-ship-item-ability"> - {ABILITY_INFO[def.type].name}</span>
                    )}
                  </span>
                </div>
                {isPlaced && <span className="bship-ship-item-check">✓</span>}
              </div>
            );
          })}

          <div className="bship-placement-controls">
            <button className="bship-btn-small" onClick={() => setHorizontal(!horizontal)} disabled={waiting}>
              {horizontal ? "Horizontal ↔" : "Vertical ↕"}
            </button>
            <button className="bship-btn-small" onClick={handleUndo} disabled={placed.length === 0 || waiting}>
              Undo
            </button>
            <button className="bship-btn-small bship-btn-random" onClick={handleRandom} disabled={waiting}>
              Random
            </button>
          </div>

          {placed.length === SHIP_DEFS.length && !waiting && (
            <button className="bship-ready-btn" onClick={handleReady}>
              Ready!
            </button>
          )}

          {waiting && (
            <div className="bship-placement-waiting">
              Waiting for opponent...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Battle Phase ────────────────────────────────

function BattlePhase({ socket, gameState, playerId }) {
  const [hoverCells, setHoverCells] = useState(null);
  const [hoverValid, setHoverValid] = useState(true);
  const [activeAbility, setActiveAbility] = useState(null);
  const [airstrikeDir, setAirstrikeDir] = useState("row");
  const [toast, setToast] = useState(null);
  const [scanData, setScanData] = useState([]);
  const [lastFiredOwn, setLastFiredOwn] = useState([]);
  const [lastFiredOpp, setLastFiredOpp] = useState([]);
  const toastTimer = useRef(null);
  const firedTimer = useRef(null);

  const isMyTurn = gameState?.turn === playerId;
  const mode = gameState?.mode;
  const abilities = gameState?.abilities;
  const abilityUsed = gameState?.abilityUsedThisTurn;

  // Listen for fire results, ability results, and toasts
  function flashFired(cells, isOwn) {
    const mapped = cells.map(c => ({ r: c.row, c: c.col }));
    if (isOwn) setLastFiredOwn(mapped);
    else setLastFiredOpp(mapped);
    clearTimeout(firedTimer.current);
    firedTimer.current = setTimeout(() => {
      setLastFiredOwn([]);
      setLastFiredOpp([]);
    }, 1200);
  }

  useEffect(() => {
    function onFireResult({ cells, sunk }) {
      if (sunk) showToast(`You sank their ${sunk}!`);
      if (cells) flashFired(cells, false);
    }
    function onOpponentFire({ cells, sunk }) {
      if (sunk) showToast(`They sank your ${sunk}!`);
      if (cells) flashFired(cells, true);
    }
    function onAbilityResult({ type, cells, sunk, scanData: sd }) {
      if (sunk) showToast(`You sank their ${sunk}!`);
      if (sd) setScanData(prev => [...prev, ...sd]);
      if (cells) flashFired(cells, false);
    }
    function onOpponentAbility({ type, cells, sunk }) {
      if (sunk) showToast(`They sank your ${sunk}!`);
      if (cells) flashFired(cells, true);
    }

    function onError({ message }) {
      showToast(message);
    }

    socket.on("battleship-fire-result", onFireResult);
    socket.on("battleship-opponent-fire", onOpponentFire);
    socket.on("battleship-ability-result", onAbilityResult);
    socket.on("battleship-opponent-ability", onOpponentAbility);
    socket.on("battleship-error", onError);

    return () => {
      socket.off("battleship-fire-result", onFireResult);
      socket.off("battleship-opponent-fire", onOpponentFire);
      socket.off("battleship-ability-result", onAbilityResult);
      socket.off("battleship-opponent-ability", onOpponentAbility);
      socket.off("battleship-error", onError);
    };
  }, [socket]);

  function showToast(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleOpponentCellClick(r, c) {
    if (!isMyTurn) return;

    if (activeAbility) {
      if (activeAbility === "airstrike") {
        socket.emit("battleship-use-ability", {
          ability: "airstrike",
          params: { direction: airstrikeDir, index: airstrikeDir === "row" ? r : c },
        });
      } else {
        socket.emit("battleship-use-ability", {
          ability: activeAbility,
          params: { row: r, col: c },
        });
      }
      setActiveAbility(null);
      setHoverCells(null);
      return;
    }

    // Normal fire
    socket.emit("battleship-fire", { row: r, col: c });
    setHoverCells(null);
  }

  function handleOpponentHover(r, c) {
    if (!isMyTurn || r === null) { setHoverCells(null); return; }

    if (activeAbility) {
      if (activeAbility === "airstrike") {
        const cells = [];
        for (let i = 0; i < 10; i++) {
          if (airstrikeDir === "row") cells.push({ r, c: i });
          else cells.push({ r: i, c });
        }
        setHoverCells(cells);
      } else {
        setHoverCells(getAbilityPreview(activeAbility, r, c));
      }
      setHoverValid(true);
      return;
    }

    setHoverCells([{ r, c }]);
    const alreadyFired = gameState?.opponentBoard?.[r]?.[c] !== null;
    setHoverValid(!alreadyFired);
  }

  const myShipsSunk = gameState?.myShips?.filter(s => s.sunk).map(s => s.type) || [];
  const oppShipsSunk = gameState?.opponentShips?.filter(s => s.sunk).map(s => s.type) || [];

  return (
    <div className="bship-battle">
      {/* Turn indicator */}
      <div className={`bship-turn-indicator${isMyTurn ? " bship-turn--mine" : ""}`}>
        {isMyTurn ? "Your Turn" : "Opponent's Turn"}
        {mode === "advanced" && isMyTurn && !activeAbility && (
          <span className="bship-shots-left"> - {gameState?.shotsRemaining} shot{gameState?.shotsRemaining !== 1 ? "s" : ""} left</span>
        )}
        {activeAbility && (
          <span className="bship-ability-active"> - {ABILITY_INFO[activeAbility === "airstrike" ? "carrier" : activeAbility === "barrage" ? "battleship" : activeAbility === "volley" ? "cruiser" : "submarine"]?.name} active</span>
        )}
      </div>

      {/* Targeting coordinate */}
      {isMyTurn && hoverCells && hoverCells.length > 0 && (
        <div className="bship-targeting">
          Targeting: {hoverCells.length === 1
            ? coordLabel(hoverCells[0].r, hoverCells[0].c)
            : `${hoverCells.length} cells`}
        </div>
      )}

      {toast && <div className="bship-toast">{toast}</div>}

      {/* Grids */}
      <div className="bship-grids">
        <Grid
          board={gameState?.myBoard}
          isOwn={true}
          disabled={true}
          sunkShips={gameState?.myShips?.filter(s => s.sunk)}
          lastFired={lastFiredOwn}
          label="Your Fleet"
        />
        <Grid
          board={gameState?.opponentBoard}
          isOwn={false}
          onCellClick={handleOpponentCellClick}
          onCellHover={handleOpponentHover}
          hoverCells={hoverCells}
          hoverValid={hoverValid}
          sunkShips={gameState?.opponentShips?.filter(s => s.sunk)}
          scanData={scanData}
          lastFired={lastFiredOpp}
          disabled={!isMyTurn}
          label="Enemy Waters"
        />
      </div>

      {/* Ship status */}
      <div className="bship-ship-status">
        <div className="bship-ship-status-col">
          <h4>Your Ships</h4>
          {SHIP_DEFS.map(def => (
            <div key={def.type} className={`bship-status-row${myShipsSunk.includes(def.type) ? " sunk" : ""}`}>
              <span>{def.emoji} {def.label}</span>
              {myShipsSunk.includes(def.type) ? <span className="bship-sunk-x">SUNK</span> : <span className="bship-alive">✓</span>}
            </div>
          ))}
        </div>
        <div className="bship-ship-status-col">
          <h4>Enemy Ships</h4>
          {SHIP_DEFS.map(def => (
            <div key={def.type} className={`bship-status-row${oppShipsSunk.includes(def.type) ? " sunk" : ""}`}>
              <span>{def.emoji} {def.label}</span>
              {oppShipsSunk.includes(def.type) ? <span className="bship-sunk-x">SUNK</span> : <span className="bship-unknown">?</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Ability bar (advanced mode) */}
      {mode === "advanced" && isMyTurn && (
        <div className="bship-ability-bar">
          {Object.entries(ABILITY_INFO).map(([shipType, info]) => {
            const uses = abilities?.[shipType];
            const ship = gameState?.myShips?.find(s => s.type === shipType);
            const isSunk = ship?.sunk;
            const noUses = uses !== undefined && uses !== null && isFinite(uses) && uses <= 0;
            const disabled = isSunk || noUses || abilityUsed;
            const isActive = activeAbility === info.name.toLowerCase().replace(/\s/g, "");
            const abilityKey = shipType === "carrier" ? "airstrike" : shipType === "battleship" ? "barrage" : shipType === "cruiser" ? "volley" : "sonar";

            return (
              <button
                key={shipType}
                className={`bship-ability-btn${disabled ? " disabled" : ""}${activeAbility === abilityKey ? " active" : ""}`}
                onClick={() => {
                  if (disabled) return;
                  setActiveAbility(activeAbility === abilityKey ? null : abilityKey);
                  setHoverCells(null);
                }}
                disabled={disabled}
                title={info.desc}
              >
                <span className="bship-ability-name">{info.name}</span>
                <span className="bship-ability-uses">
                  {isSunk ? "SUNK" : uses === Infinity ? "∞" : uses !== undefined ? uses : ""}
                </span>
              </button>
            );
          })}
          {activeAbility === "airstrike" && (
            <div className="bship-airstrike-dir">
              <button className={airstrikeDir === "row" ? "active" : ""} onClick={() => setAirstrikeDir("row")}>Row</button>
              <button className={airstrikeDir === "col" ? "active" : ""} onClick={() => setAirstrikeDir("col")}>Column</button>
            </div>
          )}
          {activeAbility && (
            <button className="bship-ability-cancel" onClick={() => { setActiveAbility(null); setHoverCells(null); }}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Game Component ─────────────────────────

export default function BattleshipGame({ code, roomState, playerName, onBack }) {
  const socket = getSocket();
  const playerId = socket.id;
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState(roomState?.phase || "placing");

  useEffect(() => {
    function onGameState(state) {
      setGameState(state);
      if (state.phase) setPhase(state.phase);
    }
    function onPhase({ phase: p }) {
      setPhase(p);
    }

    socket.on("battleship-game-state", onGameState);
    socket.on("battleship-phase", onPhase);

    return () => {
      socket.off("battleship-game-state", onGameState);
      socket.off("battleship-phase", onPhase);
    };
  }, [socket]);

  return (
    <div className="bship-game-page">
      <div className="bship-game-topbar">
        <button className="bship-game-exit" onClick={onBack}>Exit</button>
        <span className="bship-game-room">Room {code}</span>
        <span className="bship-game-mode">{roomState?.mode === "advanced" ? "Advanced" : "Classic"}</span>
      </div>

      <div className="bship-game-content">
        {phase === "placing" && (
          <PlacementPhase socket={socket} mode={roomState?.mode || "classic"} />
        )}

        {phase === "playing" && gameState && (
          <BattlePhase socket={socket} gameState={gameState} playerId={playerId} />
        )}

        {phase === "playing" && !gameState && (
          <div className="bship-loading">Loading game state...</div>
        )}
      </div>

      <Chat socket={socket} />
    </div>
  );
}
