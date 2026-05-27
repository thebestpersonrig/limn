import { useEffect, useRef, useState } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import GameEnd from "./pages/GameEnd";
import { getSocket, saveSession, clearSession, getSession } from "./hooks/useSocket";
import "./App.css";

export default function App() {
  const [screen,       setScreen]       = useState("home");
  const [sessionData,  setSessionData]  = useState(null);
  const [roundData,    setRoundData]    = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [connected,    setConnected]    = useState(true);
  const screenRef = useRef(screen);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    const s = getSocket();

    function onDisconnect() { setConnected(false); }

    function onReconnect() {
      setConnected(true);
      const session = getSession();
      if (session && screenRef.current !== "home" && screenRef.current !== "end") {
        s.emit("rejoin", session);
      }
    }

    function onRejoinFailed() {
      clearSession();
      setScreen("home");
    }

    s.on("disconnect",    onDisconnect);
    s.on("reconnect",     onReconnect);
    s.on("rejoin-failed", onRejoinFailed);
    return () => {
      s.off("disconnect",    onDisconnect);
      s.off("reconnect",     onReconnect);
      s.off("rejoin-failed", onRejoinFailed);
    };
  }, []);

  function handleJoined({ code, roomState, playerName }) {
    setSessionData({ code, roomState, playerName });
    saveSession(playerName, code);
    setScreen("lobby");
  }

  function handleGameStart(data) {
    setRoundData(data);
    setScreen("game");
  }

  function handleGameEnd(players) {
    setFinalPlayers(players);
    setScreen("end");
  }

  function handlePlayAgain() {
    clearSession();
    setScreen("home");
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
  }

  return (
    <>
      {screen === "home"  && <Home onJoined={handleJoined} />}
      {screen === "lobby" && (
        <Lobby
          code={sessionData.code}
          roomState={sessionData.roomState}
          playerName={sessionData.playerName}
          onGameStart={handleGameStart}
        />
      )}
      {screen === "game"  && <Game initialRoundData={roundData} onGameEnd={handleGameEnd} />}
      {screen === "end"   && <GameEnd players={finalPlayers ?? []} onPlayAgain={handlePlayAgain} />}

      {!connected && screen !== "home" && (
        <div className="disconnect-overlay">
          <div className="disconnect-box">
            <div className="disconnect-spinner" />
            <span>Reconnecting…</span>
          </div>
        </div>
      )}
    </>
  );
}
