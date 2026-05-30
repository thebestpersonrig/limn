import { io } from "socket.io-client";

let SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
// Ensure protocol is present (common env-var typo)
if (SERVER_URL && !/^https?:\/\//.test(SERVER_URL)) {
  SERVER_URL = `https://${SERVER_URL}`;
}

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      pingTimeout: 30000,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function savePlayerName(name) {
  localStorage.setItem("romp_player_name", name);
}

export function getSavedName() {
  return localStorage.getItem("romp_player_name") ?? "";
}

export function saveSession(name, roomCode, gameType = "limn") {
  savePlayerName(name);
  localStorage.setItem("limn_session", JSON.stringify({ name, roomCode, gameType }));
}


export function clearSession() {
  localStorage.removeItem("limn_session");
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("limn_session") ?? "null");
  } catch { return null; }
}
