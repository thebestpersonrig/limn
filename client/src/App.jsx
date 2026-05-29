import { Suspense, lazy, useEffect, useRef, useState } from "react";
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
import MonopolyHome from "./pages/MonopolyHome";
import MonopolyRoomPage from "./pages/MonopolyRoomPage";
import { getSocket, saveSession, clearSession, getSession, getSavedName, savePlayerName } from "./hooks/useSocket";
import "./App.css";

const KartHome = lazy(() => import("./pages/KartHome"));
const KartRoomPage = lazy(() => import("./pages/KartRoomPage"));

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [playerName,   setPlayerName]   = useState(() => getSavedName());
  const [sessionData,  setSessionData]  = useState(null);
  const [roundData,    setRoundData]    = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [mafiaEnd,     setMafiaEnd]     = useState(null);
  const [mafiaRole,    setMafiaRole]    = useState(null);
  const [monopolyEnd,  setMonopolyEnd]  = useState(null);
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
      if (!session || path === "/" || path === "/limn" || path === "/mafia" || path === "/monopoly" || path === "/kart") return;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", { roomCode: session.roomCode, name: session.name });
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", { roomCode: session.roomCode, name: session.name });
      } else if (session.gameType === "kart") {
        s.emit("kart-rejoin", { roomCode: session.roomCode, name: session.name });
      } else {
        s.emit("rejoin", session);
      }
    }

    function onDisconnect() { setConnected(false); }
    function onRejoinFailed() { clearSession(); navigate("/"); }
    function onMafiaRejoinFailed() { clearSession(); navigate("/"); }
    function onMonopolyRejoinFailed() { clearSession(); navigate("/"); }
    function onKartRejoinFailed() { clearSession(); navigate("/"); }

    s.on("round-start",              onRoundStart);
    s.on("game-end",                 onGameEndEvent);
    s.on("connect",                  onConnect);
    s.on("disconnect",               onDisconnect);
    s.on("rejoin-failed",            onRejoinFailed);
    s.on("mafia-rejoin-failed",      onMafiaRejoinFailed);
    s.on("monopoly-rejoin-failed",   onMonopolyRejoinFailed);
    s.on("kart-rejoin-failed",       onKartRejoinFailed);
    return () => {
      s.off("round-start",            onRoundStart);
      s.off("game-end",               onGameEndEvent);
      s.off("connect",                onConnect);
      s.off("disconnect",             onDisconnect);
      s.off("rejoin-failed",          onRejoinFailed);
      s.off("mafia-rejoin-failed",    onMafiaRejoinFailed);
      s.off("monopoly-rejoin-failed", onMonopolyRejoinFailed);
      s.off("kart-rejoin-failed",     onKartRejoinFailed);
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

  // ── Global socket wiring (Monopoly) ──────────────────────
  useEffect(() => {
    const s = getSocket();

    function onMonopolyGameStart() {
      setGamePhase("game");
    }
    function onMonopolyGameEnd({ winnerId, standings }) {
      setMonopolyEnd({ winnerId, standings });
      setGamePhase("end");
      clearSession();
    }

    s.on("monopoly-game-start", onMonopolyGameStart);
    s.on("monopoly-game-end",   onMonopolyGameEnd);
    return () => {
      s.off("monopoly-game-start", onMonopolyGameStart);
      s.off("monopoly-game-end",   onMonopolyGameEnd);
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
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", { roomCode: session.roomCode, name: session.name });
      } else if (session.gameType === "kart") {
        s.emit("kart-rejoin", { roomCode: session.roomCode, name: session.name });
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
    function onMonopolyRejoined({ code, roomState }) {
      setSessionData({ code, roomState, playerName: session.name });
      setGamePhase("lobby");
      navigate(`/monopoly/${code}`, { replace: true });
    }
    function onKartRejoined({ code, roomState, playerId, snapshot }) {
      setSessionData({ code, roomState, playerName: session.name, playerId, snapshot });
      setGamePhase("game");
      navigate(`/kart/${code}`, { replace: true });
    }

    s.once("rejoined", onRejoined);
    s.once("mafia-rejoined", onMafiaRejoined);
    s.once("monopoly-rejoined", onMonopolyRejoined);
    s.once("kart-rejoined", onKartRejoined);
    if (s.connected) { doRejoin(); }
    else { s.connect(); s.once("connect", doRejoin); }

    return () => {
      s.off("rejoined", onRejoined);
      s.off("mafia-rejoined", onMafiaRejoined);
      s.off("monopoly-rejoined", onMonopolyRejoined);
      s.off("kart-rejoined", onKartRejoined);
    };
  }, [navigate]);

  // ── Handlers ─────────────────────────────────────────────
  function handleNameChange(name) {
    savePlayerName(name);
    setPlayerName(name);
  }

  function handleSelectGame(id) {
    if (id === "limn")     navigate("/limn");
    if (id === "mafia")    navigate("/mafia");
    if (id === "monopoly") navigate("/monopoly");
    if (id === "kart")     navigate("/kart");
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

  function handleMonopolyJoined({ code, roomState }) {
    setSessionData({ code, roomState, playerName });
    setGamePhase("lobby");
    saveSession(playerName, code, "monopoly");
    navigate(`/monopoly/${code}`);
  }

  function handleKartJoined({ code, roomState, playerId, snapshot }) {
    setSessionData({ code, roomState, playerName, playerId, snapshot });
    setGamePhase("game");
    saveSession(playerName, code, "kart");
    navigate(`/kart/${code}`);
  }

  function handleBackToHub() {
    clearSession();
    setSessionData(null);
    setRoundData(null);
    setFinalPlayers(null);
    setMafiaEnd(null);
    setMafiaRole(null);
    setMonopolyEnd(null);
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

  function handleMonopolyPlayAgain() {
    clearSession();
    setSessionData(null);
    setMonopolyEnd(null);
    setGamePhase("lobby");
    navigate("/monopoly");
  }

  const path = location.pathname;
  const isInRoom = path.match(/^\/(limn|mafia|monopoly|kart)\/[A-Z0-9]+$/i);
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

        {/* ── Monopoly ── */}
        <Route
          path="/monopoly"
          element={
            <MonopolyHome
              playerName={playerName}
              onJoined={handleMonopolyJoined}
              onBack={() => navigate("/")}
            />
          }
        />
        <Route
          path="/monopoly/:code"
          element={
            <MonopolyRoomPage
              sessionData={sessionData}
              gamePhase={gamePhase}
              monopolyEnd={monopolyEnd}
              playerName={playerName}
              onJoined={handleMonopolyJoined}
              onPlayAgain={handleMonopolyPlayAgain}
              onBackToHub={handleBackToHub}
            />
          }
        />

        <Route
          path="/kart"
          element={
            <Suspense fallback={<div className="route-loading">Loading Kart Clash...</div>}>
              <KartHome
                playerName={playerName}
                onJoined={handleKartJoined}
                onBack={() => navigate("/")}
              />
            </Suspense>
          }
        />
        <Route
          path="/kart/:code"
          element={
            <Suspense fallback={<div className="route-loading">Loading Kart Clash...</div>}>
              <KartRoomPage
                sessionData={sessionData}
                playerName={playerName}
                onJoined={handleKartJoined}
                onBackToHub={handleBackToHub}
              />
            </Suspense>
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
