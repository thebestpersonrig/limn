import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io("http://localhost:3001", { autoConnect: false });
  }
  return socket;
}
