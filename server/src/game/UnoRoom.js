const COLORS = ["red", "blue", "green", "yellow"];

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color, value: String(n) });
      deck.push({ color, value: String(n) });
    }
    for (const action of ["skip", "reverse", "draw2"]) {
      deck.push({ color, value: action });
      deck.push({ color, value: action });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "wild4" });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardMatches(card, topCard, currentColor, houseRules) {
  if (card.color === "wild") return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value && topCard.color !== "wild") return true;
  return false;
}

function cardLabel(card) {
  if (card.value === "wild") return "Wild";
  if (card.value === "wild4") return "Wild +4";
  if (card.value === "draw2") return `${card.color} +2`;
  if (card.value === "skip") return `${card.color} Skip`;
  if (card.value === "reverse") return `${card.color} Reverse`;
  return `${card.color} ${card.value}`;
}

export class UnoRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.playerOrder = [];
    this.phase = "lobby";
    this.direction = 1;
    this.turnIndex = 0;
    this.discardPile = [];
    this.drawPile = [];
    this.currentColor = null;
    this.drawStack = 0;
    this.stackLevel = 0;
    this.winner = null;
    this.chat = [];
    this.houseRules = {
      stacking: true,
      jumpIn: false,
      sevenZero: false,
      noBluffWild4: false,
    };
    // per-turn draw tracking
    this.drawnCard = null;      // { playerId, card } if a player just drew a playable card
  }

  // ── Players ─────────────────────────────────────

  addPlayer(id, name) {
    if (this.players.size >= 6) return { error: "Room is full." };
    if (this.phase !== "lobby") return { error: "Game already started." };

    this.players.set(id, { id, name, hand: [], calledUno: false });
    this.playerOrder.push(id);

    this.broadcast("uno-room-state", this.getRoomState());
    this.broadcast("uno-player-joined", { player: { id, name } });
    return {};
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    if ((this.phase === "playing") && this.playerOrder.length < 2) {
      const remaining = this.playerOrder[0];
      if (remaining) {
        this.winner = remaining;
        this.phase = "ended";
        const wp = this.players.get(remaining);
        this.broadcast("uno-game-over", {
          winnerId: remaining,
          winnerName: wp?.name || "Unknown",
          reason: "forfeit",
        });
      }
    } else if (this.phase === "playing") {
      // fix turnIndex if needed
      if (this.turnIndex >= this.playerOrder.length) {
        this.turnIndex = 0;
      }
      this.sendStateToAll();
    }

    this.broadcast("uno-player-left", { playerId: id, name: player.name });
    this.broadcast("uno-room-state", this.getRoomState());
  }

  isEmpty() { return this.players.size === 0; }

  // ── House Rules ─────────────────────────────────

  updateRules(hostId, rules) {
    if (this.playerOrder[0] !== hostId) return { error: "Only the host can change rules." };
    if (this.phase !== "lobby") return { error: "Cannot change rules after game starts." };

    if (typeof rules.stacking === "boolean") this.houseRules.stacking = rules.stacking;
    if (typeof rules.jumpIn === "boolean") this.houseRules.jumpIn = rules.jumpIn;
    if (typeof rules.sevenZero === "boolean") this.houseRules.sevenZero = rules.sevenZero;
    if (typeof rules.noBluffWild4 === "boolean") this.houseRules.noBluffWild4 = rules.noBluffWild4;

    this.broadcast("uno-room-state", this.getRoomState());
    return {};
  }

  // ── Game Flow ───────────────────────────────────

  startGame(hostId) {
    if (this.playerOrder[0] !== hostId) return { error: "Only the host can start." };
    if (this.players.size < 2) return { error: "Need at least 2 players." };

    this.phase = "playing";
    this.direction = 1;
    this.turnIndex = 0;
    this.drawStack = 0;
    this.stackLevel = 0;
    this.drawnCard = null;

    // Build and shuffle deck
    this.drawPile = shuffle(buildDeck());
    this.discardPile = [];

    // Deal 7 cards each
    for (const [, p] of this.players) {
      p.hand = [];
      p.calledUno = false;
      for (let i = 0; i < 7; i++) {
        p.hand.push(this.drawFromPile());
      }
    }

    // Flip starting card (re-flip if wild4)
    let startCard = this.drawFromPile();
    while (startCard.value === "wild4") {
      this.drawPile.push(startCard);
      shuffle(this.drawPile);
      startCard = this.drawFromPile();
    }
    this.discardPile.push(startCard);
    this.currentColor = startCard.color === "wild" ? COLORS[Math.floor(Math.random() * 4)] : startCard.color;

    // Apply starting card effects
    this.applyStartingCard(startCard);

    this.broadcast("uno-phase", { phase: "playing" });
    this.sendStateToAll();
    return {};
  }

  applyStartingCard(card) {
    if (card.value === "skip") {
      this.advanceTurn();
    } else if (card.value === "reverse") {
      this.direction *= -1;
      if (this.players.size === 2) {
        this.advanceTurn();
      }
    } else if (card.value === "draw2") {
      // first player draws 2 and is skipped
      const firstId = this.playerOrder[this.turnIndex];
      const first = this.players.get(firstId);
      for (let i = 0; i < 2; i++) first.hand.push(this.drawFromPile());
      this.broadcast("uno-cards-drawn", { playerId: firstId, count: 2 });
      this.advanceTurn();
    } else if (card.value === "wild") {
      // color already set randomly above
    }
  }

  // ── Card Play ───────────────────────────────────

  playCard(id, cardIndex, chosenColor, secondCardIndex) {
    if (this.phase !== "playing") return { error: "Game not in progress." };
    if (this.currentTurnId() !== id) return { error: "Not your turn." };

    this.drawnCard = null;
    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };

    // Handle double +2 play (stacking as +4)
    if (secondCardIndex !== undefined && secondCardIndex !== null) {
      return this.playDoubleDraw2(player, id, cardIndex, secondCardIndex, chosenColor);
    }

    const card = player.hand[cardIndex];
    if (!card) return { error: "Invalid card index." };

    // If there is an active draw stack, validate response
    if (this.drawStack > 0 && this.houseRules.stacking) {
      return this.playCardOnStack(player, id, cardIndex, card, chosenColor);
    }

    // If there is a draw stack and stacking is off, can't play -- must draw
    if (this.drawStack > 0 && !this.houseRules.stacking) {
      return { error: "You must draw cards. Stacking is disabled." };
    }

    // Normal play validation
    const topCard = this.discardTop();
    if (!cardMatches(card, topCard, this.currentColor, this.houseRules)) {
      return { error: "Card doesn't match." };
    }

    // Wild4 bluff check
    if (card.value === "wild4" && !this.houseRules.noBluffWild4) {
      const hasMatch = player.hand.some((c, i) => i !== cardIndex && c.color === this.currentColor);
      if (hasMatch) return { error: "You have cards matching the current color. Cannot play Wild +4." };
    }

    // Play the card
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    if (card.color === "wild") {
      this.currentColor = chosenColor || "red";
    } else {
      this.currentColor = card.color;
    }

    this.broadcast("uno-card-played", { playerId: id, card, newColor: this.currentColor });

    // Apply effects
    this.applyCardEffects(card, player, id, chosenColor);

    return {};
  }

  playCardOnStack(player, id, cardIndex, card, chosenColor) {
    // During a stack, player can only play draw cards at stackLevel or higher
    if (card.value === "draw2" && this.stackLevel <= 2) {
      // Valid: play +2 on +2 stack
      player.hand.splice(cardIndex, 1);
      this.discardPile.push(card);
      this.currentColor = card.color;
      this.drawStack += 2;
      this.stackLevel = 2;
      this.broadcast("uno-card-played", { playerId: id, card, newColor: this.currentColor });
      this.checkUnoStatus(player, id);
      this.advanceTurn();
      this.sendStateToAll();
      return {};
    }

    if (card.value === "wild4") {
      // Valid: escalate to +4 level
      player.hand.splice(cardIndex, 1);
      this.discardPile.push(card);
      this.currentColor = chosenColor || "red";
      this.drawStack += 4;
      this.stackLevel = 4;
      this.broadcast("uno-card-played", { playerId: id, card, newColor: this.currentColor });
      this.checkUnoStatus(player, id);
      this.advanceTurn();
      this.sendStateToAll();
      return {};
    }

    return { error: "You can only play a draw card to stack, or draw the penalty." };
  }

  playDoubleDraw2(player, id, idx1, idx2, chosenColor) {
    // Playing two +2 cards as a pair counts as +4 level
    if (!this.houseRules.stacking) return { error: "Stacking is disabled." };
    if (this.drawStack === 0) return { error: "Cannot play double +2 without an active stack." };
    if (this.stackLevel > 2) {
      // At +4 level, double +2 is allowed (equals +4)
    }

    const card1 = player.hand[idx1];
    const card2 = player.hand[idx2];
    if (!card1 || !card2) return { error: "Invalid card index." };
    if (card1.value !== "draw2" || card2.value !== "draw2") return { error: "Both cards must be +2." };

    // Remove both (higher index first to avoid shift issues)
    const [lo, hi] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
    player.hand.splice(hi, 1);
    player.hand.splice(lo, 1);
    this.discardPile.push(card1, card2);

    this.currentColor = card1.color;
    this.drawStack += 4;
    this.stackLevel = 4;

    this.broadcast("uno-card-played", { playerId: id, card: card1, card2, newColor: this.currentColor, double: true });
    this.checkUnoStatus(player, id);
    this.advanceTurn();
    this.sendStateToAll();
    return {};
  }

  applyCardEffects(card, player, id, chosenColor) {
    this.checkUnoStatus(player, id);
    if (this.checkWin(player, id)) return;

    // Seven-Zero rule
    if (this.houseRules.sevenZero && card.value === "7") {
      this.pendingSwap = id;
      this.sendStateToAll();
      return; // don't advance turn yet -- waiting for swap target
    }
    if (this.houseRules.sevenZero && card.value === "0") {
      this.rotateHands();
      this.advanceTurn();
      this.sendStateToAll();
      return;
    }

    if (card.value === "skip") {
      // Advance past the skipped player
      this.advanceTurn();
      this.advanceTurn();
      this.sendStateToAll();
    } else if (card.value === "reverse") {
      this.direction *= -1;
      if (this.players.size === 2) {
        this.advanceTurn();
        this.advanceTurn();
      } else {
        this.advanceTurn();
      }
      this.sendStateToAll();
    } else if (card.value === "draw2") {
      this.drawStack += 2;
      this.stackLevel = 2;
      this.advanceTurn();
      if (!this.houseRules.stacking) {
        this.forceDrawAndSkip();
      }
      this.sendStateToAll();
    } else if (card.value === "wild4") {
      this.drawStack += 4;
      this.stackLevel = 4;
      this.advanceTurn();
      if (!this.houseRules.stacking) {
        this.forceDrawAndSkip();
      }
      this.sendStateToAll();
    } else {
      // Number or wild (no special effect)
      this.advanceTurn();
      this.sendStateToAll();
    }
  }

  forceDrawAndSkip() {
    const targetId = this.currentTurnId();
    const target = this.players.get(targetId);
    if (!target) return;

    const count = this.drawStack;
    for (let i = 0; i < count; i++) {
      target.hand.push(this.drawFromPile());
    }
    this.broadcast("uno-cards-drawn", { playerId: targetId, count });
    this.drawStack = 0;
    this.stackLevel = 0;
    this.advanceTurn();
  }

  // ── Drawing ─────────────────────────────────────

  drawCard(id) {
    if (this.phase !== "playing") return { error: "Game not in progress." };
    if (this.currentTurnId() !== id) return { error: "Not your turn." };

    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };

    this.drawnCard = null;

    // If there's a pending stack the player can't respond to
    if (this.drawStack > 0) {
      const count = this.drawStack;
      for (let i = 0; i < count; i++) {
        player.hand.push(this.drawFromPile());
      }
      this.broadcast("uno-cards-drawn", { playerId: id, count });
      this.drawStack = 0;
      this.stackLevel = 0;
      player.calledUno = false;
      this.advanceTurn();
      this.sendStateToAll();
      return {};
    }

    // Normal draw: draw 1 card
    const card = this.drawFromPile();
    player.hand.push(card);
    player.calledUno = false;

    this.broadcast("uno-cards-drawn", { playerId: id, count: 1 });

    // Check if drawn card is playable
    const topCard = this.discardTop();
    if (cardMatches(card, topCard, this.currentColor, this.houseRules)) {
      this.drawnCard = { playerId: id, card, cardIndex: player.hand.length - 1 };
      this.sendStateToAll();
      return {};
    }

    // Not playable, advance turn
    this.advanceTurn();
    this.sendStateToAll();
    return {};
  }

  playDrawnCard(id, chosenColor) {
    if (!this.drawnCard || this.drawnCard.playerId !== id) {
      return { error: "No drawn card to play." };
    }

    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };

    const cardIndex = player.hand.length - 1;
    const card = player.hand[cardIndex];
    if (!card) return { error: "Card not found." };

    this.drawnCard = null;
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    if (card.color === "wild") {
      this.currentColor = chosenColor || "red";
    } else {
      this.currentColor = card.color;
    }

    this.broadcast("uno-card-played", { playerId: id, card, newColor: this.currentColor });
    this.applyCardEffects(card, player, id, chosenColor);
    return {};
  }

  keepDrawnCard(id) {
    if (!this.drawnCard || this.drawnCard.playerId !== id) {
      return { error: "No drawn card pending." };
    }
    this.drawnCard = null;
    this.advanceTurn();
    this.sendStateToAll();
    return {};
  }

  // ── Jump In ─────────────────────────────────────

  jumpIn(id, cardIndex) {
    if (!this.houseRules.jumpIn) return { error: "Jump In is disabled." };
    if (this.phase !== "playing") return { error: "Game not in progress." };
    if (this.currentTurnId() === id) return { error: "It's already your turn." };
    if (this.drawStack > 0) return { error: "Cannot jump in during a draw stack." };

    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };

    const card = player.hand[cardIndex];
    if (!card) return { error: "Invalid card index." };

    const topCard = this.discardTop();
    if (!topCard) return { error: "No discard card." };

    // Must be exact duplicate (same color AND same value)
    if (card.color !== topCard.color || card.value !== topCard.value) {
      return { error: "Card must be an exact match to jump in." };
    }

    // Play the card and shift turn to this player
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    this.currentColor = card.color;

    // Set turn to this player
    this.turnIndex = this.playerOrder.indexOf(id);

    this.broadcast("uno-card-played", { playerId: id, card, newColor: this.currentColor, jumpIn: true });

    // Apply effects from this player's position
    this.applyCardEffects(card, player, id, null);
    return {};
  }

  // ── Seven-Zero ──────────────────────────────────

  swapHands(id, targetId) {
    if (this.pendingSwap !== id) return { error: "No pending swap." };
    if (!this.players.has(targetId)) return { error: "Invalid target." };
    if (targetId === id) return { error: "Cannot swap with yourself." };

    const me = this.players.get(id);
    const them = this.players.get(targetId);
    const temp = me.hand;
    me.hand = them.hand;
    them.hand = temp;

    // Reset uno status for both
    me.calledUno = false;
    them.calledUno = false;

    this.pendingSwap = null;
    this.broadcast("uno-hands-swapped", { playerId: id, targetId });

    if (this.checkWin(me, id)) return {};
    this.advanceTurn();
    this.sendStateToAll();
    return {};
  }

  rotateHands() {
    if (this.playerOrder.length < 2) return;

    const hands = this.playerOrder.map(id => this.players.get(id).hand);
    const n = hands.length;

    if (this.direction === 1) {
      // Clockwise: each player gets the hand of the previous player
      const last = hands[n - 1];
      for (let i = n - 1; i > 0; i--) {
        this.players.get(this.playerOrder[i]).hand = hands[i - 1];
      }
      this.players.get(this.playerOrder[0]).hand = last;
    } else {
      // Counter-clockwise
      const first = hands[0];
      for (let i = 0; i < n - 1; i++) {
        this.players.get(this.playerOrder[i]).hand = hands[i + 1];
      }
      this.players.get(this.playerOrder[n - 1]).hand = first;
    }

    // Reset uno status for all
    for (const [, p] of this.players) p.calledUno = false;

    this.broadcast("uno-hands-rotated", { direction: this.direction });
  }

  // ── Uno Call / Catch ────────────────────────────

  callUno(id) {
    const player = this.players.get(id);
    if (!player) return { error: "Not in this room." };
    if (player.hand.length > 2) return { error: "Too many cards to call Uno." };

    player.calledUno = true;
    this.broadcast("uno-uno-called", { playerId: id });
    this.sendStateToAll();
    return {};
  }

  catchUno(catcherId, targetId) {
    if (catcherId === targetId) return { error: "Cannot catch yourself." };
    const target = this.players.get(targetId);
    if (!target) return { error: "Player not found." };
    if (target.hand.length !== 1) return { error: "Player doesn't have exactly 1 card." };
    if (target.calledUno) return { error: "Player already called Uno." };

    // Penalty: draw 2 cards
    for (let i = 0; i < 2; i++) {
      target.hand.push(this.drawFromPile());
    }
    target.calledUno = false;

    const catcher = this.players.get(catcherId);
    this.broadcast("uno-uno-caught", {
      catcherId,
      catcherName: catcher?.name || "Unknown",
      targetId,
      targetName: target.name,
    });
    this.sendStateToAll();
    return {};
  }

  // ── Helpers ─────────────────────────────────────

  currentTurnId() {
    return this.playerOrder[this.turnIndex];
  }

  discardTop() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  advanceTurn() {
    this.drawnCard = null;
    const n = this.playerOrder.length;
    this.turnIndex = ((this.turnIndex + this.direction) % n + n) % n;
  }

  drawFromPile() {
    if (this.drawPile.length === 0) {
      this.reshuffleDeck();
    }
    if (this.drawPile.length === 0) {
      // Absolute fallback: create a fresh deck
      this.drawPile = shuffle(buildDeck());
    }
    return this.drawPile.pop();
  }

  reshuffleDeck() {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop();
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = [top];
  }

  checkUnoStatus(player, id) {
    if (player.hand.length === 1 && !player.calledUno) {
      // Window for others to catch
    }
    if (player.hand.length > 1) {
      player.calledUno = false;
    }
  }

  checkWin(player, id) {
    if (player.hand.length === 0) {
      this.winner = id;
      this.phase = "ended";
      this.broadcast("uno-game-over", {
        winnerId: id,
        winnerName: player.name,
        reason: "empty_hand",
      });
      return true;
    }
    return false;
  }

  // ── State ───────────────────────────────────────

  getPlayerState(socketId) {
    const me = this.players.get(socketId);
    if (!me) return null;

    const opponents = this.playerOrder
      .filter(pid => pid !== socketId)
      .map(pid => {
        const p = this.players.get(pid);
        return { id: pid, name: p.name, cardCount: p.hand.length, calledUno: p.calledUno };
      });

    // Sort hand: group by color (red, blue, green, yellow, wild), then by value
    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4 };
    const valueOrder = { "0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9, skip:10, reverse:11, draw2:12, wild:13, wild4:14 };
    const sortedHand = me.hand.map(c => ({ ...c })).sort((a, b) => {
      const cd = (colorOrder[a.color] ?? 5) - (colorOrder[b.color] ?? 5);
      if (cd !== 0) return cd;
      return (valueOrder[a.value] ?? 15) - (valueOrder[b.value] ?? 15);
    });

    return {
      myHand: sortedHand,
      myCalledUno: me.calledUno,
      opponents,
      discardTop: this.discardTop(),
      currentColor: this.currentColor,
      drawPileCount: this.drawPile.length,
      turnPlayerId: this.currentTurnId(),
      direction: this.direction,
      phase: this.phase,
      drawStack: this.drawStack,
      stackLevel: this.stackLevel,
      winner: this.winner,
      houseRules: { ...this.houseRules },
      canPlayDrawn: this.drawnCard?.playerId === socketId,
      drawnCardIndex: this.drawnCard?.playerId === socketId ? (me.hand.length - 1) : null,
      pendingSwap: this.pendingSwap === socketId,
      playerOrder: this.playerOrder,
    };
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      houseRules: { ...this.houseRules },
      players: this.playerOrder.map(id => {
        const p = this.players.get(id);
        return { id: p.id, name: p.name };
      }),
      chat: this.chat,
    };
  }

  sendStateToAll() {
    for (const [id] of this.players) {
      this.sendToPlayer(id, "uno-game-state", this.getPlayerState(id));
    }
  }

  broadcast(event, data) {
    this.io.to(this.code).emit(event, data);
  }

  sendToPlayer(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  // ── Chat ────────────────────────────────────────

  addChat(id, text) {
    const player = this.players.get(id);
    if (!player) return;
    const msg = {
      sender: player.name,
      senderId: id,
      text: String(text).slice(0, 200),
      timestamp: Date.now(),
    };
    this.chat.push(msg);
    if (this.chat.length > 50) this.chat.shift();
    this.broadcast("uno-chat-msg", msg);
  }
}
