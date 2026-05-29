import {
  BOARD, GROUP_MEMBERS, RAILROADS, UTILITIES,
  RAILROAD_RENT, UTILITY_MULT,
  CHANCE_CARDS, COMMUNITY_CARDS, shuffleDeck,
} from "./monopolyBoard.js";

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export class MonopolyRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.phase = "lobby"; // lobby | playing | gameEnd
    this.playerOrder = [];
    this.turnIndex = 0;
    this.currentPlayerId = null;
    this.turnState = null; // waitingForRoll | jailDecision | buyPrompt | auctionPhase | actionPhase | inDebt
    this.lastDice = [0, 0];
    this.doublesCount = 0;
    this.debtInfo = null; // { playerId, creditorId, amount }

    this.propertyOwners = new Map(); // boardIndex → playerId
    this.propertyHouses = new Map(); // boardIndex → count (1-5)
    this.mortgagedProps = new Set();

    this.chanceDeck = shuffleDeck(CHANCE_CARDS);
    this.communityDeck = shuffleDeck(COMMUNITY_CARDS);
    this.chanceIndex = 0;
    this.communityIndex = 0;

    this.taxPool = 0;
    this.roundCount = 0;

    // Auction state
    this.auctionState = null;
    // Trade state
    this.tradeState = null;

    // Settings (set by host)
    this.settings = {
      startingMoney: 1500,
      mode: "classic",     // classic | speed | simplified
      turnTimer: 90,       // 0 = off
      freeParking: false,  // true = collect tax pool
      maxRounds: 30,       // for speed mode
    };

    this.timer = null;
    this.timeLeft = 0;

    // Log of game events for clients
    this.log = [];
  }

  // ── Player lifecycle ──────────────────────────────────────

  addPlayer(player) {
    this.players.set(player.id, player);
    this.broadcast("monopoly-room-state", this.getRoomState());
    this.broadcast("monopoly-player-joined", { player: player.toJSON() });
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

    if (this.phase === "lobby") {
      this.players.delete(socketId);
    } else if (this.phase === "playing" && !player.isBankrupt) {
      // Mid-game disconnect → bankrupt them
      this.eliminatePlayer(socketId, null);
      // If it was their turn, advance
      if (this.currentPlayerId === socketId) {
        this.advanceTurn();
      }
    }

    this.broadcast("monopoly-player-left", { playerId: socketId, name: player?.name });
    this.broadcast("monopoly-room-state", this.getRoomState());

    if (this.phase === "playing") {
      const winner = this.checkWin();
      if (winner) this.endGame(winner);
    }
  }

  isEmpty() {
    return [...this.players.values()].every(p => p.isBankrupt) || this.players.size === 0;
  }

  // ── Start game ────────────────────────────────────────────

  startGame(settings = {}) {
    if (this.players.size < 2) return { error: "Need at least 2 players." };
    if (this.players.size > 6) return { error: "Maximum 6 players." };

    // Apply settings
    if (settings.startingMoney) this.settings.startingMoney = settings.startingMoney;
    if (settings.mode) this.settings.mode = settings.mode;
    if (settings.turnTimer !== undefined) this.settings.turnTimer = settings.turnTimer;
    if (settings.freeParking !== undefined) this.settings.freeParking = settings.freeParking;

    // Set starting money
    for (const p of this.players.values()) {
      p.money = this.settings.startingMoney;
    }

    // Shuffle turn order
    this.playerOrder = [...this.players.keys()];
    shuffleArray(this.playerOrder);

    this.phase = "playing";
    this.turnIndex = 0;
    this.roundCount = 1;

    this.broadcast("monopoly-game-start", {
      playerOrder: this.playerOrder,
      settings: this.settings,
      gameState: this.getGameState(),
    });

    this.addLog("Game started!");
    this.startTurn();
  }

  // ── Turn management ───────────────────────────────────────

  startTurn() {
    this.currentPlayerId = this.playerOrder[this.turnIndex];
    const player = this.players.get(this.currentPlayerId);
    if (!player || player.isBankrupt) {
      this.advanceTurn();
      return;
    }

    this.doublesCount = 0;
    player.hasRolled = false;

    if (player.inJail) {
      this.turnState = "jailDecision";
      this.broadcast("monopoly-turn-start", {
        playerId: this.currentPlayerId,
        turnState: "jailDecision",
        timeLeft: this.settings.turnTimer,
        gameState: this.getGameState(),
      });
    } else {
      this.turnState = "waitingForRoll";
      this.broadcast("monopoly-turn-start", {
        playerId: this.currentPlayerId,
        turnState: "waitingForRoll",
        timeLeft: this.settings.turnTimer,
        gameState: this.getGameState(),
      });
    }

    this.startTurnTimer();
  }

  advanceTurn() {
    this.stopTimer();

    // Clear any pending auction/trade
    this.auctionState = null;
    this.tradeState = null;

    // Check if we've gone around the table (new round)
    const nextIndex = (this.turnIndex + 1) % this.playerOrder.length;
    if (nextIndex <= this.turnIndex || nextIndex === 0) {
      this.roundCount++;
      // Speed mode: check round limit
      if (this.settings.mode === "speed" && this.roundCount > this.settings.maxRounds) {
        const winner = this.getRichestPlayer();
        if (winner) return this.endGame(winner);
      }
    }
    this.turnIndex = nextIndex;

    // Skip bankrupt players
    let attempts = 0;
    while (attempts < this.playerOrder.length) {
      const pid = this.playerOrder[this.turnIndex];
      const p = this.players.get(pid);
      if (p && !p.isBankrupt) break;
      this.turnIndex = (this.turnIndex + 1) % this.playerOrder.length;
      attempts++;
    }

    this.startTurn();
  }

  // ── Dice roll ─────────────────────────────────────────────

  handleRoll(playerId) {
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "waitingForRoll") return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.lastDice = [d1, d2];
    const isDoubles = d1 === d2;

    const player = this.players.get(playerId);
    player.hasRolled = true;

    if (isDoubles) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        // Three doubles → jail
        this.addLog(`${player.name} rolled doubles 3 times — go to Jail!`);
        this.broadcast("monopoly-dice-result", {
          playerId, dice: [d1, d2], isDoubles: true, threeDoubles: true,
          gameState: this.getGameState(),
        });
        this.sendToJail(playerId);
        this.turnState = "actionPhase";
        this.broadcastTurnState();
        return;
      }
    } else {
      this.doublesCount = 0;
    }

    this.addLog(`${player.name} rolled ${d1} + ${d2} = ${d1 + d2}${isDoubles ? " (doubles!)" : ""}`);

    this.broadcast("monopoly-dice-result", {
      playerId, dice: [d1, d2], isDoubles,
      gameState: this.getGameState(),
    });

    // Move player
    this.movePlayer(playerId, d1 + d2);
  }

  movePlayer(playerId, steps) {
    const player = this.players.get(playerId);
    const oldPos = player.position;
    const newPos = (oldPos + steps) % 40;
    const passedGo = newPos < oldPos && steps > 0;

    player.position = newPos;

    if (passedGo) {
      player.money += 200;
      this.addLog(`${player.name} passed GO — collect $200`);
    }

    this.broadcast("monopoly-move", {
      playerId, from: oldPos, to: newPos, passedGo,
      gameState: this.getGameState(),
    });

    this.resolveLanding(playerId);
  }

  movePlayerTo(playerId, position, collectGo = true) {
    const player = this.players.get(playerId);
    const oldPos = player.position;

    if (collectGo && position < oldPos && position !== oldPos) {
      player.money += 200;
      this.addLog(`${player.name} passed GO — collect $200`);
    }

    player.position = position;

    this.broadcast("monopoly-move", {
      playerId, from: oldPos, to: position, passedGo: collectGo && position < oldPos,
      gameState: this.getGameState(),
    });

    this.resolveLanding(playerId);
  }

  // ── Landing resolution ────────────────────────────────────

  resolveLanding(playerId) {
    const player = this.players.get(playerId);
    const space = BOARD[player.position];

    switch (space.type) {
      case "property":
      case "railroad":
      case "utility":
        this.resolvePropertyLanding(playerId, space);
        break;
      case "chance":
        this.drawCard(playerId, "chance");
        break;
      case "community":
        this.drawCard(playerId, "community");
        break;
      case "tax":
        this.resolveTax(playerId, space);
        break;
      case "go-to-jail":
        this.addLog(`${player.name} landed on Go To Jail!`);
        this.sendToJail(playerId);
        this.turnState = "actionPhase";
        this.broadcastTurnState();
        break;
      case "free-parking":
        if (this.settings.freeParking && this.taxPool > 0) {
          player.money += this.taxPool;
          this.addLog(`${player.name} collects $${this.taxPool} from Free Parking!`);
          this.taxPool = 0;
        } else {
          this.addLog(`${player.name} is Just Visiting Free Parking.`);
        }
        this.goToActionPhase(playerId);
        break;
      default:
        // GO, Jail (just visiting)
        this.goToActionPhase(playerId);
        break;
    }
  }

  resolvePropertyLanding(playerId, space) {
    const player = this.players.get(playerId);
    const owner = this.propertyOwners.get(space.index);

    if (!owner) {
      // Unowned — buy prompt (or auto-buy in simplified mode)
      if (this.settings.mode === "simplified") {
        if (player.money >= space.price) {
          this.buyProperty(playerId, space.index);
        } else {
          this.addLog(`${player.name} can't afford ${space.name}.`);
        }
        this.goToActionPhase(playerId);
      } else {
        this.turnState = "buyPrompt";
        this.broadcast("monopoly-buy-prompt", {
          playerId, propertyIndex: space.index, property: space,
          gameState: this.getGameState(),
        });
      }
    } else if (owner === playerId) {
      this.addLog(`${player.name} landed on their own ${space.name}.`);
      this.goToActionPhase(playerId);
    } else if (this.mortgagedProps.has(space.index)) {
      this.addLog(`${player.name} landed on ${space.name} (mortgaged — no rent).`);
      this.goToActionPhase(playerId);
    } else {
      // Pay rent
      const rent = this.calculateRent(space);
      const ownerPlayer = this.players.get(owner);
      this.addLog(`${player.name} pays $${rent} rent to ${ownerPlayer?.name} for ${space.name}.`);

      this.broadcast("monopoly-rent-paid", {
        payerId: playerId, ownerId: owner, amount: rent, propertyIndex: space.index,
        gameState: this.getGameState(),
      });

      this.transferMoney(playerId, owner, rent);
      if (!this.players.get(playerId)?.isBankrupt) {
        this.goToActionPhase(playerId);
      }
    }
  }

  calculateRent(space) {
    if (space.type === "railroad") {
      const ownerId = this.propertyOwners.get(space.index);
      const ownedCount = RAILROADS.filter(i =>
        this.propertyOwners.get(i) === ownerId && !this.mortgagedProps.has(i)
      ).length;
      return RAILROAD_RENT[ownedCount - 1] || 25;
    }

    if (space.type === "utility") {
      const ownerId = this.propertyOwners.get(space.index);
      const ownedCount = UTILITIES.filter(i =>
        this.propertyOwners.get(i) === ownerId && !this.mortgagedProps.has(i)
      ).length;
      const diceTotal = this.lastDice[0] + this.lastDice[1];
      return diceTotal * UTILITY_MULT[ownedCount - 1];
    }

    // Regular property
    const houses = this.propertyHouses.get(space.index) || 0;
    if (houses > 0) {
      return space.rent[houses]; // rent[1] = 1 house, ... rent[5] = hotel
    }

    // Check monopoly (double base rent)
    const ownerId = this.propertyOwners.get(space.index);
    const groupIndices = GROUP_MEMBERS[space.group] || [];
    const ownsAll = groupIndices.every(i =>
      this.propertyOwners.get(i) === ownerId && !this.mortgagedProps.has(i)
    );

    return ownsAll ? space.rent[0] * 2 : space.rent[0];
  }

  // ── Property purchase ─────────────────────────────────────

  handleBuy(playerId) {
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "buyPrompt") return;

    const player = this.players.get(playerId);
    const space = BOARD[player.position];

    if (player.money < space.price) {
      this.io.to(playerId).emit("monopoly-error", { message: "Not enough money." });
      return;
    }

    this.buyProperty(playerId, space.index);
    this.goToActionPhase(playerId);
  }

  handleDeclineBuy(playerId) {
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "buyPrompt") return;

    const player = this.players.get(playerId);
    const space = BOARD[player.position];

    if (this.settings.mode === "simplified") {
      // No auctions in simplified
      this.addLog(`${player.name} declined to buy ${space.name}.`);
      this.goToActionPhase(playerId);
    } else {
      this.addLog(`${player.name} declined to buy ${space.name} — auction begins!`);
      this.startAuction(space.index);
    }
  }

  buyProperty(playerId, propertyIndex) {
    const player = this.players.get(playerId);
    const space = BOARD[propertyIndex];

    player.money -= space.price;
    player.properties.push(propertyIndex);
    this.propertyOwners.set(propertyIndex, playerId);

    this.addLog(`${player.name} bought ${space.name} for $${space.price}.`);
    this.broadcast("monopoly-buy-result", {
      playerId, propertyIndex, property: space,
      gameState: this.getGameState(),
    });
  }

  // ── Auctions ──────────────────────────────────────────────

  startAuction(propertyIndex) {
    const space = BOARD[propertyIndex];
    const activePlayers = this.playerOrder.filter(id => {
      const p = this.players.get(id);
      return p && !p.isBankrupt && p.money > 0;
    });

    if (activePlayers.length === 0) {
      this.addLog(`No one can bid — ${space.name} remains unowned.`);
      this.goToActionPhase(this.currentPlayerId);
      return;
    }

    this.auctionState = {
      propertyIndex,
      currentBid: 0,
      currentBidder: null,
      activePlayers: [...activePlayers],
      passedPlayers: new Set(),
      timeLeft: 15,
    };

    this.turnState = "auctionPhase";

    this.broadcast("monopoly-auction-start", {
      propertyIndex, property: space,
      activePlayers,
      gameState: this.getGameState(),
    });

    this.startAuctionTimer();
  }

  handleBid(playerId, amount) {
    if (this.turnState !== "auctionPhase" || !this.auctionState) return;
    const auction = this.auctionState;
    if (auction.passedPlayers.has(playerId)) return;

    const player = this.players.get(playerId);
    if (!player || player.isBankrupt) return;

    const minBid = auction.currentBid + 1;
    if (amount < minBid || amount > player.money) {
      this.io.to(playerId).emit("monopoly-error", { message: `Bid must be between $${minBid} and $${player.money}.` });
      return;
    }

    auction.currentBid = amount;
    auction.currentBidder = playerId;
    auction.timeLeft = 10; // Reset timer on bid

    this.addLog(`${player.name} bids $${amount} on ${BOARD[auction.propertyIndex].name}.`);
    this.broadcast("monopoly-auction-bid", {
      playerId, amount, currentBid: amount, currentBidder: playerId,
      gameState: this.getGameState(),
    });
  }

  handleAuctionPass(playerId) {
    if (this.turnState !== "auctionPhase" || !this.auctionState) return;
    const auction = this.auctionState;
    auction.passedPlayers.add(playerId);

    const player = this.players.get(playerId);
    this.addLog(`${player?.name} passes on the auction.`);

    // Check if only one bidder remains
    const remaining = auction.activePlayers.filter(id => !auction.passedPlayers.has(id));
    if (remaining.length <= 1 || (remaining.length === 0 && auction.currentBidder)) {
      this.resolveAuction();
    } else {
      this.broadcast("monopoly-auction-update", {
        passedPlayers: [...auction.passedPlayers],
        gameState: this.getGameState(),
      });
    }
  }

  resolveAuction() {
    this.stopTimer();
    const auction = this.auctionState;
    if (!auction) return;

    const space = BOARD[auction.propertyIndex];

    if (auction.currentBidder && auction.currentBid > 0) {
      const winner = this.players.get(auction.currentBidder);
      winner.money -= auction.currentBid;
      winner.properties.push(auction.propertyIndex);
      this.propertyOwners.set(auction.propertyIndex, auction.currentBidder);

      this.addLog(`${winner.name} wins ${space.name} at auction for $${auction.currentBid}.`);
      this.broadcast("monopoly-auction-end", {
        winnerId: auction.currentBidder, amount: auction.currentBid, propertyIndex: auction.propertyIndex,
        gameState: this.getGameState(),
      });
    } else {
      this.addLog(`No bids — ${space.name} remains unowned.`);
      this.broadcast("monopoly-auction-end", {
        winnerId: null, amount: 0, propertyIndex: auction.propertyIndex,
        gameState: this.getGameState(),
      });
    }

    this.auctionState = null;
    this.goToActionPhase(this.currentPlayerId);
  }

  startAuctionTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      try {
        if (!this.auctionState) { this.stopTimer(); return; }
        this.auctionState.timeLeft--;
        this.broadcast("monopoly-auction-tick", { timeLeft: this.auctionState.timeLeft });
        if (this.auctionState.timeLeft <= 0) {
          this.resolveAuction();
        }
      } catch (err) {
        console.error("[MonopolyRoom auction timer error]", err);
        this.stopTimer();
      }
    }, 1000);
  }

  // ── Building ──────────────────────────────────────────────

  handleBuild(playerId, propertyIndex) {
    if (this.phase !== "playing") return;
    // Only current player can build (during action phase), or we allow building anytime on your turn
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "actionPhase") return;
    if (this.settings.mode === "simplified") {
      this.io.to(playerId).emit("monopoly-error", { message: "Building disabled in simplified mode." });
      return;
    }

    const player = this.players.get(playerId);
    const space = BOARD[propertyIndex];
    if (!space || space.type !== "property") return;
    if (this.propertyOwners.get(propertyIndex) !== playerId) return;
    if (this.mortgagedProps.has(propertyIndex)) {
      this.io.to(playerId).emit("monopoly-error", { message: "Unmortgage first." });
      return;
    }

    // Must own entire group
    const group = GROUP_MEMBERS[space.group];
    if (!group.every(i => this.propertyOwners.get(i) === playerId)) {
      this.io.to(playerId).emit("monopoly-error", { message: "You need the full color group." });
      return;
    }

    // No mortgaged properties in group
    if (group.some(i => this.mortgagedProps.has(i))) {
      this.io.to(playerId).emit("monopoly-error", { message: "Unmortgage all properties in this group first." });
      return;
    }

    const currentHouses = this.propertyHouses.get(propertyIndex) || 0;
    if (currentHouses >= 5) {
      this.io.to(playerId).emit("monopoly-error", { message: "Already at hotel level." });
      return;
    }

    // Even building rule: can't build more than 1 ahead of lowest in group
    const minInGroup = Math.min(...group.map(i => this.propertyHouses.get(i) || 0));
    if (currentHouses > minInGroup) {
      this.io.to(playerId).emit("monopoly-error", { message: "Build evenly — upgrade other properties first." });
      return;
    }

    if (player.money < space.houseCost) {
      this.io.to(playerId).emit("monopoly-error", { message: "Not enough money." });
      return;
    }

    player.money -= space.houseCost;
    this.propertyHouses.set(propertyIndex, currentHouses + 1);

    const level = currentHouses + 1 === 5 ? "a hotel" : `${currentHouses + 1} house(s)`;
    this.addLog(`${player.name} built on ${space.name} — now has ${level}.`);
    this.broadcast("monopoly-build-result", {
      playerId, propertyIndex, houses: currentHouses + 1,
      gameState: this.getGameState(),
    });
  }

  handleSellBuilding(playerId, propertyIndex) {
    const isInDebt = this.debtInfo?.playerId === playerId;
    if (playerId !== this.currentPlayerId && !isInDebt) return;
    const player = this.players.get(playerId);
    const space = BOARD[propertyIndex];
    if (!space || space.type !== "property") return;
    if (this.propertyOwners.get(propertyIndex) !== playerId) return;

    const currentHouses = this.propertyHouses.get(propertyIndex) || 0;
    if (currentHouses <= 0) return;

    // Even building: can't have more than 1 difference in group
    const group = GROUP_MEMBERS[space.group];
    const maxInGroup = Math.max(...group.map(i => this.propertyHouses.get(i) || 0));
    if (currentHouses < maxInGroup) {
      this.io.to(playerId).emit("monopoly-error", { message: "Sell evenly — sell from higher properties first." });
      return;
    }

    player.money += Math.floor(space.houseCost / 2);
    this.propertyHouses.set(propertyIndex, currentHouses - 1);

    this.addLog(`${player.name} sold a building on ${space.name} for $${Math.floor(space.houseCost / 2)}.`);
    this.broadcast("monopoly-build-result", {
      playerId, propertyIndex, houses: currentHouses - 1,
      gameState: this.getGameState(),
    });

    if (isInDebt) this.checkDebtResolved(playerId);
  }

  // ── Mortgage ──────────────────────────────────────────────

  handleMortgage(playerId, propertyIndex) {
    const isInDebt = this.debtInfo?.playerId === playerId;
    if (playerId !== this.currentPlayerId && !isInDebt) return;
    const player = this.players.get(playerId);
    const space = BOARD[propertyIndex];
    if (!space) return;
    if (this.propertyOwners.get(propertyIndex) !== playerId) return;
    if (this.mortgagedProps.has(propertyIndex)) return;

    // Can't mortgage if buildings exist on any property in the group
    if (space.group) {
      const group = GROUP_MEMBERS[space.group] || [];
      if (group.some(i => (this.propertyHouses.get(i) || 0) > 0)) {
        this.io.to(playerId).emit("monopoly-error", { message: "Sell all buildings in this group first." });
        return;
      }
    }

    this.mortgagedProps.add(propertyIndex);
    player.mortgaged.add(propertyIndex);
    player.money += space.mortgageValue;

    this.addLog(`${player.name} mortgaged ${space.name} for $${space.mortgageValue}.`);
    this.broadcast("monopoly-mortgage-result", {
      playerId, propertyIndex, mortgaged: true,
      gameState: this.getGameState(),
    });

    if (isInDebt) this.checkDebtResolved(playerId);
  }

  handleUnmortgage(playerId, propertyIndex) {
    if (playerId !== this.currentPlayerId) return;
    const player = this.players.get(playerId);
    const space = BOARD[propertyIndex];
    if (!space) return;
    if (this.propertyOwners.get(propertyIndex) !== playerId) return;
    if (!this.mortgagedProps.has(propertyIndex)) return;

    const cost = Math.ceil(space.mortgageValue * 1.1); // 10% interest
    if (player.money < cost) {
      this.io.to(playerId).emit("monopoly-error", { message: `Need $${cost} to unmortgage.` });
      return;
    }

    this.mortgagedProps.delete(propertyIndex);
    player.mortgaged.delete(propertyIndex);
    player.money -= cost;

    this.addLog(`${player.name} unmortgaged ${space.name} for $${cost}.`);
    this.broadcast("monopoly-mortgage-result", {
      playerId, propertyIndex, mortgaged: false,
      gameState: this.getGameState(),
    });
  }

  // ── Trading ───────────────────────────────────────────────

  handleTradeOffer(fromId, toId, offering, requesting) {
    if (this.settings.mode === "simplified") {
      this.io.to(fromId).emit("monopoly-error", { message: "Trading disabled in simplified mode." });
      return;
    }
    if (fromId !== this.currentPlayerId) return;
    if (this.turnState !== "actionPhase") return;

    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    if (!from || !to || to.isBankrupt) return;

    // Validate offering
    if (offering.money && offering.money > from.money) return;
    if (offering.properties) {
      for (const idx of offering.properties) {
        if (this.propertyOwners.get(idx) !== fromId) return;
        if ((this.propertyHouses.get(idx) || 0) > 0) {
          this.io.to(fromId).emit("monopoly-error", { message: "Sell buildings before trading." });
          return;
        }
      }
    }
    // Validate requesting
    if (requesting.money && requesting.money > to.money) return;
    if (requesting.properties) {
      for (const idx of requesting.properties) {
        if (this.propertyOwners.get(idx) !== toId) return;
        if ((this.propertyHouses.get(idx) || 0) > 0) {
          this.io.to(fromId).emit("monopoly-error", { message: "Opponent must sell buildings first." });
          return;
        }
      }
    }

    this.tradeState = { fromId, toId, offering, requesting };
    this.turnState = "tradeOffer";

    // Notify both players
    this.io.to(fromId).emit("monopoly-trade-offer", { fromId, toId, offering, requesting, gameState: this.getGameState() });
    this.io.to(toId).emit("monopoly-trade-offer", { fromId, toId, offering, requesting, gameState: this.getGameState() });
    this.broadcast("monopoly-trade-pending", { fromName: from.name, toName: to.name });
  }

  handleTradeResponse(playerId, accept) {
    if (!this.tradeState || playerId !== this.tradeState.toId) return;

    const { fromId, toId, offering, requesting } = this.tradeState;
    const from = this.players.get(fromId);
    const to = this.players.get(toId);

    if (accept) {
      // Execute trade
      if (offering.money) { from.money -= offering.money; to.money += offering.money; }
      if (requesting.money) { to.money -= requesting.money; from.money += requesting.money; }

      for (const idx of (offering.properties || [])) {
        from.properties = from.properties.filter(i => i !== idx);
        to.properties.push(idx);
        this.propertyOwners.set(idx, toId);
        if (this.mortgagedProps.has(idx)) {
          from.mortgaged.delete(idx);
          to.mortgaged.add(idx);
        }
      }
      for (const idx of (requesting.properties || [])) {
        to.properties = to.properties.filter(i => i !== idx);
        from.properties.push(idx);
        this.propertyOwners.set(idx, fromId);
        if (this.mortgagedProps.has(idx)) {
          to.mortgaged.delete(idx);
          from.mortgaged.add(idx);
        }
      }

      this.addLog(`${from.name} and ${to.name} completed a trade.`);
    } else {
      this.addLog(`${to.name} rejected ${from.name}'s trade offer.`);
    }

    this.broadcast("monopoly-trade-result", {
      accepted: accept, fromId, toId,
      gameState: this.getGameState(),
    });

    this.tradeState = null;
    this.turnState = "actionPhase";
    this.broadcastTurnState();
  }

  handleTradeCancel(playerId) {
    if (!this.tradeState || playerId !== this.tradeState.fromId) return;
    this.addLog(`${this.players.get(playerId)?.name} cancelled the trade.`);
    this.tradeState = null;
    this.turnState = "actionPhase";
    this.broadcastTurnState();
    this.broadcast("monopoly-trade-result", { accepted: false, cancelled: true, gameState: this.getGameState() });
  }

  // ── Jail ──────────────────────────────────────────────────

  sendToJail(playerId) {
    const player = this.players.get(playerId);
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    this.doublesCount = 0;

    this.broadcast("monopoly-jail-update", {
      playerId, inJail: true, method: "sent",
      gameState: this.getGameState(),
    });
  }

  handleJailDecision(playerId, choice) {
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "jailDecision") return;

    const player = this.players.get(playerId);
    if (!player.inJail) return;

    if (choice === "pay") {
      if (player.money < 50) {
        this.io.to(playerId).emit("monopoly-error", { message: "Not enough money to pay $50." });
        return;
      }
      player.money -= 50;
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(`${player.name} paid $50 to get out of Jail.`);
      this.broadcast("monopoly-jail-update", { playerId, inJail: false, method: "paid", gameState: this.getGameState() });
      this.turnState = "waitingForRoll";
      this.broadcastTurnState();
    } else if (choice === "card") {
      if (player.getOutOfJailCards <= 0) {
        this.io.to(playerId).emit("monopoly-error", { message: "No Get Out of Jail Free cards." });
        return;
      }
      player.getOutOfJailCards--;
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(`${player.name} used a Get Out of Jail Free card.`);
      this.broadcast("monopoly-jail-update", { playerId, inJail: false, method: "card", gameState: this.getGameState() });
      this.turnState = "waitingForRoll";
      this.broadcastTurnState();
    } else if (choice === "roll") {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      this.lastDice = [d1, d2];

      this.broadcast("monopoly-dice-result", {
        playerId, dice: [d1, d2], isDoubles: d1 === d2, jailRoll: true,
        gameState: this.getGameState(),
      });

      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(`${player.name} rolled doubles (${d1}+${d2}) — free from Jail!`);
        this.broadcast("monopoly-jail-update", { playerId, inJail: false, method: "doubles", gameState: this.getGameState() });
        this.movePlayer(playerId, d1 + d2);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          // Forced to pay after 3 failed attempts
          player.money -= 50;
          player.inJail = false;
          player.jailTurns = 0;
          this.addLog(`${player.name} failed 3 times — forced to pay $50.`);
          this.broadcast("monopoly-jail-update", { playerId, inJail: false, method: "forced", gameState: this.getGameState() });
          this.movePlayer(playerId, d1 + d2);
          if (player.money < 0) this.checkBankruptcy(playerId, null);
        } else {
          this.addLog(`${player.name} failed to roll doubles (${d1}+${d2}). Turn ${player.jailTurns}/3.`);
          this.goToActionPhase(playerId);
        }
      }
    }
  }

  // ── Cards ─────────────────────────────────────────────────

  drawCard(playerId, deckType) {
    const player = this.players.get(playerId);
    let card;

    if (deckType === "chance") {
      card = this.chanceDeck[this.chanceIndex];
      this.chanceIndex = (this.chanceIndex + 1) % this.chanceDeck.length;
    } else {
      card = this.communityDeck[this.communityIndex];
      this.communityIndex = (this.communityIndex + 1) % this.communityDeck.length;
    }

    this.addLog(`${player.name} drew ${deckType === "chance" ? "Chance" : "Community Chest"}: "${card.text}"`);
    this.broadcast("monopoly-card-drawn", {
      playerId, deckType, card,
      gameState: this.getGameState(),
    });

    this.applyCard(playerId, card);
  }

  applyCard(playerId, card) {
    const player = this.players.get(playerId);

    switch (card.action) {
      case "moveTo":
        this.movePlayerTo(playerId, card.params.position, true);
        return; // resolveLanding handles the rest

      case "moveBack": {
        const newPos = (player.position - card.params.spaces + 40) % 40;
        player.position = newPos;
        this.broadcast("monopoly-move", { playerId, from: player.position + card.params.spaces, to: newPos, passedGo: false, gameState: this.getGameState() });
        this.resolveLanding(playerId);
        return;
      }

      case "collect":
        player.money += card.params.amount;
        break;

      case "pay":
        player.money -= card.params.amount;
        if (this.settings.freeParking) this.taxPool += card.params.amount;
        if (player.money < 0) { this.checkBankruptcy(playerId, null); return; }
        break;

      case "payEach": {
        const alive = [...this.players.values()].filter(p => !p.isBankrupt && p.id !== playerId);
        const total = alive.length * card.params.amount;
        player.money -= total;
        for (const p of alive) p.money += card.params.amount;
        if (player.money < 0) { this.checkBankruptcy(playerId, null); return; }
        break;
      }

      case "collectEach": {
        const alive = [...this.players.values()].filter(p => !p.isBankrupt && p.id !== playerId);
        for (const p of alive) p.money -= card.params.amount;
        player.money += alive.length * card.params.amount;
        break;
      }

      case "repairs": {
        let cost = 0;
        for (const idx of player.properties) {
          const h = this.propertyHouses.get(idx) || 0;
          if (h === 5) cost += card.params.perHotel;
          else cost += h * card.params.perHouse;
        }
        player.money -= cost;
        this.addLog(`${player.name} pays $${cost} in repairs.`);
        if (player.money < 0) { this.checkBankruptcy(playerId, null); return; }
        break;
      }

      case "goToJail":
        this.sendToJail(playerId);
        this.turnState = "actionPhase";
        this.broadcastTurnState();
        return;

      case "jailCard":
        player.getOutOfJailCards++;
        break;

      case "nearestRailroad": {
        const rr = RAILROADS.find(i => i > player.position) || RAILROADS[0];
        this.movePlayerTo(playerId, rr, true);
        return;
      }

      case "nearestUtility": {
        const ut = UTILITIES.find(i => i > player.position) || UTILITIES[0];
        this.movePlayerTo(playerId, ut, true);
        return;
      }
    }

    this.goToActionPhase(playerId);
  }

  // ── Tax ───────────────────────────────────────────────────

  resolveTax(playerId, space) {
    const player = this.players.get(playerId);
    player.money -= space.amount;
    if (this.settings.freeParking) this.taxPool += space.amount;

    this.addLog(`${player.name} pays $${space.amount} ${space.name}.`);
    this.broadcast("monopoly-tax-paid", {
      playerId, amount: space.amount, taxPool: this.taxPool,
      gameState: this.getGameState(),
    });

    if (player.money < 0) {
      this.checkBankruptcy(playerId, null);
    } else {
      this.goToActionPhase(playerId);
    }
  }

  // ── Money transfer & bankruptcy ───────────────────────────

  transferMoney(fromId, toId, amount) {
    const from = this.players.get(fromId);
    const to = toId ? this.players.get(toId) : null;

    from.money -= amount;
    if (to) to.money += amount;

    if (from.money < 0) {
      this.checkBankruptcy(fromId, toId);
    }
  }

  checkBankruptcy(playerId, creditorId) {
    const player = this.players.get(playerId);
    if (!player || player.isBankrupt) return;

    if (player.money >= 0) return;

    // Check if player has any assets to liquidate
    const hasAssets = player.properties.some(idx => {
      if (!this.mortgagedProps.has(idx)) return true;
      if ((this.propertyHouses.get(idx) || 0) > 0) return true;
      return false;
    });

    if (!hasAssets) {
      this.eliminatePlayer(playerId, creditorId);
      return;
    }

    // Enter debt resolution — player can sell buildings / mortgage to raise funds
    this.debtInfo = { playerId, creditorId, amount: -player.money };
    this.turnState = "inDebt";
    this.addLog(`${player.name} owes $${-player.money} — must sell buildings or mortgage properties!`);
    this.broadcast("monopoly-debt", {
      playerId, creditorId, amount: -player.money,
      gameState: this.getGameState(),
    });
  }

  handleDebtGiveUp(playerId) {
    if (!this.debtInfo || this.debtInfo.playerId !== playerId) return;
    this.eliminatePlayer(playerId, this.debtInfo.creditorId);
    this.debtInfo = null;
  }

  checkDebtResolved(playerId) {
    const player = this.players.get(playerId);
    if (!player || !this.debtInfo || this.debtInfo.playerId !== playerId) return;

    if (player.money >= 0) {
      this.addLog(`${player.name} raised enough funds!`);
      const creditorId = this.debtInfo.creditorId;
      this.debtInfo = null;
      this.goToActionPhase(playerId);
    }
  }

  eliminatePlayer(playerId, creditorId) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.isBankrupt = true;
    this.addLog(`${player.name} is bankrupt!`);

    if (creditorId) {
      // Transfer all assets to creditor
      const creditor = this.players.get(creditorId);
      if (creditor) {
        for (const idx of player.properties) {
          creditor.properties.push(idx);
          this.propertyOwners.set(idx, creditorId);
          if (player.mortgaged.has(idx)) {
            player.mortgaged.delete(idx);
            creditor.mortgaged.add(idx);
          }
        }
        creditor.money += Math.max(0, player.money); // any remaining money (shouldn't be positive but just in case)
        creditor.getOutOfJailCards += player.getOutOfJailCards;
      }
    } else {
      // Owed to bank — properties go back to unowned, buildings removed
      for (const idx of player.properties) {
        this.propertyOwners.delete(idx);
        this.propertyHouses.delete(idx);
        this.mortgagedProps.delete(idx);
      }
    }

    player.properties = [];
    player.houses.clear();
    player.mortgaged.clear();
    player.money = 0;
    player.getOutOfJailCards = 0;

    this.broadcast("monopoly-bankruptcy", {
      playerId, creditorId,
      playerName: player.name,
      gameState: this.getGameState(),
    });

    const winner = this.checkWin();
    if (winner) this.endGame(winner);
  }

  // ── End turn ──────────────────────────────────────────────

  handleEndTurn(playerId) {
    if (playerId !== this.currentPlayerId) return;
    if (this.turnState !== "actionPhase") return;

    // If doubles were rolled and not in jail, roll again
    const player = this.players.get(playerId);
    if (this.doublesCount > 0 && !player.inJail && !player.isBankrupt) {
      this.turnState = "waitingForRoll";
      this.addLog(`${player.name} rolled doubles — roll again!`);
      this.broadcastTurnState();
      return;
    }

    this.advanceTurn();
  }

  // ── Win condition ─────────────────────────────────────────

  checkWin() {
    const alive = [...this.players.values()].filter(p => !p.isBankrupt);
    if (alive.length <= 1) return alive[0]?.id || null;
    return null;
  }

  getRichestPlayer() {
    let richest = null;
    let maxWorth = -1;
    for (const p of this.players.values()) {
      if (p.isBankrupt) continue;
      const worth = p.netWorth(BOARD);
      if (worth > maxWorth) { maxWorth = worth; richest = p.id; }
    }
    return richest;
  }

  endGame(winnerId) {
    this.stopTimer();
    this.phase = "gameEnd";

    const standings = [...this.players.values()]
      .map(p => ({ ...p.toJSON(), netWorth: p.netWorth(BOARD) }))
      .sort((a, b) => b.netWorth - a.netWorth);

    this.broadcast("monopoly-game-end", { winnerId, standings });
  }

  // ── Helpers ───────────────────────────────────────────────

  goToActionPhase(playerId) {
    this.turnState = "actionPhase";
    this.broadcastTurnState();
  }

  broadcastTurnState() {
    this.broadcast("monopoly-turn-state", {
      playerId: this.currentPlayerId,
      turnState: this.turnState,
      gameState: this.getGameState(),
    });
  }

  addLog(text) {
    const entry = { text, time: Date.now() };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.broadcast("monopoly-log", { entry });
  }

  broadcast(event, data) { this.io.to(this.code).emit(event, data); }

  startTurnTimer() {
    this.stopTimer();
    if (!this.settings.turnTimer) return;
    this.timeLeft = this.settings.turnTimer;
    this.timer = setInterval(() => {
      try {
        this.timeLeft--;
        this.broadcast("monopoly-timer-tick", { timeLeft: this.timeLeft });
        if (this.timeLeft <= 0) {
          this.stopTimer();
          // Auto-end turn
          const player = this.players.get(this.currentPlayerId);
          if (player && !player.isBankrupt) {
            if (this.turnState === "buyPrompt") {
              this.handleDeclineBuy(this.currentPlayerId);
            } else if (this.turnState === "waitingForRoll" || this.turnState === "jailDecision") {
              // Auto-roll or auto-pay jail
              if (player.inJail) {
                this.handleJailDecision(this.currentPlayerId, "pay");
              } else {
                this.handleRoll(this.currentPlayerId);
              }
            }
            // Force end turn if still in action phase
            if (this.turnState === "actionPhase") {
              this.advanceTurn();
            }
          }
        }
      } catch (err) {
        console.error("[MonopolyRoom timer error]", err);
        this.stopTimer();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  getGameState() {
    return {
      phase: this.phase,
      currentPlayerId: this.currentPlayerId,
      turnState: this.turnState,
      playerOrder: this.playerOrder,
      players: Object.fromEntries(
        [...this.players.entries()].map(([id, p]) => [id, p.toJSON()])
      ),
      propertyOwners: Object.fromEntries(this.propertyOwners),
      propertyHouses: Object.fromEntries(this.propertyHouses),
      mortgagedProps: [...this.mortgagedProps],
      lastDice: this.lastDice,
      doublesCount: this.doublesCount,
      taxPool: this.taxPool,
      roundCount: this.roundCount,
      settings: this.settings,
      timeLeft: this.timeLeft,
      auctionState: this.auctionState ? {
        propertyIndex: this.auctionState.propertyIndex,
        currentBid: this.auctionState.currentBid,
        currentBidder: this.auctionState.currentBidder,
        passedPlayers: [...this.auctionState.passedPlayers],
        timeLeft: this.auctionState.timeLeft,
      } : null,
      tradeState: this.tradeState,
      debtInfo: this.debtInfo,
      log: this.log.slice(-50),
    };
  }

  getRoomState() {
    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      players: [...this.players.values()].map(p => p.toJSON()),
    };
  }
}
