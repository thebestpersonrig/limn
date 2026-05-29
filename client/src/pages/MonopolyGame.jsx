import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "../hooks/useSocket";
import { BOARD, GROUP_COLORS, GROUP_SIZES, PLAYER_COLORS, getSpacePos } from "../data/monopolyBoard";
import "./MonopolyGame.css";

const DICE_DOTS = {
  1: [[1,1]],
  2: [[0,2],[2,0]],
  3: [[0,2],[1,1],[2,0]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[1,0],[2,0],[0,2],[1,2],[2,2]],
};

const CORNER_ICONS = { 0: "→", 10: "🔒", 20: "🅿️", 30: "🚔" };

function DiceFace({ value, rolling }) {
  const dots = DICE_DOTS[value] || [];
  return (
    <div className={`mpoly-die${rolling ? " mpoly-die--rolling" : ""}`}>
      {dots.map(([r, c], i) => (
        <span key={i} className="mpoly-die-dot" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  );
}

let toastId = 0;

export default function MonopolyGame() {
  const socket = getSocket();
  const myId = socket.id;

  const [game, setGame] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState("");
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [bidAmount, setBidAmount] = useState(0);
  const [modal, setModal] = useState(null);
  const [incomingTrade, setIncomingTrade] = useState(null);
  const [tradeTarget, setTradeTarget] = useState("");
  const [tradeOfferProps, setTradeOfferProps] = useState([]);
  const [tradeOfferMoney, setTradeOfferMoney] = useState(0);
  const [tradeRequestProps, setTradeRequestProps] = useState([]);
  const [tradeRequestMoney, setTradeRequestMoney] = useState(0);
  const [cardPopup, setCardPopup] = useState(null);
  const rollTimerRef = useRef(null);

  const addToast = useCallback((text, type = "info") => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-4), { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    function updateState(data) {
      if (data.gameState) setGame(data.gameState);
    }
    function onDice(data) {
      updateState(data);
      setRolling(true);
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = setTimeout(() => setRolling(false), 800);
    }
    function onCard(data) {
      updateState(data);
      setCardPopup({ text: data.card?.text, deckType: data.deckType });
    }
    function onTradeOffer(data) {
      updateState(data);
      if (data.toId === myId) setIncomingTrade(data);
    }
    function onTradeResult(data) {
      updateState(data);
      setIncomingTrade(null);
      setModal(null);
    }
    function onTimerTick({ timeLeft }) {
      setGame(prev => prev ? { ...prev, timeLeft } : prev);
    }
    function onAuctionTick({ timeLeft }) {
      setGame(prev => prev && prev.auctionState ? {
        ...prev, auctionState: { ...prev.auctionState, timeLeft }
      } : prev);
    }
    function onLog({ entry }) {
      const text = typeof entry === "string" ? entry : entry?.text || "";
      if (text) addToast(text);
    }
    function onError({ message }) { setError(message); setTimeout(() => setError(""), 3000); }
    function onStateSync(data) { if (data.gameState) setGame(data.gameState); }

    const stateEvents = [
      "monopoly-game-start", "monopoly-turn-start", "monopoly-move",
      "monopoly-buy-prompt", "monopoly-rent-paid", "monopoly-buy-result",
      "monopoly-auction-start", "monopoly-auction-bid", "monopoly-auction-update",
      "monopoly-auction-end", "monopoly-build-result", "monopoly-mortgage-result",
      "monopoly-jail-update", "monopoly-tax-paid", "monopoly-bankruptcy",
      "monopoly-turn-state", "monopoly-trade-pending",
    ];
    stateEvents.forEach(ev => socket.on(ev, updateState));

    socket.on("monopoly-dice-result", onDice);
    socket.on("monopoly-card-drawn", onCard);
    socket.on("monopoly-trade-offer", onTradeOffer);
    socket.on("monopoly-trade-result", onTradeResult);
    socket.on("monopoly-timer-tick", onTimerTick);
    socket.on("monopoly-auction-tick", onAuctionTick);
    socket.on("monopoly-log", onLog);
    socket.on("monopoly-error", onError);
    socket.on("monopoly-state-sync", onStateSync);

    socket.emit("monopoly-get-state");

    return () => {
      stateEvents.forEach(ev => socket.off(ev, updateState));
      socket.off("monopoly-dice-result", onDice);
      socket.off("monopoly-card-drawn", onCard);
      socket.off("monopoly-trade-offer", onTradeOffer);
      socket.off("monopoly-trade-result", onTradeResult);
      socket.off("monopoly-timer-tick", onTimerTick);
      socket.off("monopoly-auction-tick", onAuctionTick);
      socket.off("monopoly-log", onLog);
      socket.off("monopoly-error", onError);
      socket.off("monopoly-state-sync", onStateSync);
      clearTimeout(rollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cardPopup) return;
    const t = setTimeout(() => setCardPopup(null), 4000);
    return () => clearTimeout(t);
  }, [cardPopup]);

  if (!game) {
    return (
      <div className="mpoly">
        <div className="mpoly-loading">
          <div className="mpoly-loading-title">MONOPOLY</div>
          <div className="mpoly-loading-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const me = game.players[myId];
  const isMyTurn = game.currentPlayerId === myId;
  const currentPlayer = game.players[game.currentPlayerId];
  const pColor = (id) => PLAYER_COLORS[game.playerOrder.indexOf(id)] || "#666";
  const diceTotal = game.lastDice[0] + game.lastDice[1];
  const isDoubles = game.lastDice[0] > 0 && game.lastDice[0] === game.lastDice[1];

  function roll() { socket.emit("monopoly-roll"); }
  function buy() { socket.emit("monopoly-buy"); }
  function declineBuy() { socket.emit("monopoly-decline-buy"); }
  function endTurn() { socket.emit("monopoly-end-turn"); }
  function placeBid() { socket.emit("monopoly-auction-bid", { amount: bidAmount }); setBidAmount(0); }
  function passBid() { socket.emit("monopoly-auction-pass"); }
  function buildHouse(idx) { socket.emit("monopoly-build", { propertyIndex: idx }); }
  function sellHouse(idx) { socket.emit("monopoly-sell-building", { propertyIndex: idx }); }
  function mortgageProp(idx) { socket.emit("monopoly-mortgage", { propertyIndex: idx }); }
  function unmortgageProp(idx) { socket.emit("monopoly-unmortgage", { propertyIndex: idx }); }
  function jailChoice(choice) { socket.emit("monopoly-jail-decision", { choice }); }
  function submitTrade() {
    socket.emit("monopoly-trade-offer", {
      toId: tradeTarget,
      offering: { properties: tradeOfferProps, money: tradeOfferMoney },
      requesting: { properties: tradeRequestProps, money: tradeRequestMoney },
    });
    setModal(null);
    setTradeOfferProps([]); setTradeOfferMoney(0);
    setTradeRequestProps([]); setTradeRequestMoney(0);
  }
  function respondTrade(accept) {
    socket.emit("monopoly-trade-respond", { accept });
    setIncomingTrade(null);
  }

  function getMyBuildable() {
    if (!me) return [];
    const owned = me.properties || [];
    const groups = {};
    owned.forEach(idx => {
      const space = BOARD[idx];
      if (space?.group) {
        if (!groups[space.group]) groups[space.group] = [];
        groups[space.group].push(idx);
      }
    });
    const buildable = [];
    Object.entries(groups).forEach(([group, indices]) => {
      if (indices.length === GROUP_SIZES[group]) {
        indices.forEach(idx => {
          if (!game.mortgagedProps.includes(idx)) buildable.push(idx);
        });
      }
    });
    return buildable;
  }

  function renderCorner(space) {
    const labels = { 0: ["COLLECT", "$200"], 10: ["JUST", "VISITING"], 20: ["FREE", "PARKING"], 30: ["GO TO", "JAIL"] };
    const l = labels[space.i] || [];
    return (
      <>
        <span className="mpoly-corner-icon">{CORNER_ICONS[space.i]}</span>
        <span className="mpoly-corner-label">{l[0]}</span>
        <span className="mpoly-corner-label">{l[1]}</span>
      </>
    );
  }

  function renderSpaceInner(space) {
    if (space.type === "chance" || space.type === "community") {
      return (
        <>
          <span className="mpoly-space-icon">{space.type === "chance" ? "?" : "📦"}</span>
          <span className="mpoly-space-label">{space.type === "chance" ? "Chance" : "Chest"}</span>
        </>
      );
    }
    if (space.type === "tax") {
      return (
        <>
          <span className="mpoly-space-icon">{"💰"}</span>
          <span className="mpoly-space-label">{space.name}</span>
          <span className="mpoly-space-price">${space.amount}</span>
        </>
      );
    }
    if (space.type === "railroad") {
      return (
        <>
          <span className="mpoly-space-icon">{"🚂"}</span>
          <span className="mpoly-space-label">{space.short}</span>
          <span className="mpoly-space-price">${space.price}</span>
        </>
      );
    }
    if (space.type === "utility") {
      return (
        <>
          <span className="mpoly-space-icon">{space.i === 12 ? "⚡" : "💧"}</span>
          <span className="mpoly-space-label">{space.short}</span>
          <span className="mpoly-space-price">${space.price}</span>
        </>
      );
    }
    return (
      <>
        <span className="mpoly-space-label">{space.short}</span>
        <span className="mpoly-space-price">${space.price}</span>
      </>
    );
  }

  function getRentInfo(space) {
    if (!space) return null;
    if (space.type === "property" && space.rent) {
      return (
        <div className="mpoly-propcard-rents">
          <div className="mpoly-rent-row"><span>Rent</span><span>${space.rent[0]}</span></div>
          <div className="mpoly-rent-row"><span>1 House</span><span>${space.rent[1]}</span></div>
          <div className="mpoly-rent-row"><span>2 Houses</span><span>${space.rent[2]}</span></div>
          <div className="mpoly-rent-row"><span>3 Houses</span><span>${space.rent[3]}</span></div>
          <div className="mpoly-rent-row"><span>4 Houses</span><span>${space.rent[4]}</span></div>
          <div className="mpoly-rent-row mpoly-rent-row--hotel"><span>Hotel</span><span>${space.rent[5]}</span></div>
          <div className="mpoly-rent-row mpoly-rent-row--cost"><span>House cost</span><span>${space.houseCost}</span></div>
        </div>
      );
    }
    if (space.type === "railroad") {
      return (
        <div className="mpoly-propcard-rents">
          <div className="mpoly-rent-row"><span>1 owned</span><span>$25</span></div>
          <div className="mpoly-rent-row"><span>2 owned</span><span>$50</span></div>
          <div className="mpoly-rent-row"><span>3 owned</span><span>$100</span></div>
          <div className="mpoly-rent-row"><span>4 owned</span><span>$200</span></div>
        </div>
      );
    }
    if (space.type === "utility") {
      return (
        <div className="mpoly-propcard-rents">
          <div className="mpoly-rent-row"><span>1 owned</span><span>4x dice</span></div>
          <div className="mpoly-rent-row"><span>2 owned</span><span>10x dice</span></div>
        </div>
      );
    }
    return null;
  }

  const buyPromptSpace = game.turnState === "buyPrompt" && currentPlayer ? BOARD[currentPlayer.position] : null;

  return (
    <div className="mpoly">
      {/* Toasts */}
      <div className="mpoly-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`mpoly-toast mpoly-toast--${t.type}`}>{t.text}</div>
        ))}
      </div>

      {/* Error */}
      {error && <div className="mpoly-error-banner">{error}</div>}

      {/* Player Strip */}
      <div className="mpoly-strip">
        {game.playerOrder.map((pid, idx) => {
          const p = game.players[pid];
          if (!p) return null;
          const isTurn = pid === game.currentPlayerId;
          return (
            <div key={pid} className={`mpoly-ps${isTurn ? " mpoly-ps--turn" : ""}${p.isBankrupt ? " mpoly-ps--bankrupt" : ""}${pid === myId ? " mpoly-ps--me" : ""}`}>
              <div className="mpoly-ps-dot" style={{ background: PLAYER_COLORS[idx] }} />
              <div className="mpoly-ps-info">
                <span className="mpoly-ps-name">{p.name}{pid === myId ? " (you)" : ""}</span>
                <span className="mpoly-ps-money">${p.money}</span>
              </div>
              <div className="mpoly-ps-meta">
                {(p.properties?.length || 0) > 0 && <span className="mpoly-ps-props">{p.properties.length}</span>}
                {p.inJail && <span className="mpoly-ps-badge mpoly-ps-badge--jail">JAIL</span>}
                {p.isBankrupt && <span className="mpoly-ps-badge mpoly-ps-badge--out">OUT</span>}
              </div>
              {isTurn && game.timeLeft > 0 && (
                <span className={`mpoly-ps-timer${game.timeLeft <= 10 ? " mpoly-ps-timer--warn" : ""}`}>{game.timeLeft}s</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div className="mpoly-board-wrap">
        <div className="mpoly-board">
          {BOARD.map(space => {
            const pos = getSpacePos(space.i);
            const isCorner = [0, 10, 20, 30].includes(space.i);
            const owner = game.propertyOwners[space.i];
            const houses = game.propertyHouses[space.i] || 0;
            const isMortgaged = game.mortgagedProps.includes(space.i);
            const playersHere = game.playerOrder.filter(pid => {
              const p = game.players[pid];
              return p && !p.isBankrupt && p.position === space.i;
            });

            return (
              <div
                key={space.i}
                className={`mpoly-space mpoly-space--${pos.side}${isCorner ? " mpoly-space--corner" : ""}${isMortgaged ? " mpoly-space--mortgaged" : ""}${selectedSpace === space.i ? " mpoly-space--selected" : ""} mpoly-space--${space.type}`}
                style={{ gridRow: pos.row, gridColumn: pos.col }}
                onClick={() => setSelectedSpace(selectedSpace === space.i ? null : space.i)}
              >
                {space.group && (
                  <div className={`mpoly-color-bar mpoly-cb--${pos.side}`} style={{ background: GROUP_COLORS[space.group] }} />
                )}
                <div className="mpoly-space-content">
                  {isCorner ? renderCorner(space) : renderSpaceInner(space)}
                </div>
                {houses > 0 && (
                  <div className={`mpoly-houses mpoly-houses--${pos.side}`}>
                    {houses >= 5
                      ? <span className="mpoly-hotel">H</span>
                      : Array.from({ length: houses }, (_, j) => <span key={j} className="mpoly-house" />)
                    }
                  </div>
                )}
                {owner && !isCorner && (
                  <div className="mpoly-owner-dot" style={{ background: pColor(owner) }} />
                )}
                {playersHere.length > 0 && (
                  <div className="mpoly-tokens">
                    {playersHere.map(pid => (
                      <div
                        key={pid}
                        className={`mpoly-token${pid === game.currentPlayerId ? " mpoly-token--active" : ""}`}
                        style={{ background: pColor(pid) }}
                        title={game.players[pid]?.name}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Center */}
          <div className="mpoly-center">
            <div className="mpoly-center-top">
              <div className="mpoly-center-title">MONOPOLY</div>
              <div className="mpoly-center-round">Round {game.roundCount}</div>
            </div>

            <div className="mpoly-dice-area">
              <div className="mpoly-dice-wrap">
                <DiceFace value={game.lastDice[0]} rolling={rolling} />
                <DiceFace value={game.lastDice[1]} rolling={rolling} />
              </div>
              {diceTotal > 0 && !rolling && (
                <div className="mpoly-dice-total">
                  {diceTotal}{isDoubles && <span className="mpoly-doubles">DOUBLES</span>}
                </div>
              )}
            </div>

            <div className="mpoly-center-status">
              {isMyTurn
                ? <span className="mpoly-status--yours">Your turn</span>
                : <span className="mpoly-status--other">{currentPlayer?.name}'s turn</span>
              }
            </div>

            {game.settings.freeParking && game.taxPool > 0 && (
              <div className="mpoly-center-pool">Free Parking: ${game.taxPool}</div>
            )}

            <div className="mpoly-center-actions">
              {isMyTurn && game.turnState === "waitingForRoll" && (
                <button className="mpoly-btn mpoly-btn--roll" onClick={roll}>Roll Dice</button>
              )}

              {isMyTurn && game.turnState === "jailDecision" && (
                <div className="mpoly-jail-actions">
                  <div className="mpoly-jail-label">You're in Jail</div>
                  <div className="mpoly-jail-btns">
                    <button className="mpoly-btn mpoly-btn--sm" onClick={() => jailChoice("pay")}>Pay $50</button>
                    {me?.getOutOfJailCards > 0 && (
                      <button className="mpoly-btn mpoly-btn--sm" onClick={() => jailChoice("card")}>Use Card ({me.getOutOfJailCards})</button>
                    )}
                    <button className="mpoly-btn mpoly-btn--sm" onClick={() => jailChoice("roll")}>Roll Doubles</button>
                  </div>
                </div>
              )}

              {isMyTurn && game.turnState === "actionPhase" && (
                <div className="mpoly-action-group">
                  <button className="mpoly-btn mpoly-btn--end" onClick={endTurn}>End Turn</button>
                  <div className="mpoly-quick-btns">
                    <button className="mpoly-btn mpoly-btn--quick" onClick={() => setModal("build")}>Build</button>
                    <button className="mpoly-btn mpoly-btn--quick" onClick={() => setModal("mortgage")}>Mortgage</button>
                    <button className="mpoly-btn mpoly-btn--quick" onClick={() => setModal("trade")}>Trade</button>
                  </div>
                </div>
              )}

              {!isMyTurn && !game.auctionState && (
                <div className="mpoly-waiting">Waiting for {currentPlayer?.name}...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Space detail popover */}
      {selectedSpace !== null && (
        <div className="mpoly-sd" onClick={() => setSelectedSpace(null)}>
          <div className="mpoly-sd-card" onClick={e => e.stopPropagation()}>
            <div className="mpoly-sd-head">
              {BOARD[selectedSpace]?.group && <span className="mpoly-sd-swatch" style={{ background: GROUP_COLORS[BOARD[selectedSpace].group] }} />}
              <span className="mpoly-sd-title">{BOARD[selectedSpace]?.name}</span>
              <button className="mpoly-sd-x" onClick={() => setSelectedSpace(null)}>x</button>
            </div>
            {BOARD[selectedSpace]?.price && <div className="mpoly-sd-line">Price: ${BOARD[selectedSpace].price}</div>}
            {game.propertyOwners[selectedSpace] && (
              <div className="mpoly-sd-line">Owner: <span style={{ color: pColor(game.propertyOwners[selectedSpace]) }}>{game.players[game.propertyOwners[selectedSpace]]?.name}</span></div>
            )}
            {(game.propertyHouses[selectedSpace] || 0) > 0 && (
              <div className="mpoly-sd-line">{game.propertyHouses[selectedSpace] >= 5 ? "Hotel" : `${game.propertyHouses[selectedSpace]} house(s)`}</div>
            )}
            {game.mortgagedProps.includes(selectedSpace) && <div className="mpoly-sd-line mpoly-sd-mort">MORTGAGED</div>}
            {BOARD[selectedSpace]?.rent && getRentInfo(BOARD[selectedSpace])}
          </div>
        </div>
      )}

      {/* Buy Prompt — Property Card */}
      {isMyTurn && game.turnState === "buyPrompt" && buyPromptSpace && (
        <div className="mpoly-overlay">
          <div className="mpoly-propcard">
            <div className="mpoly-propcard-banner" style={{ background: buyPromptSpace.group ? GROUP_COLORS[buyPromptSpace.group] : "#445" }}>
              <div className="mpoly-propcard-name">{buyPromptSpace.name}</div>
            </div>
            <div className="mpoly-propcard-body">
              <div className="mpoly-propcard-price">${buyPromptSpace.price}</div>
              {getRentInfo(buyPromptSpace)}
              <div className="mpoly-propcard-btns">
                <button className="mpoly-btn mpoly-btn--buy" onClick={buy}>Buy</button>
                <button className="mpoly-btn mpoly-btn--auction" onClick={declineBuy}>Auction</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auction */}
      {game.auctionState && (
        <div className="mpoly-overlay">
          <div className="mpoly-modal">
            <div className="mpoly-modal-head">
              <span>Auction: {BOARD[game.auctionState.propertyIndex]?.name}</span>
              {game.auctionState.timeLeft > 0 && <span className="mpoly-auction-time">{game.auctionState.timeLeft}s</span>}
            </div>
            <div className="mpoly-auction-info">
              {game.auctionState.currentBid > 0
                ? <>High bid: <strong>${game.auctionState.currentBid}</strong> by {game.players[game.auctionState.currentBidder]?.name}</>
                : "No bids yet"
              }
            </div>
            {me && !me.isBankrupt && !game.auctionState.passedPlayers?.includes(myId) && (
              <div className="mpoly-auction-ctrls">
                <input
                  type="number"
                  className="mpoly-input"
                  value={bidAmount || ""}
                  onChange={e => setBidAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder={`Min $${(game.auctionState.currentBid || 0) + 1}`}
                />
                <button className="mpoly-btn mpoly-btn--buy" onClick={placeBid}>Bid</button>
                <button className="mpoly-btn mpoly-btn--decline" onClick={passBid}>Pass</button>
              </div>
            )}
            {game.auctionState.passedPlayers?.includes(myId) && (
              <div className="mpoly-auction-passed">You passed</div>
            )}
          </div>
        </div>
      )}

      {/* Card Popup */}
      {cardPopup && (
        <div className="mpoly-overlay" onClick={() => setCardPopup(null)}>
          <div className={`mpoly-card-popup mpoly-card-popup--${cardPopup.deckType}`} onClick={e => e.stopPropagation()}>
            <div className="mpoly-card-head">{cardPopup.deckType === "chance" ? "CHANCE" : "COMMUNITY CHEST"}</div>
            <div className="mpoly-card-body">{cardPopup.text}</div>
          </div>
        </div>
      )}

      {/* Incoming Trade */}
      {incomingTrade && (
        <div className="mpoly-overlay">
          <div className="mpoly-modal">
            <div className="mpoly-modal-head">Trade from {game.players[incomingTrade.fromId]?.name}</div>
            <div className="mpoly-trade-cols">
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">They offer</div>
                {incomingTrade.offering.properties.map(idx => (
                  <div key={idx} className="mpoly-trade-item">{BOARD[idx]?.name}</div>
                ))}
                {incomingTrade.offering.money > 0 && <div className="mpoly-trade-item green">${incomingTrade.offering.money}</div>}
                {incomingTrade.offering.properties.length === 0 && !incomingTrade.offering.money && <div className="mpoly-trade-item dim">Nothing</div>}
              </div>
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">They want</div>
                {incomingTrade.requesting.properties.map(idx => (
                  <div key={idx} className="mpoly-trade-item">{BOARD[idx]?.name}</div>
                ))}
                {incomingTrade.requesting.money > 0 && <div className="mpoly-trade-item green">${incomingTrade.requesting.money}</div>}
                {incomingTrade.requesting.properties.length === 0 && !incomingTrade.requesting.money && <div className="mpoly-trade-item dim">Nothing</div>}
              </div>
            </div>
            <div className="mpoly-modal-btns">
              <button className="mpoly-btn mpoly-btn--buy" onClick={() => respondTrade(true)}>Accept</button>
              <button className="mpoly-btn mpoly-btn--decline" onClick={() => respondTrade(false)}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Build Modal */}
      {modal === "build" && (
        <div className="mpoly-overlay" onClick={() => setModal(null)}>
          <div className="mpoly-modal" onClick={e => e.stopPropagation()}>
            <div className="mpoly-modal-head">
              <span>Build Houses</span>
              <button className="mpoly-modal-x" onClick={() => setModal(null)}>x</button>
            </div>
            {getMyBuildable().length === 0 ? (
              <div className="mpoly-modal-empty">No complete color sets to build on</div>
            ) : (
              <div className="mpoly-list">
                {getMyBuildable().map(idx => {
                  const sp = BOARD[idx];
                  const h = game.propertyHouses[idx] || 0;
                  return (
                    <div key={idx} className="mpoly-list-row">
                      <span className="mpoly-list-color" style={{ background: GROUP_COLORS[sp.group] }} />
                      <span className="mpoly-list-name">{sp.short}</span>
                      <span className="mpoly-list-detail">{h >= 5 ? "Hotel" : h > 0 ? `${h}h` : "-"}</span>
                      <span className="mpoly-list-cost">${sp.houseCost}</span>
                      <button className="mpoly-btn mpoly-btn--icon" onClick={() => sellHouse(idx)} disabled={h === 0}>-</button>
                      <button className="mpoly-btn mpoly-btn--icon" onClick={() => buildHouse(idx)} disabled={h >= 5}>+</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mortgage Modal */}
      {modal === "mortgage" && (
        <div className="mpoly-overlay" onClick={() => setModal(null)}>
          <div className="mpoly-modal" onClick={e => e.stopPropagation()}>
            <div className="mpoly-modal-head">
              <span>Mortgage Properties</span>
              <button className="mpoly-modal-x" onClick={() => setModal(null)}>x</button>
            </div>
            {(!me?.properties || me.properties.length === 0) ? (
              <div className="mpoly-modal-empty">No properties owned</div>
            ) : (
              <div className="mpoly-list">
                {me.properties.map(idx => {
                  const sp = BOARD[idx];
                  const mortgaged = game.mortgagedProps.includes(idx);
                  return (
                    <div key={idx} className="mpoly-list-row">
                      {sp.group ? <span className="mpoly-list-color" style={{ background: GROUP_COLORS[sp.group] }} /> : <span className="mpoly-list-color" style={{ background: "#445" }} />}
                      <span className="mpoly-list-name">{sp.short || sp.name}</span>
                      <span className="mpoly-list-detail">{mortgaged ? "Mortgaged" : `$${Math.floor(sp.price / 2)}`}</span>
                      {mortgaged
                        ? <button className="mpoly-btn mpoly-btn--sm" onClick={() => unmortgageProp(idx)}>Unmortgage</button>
                        : <button className="mpoly-btn mpoly-btn--decline-sm" onClick={() => mortgageProp(idx)}>Mortgage</button>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Modal */}
      {modal === "trade" && (
        <div className="mpoly-overlay" onClick={() => setModal(null)}>
          <div className="mpoly-modal mpoly-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="mpoly-modal-head">
              <span>Propose Trade</span>
              <button className="mpoly-modal-x" onClick={() => setModal(null)}>x</button>
            </div>
            <div className="mpoly-trade-field">
              <label>Trade with</label>
              <select value={tradeTarget} onChange={e => setTradeTarget(e.target.value)}>
                <option value="">Select player...</option>
                {game.playerOrder.filter(pid => pid !== myId && !game.players[pid]?.isBankrupt).map(pid => (
                  <option key={pid} value={pid}>{game.players[pid]?.name}</option>
                ))}
              </select>
            </div>
            <div className="mpoly-trade-cols">
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">You offer</div>
                {me?.properties?.map(idx => (
                  <label key={idx} className="mpoly-trade-check">
                    <input type="checkbox" checked={tradeOfferProps.includes(idx)} onChange={e => {
                      setTradeOfferProps(e.target.checked ? [...tradeOfferProps, idx] : tradeOfferProps.filter(x => x !== idx));
                    }} />
                    {BOARD[idx]?.short || BOARD[idx]?.name}
                  </label>
                ))}
                <input type="number" className="mpoly-input mpoly-input--full" placeholder="$0" value={tradeOfferMoney || ""} onChange={e => setTradeOfferMoney(Math.max(0, parseInt(e.target.value) || 0))} />
              </div>
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">You want</div>
                {tradeTarget && game.players[tradeTarget]?.properties?.map(idx => (
                  <label key={idx} className="mpoly-trade-check">
                    <input type="checkbox" checked={tradeRequestProps.includes(idx)} onChange={e => {
                      setTradeRequestProps(e.target.checked ? [...tradeRequestProps, idx] : tradeRequestProps.filter(x => x !== idx));
                    }} />
                    {BOARD[idx]?.short || BOARD[idx]?.name}
                  </label>
                ))}
                <input type="number" className="mpoly-input mpoly-input--full" placeholder="$0" value={tradeRequestMoney || ""} onChange={e => setTradeRequestMoney(Math.max(0, parseInt(e.target.value) || 0))} />
              </div>
            </div>
            <div className="mpoly-modal-btns">
              <button className="mpoly-btn mpoly-btn--buy" onClick={submitTrade} disabled={!tradeTarget}>Send Offer</button>
              <button className="mpoly-btn mpoly-btn--decline" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
