import { GameRoom } from "../game/GameRoom.js";
import { Player } from "../game/Player.js";
import { MafiaRoom } from "../game/MafiaRoom.js";
import { MafiaPlayer } from "../game/MafiaPlayer.js";
import { MonopolyRoom } from "../game/MonopolyRoom.js";
import { MonopolyPlayer } from "../game/MonopolyPlayer.js";
import { KartArena } from "../game/KartArena.js";
import { BattleshipRoom } from "../game/BattleshipRoom.js";
import { UnoRoom } from "../game/UnoRoom.js";
import { TicTacToeRoom } from "../game/TicTacToeRoom.js";
import { HangmanRoom } from "../game/HangmanRoom.js";
import { CarromRoom } from "../game/CarromRoom.js";

const rooms = new Map();
const mafiaRooms = new Map();
const monopolyRooms = new Map();
const kartRooms = new Map();
const battleshipRooms = new Map();
const unoRooms = new Map();
const tttRooms = new Map();
const hangmanRooms = new Map();
const carromRooms = new Map();

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function safe(fn) {
  return (...args) => {
    try {
      fn(...args);
    } catch (err) {
      console.error("[handler error]", err);
    }
  };
}

/* ─────────────────────────────────────────────
   GLOBAL ROOM VALIDATION (IMPORTANT FIX)
──────────────────────────────────────────── */
function isRoomValid(roomState) {
  if (!roomState) return false;

  return !(
    roomState.phase === "ended" ||
    roomState.state === "gameEnd" ||
    roomState.status === "ended" ||
    roomState.gameOver === true ||
    roomState.ended === true
  );
}

