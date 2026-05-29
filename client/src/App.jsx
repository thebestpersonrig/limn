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

import {
  getSocket,
  saveSession,
  clearSession,
  getSession,
  getSavedName,
  savePlayerName
} from "./hooks/useSocket";

import "./App.css";

const KartHome = lazy(() => import("./pages/KartHome"));
const KartRoomPage = lazy(() => import("./pages/KartRoomPage"));

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [playerName, setPlayerName] = useState(() => getSavedName());
  const [sessionData, setSessionData] = useState(null);
  const [roundData, setRoundData] = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [mafiaEnd, setMafiaEnd] = useState(null);
  const [mafiaRole, setMafiaRole] = useState(null);
  const [monopolyEnd, setMonopolyEnd] = useState(null);
  const [connected, setConnected] = useState(true);
  const [gamePhase, setGamePhase] = useState("lobby");

  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const wasConnected = useRef(false);

  // ─────────────────────────────────────────────
  // 🔒 GLOBAL ROOM VALIDATION (FIX)
  // ─────────────────────────────────────────────
  function isValidRoom(roomState) {
    if (!roomState) return false;

    return (
      roomState.status !== "ended" &&
      roomState.gameOver !== true &&
      roomState.ended !== true
    );
  }

  // ─────────────────────────────────────────────
  // SOCKET CORE EVENTS
  // ─────────────────────────────────────────────
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

      if (
        !session ||
        path === "/" ||
        path === "/limn" ||
        path === "/mafia" ||
        path === "/monopoly" ||
        path === "/kart"
      )
        return;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", session);
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", session);
      } else if (session.gameType === "kart") {
        s.emit("kart-rejoin", session);
      } else {
        s.emit("rejoin", session);
      }
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onRejoinFailed() {
      clearSession();
      navigate("/");
    }

    s.on("round-start", onRoundStart);
    s.on("game-end", onGameEndEvent);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    s.on("rejoin-failed", onRejoinFailed);
    s.on("mafia-rejoin-failed", onRejoinFailed);
    s.on("monopoly-rejoin-failed", onRejoinFailed);
    s.on("kart-rejoin-failed", onRejoinFailed);

    return () => {
      s.off("round-start", onRoundStart);
      s.off("game-end", onGameEndEvent);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);

      s.off("rejoin-failed", onRejoinFailed);
      s.off("mafia-rejoin-failed", onRejoinFailed);
      s.off("monopoly-rejoin-failed", onRejoinFailed);
      s.off("kart-rejoin-failed", onRejoinFailed);
    };
  }, [navigate]);

  // ─────────────────────────────────────────────
  // MAFIA EVENTS
  // ─────────────────────────────────────────────
  useEffect(() => {
    const s = getSocket();

    function onMafiaRoleAssigned({ role, mafiaTeam }) {
      setMafiaRole({ role, mafiaTeam });
    }

    function onMafiaPhase({ phase }) {
      if (phase === "roleReveal") setGamePhase("game");
    }

    function onMafiaGameEnd({ winner, players }) {
      setMafiaEnd({ winner, players });
      setGamePhase("end");
      clearSession();
    }

    s.on("mafia-role-assigned", onMafiaRoleAssigned);
    s.on("mafia-phase", onMafiaPhase);
    s.on("mafia-game-end", onMafiaGameEnd);

    return () => {
      s.off("mafia-role-assigned", onMafiaRoleAssigned);
      s.off("mafia-phase", onMafiaPhase);
      s.off("mafia-game-end", onMafiaGameEnd);
    };
  }, []);

  // ─────────────────────────────────────────────
  // MONOPOLY EVENTS
  // ─────────────────────────────────────────────
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
    s.on("monopoly-game-end", onMonopolyGameEnd);

    return () => {
      s.off("monopoly-game-start", onMonopolyGameStart);
      s.off("monopoly-game-end", onMonopolyGameEnd);
    };
  }, []);

  // ─────────────────────────────────────────────
  // AUTO REJOIN (FIXED WITH VALIDATION)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    const s = getSocket();

    function doRejoin() {
      wasConnected.current = true;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", session);
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", session);
      } else if (session.gameType === "kart") {
        s.emit("kart-rejoin", session);
      } else {
        s.emit("rejoin", session);
      }
    }

    function safeNavigate(roomState, path, extraData = {}) {
      if (!isValidRoom(roomState)) {
        clearSession();
        navigate("/", { replace: true });
        return;
      }

      setSessionData({
        code: extraData.code,
        roomState,
        playerName: session.name,
        ...extraData
      });

      setGamePhase(extraData.phase || "lobby");
      navigate(path, { replace: true });
    }

    function onRejoined({ code, roomState }) {
      safeNavigate(roomState, `/limn/${code}`, { code });
    }

    function onMafiaRejoined({ code, roomState }) {
      safeNavigate(roomState, `/mafia/${code}`, { code });
    }

    function onMonopolyRejoined({ code, roomState }) {
      safeNavigate(roomState, `/monopoly/${code}`, { code });
    }

    function onKartRejoined({ code, roomState, playerId, snapshot }) {
      if (!isValidRoom(roomState)) {
        clearSession();
        navigate("/");
        return;
      }

      setSessionData({
        code,
        roomState,
        playerName: session.name,
        playerId,
        snapshot
      });

      setGamePhase("game");
      navigate(`/kart/${code}`, { replace: true });
    }

    s.once("rejoined", onRejoined);
    s.once("mafia-rejoined", onMafiaRejoined);
    s.once("monopoly-rejoined", onMonopolyRejoined);
    s.once("kart-rejoined", onKartRejoined);

    if (s.connected) doRejoin();
    else {
      s.connect();
      s.once("connect", doRejoin);
    }

    return () => {
      s.off("rejoined", onRejoined);
      s.off("mafia-rejoined", onMafiaRejoined);
      s.off("monopoly-rejoined", onMonopolyRejoined);
      s.off("kart-rejoined", onKartRejoined);
    };
  }, [navigate]);

  // ─────────────────────────────────────────────
  // HANDLERS (UNCHANGED LOGIC)
  // ─────────────────────────────────────────────
  function handleNameChange(name) {
    savePlayerName(name);
    setPlayerName(name);
  }

  function handleSelectGame(id) {
    if (id === "limn") navigate("/limn");
    if (id === "mafia") navigate("/mafia");
    if (id === "monopoly") navigate("/monopoly");
    if (id === "kart") navigate("/kart");
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

        <Route path="/limn" element={<Home playerName={playerName} />} />
        <Route path="/limn/:code" element={<LimnRoom sessionData={sessionData} />} />

        <Route path="/mafia" element={<MafiaHome playerName={playerName} />} />
        <Route path="/mafia/:code" element={<MafiaRoomPage sessionData={sessionData} />} />

        <Route path="/monopoly" element={<MonopolyHome playerName={playerName} />} />
        <Route path="/monopoly/:code" element={<MonopolyRoomPage sessionData={sessionData} />} />

        <Route
          path="/kart"
          element={
            <Suspense fallback={<div>Loading Kart...</div>}>
              <KartHome playerName={playerName} />
            </Suspense>
          }
        />

        <Route
          path="/kart/:code"
          element={
            <Suspense fallback={<div>Loading Kart...</div>}>
              <KartRoomPage sessionData={sessionData} />
            </Suspense>
          }
        />

        <Route path="*" element={<Hub playerName={playerName} />} />
      </Routes>

      {showDisconnect && (
        <div className="disconnect-overlay">
          <div className="disconnect-box">
            <div className="disconnect-spinner" />
            <span>Reconnecting…</span>
            <button onClick={handleBackToHub}>Back to Hub</button>
          </div>
        </div>
      )}
    </>
  );
}