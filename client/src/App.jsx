import { useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Hub from "./pages/Hub";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import GameEnd from "./pages/GameEnd";
import MafiaHome from "./pages/MafiaHome";
import MafiaLobby from "./pages/MafiaLobby";
import MafiaGame from "./pages/MafiaGame";
import MafiaEnd from "./pages/MafiaEnd";
import LimnRoom from "./pages/LimnRoom";
import MafiaRoomPage from "./pages/MafiaRoomPage";
import { getSocket, saveSession, clearSession, getSession, getSavedName, savePlayerName } from "./hooks/useSocket";
import "./App.css";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [playerName,   setPlayerName]   = useState(() => getSavedName());
  const [sessionData,  setSessionData]  = useState(null);
  const [roundData,    setRoundData]    = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [mafiaEnd,     setMafiaEnd]     = useState(null);
  const [mafiaRole,    setMafiaRole]    = useState(null);
  const [connected,    setConnected]    = useState(true);
  const [gamePhase,    setGamePhase]    = useState("lobby"); // lobby | game | end

  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  // ── Global socket wiring (Limn + reconnect) ──────────────
  const wasConnected = useRef(false);

  useEffect(() => {
    const s = getSocket();

    function onRoundStart(data) {
      setRoundData(data);
      setGamePhase("game");
    }
    function onGameEndEvent({ players }) {
      setFinalPlayers(players);
      setGamePhase("end");
      clearSession();
    }

    function onConnect() {
      setConnected(true);
      if (!wasConnected.current) {
        wasConnected.current = true;
        return;
      }
      const session = getSession();
      const path = locationRef.current.pathname;
      if (!session || path === "/" || path === "/limn" || path === "/mafia") return;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", { roomCode: session.roomCode, name: session.name });
      } else {
        s.emit("rejoin", session);
      }
    }

    function onDisconnect() { setConnected(false); }
    function onRejoinFailed() { clearSession(); navigate("/"); }
    function onMafiaRejoinFailed() { clearSession(); navigate("/"); }

    s.on("round-start",          onRoundStart);
    s.on("game-end",             onGameEndEvent);
    s.on("connect",              onConnect);
    s.on("disconnect",           onDisconnect);
    s.on("rejoin-failed",        onRejoinFailed);
    s.on("mafia-rejoin-failed",  onMafiaRejoinFailed);
    return () => {
      s.off("round-start",          onRoundStart);
      s.off("game-end",             onGameEndEvent);
      s.off("connect",              onConnect);
      s.off("disconnect",           onDisconnect);
      s.off("rejoin-failed",        onRejoinFailed);
      s.off("mafia-rejoin-failed",  onMafiaRejoinFailed);
    };
  }, [navigate]);

  // ── Global socket wiring (Mafia) ─────────────────────────
  useEffect(() => {
    const s = getSocket();

    function onMafiaRoleAssigned({ role, mafiaTeam }) {
      setMafiaRole({ role, mafiaTeam });
    }
    function onMafiaPhase({ phase }) {
      if (phase === "roleReveal") {
        setGamePhase("game");
      }
    }
    function onMafiaGameEnd({ winner, players }) {
      setMafiaEnd({ winner, players });
      setGamePhase("end");
      clearSession();
    }

    s.on("mafia-role-assigned", onMafiaRoleAssigned);
    s.on("mafia-phase",         onMafiaPhase);
    s.on("mafia-game-end",      onMafiaGameEnd);
    return () => {
      s.off("mafia-role-assigned", onMafiaRoleAssigned);
      s.off("mafia-phase",         onMafiaPhase);
      s.off("mafia-game-end",      onMafiaGameEnd);
    };
  }, []);

  // ── Auto-rejoin on page load ─────────────────────────────
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    const s = getSocket();

    function doRejoin() {
      wasConnected.current = true;
      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", { roomCode: session.roomCode, name: session.name });
      } else {
        s.emit("rejoin", session);
      }
    }

    function onRejoined({ code, roomState }) {
      setSessionData({ code, roomState, playerName: session.name });
      setGamePhase("lobby");
      navigate(`/limn/${code}`, { replace: true });
    }
    function onMafiaRejoined({ code, roomState }) {
      setSessionData({ code, roomState, playerName: session.name });
      setGamePhase("lobby");
      navigate(`/mafia/${code}`, { replace: true });
    }

    s.once("rejoined", onRejoined);
    s.once("mafia-rejoined", onMafiaRejoined);
    if (s.connected) { doRejoin(); }
    else { s.connect(); s.once("connect", doRejoin); }

    return () => {
      s.off("rejoined", onRejoined);
      s.off("mafia-rejoined", onMafiaRejoined);
    };
  }, [navigate]);

  // ── Handlers ─────────────────────────────────────────────
  function handleNameChange(name) {
    savePlayerName(name);
    setPlayerName(name);
  }

  function handleSelectGame(id) {
    if (id === "limn")  navigate("/limn");
    if (id === "mafia") navigate("/mafia");
  }

  function handleJoined({ code, roomState }) {
    setSessionData({ code, roomState, playerName });
    setGamePhase("lobby");
    saveSession(playerName, code, "limn");
    navigate(`/limn/${code}`);
  }

  function handleMafiaJoined({ code, roomState }) {
    setSessionData({ code, roomState, playerName });
    setGamePhase("lobby");
    saveSession(playerName, code, "mafia");
    navigate(`/mafia/${code}`);
  }

  function handleBackToHub() {
    clearSession();
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
    setMafiaEnd(null);
    setMafiaRole(null);
    setGamePhase("lobby");
    navigate("/");
  }

  function handlePlayAgain() {
    clearSession();
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
    setGamePhase("lobby");
    navigate("/limn");
  }

  function handleMafiaPlayAgain() {
    clearSession();
    setSessionData(null);
    setMafiaEnd(null);
    setMafiaRole(null);
    setGamePhase("lobby");
    navigate("/mafia");
  }

  // Determine if the disconnect overlay should show
  const path = location.pathname;
  const isInRoom = path.match(/^\/(limn|mafia)\/[A-Z0-9]+$/i);
  const showDisconnect = !connected && isInRoom;

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <Hub
              playerName={playerName}
              onNameChange={handleNameChange}
              onSelectGame={handleSelectGame}
            />
          }
        />

        {/* ── Limn ── */}
        <Route
          path="/limn"
          element={
            <Home
              playerName={playerName}
              onJoined={handleJoined}
              onBack={() => navigate("/")}
            />
          }
        />
        <Route
          path="/limn/:code"
          element={
            <LimnRoom
              sessionData={sessionData}
              gamePhase={gamePhase}
              roundData={roundData}
              finalPlayers={finalPlayers}
              playerName={playerName}
              onJoined={handleJoined}
              onPlayAgain={handlePlayAgain}
              onBackToHub={handleBackToHub}
            />
          }
        />

        {/* ── Mafia ── */}
        <Route
          path="/mafia"
          element={
            <MafiaHome
              playerName={playerName}
              onJoined={handleMafiaJoined}
              onBack={() => navigate("/")}
            />
          }
        />
        <Route
          path="/mafia/:code"
          element={
            <MafiaRoomPage
              sessionData={sessionData}
              gamePhase={gamePhase}
              roundData={roundData}
              mafiaEnd={mafiaEnd}
              mafiaRole={mafiaRole}
              playerName={playerName}
              onJoined={handleMafiaJoined}
              onPlayAgain={handleMafiaPlayAgain}
              onBackToHub={handleBackToHub}
            />
          }
        />

        {/* Fallback */}
        <Route path="*" element={
          <Hub
            playerName={playerName}
            onNameChange={handleNameChange}
            onSelectGame={handleSelectGame}
          />
        } />
      </Routes>

      {showDisconnect && (
        <div className="disconnect-overlay">
          <div className="disconnect-box">
            <div className="disconnect-spinner" />
            <span>Reconnecting…</span>
            <button className="disconnect-bail" onClick={handleBackToHub}>
              Back to Hub
            </button>
          </div>
        </div>
      )}
    </>
  );
}