export function registerHandlers(io) {
  io.on("connection", (socket) => {
    let currentRoomCode = null;
    let currentMafiaCode = null;
    let currentMonopolyCode = null;
    let currentKartCode = null;
    let currentBattleshipCode = null;
    let currentUnoCode = null;
    let currentTttCode = null;
    let currentHangmanCode = null;
    let currentCarromCode = null;

    /* ─────────────────────────────
       LIMN GAME
    ───────────────────────────── */

    socket.on("create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }
      const room = new GameRoom(code, io);
      rooms.set(code, room);
      joinRoom(socket, room, name || "Player");
      socket.emit("room-created", { code });
    }));

    socket.on("join-room", safe(({ code, name }) => {
      const room = rooms.get(code?.toUpperCase());
      if (!room) return socket.emit("error", { message: "Room not found." });

      joinRoom(socket, room, name || "Player");
    }));

    socket.on("rejoin", safe(({ name, roomCode }) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("rejoin-failed");

      const state = room.getRoomState();

      if (!isRoomValid(state)) {
        return socket.emit("rejoin-failed");
      }

      joinRoom(socket, room, name || "Player");

      socket.emit("rejoined", {
        code: room.code,
        roomState: state
      });

      if (room.state === "drawing" || room.state === "choosing") {
        socket.emit("round-start", {
          round: room.round,
          totalRounds: room.roundsPerGame * room.drawerQueue.length,
          roundDuration: room.roundDuration,
          drawerId: room.currentDrawerId,
          players: room.getPlayersArray(),
        });
      }
    }));

    function joinRoom(socket, room, name) {
      currentRoomCode = room.code;
      socket.join(room.code);

      const player = new Player(socket.id, name);
      room.addPlayer(player);

      socket.emit("joined-room", {
        code: room.code,
        roomState: room.getRoomState()
      });
    }

    socket.on("start-game", safe(({ rounds, timer }) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const result = room.startGame({ rounds, timer });
      if (result?.error) socket.emit("error", { message: result.error });
    }));

    socket.on("choose-word", safe(({ word }) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      room.wordChosen(word);
    }));

    socket.on("draw-batch", safe((points) => {
      const room = rooms.get(currentRoomCode);
      if (!room || socket.id !== room.currentDrawerId) return;
      socket.to(room.code).emit("draw-batch", points);
    }));

    socket.on("draw-fill", safe((data) => {
      const room = rooms.get(currentRoomCode);
      if (!room || socket.id !== room.currentDrawerId) return;
      socket.to(room.code).emit("draw-fill", data);
    }));

    socket.on("draw-shape", safe((data) => {
      const room = rooms.get(currentRoomCode);
      if (!room || socket.id !== room.currentDrawerId) return;
      socket.to(room.code).emit("draw-shape", data);
    }));

    socket.on("clear-canvas", safe(() => {
      const room = rooms.get(currentRoomCode);
      if (!room || socket.id !== room.currentDrawerId) return;
      socket.to(room.code).emit("clear-canvas");
    }));

    socket.on("guess", safe(({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      room.handleGuess(socket.id, text);
    }));

    socket.on("chat", safe(({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      room.handleChat(socket.id, text);
    }));

    /* ─────────────────────────────
       MAFIA GAME
    ───────────────────────────── */

    socket.on("mafia-create-room", safe(({ name, roleConfig }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new MafiaRoom(code, io);
      if (roleConfig) {
        if (roleConfig.mafiaCount !== undefined) room.roleConfig.mafiaCount = roleConfig.mafiaCount;
        if (roleConfig.detective !== undefined) room.roleConfig.detective = roleConfig.detective;
        if (roleConfig.doctor !== undefined) room.roleConfig.doctor = roleConfig.doctor;
        if (roleConfig.hunter !== undefined) room.roleConfig.hunter = roleConfig.hunter;
        if (roleConfig.jester !== undefined) room.roleConfig.jester = roleConfig.jester;
        if (roleConfig.witch !== undefined) room.roleConfig.witch = roleConfig.witch;
      }
      mafiaRooms.set(code, room);

      joinMafiaRoom(socket, room, name || "Player");
    }));

    socket.on("mafia-rejoin", safe(({ roomCode, name }) => {
      const room = mafiaRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("mafia-rejoin-failed");

      const state = room.getRoomState();

      if (!isRoomValid(state)) {
        return socket.emit("mafia-rejoin-failed");
      }

      joinMafiaRoom(socket, room, name || "Player");

      socket.emit("mafia-rejoined", {
        code: room.code,
        roomState: state
      });
    }));

    function joinMafiaRoom(sock, room, name) {
      currentMafiaCode = room.code;
      sock.join(room.code);

      const player = new MafiaPlayer(sock.id, name);
      room.addPlayer(player);

      sock.emit("mafia-joined-room", {
        code: room.code,
        roomState: room.getRoomState()
      });
    }

    socket.on("mafia-join-room", safe(({ code, name }) => {
      const room = mafiaRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("mafia-error", { message: "Room not found." });
      joinMafiaRoom(socket, room, name || "Player");
    }));

    socket.on("mafia-start-game", safe(() => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      const result = room.startGame(room.roleConfig);
      if (result?.error) socket.emit("mafia-error", { message: result.error });
    }));

    socket.on("mafia-day-chat", safe(({ text }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.handleDayChat(socket.id, text);
    }));

    socket.on("mafia-night-chat", safe(({ text }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.handleNightChat(socket.id, text);
    }));

    socket.on("mafia-vote", safe(({ targetId }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.submitVote(socket.id, targetId);
    }));

    socket.on("mafia-night-action", safe(({ targetId }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.submitNightAction(socket.id, targetId);
    }));

    socket.on("mafia-witch-action", safe((data) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.submitNightAction(socket.id, null, data);
    }));

    socket.on("mafia-hunter-action", safe(({ targetId }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      room.handleHunterAction(socket.id, targetId);
    }));

    /* ─────────────────────────────
       MONOPOLY GAME
    ───────────────────────────── */

    socket.on("monopoly-create-room", safe(({ name, settings }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new MonopolyRoom(code, io);
      if (settings) {
        if (settings.startingMoney) room.settings.startingMoney = settings.startingMoney;
        if (settings.mode) room.settings.mode = settings.mode;
        if (settings.turnTimer !== undefined) room.settings.turnTimer = settings.turnTimer;
        if (settings.freeParking !== undefined) room.settings.freeParking = settings.freeParking;
      }
      monopolyRooms.set(code, room);

      joinMonopolyRoom(socket, room, name || "Player");
    }));

    socket.on("monopoly-rejoin", safe(({ roomCode, name }) => {
      const room = monopolyRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("monopoly-rejoin-failed");

      const state = room.getRoomState();

      if (!isRoomValid(state)) {
        return socket.emit("monopoly-rejoin-failed");
      }

      joinMonopolyRoom(socket, room, name || "Player");

      socket.emit("monopoly-rejoined", {
        code: room.code,
        roomState: state
      });
    }));

    function joinMonopolyRoom(sock, room, name) {
      currentMonopolyCode = room.code;
      sock.join(room.code);

      const player = new MonopolyPlayer(sock.id, name);
      room.addPlayer(player);

      sock.emit("monopoly-joined-room", {
        code: room.code,
        roomState: room.getRoomState()
      });
    }

    socket.on("monopoly-join-room", safe(({ code, name }) => {
      const room = monopolyRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("monopoly-error", { message: "Room not found." });
      joinMonopolyRoom(socket, room, name || "Player");
    }));

    socket.on("monopoly-start-game", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      const result = room.startGame();
      if (result?.error) socket.emit("monopoly-error", { message: result.error });
    }));

    socket.on("monopoly-roll", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleRoll(socket.id);
    }));

    socket.on("monopoly-buy", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleBuy(socket.id);
    }));

    socket.on("monopoly-decline-buy", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleDeclineBuy(socket.id);
    }));

    socket.on("monopoly-end-turn", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleEndTurn(socket.id);
    }));

    socket.on("monopoly-auction-bid", safe(({ amount }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleBid(socket.id, amount);
    }));

    socket.on("monopoly-auction-pass", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleAuctionPass(socket.id);
    }));

    socket.on("monopoly-build", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleBuild(socket.id, propertyIndex);
    }));

    socket.on("monopoly-sell-building", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleSellBuilding(socket.id, propertyIndex);
    }));

    socket.on("monopoly-mortgage", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleMortgage(socket.id, propertyIndex);
    }));

    socket.on("monopoly-unmortgage", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleUnmortgage(socket.id, propertyIndex);
    }));

    socket.on("monopoly-jail-decision", safe(({ choice }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleJailDecision(socket.id, choice);
    }));

    socket.on("monopoly-trade-offer", safe(({ toId, offering, requesting }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleTradeOffer(socket.id, toId, offering, requesting);
    }));

    socket.on("monopoly-trade-respond", safe(({ accept }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleTradeResponse(socket.id, accept);
    }));

    socket.on("monopoly-trade-cancel", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleTradeCancel(socket.id);
    }));

    socket.on("monopoly-debt-give-up", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.handleDebtGiveUp(socket.id);
    }));

    socket.on("monopoly-get-state", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      socket.emit("monopoly-state-sync", { gameState: room.getGameState() });
    }));

    socket.on("monopoly-chat", safe(({ text }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      room.addChat(socket.id, text);
    }));

    /* ─────────────────────────────
       KART GAME
    ───────────────────────────── */

    socket.on("kart-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new KartArena(code, io);
      kartRooms.set(code, room);

      joinKartRoom(socket, room, name || "Racer");
    }));

    socket.on("kart-rejoin", safe(({ roomCode, name }) => {
      const room = kartRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("kart-rejoin-failed");

      const state = room.getRoomState();

      if (!isRoomValid(state)) {
        return socket.emit("kart-rejoin-failed");
      }

      joinKartRoom(socket, room, name || "Racer", "kart-rejoined");
    }));

    function joinKartRoom(sock, room, name, eventName = "kart-joined-room") {
      currentKartCode = room.code;
      sock.join(room.channel);

      room.addPlayer(sock.id, name);

      sock.emit(eventName, {
        code: room.code,
        roomState: room.getRoomState(),
        playerId: sock.id,
        snapshot: room.snapshot(),
      });

      room.broadcast();
    }

    /* ─────────────────────────────
       BATTLESHIP GAME
    ───────────────────────────── */

    socket.on("battleship-create-room", safe(({ name, mode }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new BattleshipRoom(code, io, mode || "classic");
      battleshipRooms.set(code, room);

      joinBattleshipRoom(socket, room, name || "Player");
    }));

    socket.on("battleship-join-room", safe(({ code, name }) => {
      const room = battleshipRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("battleship-error", { message: "Room not found." });

      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("battleship-error", { message: result.error });

      currentBattleshipCode = room.code;
      socket.join(room.code);

      socket.emit("battleship-joined-room", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }));

    socket.on("battleship-rejoin", safe(({ roomCode, name }) => {
      const room = battleshipRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("battleship-rejoin-failed");

      const state = room.getRoomState();
      if (!isRoomValid(state)) return socket.emit("battleship-rejoin-failed");

      // Re-add player (replaces old socket id)
      room.removePlayer(socket.id); // no-op if not present
      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("battleship-rejoin-failed");

      currentBattleshipCode = room.code;
      socket.join(room.code);

      socket.emit("battleship-rejoined", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }));

    socket.on("battleship-start-game", safe(() => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      const result = room.startGame(socket.id);
      if (result.error) socket.emit("battleship-error", { message: result.error });
    }));

    socket.on("battleship-place-ships", safe(({ ships }) => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      const result = room.placeShips(socket.id, ships);
      if (result.error) socket.emit("battleship-error", { message: result.error });
    }));

    socket.on("battleship-fire", safe(({ row, col }) => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      const result = room.fire(socket.id, row, col);
      if (result.error) socket.emit("battleship-error", { message: result.error });
    }));

    socket.on("battleship-use-ability", safe(({ ability, params }) => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      const result = room.useAbility(socket.id, ability, params);
      if (result.error) socket.emit("battleship-error", { message: result.error });
    }));

    socket.on("battleship-get-state", safe(() => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;
      const state = room.getPlayerState(socket.id);
      if (state) socket.emit("battleship-game-state", state);
    }));

    socket.on("battleship-chat", safe(({ text }) => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      room.addChat(socket.id, text);
    }));

    socket.on("battleship-leave", safe(() => {
      const room = battleshipRooms.get(currentBattleshipCode);
      if (!room) return;

      room.removePlayer(socket.id);
      socket.leave(room.code);
      currentBattleshipCode = null;

      if (room.isEmpty()) battleshipRooms.delete(room.code);
    }));

    function joinBattleshipRoom(sock, room, name) {
      currentBattleshipCode = room.code;
      sock.join(room.code);

      room.addPlayer(sock.id, name);

      sock.emit("battleship-joined-room", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }

    /* ─────────────────────────────
       UNO GAME
    ───────────────────────────── */

    socket.on("uno-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new UnoRoom(code, io);
      unoRooms.set(code, room);

      joinUnoRoom(socket, room, name || "Player");
    }));

    socket.on("uno-join-room", safe(({ code, name }) => {
      const room = unoRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("uno-error", { message: "Room not found." });

      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("uno-error", { message: result.error });

      currentUnoCode = room.code;
      socket.join(room.code);

      socket.emit("uno-joined-room", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }));

    socket.on("uno-rejoin", safe(({ roomCode, name }) => {
      const room = unoRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("uno-rejoin-failed");

      const state = room.getRoomState();
      if (!isRoomValid(state)) return socket.emit("uno-rejoin-failed");

      room.removePlayer(socket.id);
      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("uno-rejoin-failed");

      currentUnoCode = room.code;
      socket.join(room.code);

      socket.emit("uno-rejoined", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }));

    socket.on("uno-start-game", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.startGame(socket.id);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-update-rules", safe(({ rules }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.updateRules(socket.id, rules);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-play-card", safe(({ cardIndex, chosenColor, secondCardIndex }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.playCard(socket.id, cardIndex, chosenColor, secondCardIndex);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-draw-card", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.drawCard(socket.id);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-play-drawn", safe(({ chosenColor }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.playDrawnCard(socket.id, chosenColor);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-keep-drawn", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.keepDrawnCard(socket.id);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-call-uno", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.callUno(socket.id);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-catch-uno", safe(({ targetId }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.catchUno(socket.id, targetId);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-jump-in", safe(({ cardIndex }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.jumpIn(socket.id, cardIndex);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-swap-hands", safe(({ targetId }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const result = room.swapHands(socket.id, targetId);
      if (result.error) socket.emit("uno-error", { message: result.error });
    }));

    socket.on("uno-get-state", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      const state = room.getPlayerState(socket.id);
      if (state) socket.emit("uno-game-state", state);
    }));

    socket.on("uno-chat", safe(({ text }) => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;
      room.addChat(socket.id, text);
    }));

    socket.on("uno-leave", safe(() => {
      const room = unoRooms.get(currentUnoCode);
      if (!room) return;

      room.removePlayer(socket.id);
      socket.leave(room.code);
      currentUnoCode = null;

      if (room.isEmpty()) unoRooms.delete(room.code);
    }));

    function joinUnoRoom(sock, room, name) {
      currentUnoCode = room.code;
      sock.join(room.code);
      room.addPlayer(sock.id, name);
      sock.emit("uno-joined-room", {
        code: room.code,
        roomState: room.getRoomState(),
      });
    }

    /* ─────────────────────────────
       TIC-TAC-TOE GAME
    ───────────────────────────── */

    socket.on("ttt-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new TicTacToeRoom(code, io);
      tttRooms.set(code, room);
      joinTttRoom(socket, room, name || "Player");
    }));

    socket.on("ttt-join-room", safe(({ code, name }) => {
      const room = tttRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("ttt-error", { message: "Room not found." });
      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("ttt-error", { message: result.error });

      currentTttCode = room.code;
      socket.join(room.code);
      socket.emit("ttt-joined-room", { code: room.code, roomState: room.getRoomState() });

      // Auto-start when 2 players
      if (room.players.size === 2 && room.phase === "lobby") {
        room.startGame();
      }
    }));

    socket.on("ttt-rejoin", safe(({ roomCode, name }) => {
      const room = tttRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("ttt-rejoin-failed");
      const state = room.getRoomState();
      if (!isRoomValid(state)) return socket.emit("ttt-rejoin-failed");

      // Re-add player if they were removed
      if (!room.players.has(socket.id)) {
        const result = room.addPlayer(socket.id, name || "Player");
        if (result.error) return socket.emit("ttt-rejoin-failed");
      }

      currentTttCode = room.code;
      socket.join(room.code);
      socket.emit("ttt-rejoined", { code: room.code, roomState: state });
    }));

    socket.on("ttt-make-move", safe(({ cellIndex }) => {
      const room = tttRooms.get(currentTttCode);
      if (!room) return;
      room.makeMove(socket.id, cellIndex);
    }));

    socket.on("ttt-rematch", safe(() => {
      const room = tttRooms.get(currentTttCode);
      if (!room) return;
      room.requestRematch(socket.id);
    }));

    socket.on("ttt-get-state", safe(() => {
      const room = tttRooms.get(currentTttCode);
      if (!room) return;
      socket.emit("ttt-room-state", room.getRoomState());
      if (room.phase === "playing") {
        socket.emit("ttt-game-state", room.getPlayerState(socket.id));
      }
    }));

    socket.on("ttt-leave", safe(() => {
      const room = tttRooms.get(currentTttCode);
      if (room) {
        room.removePlayer(socket.id);
        if (room.isEmpty()) tttRooms.delete(currentTttCode);
      }
      currentTttCode = null;
    }));

    function joinTttRoom(sock, room, name) {
      const result = room.addPlayer(sock.id, name);
      if (result.error) {
        sock.emit("ttt-error", { message: result.error });
        return;
      }
      currentTttCode = room.code;
      sock.join(room.code);
      sock.emit("ttt-joined-room", { code: room.code, roomState: room.getRoomState() });
    }

    /* ─────────────────────────────
       HANGMAN GAME
    ───────────────────────────── */

    socket.on("hang-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new HangmanRoom(code, io);
      hangmanRooms.set(code, room);
      joinHangmanRoom(socket, room, name || "Player");
    }));

    socket.on("hang-join-room", safe(({ code, name }) => {
      const room = hangmanRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("hang-error", { message: "Room not found." });
      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("hang-error", { message: result.error });

      currentHangmanCode = room.code;
      socket.join(room.code);
      socket.emit("hang-joined-room", { code: room.code, roomState: room.getRoomState() });
    }));

    socket.on("hang-rejoin", safe(({ roomCode, name }) => {
      const room = hangmanRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("hang-rejoin-failed");
      const state = room.getRoomState();
      if (!isRoomValid(state)) return socket.emit("hang-rejoin-failed");

      if (!room.players.has(socket.id)) {
        const result = room.addPlayer(socket.id, name || "Player");
        if (result.error) return socket.emit("hang-rejoin-failed");
      }

      currentHangmanCode = room.code;
      socket.join(room.code);
      socket.emit("hang-rejoined", { code: room.code, roomState: state });
    }));

    socket.on("hang-start-game", safe(() => {
      const room = hangmanRooms.get(currentHangmanCode);
      if (!room) return;
      const result = room.startGame();
      if (result?.error) socket.emit("hang-error", { message: result.error });
    }));

    socket.on("hang-submit-word", safe(({ word, hint }) => {
      const room = hangmanRooms.get(currentHangmanCode);
      if (!room) return;
      room.submitWord(socket.id, word, hint);
    }));

    socket.on("hang-guess-letter", safe(({ letter }) => {
      const room = hangmanRooms.get(currentHangmanCode);
      if (!room) return;
      room.guessLetter(socket.id, letter);
    }));

    socket.on("hang-get-state", safe(() => {
      const room = hangmanRooms.get(currentHangmanCode);
      if (!room) return;
      socket.emit("hang-room-state", room.getRoomState());
    }));

    socket.on("hang-leave", safe(() => {
      const room = hangmanRooms.get(currentHangmanCode);
      if (room) {
        room.removePlayer(socket.id);
        if (room.isEmpty()) hangmanRooms.delete(currentHangmanCode);
      }
      currentHangmanCode = null;
    }));

    function joinHangmanRoom(sock, room, name) {
      const result = room.addPlayer(sock.id, name);
      if (result.error) {
        sock.emit("hang-error", { message: result.error });
        return;
      }
      currentHangmanCode = room.code;
      sock.join(room.code);
      sock.emit("hang-joined-room", { code: room.code, roomState: room.getRoomState() });
    }

    /* ─────────────────────────────
       CARROM
    ───────────────────────────── */

    socket.on("carr-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code) || unoRooms.has(code) || tttRooms.has(code) || hangmanRooms.has(code) || carromRooms.has(code)) {
        code = generateCode();
      }

      const room = new CarromRoom(code, io);
      carromRooms.set(code, room);
      joinCarromRoom(socket, room, name || "Player");
    }));

    socket.on("carr-join-room", safe(({ code, name }) => {
      const room = carromRooms.get(code?.toUpperCase());
      if (!room) return socket.emit("carr-error", { message: "Room not found." });
      const result = room.addPlayer(socket.id, name || "Player");
      if (result.error) return socket.emit("carr-error", { message: result.error });

      currentCarromCode = room.code;
      socket.join(room.code);
      socket.emit("carr-joined-room", { code: room.code, roomState: room.getRoomState() });
    }));

    socket.on("carr-rejoin", safe(({ roomCode, name }) => {
      const room = carromRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("carr-rejoin-failed");
      const state = room.getRoomState();
      if (!isRoomValid(state)) return socket.emit("carr-rejoin-failed");

      if (!room.players.has(socket.id)) {
        const result = room.addPlayer(socket.id, name || "Player");
        if (result.error) return socket.emit("carr-rejoin-failed");
      }

      currentCarromCode = room.code;
      socket.join(room.code);
      socket.emit("carr-rejoined", { code: room.code, roomState: state });
    }));

    socket.on("carr-start-game", safe(() => {
      const room = carromRooms.get(currentCarromCode);
      if (!room) return;
      const result = room.startGame();
      if (result?.error) socket.emit("carr-error", { message: result.error });
    }));

    socket.on("carr-shot", safe(({ strikerX, angle, force }) => {
      const room = carromRooms.get(currentCarromCode);
      if (!room) return;
      room.handleShot(socket.id, { strikerX, angle, force });
    }));

    socket.on("carr-shot-result", safe(({ pocketedIds, finalPositions, strikerPocketed, noPieceHit }) => {
      const room = carromRooms.get(currentCarromCode);
      if (!room) return;
      room.handleShotResult(socket.id, { pocketedIds, finalPositions, strikerPocketed, noPieceHit });
    }));

    socket.on("carr-get-state", safe(() => {
      const room = carromRooms.get(currentCarromCode);
      if (!room) return;
      socket.emit("carr-room-state", room.getRoomState());
    }));

    socket.on("carr-leave", safe(() => {
      const room = carromRooms.get(currentCarromCode);
      if (room) {
        room.removePlayer(socket.id);
        if (room.isEmpty()) carromRooms.delete(currentCarromCode);
      }
      currentCarromCode = null;
    }));

    function joinCarromRoom(sock, room, name) {
      const result = room.addPlayer(sock.id, name);
      if (result.error) {
        sock.emit("carr-error", { message: result.error });
        return;
      }
      currentCarromCode = room.code;
      sock.join(room.code);
      sock.emit("carr-joined-room", { code: room.code, roomState: room.getRoomState() });
    }

    /* ─────────────────────────────
       DISCONNECT
    ───────────────────────────── */

    socket.on("disconnect", () => {
      // Limn cleanup
      if (currentRoomCode) {
        const lRoom = rooms.get(currentRoomCode);
        if (lRoom) {
          lRoom.removePlayer(socket.id);
          if (lRoom.isEmpty()) rooms.delete(currentRoomCode);
        }
      }

      // Mafia cleanup
      if (currentMafiaCode) {
        const mRoom = mafiaRooms.get(currentMafiaCode);
        if (mRoom) {
          mRoom.removePlayer(socket.id);
          if (mRoom.isEmpty()) mafiaRooms.delete(currentMafiaCode);
        }
      }

      // Monopoly cleanup
      if (currentMonopolyCode) {
        const moRoom = monopolyRooms.get(currentMonopolyCode);
        if (moRoom) {
          moRoom.removePlayer(socket.id);
          if (moRoom.isEmpty()) monopolyRooms.delete(currentMonopolyCode);
        }
      }

      // Kart cleanup
      if (currentKartCode) {
        const kRoom = kartRooms.get(currentKartCode);
        if (kRoom) {
          kRoom.removePlayer(socket.id);
          if (kRoom.isEmpty()) kartRooms.delete(currentKartCode);
        }
      }

      // Battleship cleanup
      if (currentBattleshipCode) {
        const bRoom = battleshipRooms.get(currentBattleshipCode);
        if (bRoom) {
          bRoom.removePlayer(socket.id);
          if (bRoom.isEmpty()) battleshipRooms.delete(currentBattleshipCode);
        }
      }

      // Uno cleanup
      if (currentUnoCode) {
        const uRoom = unoRooms.get(currentUnoCode);
        if (uRoom) {
          uRoom.removePlayer(socket.id);
          if (uRoom.isEmpty()) unoRooms.delete(currentUnoCode);
        }
      }

      // TicTacToe cleanup
      if (currentTttCode) {
        const tRoom = tttRooms.get(currentTttCode);
        if (tRoom) {
          tRoom.removePlayer(socket.id);
          if (tRoom.isEmpty()) tttRooms.delete(currentTttCode);
        }
      }

      // Hangman cleanup
      if (currentHangmanCode) {
        const hRoom = hangmanRooms.get(currentHangmanCode);
        if (hRoom) {
          hRoom.removePlayer(socket.id);
          if (hRoom.isEmpty()) hangmanRooms.delete(currentHangmanCode);
        }
      }

      // Carrom cleanup
      if (currentCarromCode) {
        const cRoom = carromRooms.get(currentCarromCode);
        if (cRoom) {
          cRoom.removePlayer(socket.id);
          if (cRoom.isEmpty()) carromRooms.delete(currentCarromCode);
        }
      }
    });
  });
}