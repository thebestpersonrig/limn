import { GameRoom } from "../game/GameRoom.js";
import { Player } from "../game/Player.js";

const rooms = new Map();

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function registerHandlers(io) {
  io.on("connection", (socket) => {
    let currentRoomCode = null;

    socket.on("create-room", ({ name }) => {
      let code = generateCode();
      while (rooms.has(code)) code = generateCode();
      const room = new GameRoom(code, io);
      rooms.set(code, room);
      joinRoom(socket, room, name);
      socket.emit("room-created", { code });
    });

    socket.on("join-room", ({ code, name }) => {
      const room = rooms.get(code.toUpperCase());
      if (!room) return socket.emit("error", { message: "Room not found." });
      if (room.state !== "lobby") return socket.emit("error", { message: "Game already in progress." });
      joinRoom(socket, room, name);
    });

    socket.on("rejoin", ({ name, roomCode }) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return socket.emit("rejoin-failed");
      joinRoom(socket, room, name);
      // Send current game state if mid-round
      if (room.state === "drawing" || room.state === "choosing") {
        socket.emit("round-start", {
          round: room.round,
          totalRounds: room.roundsPerGame * room.drawerQueue.length,
          roundDuration: room.roundDuration,
          drawerId: room.currentDrawerId,
          players: room.getPlayersArray(),
        });
      }
    });

    socket.on("start-game", (settings = {}) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const result = room.startGame(settings);
      if (result?.error) socket.emit("error", result);
    });

    socket.on("choose-word", ({ word }) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId) room.wordChosen(word);
    });

    socket.on("draw", (data) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-update", data);
    });

    socket.on("draw-shape", (data) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-shape", data);
    });

    socket.on("draw-fill", (data) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("draw-fill", data);
    });

    socket.on("canvas-undo", ({ imageData }) => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("canvas-restore", { imageData });
    });

    socket.on("canvas-sync", ({ imageData, forSocket }) => {
      io.to(forSocket).emit("canvas-restore", { imageData });
    });

    socket.on("clear-canvas", () => {
      const room = rooms.get(currentRoomCode);
      if (room && socket.id === room.currentDrawerId)
        socket.to(currentRoomCode).emit("canvas-cleared");
    });

    socket.on("guess", ({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (room) room.handleGuess(socket.id, text);
    });

    socket.on("chat", ({ text }) => {
      const room = rooms.get(currentRoomCode);
      if (room) room.handleChat(socket.id, text);
    });

    socket.on("disconnect", () => {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.removePlayer(socket.id);
        if (room.isEmpty()) rooms.delete(currentRoomCode);
      }
    });

    function joinRoom(socket, room, name) {
      currentRoomCode = room.code;
      socket.join(room.code);
      const player = new Player(socket.id, name);
      room.addPlayer(player);
      socket.emit("joined-room", { code: room.code, roomState: room.getRoomState() });

      // Request canvas state from drawer for late/rejoining players
      if (room.state === "drawing" && room.currentDrawerId) {
        io.to(room.currentDrawerId).emit("sync-canvas-request", { forSocket: socket.id });
      }
    }
  });
}
