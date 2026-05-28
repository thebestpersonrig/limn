import { GameRoom } from "../game/GameRoom.js";
import { Player } from "../game/Player.js";
import { MafiaRoom } from "../game/MafiaRoom.js";
import { MafiaPlayer } from "../game/MafiaPlayer.js";

const rooms = new Map();
const mafiaRooms = new Map();

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
      while (rooms.has(code)) code = generateCode();
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
      while (mafiaRooms.has(code) || rooms.has(code)) code = generateCode();
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
  });
}
