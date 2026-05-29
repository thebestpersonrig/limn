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

    /* ─────────────────────────────
       LIMN GAME
    ───────────────────────────── */

    socket.on("create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) {
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

    /* ─────────────────────────────
       MAFIA GAME
    ───────────────────────────── */

    socket.on("mafia-create-room", safe(({ name, roleConfig }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) {
        code = generateCode();
      }

      const room = new MafiaRoom(code, io);
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

    /* ─────────────────────────────
       MONOPOLY GAME
    ───────────────────────────── */

    socket.on("monopoly-create-room", safe(({ name, settings }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) {
        code = generateCode();
      }

      const room = new MonopolyRoom(code, io);
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

    /* ─────────────────────────────
       KART GAME
    ───────────────────────────── */

    socket.on("kart-create-room", safe(({ name }) => {
      let code = generateCode();
      while (rooms.has(code) || mafiaRooms.has(code) || monopolyRooms.has(code) || kartRooms.has(code)) {
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
  });
}