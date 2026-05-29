import { useEffect } from "react";
import { getSocket } from "../hooks/useSocket";
import { useKartStore } from "./kartStore";

export function useKartSocket(enabled) {
  const joined = useKartStore((state) => state.joined);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = getSocket();

    function onConnect() {
      useKartStore.getState().setConnected(true);
    }
    function onDisconnect() {
      useKartStore.getState().setConnected(false);
    }
    function onJoined({ playerId, snapshot }) {
      useKartStore.getState().setJoined(playerId, snapshot);
    }
    function onSnapshot(snapshot) {
      useKartStore.getState().setSnapshot(snapshot);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("kart-joined-room", onJoined);
    socket.on("kart-rejoined", onJoined);
    socket.on("kart-snapshot", onSnapshot);

    if (socket.connected) onConnect();
    else socket.connect();

    const inputTimer = setInterval(() => {
      const state = useKartStore.getState();
      if (socket.connected && state.joined) socket.emit("kart-input", state.input);
    }, 1000 / 30);

    const latencyTimer = setInterval(() => {
      const sent = performance.now();
      socket.timeout(1200).emit("kart-ping", sent, () => {
        useKartStore.getState().setLatency(Math.round(performance.now() - sent));
      });
    }, 1800);

    return () => {
      clearInterval(inputTimer);
      clearInterval(latencyTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("kart-joined-room", onJoined);
      socket.off("kart-rejoined", onJoined);
      socket.off("kart-snapshot", onSnapshot);
    };
  }, [enabled]);

  return joined;
}
