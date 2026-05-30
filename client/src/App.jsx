import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";

import Hub from "./pages/Hub";
import Home from "./pages/Home";
import LimnRoom from "./pages/LimnRoom";

import MafiaHome from "./pages/MafiaHome";
import MafiaRoomPage from "./pages/MafiaRoomPage";

import MonopolyHome from "./pages/MonopolyHome";
import MonopolyRoomPage from "./pages/MonopolyRoomPage";

import BattleshipHome from "./pages/BattleshipHome";
import BattleshipRoomPage from "./pages/BattleshipRoomPage";

import SnakeGame from "./pages/SnakeGame";
import TicTacToeGame from "./pages/TicTacToeGame";

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
  const [connected, setConnected] = useState(true);

  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const wasConnected = useRef(false);

  // -----------------------------------------
  // GLOBAL ROOM VALIDATION
  // -----------------------------------------
  function isValidRoom(roomState) {
    if (!roomState) return false;
    return (
      roomState.status !== "ended" &&
      roomState.gameOver !== true &&
      roomState.ended !== true
    );
  }

  // -----------------------------------------
  // SOCKET CORE EVENTS
  // -----------------------------------------
  useEffect(() => {
    const s = getSocket();

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
        path === "/kart" ||
        path === "/battleship"
      )
        return;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", session);
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", session);
      } else if (session.gameType === "kart") {
        s.emit("kart-rejoin", session);
      } else if (session.gameType === "battleship") {
        s.emit("battleship-rejoin", session);
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

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    s.on("rejoin-failed", onRejoinFailed);
    s.on("mafia-rejoin-failed", onRejoinFailed);
    s.on("monopoly-rejoin-failed", onRejoinFailed);
    s.on("kart-rejoin-failed", onRejoinFailed);
    s.on("battleship-rejoin-failed", onRejoinFailed);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);

      s.off("rejoin-failed", onRejoinFailed);
      s.off("mafia-rejoin-failed", onRejoinFailed);
      s.off("monopoly-rejoin-failed", onRejoinFailed);
      s.off("kart-rejoin-failed", onRejoinFailed);
      s.off("battleship-rejoin-failed", onRejoinFailed);
    };
  }, [navigate]);

  // -----------------------------------------
  // AUTO REJOIN
  // -----------------------------------------
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
      } else if (session.gameType === "battleship") {
        s.emit("battleship-rejoin", session);
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

      navigate(`/kart/${code}`, { replace: true });
    }

    function onBattleshipRejoined({ code, roomState }) {
      if (!isValidRoom(roomState)) {
        clearSession();
        navigate("/", { replace: true });
        return;
      }
      setSessionData({
        code,
        roomState,
        playerName: session.name,
      });
      navigate(`/battleship/${code}`, { replace: true });
    }

    s.once("rejoined", onRejoined);
    s.once("mafia-rejoined", onMafiaRejoined);
    s.once("monopoly-rejoined", onMonopolyRejoined);
    s.once("kart-rejoined", onKartRejoined);
    s.once("battleship-rejoined", onBattleshipRejoined);

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
      s.off("battleship-rejoined", onBattleshipRejoined);
    };
  }, [navigate]);

  // -----------------------------------------
  // HANDLERS
  // -----------------------------------------
  function handleNameChange(name) {
    savePlayerName(name);
    setPlayerName(name);
  }

  function handleSelectGame(id) {
    if (id === "limn") navigate("/limn");
    if (id === "mafia") navigate("/mafia");
    if (id === "monopoly") navigate("/monopoly");
    if (id === "kart") navigate("/kart");
    if (id === "battleship") navigate("/battleship");
    if (id === "snake") navigate("/snake");
    if (id === "tictactoe") navigate("/tictactoe");
  }

  function handleBackToHub() {
    clearSession();
    setSessionData(null);
    navigate("/");
  }

  const path = location.pathname;
  const isInRoom = path.match(/^\/(limn|mafia|monopoly|kart|battleship)\/[A-Z0-9]+$/i);
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

        <Route path="/battleship" element={<BattleshipHome playerName={playerName} />} />
        <Route path="/battleship/:code" element={<BattleshipRoomPage sessionData={sessionData} />} />

        <Route path="/snake" element={<SnakeGame />} />
        <Route path="/tictactoe" element={<TicTacToeGame />} />

        <Route path="*" element={<Hub playerName={playerName} />} />
      </Routes>

      {showDisconnect && (
        <div className="disconnect-overlay">
          <div className="disconnect-box">
            <div className="disconnect-spinner" />
            <span>Reconnecting...</span>
            <button onClick={handleBackToHub}>Back to Hub</button>
          </div>
        </div>
      )}
    </>
  );
}
