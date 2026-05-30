import { GameRoom } from "../game/GameRoom.js";
import { Player } from "../game/Player.js";
import { MafiaRoom } from "../game/MafiaRoom.js";
import { MafiaPlayer } from "../game/MafiaPlayer.js";
import { MonopolyRoom } from "../game/MonopolyRoom.js";
import { MonopolyPlayer } from "../game/MonopolyPlayer.js";
import { KartArena } from "../game/KartArena.js";
import { BattleshipRoom } from "../game/BattleshipRoom.js";

const rooms = new Map();
const mafiaRooms = new Map();
const monopolyRooms = new Map();
const kartRooms = new Map();
const battleshipRooms = new Map();

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

    /* ─────────────────────────────
       LIMN GAME
    ───────────────────────────── */

    socket.on("create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code)) {
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
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code)) {
        code = generateCode();
      }

      const room = new MafiaRoom(code, io);
      if (roleConfig) {
        if (roleConfig.mafiaCount !== undefined) room.roleConfig.mafiaCount = roleConfig.mafiaCount;
        if (roleConfig.detective !== undefined) room.roleConfig.detective = roleConfig.detective;
        if (roleConfig.doctor !== undefined) room.roleConfig.doctor = roleConfig.doctor;
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

    /* ─────────────────────────────
       MONOPOLY GAME
    ───────────────────────────── */

    socket.on("monopoly-create-room", safe(({ name, settings }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code)) {
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
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code)) {
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
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code) || battleshipRooms.has(code)) {
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
    });
  });
}