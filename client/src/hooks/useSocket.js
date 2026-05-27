import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      pingTimeout: 30000,
    });
  }
  return socket;
}

export function saveSession(name, roomCode) {
  localStorage.setItem("limn_session", JSON.stringify({ name, roomCode }));
}

export function clearSession() {
  localStorage.removeItem("limn_session");
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("limn_session") ?? "null");
  } catch { return null; }
}
