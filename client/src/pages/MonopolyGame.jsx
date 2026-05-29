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
const GROUP_NAMES = {
  brown: "Brown", lightblue: "Light Blue", pink: "Pink", orange: "Orange",
  red: "Red", yellow: "Yellow", green: "Green", darkblue: "Dark Blue", other: "Railroads & Utilities",
};

const PLAYER_AVATARS = ["🚗", "🎩", "🐕", "👢", "🚢", "⭐"];

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

function AnimatedMoney({ value }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === value) return;
    const diff = value - prev;
    const duration = 600;
    const start = performance.now();
    cancelAnimationFrame(frameRef.current);
    function animate(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(prev + diff * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    }
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return display;
}

let toastId = 0;

export default function MonopolyGame() {
  const socket = getSocket();
  const myId = socket.id;

  const [game, setGame] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [rollAnnounce, setRollAnnounce] = useState(null);
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
  const [tokenPositions, setTokenPositions] = useState({});
  const [landedSpace, setLandedSpace] = useState(null);
  const [hoverRentSpace, setHoverRentSpace] = useState(null);
  const rollTimerRef = useRef(null);
  const announceTimerRef = useRef(null);
  const pendingCardRef = useRef(null);
  const landedTimerRef = useRef(null);
  const tokenAnimRef = useRef({});
  const gameRef = useRef(null);
  gameRef.current = game;

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
      clearTimeout(announceTimerRef.current);

      const total = (data.gameState?.lastDice?.[0] || 0) + (data.gameState?.lastDice?.[1] || 0);
      const doubles = data.gameState?.lastDice?.[0] > 0 && data.gameState?.lastDice?.[0] === data.gameState?.lastDice?.[1];
      const rollerId = data.gameState?.currentPlayerId;
      const rollerName = data.gameState?.players?.[rollerId]?.name || "Someone";
      const isMe = rollerId === myId;

      rollTimerRef.current = setTimeout(() => {
        setRolling(false);
        setRollAnnounce({ total, name: rollerName, isMe, doubles });
        announceTimerRef.current = setTimeout(() => {
          setRollAnnounce(null);
          // Flush any card popup that arrived during the announcement
          if (pendingCardRef.current) {
            setCardPopup(pendingCardRef.current);
            pendingCardRef.current = null;
          }
        }, 2000);
      }, 800);
    }
    function onCard(data) {
      updateState(data);
      const card = { text: data.card?.text, deckType: data.deckType };
      // Queue card behind roll announcement
      if (rollTimerRef.current || announceTimerRef.current) {
        pendingCardRef.current = card;
      } else {
        setCardPopup(card);
      }
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

    function onMove(data) {
      if (data.gameState) setGame(data.gameState);
      const { playerId, from, to } = data;
      if (from !== undefined && to !== undefined && from !== to) {
        const path = [];
        let pos = from;
        while (pos !== to) { pos = (pos + 1) % 40; path.push(pos); }
        if (tokenAnimRef.current[playerId]) clearInterval(tokenAnimRef.current[playerId]);
        setTokenPositions(prev => ({ ...prev, [playerId]: from }));
        let step = 0;
        tokenAnimRef.current[playerId] = setInterval(() => {
          if (step >= path.length) {
            clearInterval(tokenAnimRef.current[playerId]);
            delete tokenAnimRef.current[playerId];
            setTokenPositions(prev => { const n = { ...prev }; delete n[playerId]; return n; });
            setLandedSpace(to);
            clearTimeout(landedTimerRef.current);
            landedTimerRef.current = setTimeout(() => setLandedSpace(null), 3000);
            return;
          }
          setTokenPositions(prev => ({ ...prev, [playerId]: path[step] }));
          step++;
        }, 100);
      }
    }

    const stateEvents = [
      "monopoly-game-start", "monopoly-turn-start",
      "monopoly-buy-prompt", "monopoly-rent-paid", "monopoly-buy-result",
      "monopoly-auction-start", "monopoly-auction-bid", "monopoly-auction-update",
      "monopoly-auction-end", "monopoly-build-result", "monopoly-mortgage-result",
      "monopoly-jail-update", "monopoly-tax-paid", "monopoly-bankruptcy",
      "monopoly-turn-state", "monopoly-trade-pending", "monopoly-debt",
    ];
    stateEvents.forEach(ev => socket.on(ev, updateState));

    socket.on("monopoly-dice-result", onDice);
    socket.on("monopoly-move", onMove);
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
      socket.off("monopoly-move", onMove);
      socket.off("monopoly-card-drawn", onCard);
      socket.off("monopoly-trade-offer", onTradeOffer);
      socket.off("monopoly-trade-result", onTradeResult);
      socket.off("monopoly-timer-tick", onTimerTick);
      socket.off("monopoly-auction-tick", onAuctionTick);
      socket.off("monopoly-log", onLog);
      socket.off("monopoly-error", onError);
      socket.off("monopoly-state-sync", onStateSync);
      clearTimeout(rollTimerRef.current);
      clearTimeout(announceTimerRef.current);
      clearTimeout(landedTimerRef.current);
      Object.values(tokenAnimRef.current).forEach(clearInterval);
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
          <div className="mpoly-skeleton">
            <div className="mpoly-skel-strip">
              {[0,1,2,3].map(i => <div key={i} className="mpoly-skel-player" />)}
            </div>
            <div className="mpoly-skel-board">
              <div className="mpoly-skel-center">
                <div className="mpoly-skel-dice-row"><div className="mpoly-skel-die" /><div className="mpoly-skel-die" /></div>
                <div className="mpoly-skel-text" />
                <div className="mpoly-skel-btn" />
              </div>
            </div>
          </div>
          <div className="mpoly-loading-sub">Connecting to game...</div>
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

  function toggleTradeOfferProp(idx) {
    if (tradeOfferProps.includes(idx)) {
      setTradeOfferProps(tradeOfferProps.filter(x => x !== idx));
    } else if (tradeOfferProps.length < 3) {
      setTradeOfferProps([...tradeOfferProps, idx]);
    }
  }
  function toggleTradeRequestProp(idx) {
    if (tradeRequestProps.includes(idx)) {
      setTradeRequestProps(tradeRequestProps.filter(x => x !== idx));
    } else if (tradeRequestProps.length < 3) {
      setTradeRequestProps([...tradeRequestProps, idx]);
    }
  }

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

  // Group my properties by color for the "My Properties" panel
  function getMyPropsGrouped() {
    if (!me?.properties) return [];
    const groups = {};
    const ungrouped = [];
    me.properties.forEach(idx => {
      const sp = BOARD[idx];
      if (sp?.group) {
        if (!groups[sp.group]) groups[sp.group] = [];
        groups[sp.group].push(idx);
      } else {
        ungrouped.push(idx);
      }
    });
    const result = [];
    Object.entries(groups).forEach(([group, indices]) => {
      result.push({
        group,
        color: GROUP_COLORS[group],
        total: GROUP_SIZES[group],
        owned: indices.length,
        complete: indices.length === GROUP_SIZES[group],
        props: indices.map(idx => ({
          idx,
          name: BOARD[idx]?.short || BOARD[idx]?.name,
          houses: game.propertyHouses[idx] || 0,
          mortgaged: game.mortgagedProps.includes(idx),
        })),
      });
    });
    if (ungrouped.length > 0) {
      result.push({
        group: "other",
        color: "#667",
        total: 0,
        owned: ungrouped.length,
        complete: false,
        props: ungrouped.map(idx => ({
          idx,
          name: BOARD[idx]?.short || BOARD[idx]?.name,
          houses: 0,
          mortgaged: game.mortgagedProps.includes(idx),
        })),
      });
    }
    return result;
  }

  function netWorth(p) {
    if (!p) return 0;
    let nw = p.money || 0;
    (p.properties || []).forEach(idx => {
      const sp = BOARD[idx];
      if (sp?.price) nw += sp.price;
      nw += (game.propertyHouses[idx] || 0) * (sp?.houseCost || 0);
    });
    return nw;
  }

  function getCurrentRent(spaceIdx) {
    const space = BOARD[spaceIdx];
    if (!space) return null;
    const owner = game.propertyOwners[spaceIdx];
    if (!owner) return null;
    if (game.mortgagedProps.includes(spaceIdx)) return { rent: 0, mortgaged: true };
    if (space.type === "property" && space.rent) {
      const houses = game.propertyHouses[spaceIdx] || 0;
      if (houses > 0) return { rent: space.rent[houses], houses };
      const groupProps = BOARD.filter(s => s.group === space.group).map(s => s.i);
      const ownsAll = groupProps.every(i => game.propertyOwners[i] === owner);
      return { rent: ownsAll ? space.rent[0] * 2 : space.rent[0], monopoly: ownsAll, houses: 0 };
    }
    if (space.type === "railroad") {
      const owned = [5,15,25,35].filter(i => game.propertyOwners[i] === owner && !game.mortgagedProps.includes(i)).length;
      return { rent: [25,50,100,200][owned - 1] || 25 };
    }
    if (space.type === "utility") {
      const owned = [12,28].filter(i => game.propertyOwners[i] === owner && !game.mortgagedProps.includes(i)).length;
      return { rent: owned === 2 ? "10× dice" : "4× dice", isUtility: true };
    }
    return null;
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
  const canAfford = buyPromptSpace && me ? me.money >= buyPromptSpace.price : false;
  const showBuyCard = isMyTurn && game.turnState === "buyPrompt" && buyPromptSpace && !rollAnnounce && !rolling;
  const myPropGroups = getMyPropsGrouped();
  const myPropCount = me?.properties?.length || 0;

  // Auction quick bid helpers
  const auctionMin = (game.auctionState?.currentBid || 0) + 1;

  return (
    <div className="mpoly">
      {/* Mobile blocker */}
      <div className="mpoly-mobile-block">
        <div className="mpoly-mobile-block-inner">
          <span className="mpoly-mobile-block-icon">🖥️</span>
          <h2 className="mpoly-mobile-block-title">Screen Too Small</h2>
          <p className="mpoly-mobile-block-text">Monopoly requires a tablet or larger screen to play. Please switch to a bigger device.</p>
        </div>
      </div>

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
          const nw = netWorth(p);
          // collect color swatches for owned property groups
          const ownedGroups = [];
          (p.properties || []).forEach(propIdx => {
            const sp = BOARD[propIdx];
            if (sp?.group && !ownedGroups.includes(sp.group)) ownedGroups.push(sp.group);
          });
          return (
            <div key={pid} className={`mpoly-ps${isTurn ? " mpoly-ps--turn" : ""}${p.isBankrupt ? " mpoly-ps--bankrupt" : ""}${pid === myId ? " mpoly-ps--me" : ""}`}>
              <span className="mpoly-ps-avatar" style={{ borderColor: PLAYER_COLORS[idx] }}>{PLAYER_AVATARS[idx] || "🎲"}</span>
              <div className="mpoly-ps-info">
                <span className="mpoly-ps-name">{p.name}{pid === myId ? " (you)" : ""}</span>
                <span className="mpoly-ps-money">$<AnimatedMoney value={p.money} /></span>
                <span className="mpoly-ps-nw">NW $<AnimatedMoney value={nw} /></span>
              </div>
              <div className="mpoly-ps-meta">
                {ownedGroups.length > 0 && (
                  <div className="mpoly-ps-groups">
                    {ownedGroups.map(g => (
                      <span key={g} className="mpoly-ps-gswatch" style={{ background: GROUP_COLORS[g] }} />
                    ))}
                  </div>
                )}
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
            const isMyProp = owner === myId;
            const playersHere = game.playerOrder.filter(pid => {
              const p = game.players[pid];
              if (!p || p.isBankrupt) return false;
              const displayPos = tokenPositions[pid] !== undefined ? tokenPositions[pid] : p.position;
              return displayPos === space.i;
            });

            return (
              <div
                key={space.i}
                className={`mpoly-space mpoly-space--${pos.side}${isCorner ? " mpoly-space--corner" : ""}${isMortgaged ? " mpoly-space--mortgaged" : ""}${selectedSpace === space.i ? " mpoly-space--selected" : ""}${isMyProp ? " mpoly-space--mine" : ""}${landedSpace === space.i ? " mpoly-space--landed" : ""} mpoly-space--${space.type}`}
                style={{ gridRow: pos.row, gridColumn: pos.col }}
                onClick={() => setSelectedSpace(selectedSpace === space.i ? null : space.i)}
                onMouseEnter={() => { if (owner && !isCorner) setHoverRentSpace(space.i); }}
                onMouseLeave={() => setHoverRentSpace(null)}
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
                {hoverRentSpace === space.i && owner && (() => {
                  const ri = getCurrentRent(space.i);
                  if (!ri) return null;
                  return (
                    <div className="mpoly-rent-tip">
                      {ri.mortgaged ? "Mortgaged" : ri.isUtility ? ri.rent : `$${ri.rent}`}
                      {ri.monopoly && !ri.houses && <span className="mpoly-rent-tip-x2"> 2×</span>}
                    </div>
                  );
                })()}
                {playersHere.length > 0 && (
                  <div className="mpoly-tokens">
                    {playersHere.map(pid => (
                      <div
                        key={pid}
                        className={`mpoly-token${pid === game.currentPlayerId ? " mpoly-token--active" : ""}${tokenPositions[pid] !== undefined ? " mpoly-token--moving" : ""}`}
                        title={game.players[pid]?.name}
                      >
                        {PLAYER_AVATARS[game.playerOrder.indexOf(pid)] || "🎲"}
                      </div>
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

            {/* Roll announcement replaces status temporarily */}
            {rollAnnounce ? (
              <div className="mpoly-roll-announce" key={rollAnnounce.total + rollAnnounce.name}>
                <span className="mpoly-ra-text">
                  {rollAnnounce.isMe ? "You" : rollAnnounce.name} rolled a <strong>{rollAnnounce.total}</strong>
                </span>
                {rollAnnounce.doubles && <span className="mpoly-ra-doubles">Doubles!</span>}
              </div>
            ) : (
              <div className="mpoly-center-status">
                {isMyTurn
                  ? <span className="mpoly-status--yours">Your turn</span>
                  : <span className="mpoly-status--other">{currentPlayer?.name}'s turn</span>
                }
              </div>
            )}

            {game.settings.freeParking && game.taxPool > 0 && (
              <div className="mpoly-center-pool">Free Parking: ${game.taxPool}</div>
            )}

            <div className="mpoly-center-actions">
              {isMyTurn && game.turnState === "waitingForRoll" && !rolling && !rollAnnounce && (
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

              {!isMyTurn && !game.auctionState && !rolling && !rollAnnounce && (
                <div className="mpoly-waiting">Waiting for {currentPlayer?.name}...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* My Properties floating button */}
      {myPropCount > 0 && (
        <button className="mpoly-myprops-fab" onClick={() => setModal(modal === "myprops" ? null : "myprops")}>
          <span className="mpoly-fab-icon">🏠</span>
          <span className="mpoly-fab-label">My Properties</span>
          <span className="mpoly-fab-count">{myPropCount}</span>
        </button>
      )}

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

      {/* Buy Prompt — Property Card (delayed after roll) */}
      {showBuyCard && (
        <div className="mpoly-overlay">
          <div className="mpoly-propcard">
            <div className="mpoly-propcard-banner" style={{ background: buyPromptSpace.group ? GROUP_COLORS[buyPromptSpace.group] : "#445" }}>
              <div className="mpoly-propcard-name">{buyPromptSpace.name}</div>
            </div>
            <div className="mpoly-propcard-body">
              <div className="mpoly-propcard-price">${buyPromptSpace.price}</div>
              {!canAfford && <div className="mpoly-propcard-warn">You can't afford this</div>}
              {canAfford && <div className="mpoly-propcard-ok">Balance after: ${me.money - buyPromptSpace.price}</div>}
              {getRentInfo(buyPromptSpace)}
              <div className="mpoly-propcard-btns">
                <button className="mpoly-btn mpoly-btn--buy" onClick={buy} disabled={!canAfford}>Buy</button>
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
                <div className="mpoly-auction-quick">
                  <button className="mpoly-btn mpoly-btn--bid-quick" onClick={() => { setBidAmount(auctionMin); socket.emit("monopoly-auction-bid", { amount: auctionMin }); }}>
                    ${auctionMin}
                  </button>
                  <button className="mpoly-btn mpoly-btn--bid-quick" onClick={() => { const a = auctionMin + 9; setBidAmount(a); socket.emit("monopoly-auction-bid", { amount: a }); }} disabled={auctionMin + 9 > (me?.money || 0)}>
                    +$10
                  </button>
                  <button className="mpoly-btn mpoly-btn--bid-quick" onClick={() => { const a = auctionMin + 49; setBidAmount(a); socket.emit("monopoly-auction-bid", { amount: a }); }} disabled={auctionMin + 49 > (me?.money || 0)}>
                    +$50
                  </button>
                  <button className="mpoly-btn mpoly-btn--bid-quick" onClick={() => { const a = auctionMin + 99; setBidAmount(a); socket.emit("monopoly-auction-bid", { amount: a }); }} disabled={auctionMin + 99 > (me?.money || 0)}>
                    +$100
                  </button>
                </div>
                <div className="mpoly-auction-custom">
                  <input
                    type="number"
                    className="mpoly-input"
                    value={bidAmount || ""}
                    onChange={e => setBidAmount(Math.max(0, Math.min(me?.money || 0, parseInt(e.target.value) || 0)))}
                    placeholder={`$${auctionMin}`}
                  />
                  <button className="mpoly-btn mpoly-btn--buy" onClick={placeBid} disabled={bidAmount < auctionMin}>Bid</button>
                  <button className="mpoly-btn mpoly-btn--decline" onClick={passBid}>Pass</button>
                </div>
                <div className="mpoly-auction-bal">Your balance: ${me?.money || 0}</div>
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

      {/* Debt Resolution */}
      {game.debtInfo && game.debtInfo.playerId === myId && game.turnState === "inDebt" && (
        <div className="mpoly-overlay">
          <div className="mpoly-modal">
            <div className="mpoly-modal-head mpoly-debt-head">
              <span>You Owe ${game.debtInfo.amount}</span>
            </div>
            <div className="mpoly-debt-info">
              <div className="mpoly-debt-bal">Current balance: <strong>${me?.money || 0}</strong></div>
              <p className="mpoly-debt-msg">Sell buildings or mortgage properties to raise funds. If you can't cover the debt, you'll go bankrupt.</p>
            </div>
            <div className="mpoly-debt-actions">
              {me?.properties?.filter(idx => (game.propertyHouses[idx] || 0) > 0).length > 0 && (
                <div className="mpoly-debt-section">
                  <div className="mpoly-debt-section-title">Sell Buildings</div>
                  {me.properties.filter(idx => (game.propertyHouses[idx] || 0) > 0).map(idx => {
                    const sp = BOARD[idx];
                    const h = game.propertyHouses[idx] || 0;
                    return (
                      <div key={idx} className="mpoly-list-row">
                        <span className="mpoly-list-color" style={{ background: GROUP_COLORS[sp.group] }} />
                        <span className="mpoly-list-name">{sp.short}</span>
                        <span className="mpoly-list-detail">{h >= 5 ? "Hotel" : `${h}h`}</span>
                        <span className="mpoly-list-cost">+${Math.floor(sp.houseCost / 2)}</span>
                        <button className="mpoly-btn mpoly-btn--sm" onClick={() => sellHouse(idx)}>Sell</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {me?.properties?.filter(idx => !game.mortgagedProps.includes(idx) && (game.propertyHouses[idx] || 0) === 0).length > 0 && (
                <div className="mpoly-debt-section">
                  <div className="mpoly-debt-section-title">Mortgage Properties</div>
                  {me.properties.filter(idx => !game.mortgagedProps.includes(idx) && (game.propertyHouses[idx] || 0) === 0).map(idx => {
                    const sp = BOARD[idx];
                    return (
                      <div key={idx} className="mpoly-list-row">
                        {sp.group ? <span className="mpoly-list-color" style={{ background: GROUP_COLORS[sp.group] }} /> : <span className="mpoly-list-color" style={{ background: "#445" }} />}
                        <span className="mpoly-list-name">{sp.short || sp.name}</span>
                        <span className="mpoly-list-cost">+${Math.floor(sp.price / 2)}</span>
                        <button className="mpoly-btn mpoly-btn--sm" onClick={() => mortgageProp(idx)}>Mortgage</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mpoly-modal-btns">
              <button className="mpoly-btn mpoly-btn--decline" onClick={() => socket.emit("monopoly-debt-give-up")}>Declare Bankruptcy</button>
            </div>
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
                  <div key={idx} className="mpoly-trade-item">
                    {BOARD[idx]?.group && <span className="mpoly-trade-swatch" style={{ background: GROUP_COLORS[BOARD[idx].group] }} />}
                    {BOARD[idx]?.name}
                  </div>
                ))}
                {incomingTrade.offering.money > 0 && <div className="mpoly-trade-item green">${incomingTrade.offering.money}</div>}
                {incomingTrade.offering.properties.length === 0 && !incomingTrade.offering.money && <div className="mpoly-trade-item dim">Nothing</div>}
              </div>
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">They want</div>
                {incomingTrade.requesting.properties.map(idx => (
                  <div key={idx} className="mpoly-trade-item">
                    {BOARD[idx]?.group && <span className="mpoly-trade-swatch" style={{ background: GROUP_COLORS[BOARD[idx].group] }} />}
                    {BOARD[idx]?.name}
                  </div>
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

      {/* My Properties Modal */}
      {modal === "myprops" && (
        <div className="mpoly-overlay" onClick={() => setModal(null)}>
          <div className="mpoly-modal" onClick={e => e.stopPropagation()}>
            <div className="mpoly-modal-head">
              <span>My Properties ({myPropCount})</span>
              <button className="mpoly-modal-x" onClick={() => setModal(null)}>x</button>
            </div>
            {myPropGroups.length === 0 ? (
              <div className="mpoly-modal-empty">No properties owned yet</div>
            ) : (
              <div className="mpoly-myprops-list">
                {myPropGroups.map(g => (
                  <div key={g.group} className="mpoly-myprops-group">
                    <div className="mpoly-myprops-ghdr">
                      <span className="mpoly-myprops-gswatch" style={{ background: g.color }} />
                      <span className="mpoly-myprops-glabel">
                        {GROUP_NAMES[g.group] || g.group}
                      </span>
                      {g.total > 0 && (
                        <span className={`mpoly-myprops-gcount${g.complete ? " complete" : ""}`}>
                          {g.owned}/{g.total}
                        </span>
                      )}
                      {g.complete && <span className="mpoly-myprops-mono">MONOPOLY</span>}
                    </div>
                    <div className="mpoly-myprops-cards">
                      {g.props.map(p => (
                        <div key={p.idx} className={`mpoly-myprops-card${p.mortgaged ? " mpoly-myprops-card--mort" : ""}`}>
                          <div className="mpoly-myprops-card-bar" style={{ background: g.color }} />
                          <div className="mpoly-myprops-card-body">
                            <span className="mpoly-myprops-card-name">{p.name}</span>
                            {p.houses > 0 && (
                              <span className="mpoly-myprops-card-houses">
                                {p.houses >= 5 ? "🏨" : "🏠".repeat(p.houses)}
                              </span>
                            )}
                            {p.mortgaged && <span className="mpoly-myprops-card-mort">MORTGAGED</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            {game.housesAvailable !== undefined && (
              <div className="mpoly-build-pool">
                <span>🏠 {game.housesAvailable} houses</span>
                <span>🏨 {game.hotelsAvailable} hotels</span>
              </div>
            )}
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
                        ? <button className="mpoly-btn mpoly-btn--sm" onClick={() => unmortgageProp(idx)}>Unmortgage (${Math.ceil(Math.floor(sp.price / 2) * 1.1)})</button>
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
              <select value={tradeTarget} onChange={e => { setTradeTarget(e.target.value); setTradeRequestProps([]); setTradeRequestMoney(0); }}>
                <option value="">Select player...</option>
                {game.playerOrder.filter(pid => pid !== myId && !game.players[pid]?.isBankrupt).map(pid => (
                  <option key={pid} value={pid}>{game.players[pid]?.name}</option>
                ))}
              </select>
            </div>
            <div className="mpoly-trade-cols">
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">You offer {tradeOfferProps.length > 0 && <span className="mpoly-trade-sel">{tradeOfferProps.length}/3</span>}</div>
                <div className="mpoly-trade-section-label">Properties</div>
                {me?.properties?.length > 0 ? me.properties.map(idx => {
                  const checked = tradeOfferProps.includes(idx);
                  const disabled = !checked && tradeOfferProps.length >= 3;
                  return (
                    <label key={idx} className={`mpoly-trade-check${disabled ? " disabled" : ""}`}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleTradeOfferProp(idx)} />
                      {BOARD[idx]?.group && <span className="mpoly-trade-swatch" style={{ background: GROUP_COLORS[BOARD[idx].group] }} />}
                      {BOARD[idx]?.short || BOARD[idx]?.name}
                    </label>
                  );
                }) : <div className="mpoly-trade-item dim">No properties</div>}
                <div className="mpoly-trade-section-label">Money <span className="mpoly-trade-bal">(max ${me?.money || 0})</span></div>
                <input
                  type="number"
                  className="mpoly-input mpoly-input--full"
                  placeholder="$0"
                  value={tradeOfferMoney || ""}
                  min={0}
                  max={me?.money || 0}
                  onChange={e => setTradeOfferMoney(Math.max(0, Math.min(me?.money || 0, parseInt(e.target.value) || 0)))}
                />
              </div>
              <div className="mpoly-trade-col">
                <div className="mpoly-trade-label">You want {tradeRequestProps.length > 0 && <span className="mpoly-trade-sel">{tradeRequestProps.length}/3</span>}</div>
                <div className="mpoly-trade-section-label">Properties</div>
                {tradeTarget && game.players[tradeTarget]?.properties?.length > 0 ? game.players[tradeTarget].properties.map(idx => {
                  const checked = tradeRequestProps.includes(idx);
                  const disabled = !checked && tradeRequestProps.length >= 3;
                  return (
                    <label key={idx} className={`mpoly-trade-check${disabled ? " disabled" : ""}`}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleTradeRequestProp(idx)} />
                      {BOARD[idx]?.group && <span className="mpoly-trade-swatch" style={{ background: GROUP_COLORS[BOARD[idx].group] }} />}
                      {BOARD[idx]?.short || BOARD[idx]?.name}
                    </label>
                  );
                }) : <div className="mpoly-trade-item dim">{tradeTarget ? "No properties" : "Select a player"}</div>}
                <div className="mpoly-trade-section-label">Money {tradeTarget && <span className="mpoly-trade-bal">(max ${game.players[tradeTarget]?.money || 0})</span>}</div>
                <input
                  type="number"
                  className="mpoly-input mpoly-input--full"
                  placeholder="$0"
                  value={tradeRequestMoney || ""}
                  min={0}
                  max={tradeTarget ? (game.players[tradeTarget]?.money || 0) : 0}
                  onChange={e => setTradeRequestMoney(Math.max(0, Math.min(tradeTarget ? (game.players[tradeTarget]?.money || 0) : 0, parseInt(e.target.value) || 0)))}
                />
              </div>
            </div>
            <div className="mpoly-modal-btns">
              <button className="mpoly-btn mpoly-btn--buy" onClick={submitTrade} disabled={!tradeTarget || (tradeOfferProps.length === 0 && !tradeOfferMoney && tradeRequestProps.length === 0 && !tradeRequestMoney)}>Send Offer</button>
              <button className="mpoly-btn mpoly-btn--decline" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
