import { useEffect, useRef, useState } from "react";
import Hub from "./pages/Hub";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import GameEnd from "./pages/GameEnd";
import { getSocket, saveSession, clearSession, getSession } from "./hooks/useSocket";
import "./App.css";

export default function App() {
  const [screen,       setScreen]       = useState("hub");
  const [sessionData,  setSessionData]  = useState(null);
  const [roundData,    setRoundData]    = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [connected,    setConnected]    = useState(true);
  const screenRef = useRef(screen);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ── Global socket wiring ─────────────────────────────────
  useEffect(() => {
    const s = getSocket();

    // round-start lives here so it fires whether coming from lobby or rejoin
    function onRoundStart(data) {
      setRoundData(data);
      setScreen("game");
    }
    function onGameEndEvent({ players }) {
      setFinalPlayers(players);
      setScreen("end");
      clearSession();
    }
    function onDisconnect()  { setConnected(false); }
    function onReconnect()   {
      setConnected(true);
      const session = getSession();
      if (session && screenRef.current !== "home" && screenRef.current !== "end") {
        s.emit("rejoin", session);
      }
    }
    function onRejoinFailed() { clearSession(); setScreen("hub"); }

    s.on("round-start",    onRoundStart);
    s.on("game-end",       onGameEndEvent);
    s.on("disconnect",     onDisconnect);
    s.on("reconnect",      onReconnect);
    s.on("rejoin-failed",  onRejoinFailed);
    return () => {
      s.off("round-start",   onRoundStart);
      s.off("game-end",      onGameEndEvent);
      s.off("disconnect",    onDisconnect);
      s.off("reconnect",     onReconnect);
      s.off("rejoin-failed", onRejoinFailed);
    };
  }, []);

  // ── Auto-rejoin on page load ─────────────────────────────
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    const s = getSocket();

    function doRejoin() { s.emit("rejoin", session); }

    function onRejoined({ code, roomState }) {
      setSessionData({ code, roomState, playerName: session.name });
      setScreen("lobby"); // skip hub on successful rejoin
      // If game is in progress the server also fires "round-start",
      // which the global listener above will catch and navigate to game.
    }

    s.once("rejoined", onRejoined);
    if (s.connected) { doRejoin(); }
    else { s.connect(); s.once("connect", doRejoin); }

    return () => { s.off("rejoined", onRejoined); };
  }, []);

  // ── Handlers ─────────────────────────────────────────────
  function handleJoined({ code, roomState, playerName }) {
    setSessionData({ code, roomState, playerName });
    saveSession(playerName, code);
    // Put code in hash so the link is shareable
    window.location.hash = `join/${code}`;
    setScreen("lobby");
  }

  function handleSelectGame(id) {
    // id is e.g. "limn" — route to that game's home screen
    if (id === "limn") setScreen("home");
  }

  function handleBackToHub() {
    clearSession();
    window.location.hash = "";
    setScreen("hub");
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
  }

  function handlePlayAgain() {
    clearSession();
    window.location.hash = "";
    setScreen("home");
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
  }

  return (
    <>
      {screen === "hub"   && <Hub onSelectGame={handleSelectGame} />}
      {screen === "home"  && <Home onJoined={handleJoined} onBack={() => setScreen("hub")} />}
      {screen === "lobby" && sessionData && (
        <Lobby
          code={sessionData.code}
          roomState={sessionData.roomState}
          playerName={sessionData.playerName}
        />
      )}
      {screen === "game"  && <Game initialRoundData={roundData} />}
      {screen === "end"   && <GameEnd players={finalPlayers ?? []} onPlayAgain={handlePlayAgain} onBackToHub={handleBackToHub} />}

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
