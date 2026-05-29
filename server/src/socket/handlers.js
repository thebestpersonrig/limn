import { GameRoom } from "../game/GameRoom.js";
import { Player } from "../game/Player.js";
import { MafiaRoom } from "../game/MafiaRoom.js";
import { MafiaPlayer } from "../game/MafiaPlayer.js";
import { MonopolyRoom } from "../game/MonopolyRoom.js";
import { MonopolyPlayer } from "../game/MonopolyPlayer.js";
import { KartArena } from "../game/KartArena.js";

const rooms = new Map();
const mafiaRooms = new Map();
const monopolyRooms = new Map();
const kartRooms = new Map();

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Wrap a handler so one bad event can't crash the server */
function safe(fn) {
  return (...args) => {
    try { fn(...args); }
    catch (err) { console.error("[handler error]", err); }
  };
}

export function registerHandlers(io) {
  io.on("connection", (socket) => {
    let currentRoomCode = null;

    socket.on("create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) code = generateCode();
      const room = new GameRoom(code, io);
      rooms.set(code, room);
      joinRoom(socket, room, name || "Player");
      socket.emit("room-created", { code });
    }));

    socket.on("join-room", safe(({ code, name }) => {
      if (!code) return socket.emit("error", { message: "Invalid room code." });
      const room = rooms.get(code.toUpperCase());
      if (!room) return socket.emit("error", { message: "Room not found." });
      joinRoom(socket, room, name || "Player");
      if (room.state !== "lobby") {
        socket.emit("round-start", {
          round: room.round,
          totalRounds: room.roundsPerGame * room.drawerQueue.length,
          roundDuration: room.roundDuration,
          drawerId: room.currentDrawerId,
          players: room.getPlayersArray(),
        });
      }
    }));

    socket.on("rejoin", safe(({ name, roomCode }) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("rejoin-failed");
      joinRoom(socket, room, name || "Player");
      socket.emit("rejoined", { code: room.code, roomState: room.getRoomState() });
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

    socket.on("start-game", safe((settings = {}) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const result = room.startGame(settings);
      if (result?.error) socket.emit("error", result);
    }));

    socket.on("choose-word", safe(({ word }) => {
      const room = rooms.get(currentRoomCode);
      if (room && word && socket.id === room.currentDrawerId) room.wordChosen(word);
    }));

    socket.on("draw-batch", safe((events) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-batch", events);
    }));

    socket.on("draw-shape", safe((data) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-shape", data);
    }));

    socket.on("draw-fill", safe((data) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-fill", data);
    }));

    socket.on("canvas-undo", safe(({ imageData }) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("canvas-restore", { imageData });
    }));

    socket.on("canvas-sync", safe(({ imageData, forSocket }) => {
      if (forSocket) io.to(forSocket).emit("canvas-restore", { imageData });
    }));

    socket.on("clear-canvas", safe(() => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("canvas-cleared");
    }));

    socket.on("guess", safe(({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (room && text) room.handleGuess(socket.id, text);
    }));

    socket.on("chat", safe(({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (room && text) room.handleChat(socket.id, text);
    }));

    socket.on("disconnect", safe(() => {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.removePlayer(socket.id);
        if (room.isEmpty()) rooms.delete(currentRoomCode);
      }
      const mRoom = mafiaRooms.get(currentMafiaCode);
      if (mRoom) {
        mRoom.removePlayer(socket.id);
        if (mRoom.isEmpty()) mafiaRooms.delete(currentMafiaCode);
      }
      const monoRoom = monopolyRooms.get(currentMonopolyCode);
      if (monoRoom) {
        monoRoom.removePlayer(socket.id);
        if (monoRoom.isEmpty()) monopolyRooms.delete(currentMonopolyCode);
      }
      const kartRoom = kartRooms.get(currentKartCode);
      if (kartRoom) {
        kartRoom.removePlayer(socket.id);
        if (kartRoom.isEmpty()) {
          kartRoom.stop();
          kartRooms.delete(currentKartCode);
        }
      }
    }));

    function joinRoom(socket, room, name) {
      currentRoomCode = room.code;
      socket.join(room.code);
      const player = new Player(socket.id, name);
      room.addPlayer(player);
      socket.emit("joined-room", { code: room.code, roomState: room.getRoomState() });

      if (room.state === "drawing" && room.currentDrawerId) {
        io.to(room.currentDrawerId).emit("sync-canvas-request", { forSocket: socket.id });
      }
    }

    // -- Mafia handlers --
    let currentMafiaCode = null;

    socket.on("mafia-create-room", safe(({ name, roleConfig }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) code = generateCode();
      const room = new MafiaRoom(code, io);
      if (roleConfig) {
        if (roleConfig.mafiaCount) room.roleConfig.mafiaCount = roleConfig.mafiaCount;
        if (roleConfig.detective !== undefined) room.roleConfig.detective = roleConfig.detective;
        if (roleConfig.doctor !== undefined) room.roleConfig.doctor = roleConfig.doctor;
        if (roleConfig.dayDuration) room.dayDuration = roleConfig.dayDuration;
      }
      mafiaRooms.set(code, room);
      joinMafiaRoom(socket, room, name || "Player");
    }));

    socket.on("mafia-join-room", safe(({ code, name }) => {
      if (!code) return socket.emit("mafia-error", { message: "Invalid room code." });
      const room = mafiaRooms.get(code.toUpperCase());
      if (!room) return socket.emit("mafia-error", { message: "Room not found." });
      if (room.phase !== "lobby") return socket.emit("mafia-error", { message: "Game already in progress." });
      joinMafiaRoom(socket, room, name || "Player");
    }));

    socket.on("mafia-rejoin", safe(({ roomCode, name }) => {
      const room = mafiaRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("mafia-rejoin-failed");
      joinMafiaRoom(socket, room, name || "Player");
      socket.emit("mafia-rejoined", { code: room.code, roomState: room.getRoomState() });
    }));

    socket.on("mafia-start-game", safe((config = {}) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (!room) return;
      const result = room.startGame(config);
      if (result?.error) socket.emit("mafia-error", result);
    }));

    socket.on("mafia-day-chat", safe(({ text }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (room && text) room.handleDayChat(socket.id, text);
    }));

    socket.on("mafia-night-chat", safe(({ text }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (room && text) room.handleNightChat(socket.id, text);
    }));

    socket.on("mafia-vote", safe(({ targetId }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (room && targetId) room.submitVote(socket.id, targetId);
    }));

    socket.on("mafia-night-action", safe(({ targetId }) => {
      const room = mafiaRooms.get(currentMafiaCode);
      if (room && targetId) room.submitNightAction(socket.id, targetId);
    }));

    function joinMafiaRoom(sock, room, name) {
      currentMafiaCode = room.code;
      sock.join(room.code);
      const player = new MafiaPlayer(sock.id, name);
      room.addPlayer(player);
      sock.emit("mafia-joined-room", { code: room.code, roomState: room.getRoomState() });
    }

    // -- Monopoly handlers --
    let currentMonopolyCode = null;

    socket.on("monopoly-create-room", safe(({ name, settings }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) code = generateCode();
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

    socket.on("monopoly-join-room", safe(({ code, name }) => {
      if (!code) return socket.emit("monopoly-error", { message: "Invalid room code." });
      const room = monopolyRooms.get(code.toUpperCase());
      if (!room) return socket.emit("monopoly-error", { message: "Room not found." });
      if (room.phase !== "lobby") return socket.emit("monopoly-error", { message: "Game already in progress." });
      if (room.players.size >= 6) return socket.emit("monopoly-error", { message: "Room is full (6 players max)." });
      joinMonopolyRoom(socket, room, name || "Player");
    }));

    socket.on("monopoly-rejoin", safe(({ roomCode, name }) => {
      const room = monopolyRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("monopoly-rejoin-failed");
      joinMonopolyRoom(socket, room, name || "Player");
      socket.emit("monopoly-rejoined", { code: room.code, roomState: room.getRoomState() });
      if (room.phase === "playing") {
        socket.emit("monopoly-state-sync", { gameState: room.getGameState() });
      }
    }));

    socket.on("monopoly-start-game", safe((settings = {}) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (!room) return;
      const result = room.startGame(settings);
      if (result?.error) socket.emit("monopoly-error", result);
    }));

    socket.on("monopoly-roll", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleRoll(socket.id);
    }));

    socket.on("monopoly-buy", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleBuy(socket.id);
    }));

    socket.on("monopoly-decline-buy", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleDeclineBuy(socket.id);
    }));

    socket.on("monopoly-auction-bid", safe(({ amount }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && amount) room.handleBid(socket.id, amount);
    }));

    socket.on("monopoly-auction-pass", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleAuctionPass(socket.id);
    }));

    socket.on("monopoly-build", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && propertyIndex !== undefined) room.handleBuild(socket.id, propertyIndex);
    }));

    socket.on("monopoly-sell-building", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && propertyIndex !== undefined) room.handleSellBuilding(socket.id, propertyIndex);
    }));

    socket.on("monopoly-mortgage", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && propertyIndex !== undefined) room.handleMortgage(socket.id, propertyIndex);
    }));

    socket.on("monopoly-unmortgage", safe(({ propertyIndex }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && propertyIndex !== undefined) room.handleUnmortgage(socket.id, propertyIndex);
    }));

    socket.on("monopoly-trade-offer", safe(({ toId, offering, requesting }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && toId) room.handleTradeOffer(socket.id, toId, offering || {}, requesting || {});
    }));

    socket.on("monopoly-trade-respond", safe(({ accept }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleTradeResponse(socket.id, !!accept);
    }));

    socket.on("monopoly-trade-cancel", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleTradeCancel(socket.id);
    }));

    socket.on("monopoly-jail-decision", safe(({ choice }) => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && choice) room.handleJailDecision(socket.id, choice);
    }));

    socket.on("monopoly-end-turn", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleEndTurn(socket.id);
    }));

    socket.on("monopoly-debt-give-up", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room) room.handleDebtGiveUp(socket.id);
    }));

    socket.on("monopoly-get-state", safe(() => {
      const room = monopolyRooms.get(currentMonopolyCode);
      if (room && room.phase === "playing") {
        socket.emit("monopoly-state-sync", { gameState: room.getGameState() });
      }
    }));

    function joinMonopolyRoom(sock, room, name) {
      currentMonopolyCode = room.code;
      sock.join(room.code);
      const player = new MonopolyPlayer(sock.id, name);
      room.addPlayer(player);
      sock.emit("monopoly-joined-room", { code: room.code, roomState: room.getRoomState() });
    }

    // -- Kart Clash handlers --
    let currentKartCode = null;

    socket.on("kart-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) code = generateCode();
      const room = new KartArena(code, io);
      kartRooms.set(code, room);
      joinKartRoom(socket, room, name || "Racer");
    }));

    socket.on("kart-join-room", safe(({ code, name }) => {
      if (!code) return socket.emit("kart-error", { message: "Invalid room code." });
      const room = kartRooms.get(code.toUpperCase());
      if (!room) return socket.emit("kart-error", { message: "Room not found." });
      joinKartRoom(socket, room, name || "Racer");
    }));

    socket.on("kart-rejoin", safe(({ roomCode, name }) => {
      const room = kartRooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("kart-rejoin-failed");
      joinKartRoom(socket, room, name || "Racer", "kart-rejoined");
    }));

    socket.on("kart-input", safe((input) => {
      const room = kartRooms.get(currentKartCode);
      if (room) room.setInput(socket.id, input);
    }));

    socket.on("kart-ping", safe((_sentAt, callback) => {
      if (typeof callback === "function") callback(Date.now());
    }));

    socket.on("kart-leave", safe(() => {
      const room = kartRooms.get(currentKartCode);
      if (!room) return;
      socket.leave(room.channel);
      room.removePlayer(socket.id);
      if (room.isEmpty()) {
        room.stop();
        kartRooms.delete(currentKartCode);
      }
      currentKartCode = null;
    }));

    function joinKartRoom(sock, room, name, eventName = "kart-joined-room") {
      if (currentKartCode && currentKartCode !== room.code) {
        const oldRoom = kartRooms.get(currentKartCode);
        if (oldRoom) oldRoom.removePlayer(sock.id);
        sock.leave(`kart-${currentKartCode}`);
      }
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
  });
}
