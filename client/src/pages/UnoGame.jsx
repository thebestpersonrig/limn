import { useEffect, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./UnoGame.css";

const TAUNTS = ["Uno!", "Draw!", "No mercy!", "Stacked!"];

const CARD_SYMBOLS = {
  skip: "\u{1F6AB}",
  reverse: "\u{1F504}",
  draw2: "+2",
  wild: "W",
  wild4: "+4",
};

function cardDisplay(card) {
  if (!card) return "";
  if (card.value === "wild") return "W";
  if (card.value === "wild4") return "+4";
  if (card.value === "skip") return "\u{2298}";
  if (card.value === "reverse") return "\u{21C4}";
  if (card.value === "draw2") return "+2";
  return card.value;
}

function cardName(card) {
  if (!card) return "";
  if (card.value === "wild") return "Wild";
  if (card.value === "wild4") return "Wild +4";
  if (card.value === "skip") return "Skip";
  if (card.value === "reverse") return "Reverse";
  if (card.value === "draw2") return "+2";
  const col = card.color.charAt(0).toUpperCase() + card.color.slice(1);
  return `${col} ${card.value}`;
}

function cardColorClass(card) {
  if (!card) return "";
  if (card.color === "wild") return "uno-card--wild";
  return `uno-card--${card.color}`;
}

function isPlayable(card, discardTop, currentColor, drawStack, stackLevel, houseRules) {
  if (!card || !discardTop) return false;

  // During a draw stack with stacking on, only draw cards are playable
  if (drawStack > 0 && houseRules?.stacking) {
    if (card.value === "draw2" && stackLevel <= 2) return true;
    if (card.value === "wild4") return true;
    return false;
  }
  // During a draw stack with stacking off, nothing is playable (must draw)
  if (drawStack > 0) return false;

  if (card.color === "wild") return true;
  if (card.color === currentColor) return true;
  if (card.value === discardTop.value && discardTop.color !== "wild") return true;
  return false;
}

// ── Chat ──────────────────────────────────

function Chat({ socket }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
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
    socket.on("uno-chat-msg", onMsg);
    return () => socket.off("uno-chat-msg", onMsg);
  }, [socket, open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    socket.emit("uno-chat", { text });
    setInput("");
  }

  if (!open) {
    return (
      <button className="uno-chat-toggle" onClick={() => { setOpen(true); setUnread(0); }}>
        Chat {unread > 0 && <span className="uno-chat-unread">{unread}</span>}
      </button>
    );
  }

  return (
    <div className="uno-chat">
      <div className="uno-chat-header">
        <span>Chat</span>
        <button className="uno-chat-close" onClick={() => setOpen(false)}>_</button>
      </div>
      <div className="uno-chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="uno-chat-empty">No messages yet</p>}
        {messages.map((m, i) => (
          <div key={i} className={`uno-chat-msg${m.senderId === socket.id ? " uno-chat-msg--me" : ""}`}>
            <strong>{m.sender}</strong>: {m.text}
          </div>
        ))}
      </div>
      <div className="uno-chat-taunts">
        {TAUNTS.map(t => (
          <button key={t} className="uno-chat-taunt" onClick={() => socket.emit("uno-chat", { text: t })}>{t}</button>
        ))}
      </div>
      <div className="uno-chat-input-row">
        <input
          className="uno-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button className="uno-chat-send" onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ── Color Picker ──────────────────────────

function ColorPicker({ onPick }) {
  const colors = ["red", "blue", "green", "yellow"];
  return (
    <div className="uno-color-picker-overlay">
      <div className="uno-color-picker">
        <p className="uno-color-picker-title">Choose a color</p>
        <div className="uno-color-picker-options">
          {colors.map(c => (
            <button key={c} className={`uno-color-pick uno-color-pick--${c}`} onClick={() => onPick(c)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Swap Picker (for Seven-Zero rule) ─────

function SwapPicker({ opponents, onPick }) {
  return (
    <div className="uno-color-picker-overlay">
      <div className="uno-color-picker">
        <p className="uno-color-picker-title">Swap hands with...</p>
        <div className="uno-swap-options">
          {opponents.map(o => (
            <button key={o.id} className="uno-swap-btn" onClick={() => onPick(o.id)}>
              {o.name} ({o.cardCount} cards)
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Card Component ────────────────────────

function Card({ card, playable, onClick, small, faceDown, glow }) {
  if (faceDown) {
    return <div className={`uno-card uno-card--back${small ? " uno-card--small" : ""}`} />;
  }

  return (
    <div
      className={`uno-card ${cardColorClass(card)}${playable ? " uno-card--playable" : " uno-card--disabled"}${small ? " uno-card--small" : ""}${glow ? " uno-card--glow" : ""}`}
      onClick={() => playable && onClick?.()}
    >
      <span className="uno-card-corner-tl">{cardDisplay(card)}</span>
      <span className="uno-card-oval">
        <span className="uno-card-value">{cardDisplay(card)}</span>
      </span>
      <span className="uno-card-corner-br">{cardDisplay(card)}</span>
    </div>
  );
}

// ── Main Game ─────────────────────────────

export default function UnoGame({ code, roomState, onBack }) {
  const socket = getSocket();
  const playerId = socket.id;
  const [gs, setGs] = useState(null);
  const [toast, setToast] = useState(null);
  const [colorPicking, setColorPicking] = useState(null); // cardIndex waiting for color
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const toastTimer = useRef(null);

  // Track last action for center display
  const [lastAction, setLastAction] = useState(null);
  const lastActionTimer = useRef(null);

  function showLastAction(text) {
    setLastAction(text);
    clearTimeout(lastActionTimer.current);
    lastActionTimer.current = setTimeout(() => setLastAction(null), 3000);
  }

  useEffect(() => {
    function onGameState(state) { setGs(state); }
    function onCardPlayed({ playerId: pid, card, newColor, jumpIn: ji, double }) {
      // Find the player name
      const pName = pid === socket.id ? "You" : gs?.opponents?.find(o => o.id === pid)?.name || "Opponent";
      if (ji) {
        showToast(`${pName} jumped in!`);
        showLastAction("Jump In!");
      } else if (pid !== socket.id) {
        showToast(`${pName} played ${cardName(card)}`);
      }
      if (double) showLastAction("Double +2!");
      else if (card.value === "skip") showLastAction("Skip!");
      else if (card.value === "reverse") showLastAction("Reverse!");
      else if (card.value === "draw2") showLastAction("+2");
      else if (card.value === "wild4") showLastAction("+4");
    }
    function onCardsDrawn({ playerId: pid, count }) {
      const pName = pid === socket.id ? "You" : gs?.opponents?.find(o => o.id === pid)?.name || "Opponent";
      if (count > 1) showToast(`${pName} drew ${count} cards`);
    }
    function onUnoCalled({ playerId: pid }) {
      const pName = pid === socket.id ? "You" : gs?.opponents?.find(o => o.id === pid)?.name || "Someone";
      showToast(`${pName} called UNO!`);
    }
    function onUnoCaught({ catcherName, targetName }) {
      showToast(`${catcherName} caught ${targetName}! +2 penalty`);
    }
    function onHandsSwapped() {
      showToast("Hands swapped!");
      showLastAction("Swap!");
      setShowSwapPicker(false);
    }
    function onHandsRotated() {
      showToast("All hands rotated!");
      showLastAction("Rotate!");
    }
    function onError({ message }) { showToast(message); }

    socket.on("uno-game-state", onGameState);
    socket.on("uno-card-played", onCardPlayed);
    socket.on("uno-cards-drawn", onCardsDrawn);
    socket.on("uno-uno-called", onUnoCalled);
    socket.on("uno-uno-caught", onUnoCaught);
    socket.on("uno-hands-swapped", onHandsSwapped);
    socket.on("uno-hands-rotated", onHandsRotated);
    socket.on("uno-error", onError);

    socket.emit("uno-get-state");

    return () => {
      socket.off("uno-game-state", onGameState);
      socket.off("uno-card-played", onCardPlayed);
      socket.off("uno-cards-drawn", onCardsDrawn);
      socket.off("uno-uno-called", onUnoCalled);
      socket.off("uno-uno-caught", onUnoCaught);
      socket.off("uno-hands-swapped", onHandsSwapped);
      socket.off("uno-hands-rotated", onHandsRotated);
      socket.off("uno-error", onError);
    };
  }, [socket]);

  // Show swap picker when pending
  useEffect(() => {
    if (gs?.pendingSwap) setShowSwapPicker(true);
  }, [gs?.pendingSwap]);

  function showToast(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  if (!gs) {
    return (
      <div className="uno-game-page">
        <div className="uno-game-topbar">
          <button className="uno-game-exit" onClick={onBack}>Exit</button>
          <span className="uno-game-room">Room {code}</span>
        </div>
        <div className="uno-game-content">
          <div className="uno-loading">Loading game state...</div>
        </div>
      </div>
    );
  }

  const isMyTurn = gs.turnPlayerId === playerId;
  const myHand = gs.myHand || [];
  const opponents = gs.opponents || [];
  const discardTop = gs.discardTop;
  const drawStack = gs.drawStack || 0;
  const stackLevel = gs.stackLevel || 0;

  function handlePlayCard(cardIndex) {
    const card = myHand[cardIndex];
    if (!card) return;

    // Wild cards need color picker
    if (card.color === "wild") {
      setColorPicking(cardIndex);
      return;
    }

    // Check if we can play double +2
    // For now, single card play
    socket.emit("uno-play-card", { cardIndex });
  }

  function handleColorPick(color) {
    if (colorPicking !== null) {
      socket.emit("uno-play-card", { cardIndex: colorPicking, chosenColor: color });
      setColorPicking(null);
    }
  }

  function handleDraw() {
    socket.emit("uno-draw-card");
  }

  function handlePlayDrawn(chosenColor) {
    if (chosenColor) {
      socket.emit("uno-play-drawn", { chosenColor });
    } else {
      const drawnCard = myHand[myHand.length - 1];
      if (drawnCard?.color === "wild") {
        setColorPicking("drawn");
        return;
      }
      socket.emit("uno-play-drawn", {});
    }
  }

  function handleKeepDrawn() {
    socket.emit("uno-keep-drawn");
  }

  function handleColorPickDrawn(color) {
    socket.emit("uno-play-drawn", { chosenColor: color });
    setColorPicking(null);
  }

  function handleCallUno() {
    socket.emit("uno-call-uno");
  }

  function handleCatchUno(targetId) {
    socket.emit("uno-catch-uno", { targetId });
  }

  function handleJumpIn(cardIndex) {
    socket.emit("uno-jump-in", { cardIndex });
  }

  function handleSwap(targetId) {
    socket.emit("uno-swap-hands", { targetId });
    setShowSwapPicker(false);
  }

  // Direction display
  const dirArrow = gs.direction === 1 ? "\u{27F3}" : "\u{27F2}";

  // Find current turn player name
  const turnPlayer = gs.turnPlayerId === playerId
    ? "You"
    : opponents.find(o => o.id === gs.turnPlayerId)?.name || "...";

  return (
    <div className="uno-game-page">
      {/* Top bar */}
      <div className="uno-game-topbar">
        <button className="uno-game-exit" onClick={onBack}>Exit</button>
        <span className="uno-game-room">Room {code}</span>
        <span className="uno-game-direction">{dirArrow}</span>
        <span className={`uno-game-turn${isMyTurn ? " uno-game-turn--mine" : ""}`}>
          {isMyTurn ? "Your Turn" : `${turnPlayer}'s Turn`}
        </span>
      </div>

      {toast && <div className="uno-toast">{toast}</div>}

      <div className="uno-game-content">
        {/* Opponents */}
        <div className="uno-opponents">
          {opponents.map(o => (
            <div key={o.id} className={`uno-opponent${gs.turnPlayerId === o.id ? " uno-opponent--active" : ""}`}>
              <div className="uno-opponent-info">
                <span className="uno-opponent-name">{o.name}</span>
                <span className="uno-opponent-count">{o.cardCount} card{o.cardCount !== 1 ? "s" : ""}</span>
                {o.calledUno && o.cardCount === 1 && <span className="uno-opponent-uno">UNO!</span>}
              </div>
              <div className="uno-opponent-cards">
                {Array.from({ length: Math.min(o.cardCount, 10) }, (_, i) => (
                  <Card key={i} faceDown small />
                ))}
                {o.cardCount > 10 && <span className="uno-opponent-more">+{o.cardCount - 10}</span>}
              </div>
              {o.cardCount === 1 && !o.calledUno && (
                <button className="uno-catch-btn" onClick={() => handleCatchUno(o.id)}>Catch!</button>
              )}
            </div>
          ))}
        </div>

        {/* Center: Discard + Action + Draw */}
        <div className="uno-center">
          <div className="uno-discard-area">
            <div className={`uno-color-ring uno-color-ring--${gs.currentColor}`} />
            <div className="uno-discard-stack">
              <div className="uno-discard-shadow" />
              <div className="uno-discard-shadow uno-discard-shadow--2" />
              {discardTop && <Card card={discardTop} playable={false} glow />}
            </div>
            <span className="uno-color-label">{gs.currentColor}</span>
          </div>

          {lastAction && (
            <div className="uno-last-action" key={lastAction}>
              {lastAction}
            </div>
          )}

          <div className="uno-draw-area" onClick={isMyTurn ? handleDraw : undefined}>
            <div className={`uno-draw-pile${isMyTurn ? " uno-draw-pile--active" : ""}${drawStack > 0 && isMyTurn ? " uno-draw-pile--danger" : ""}`}>
              <span className="uno-draw-count">{gs.drawPileCount}</span>
              {drawStack > 0 && <span className="uno-draw-stack">+{drawStack}</span>}
            </div>
            {isMyTurn && <span className="uno-draw-label">{drawStack > 0 ? `Draw ${drawStack} cards` : "Draw card"}</span>}
          </div>
        </div>

        {/* Drawn card prompt */}
        {gs.canPlayDrawn && isMyTurn && (
          <div className="uno-drawn-prompt">
            <span>Play drawn card?</span>
            <div className="uno-drawn-prompt-card">
              <Card card={myHand[myHand.length - 1]} playable />
            </div>
            <div className="uno-drawn-prompt-btns">
              <button className="uno-drawn-btn uno-drawn-btn--play" onClick={() => handlePlayDrawn()}>Play</button>
              <button className="uno-drawn-btn uno-drawn-btn--keep" onClick={handleKeepDrawn}>Keep</button>
            </div>
          </div>
        )}

        {/* Player hand */}
        <div className="uno-hand-area">
          <div className="uno-hand-header">
            <span className="uno-hand-count">{myHand.length} card{myHand.length !== 1 ? "s" : ""}</span>
            {isMyTurn && !gs.canPlayDrawn && drawStack === 0 && (
              <span className="uno-hand-hint">
                {myHand.some((c, i) => isPlayable(c, discardTop, gs.currentColor, drawStack, stackLevel, gs.houseRules))
                  ? "Select a card to play"
                  : "No playable cards -- draw from pile"}
              </span>
            )}
            {isMyTurn && drawStack > 0 && gs.houseRules?.stacking && (
              <span className="uno-hand-hint uno-hand-hint--danger">
                Stack a draw card or draw {drawStack}!
              </span>
            )}
          </div>

          {/* Uno button */}
          {myHand.length <= 2 && (
            <button
              className={`uno-uno-btn${myHand.length === 1 && !gs.myCalledUno ? " uno-uno-btn--urgent" : ""}${gs.myCalledUno ? " uno-uno-btn--called" : ""}`}
              onClick={handleCallUno}
              disabled={gs.myCalledUno}
            >
              {gs.myCalledUno ? "UNO!" : "UNO"}
            </button>
          )}

          <div className="uno-hand">
            {myHand.map((card, i) => {
              const canPlay = isMyTurn && !gs.canPlayDrawn && isPlayable(card, discardTop, gs.currentColor, drawStack, stackLevel, gs.houseRules);
              // Jump in: exact match, not my turn, jump in enabled
              const canJumpIn = !isMyTurn && gs.houseRules?.jumpIn && drawStack === 0 &&
                discardTop && card.color === discardTop.color && card.value === discardTop.value && card.color !== "wild";

              return (
                <Card
                  key={i}
                  card={card}
                  playable={canPlay || canJumpIn}
                  onClick={() => {
                    if (canJumpIn) handleJumpIn(i);
                    else if (canPlay) handlePlayCard(i);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Color picker */}
      {colorPicking !== null && colorPicking !== "drawn" && (
        <ColorPicker onPick={handleColorPick} />
      )}
      {colorPicking === "drawn" && (
        <ColorPicker onPick={handleColorPickDrawn} />
      )}

      {/* Swap picker for Seven-Zero */}
      {showSwapPicker && gs.pendingSwap && (
        <SwapPicker opponents={opponents} onPick={handleSwap} />
      )}

      <Chat socket={socket} />
    </div>
  );
}
