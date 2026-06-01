import { useEffect, useRef, useState } from "react";
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

import UnoHome from "./pages/UnoHome";
import UnoRoomPage from "./pages/UnoRoomPage";

import TicTacToeHome from "./pages/TicTacToeHome";
import TicTacToeGame from "./pages/TicTacToeGame";
import TicTacToeOnline from "./pages/TicTacToeOnline";

import HangmanHome from "./pages/HangmanHome";
import HangmanGame from "./pages/HangmanGame";

import CarromHome from "./pages/CarromHome";
import CarromGame from "./pages/CarromGame";

import ChessHome from "./pages/ChessHome";
import ChessGame from "./pages/ChessGame";

import SnakeGame from "./pages/SnakeGame";

import {
  getSocket,
  saveSession,
  clearSession,
  getSession,
  getSavedName,
  savePlayerName
} from "./hooks/useSocket";

import "./App.css";

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
      roomState.phase !== "ended" &&
      roomState.state !== "gameEnd" &&
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
        path === "/battleship" ||
        path === "/uno" ||
        path === "/tictactoe" ||
        path === "/hangman" ||
        path === "/carrom" ||
        path === "/chess"
      )
        return;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", session);
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", session);
      } else if (session.gameType === "battleship") {
        s.emit("battleship-rejoin", session);
      } else if (session.gameType === "uno") {
        s.emit("uno-rejoin", session);
      } else if (session.gameType === "tictactoe") {
        s.emit("ttt-rejoin", session);
      } else if (session.gameType === "hangman") {
        s.emit("hang-rejoin", session);
      } else if (session.gameType === "carrom") {
        s.emit("carr-rejoin", session);
      } else if (session.gameType === "chess") {
        s.emit("chess-rejoin", session);
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

    // When any game ends, immediately clear the session so that navigating
    // to the hub (or a future reconnect) never bounces back into a finished room.
    function onGameEnd() { clearSession(); }

    const GAME_END_EVENTS = [
      "game-end",           // Limn drawing game
      "mafia-game-end",     // Mafia
      "monopoly-game-end",  // Monopoly
      "battleship-game-over",
      "uno-game-over",
      "ttt-game-over",
      "hang-game-end",
      "carr-match-over",
      "chess-game-over",
    ];

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    s.on("rejoin-failed", onRejoinFailed);
    s.on("mafia-rejoin-failed", onRejoinFailed);
    s.on("monopoly-rejoin-failed", onRejoinFailed);
    s.on("battleship-rejoin-failed", onRejoinFailed);
    s.on("uno-rejoin-failed", onRejoinFailed);
    s.on("ttt-rejoin-failed", onRejoinFailed);
    s.on("hang-rejoin-failed", onRejoinFailed);
    s.on("carr-rejoin-failed", onRejoinFailed);
    s.on("chess-rejoin-failed", onRejoinFailed);

    for (const ev of GAME_END_EVENTS) s.on(ev, onGameEnd);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);

      s.off("rejoin-failed", onRejoinFailed);
      s.off("mafia-rejoin-failed", onRejoinFailed);
      s.off("monopoly-rejoin-failed", onRejoinFailed);
      s.off("battleship-rejoin-failed", onRejoinFailed);
      s.off("uno-rejoin-failed", onRejoinFailed);
      s.off("ttt-rejoin-failed", onRejoinFailed);
      s.off("hang-rejoin-failed", onRejoinFailed);
      s.off("carr-rejoin-failed", onRejoinFailed);
      s.off("chess-rejoin-failed", onRejoinFailed);

      for (const ev of GAME_END_EVENTS) s.off(ev, onGameEnd);
    };
  }, [navigate]);

  // -----------------------------------------
  // AUTO REJOIN
  // -----------------------------------------
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    // Don't auto-rejoin if user navigated to the hub or a home page
    const currentPath = locationRef.current.pathname;
    if (
      currentPath === "/" ||
      currentPath === "/limn" ||
      currentPath === "/mafia" ||
      currentPath === "/monopoly" ||
      currentPath === "/battleship" ||
      currentPath === "/uno" ||
      currentPath === "/tictactoe" ||
      currentPath === "/tictactoe/ai" ||
      currentPath === "/hangman" ||
      currentPath === "/carrom" ||
      currentPath === "/chess" ||
      currentPath === "/snake"
    ) {
      clearSession();
      return;
    }

    const s = getSocket();

    function doRejoin() {
      wasConnected.current = true;

      if (session.gameType === "mafia") {
        s.emit("mafia-rejoin", session);
      } else if (session.gameType === "monopoly") {
        s.emit("monopoly-rejoin", session);
      } else if (session.gameType === "battleship") {
        s.emit("battleship-rejoin", session);
      } else if (session.gameType === "uno") {
        s.emit("uno-rejoin", session);
      } else if (session.gameType === "tictactoe") {
        s.emit("ttt-rejoin", session);
      } else if (session.gameType === "hangman") {
        s.emit("hang-rejoin", session);
      } else if (session.gameType === "carrom") {
        s.emit("carr-rejoin", session);
      } else if (session.gameType === "chess") {
        s.emit("chess-rejoin", session);
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

    function onUnoRejoined({ code, roomState }) {
      safeNavigate(roomState, `/uno/${code}`, { code });
    }

    function onTttRejoined({ code, roomState }) {
      safeNavigate(roomState, `/tictactoe/${code}`, { code });
    }

    function onHangRejoined({ code, roomState }) {
      safeNavigate(roomState, `/hangman/${code}`, { code });
    }

    function onCarrRejoined({ code, roomState }) {
      safeNavigate(roomState, `/carrom/${code}`, { code });
    }

    function onChessRejoined({ code, roomState }) {
      safeNavigate(roomState, `/chess/${code}`, { code });
    }

    s.once("rejoined", onRejoined);
    s.once("mafia-rejoined", onMafiaRejoined);
    s.once("monopoly-rejoined", onMonopolyRejoined);
    s.once("battleship-rejoined", onBattleshipRejoined);
    s.once("uno-rejoined", onUnoRejoined);
    s.once("ttt-rejoined", onTttRejoined);
    s.once("hang-rejoined", onHangRejoined);
    s.once("carr-rejoined", onCarrRejoined);
    s.once("chess-rejoined", onChessRejoined);

    if (s.connected) doRejoin();
    else {
      s.connect();
      s.once("connect", doRejoin);
    }

    return () => {
      s.off("rejoined", onRejoined);
      s.off("mafia-rejoined", onMafiaRejoined);
      s.off("monopoly-rejoined", onMonopolyRejoined);
      s.off("battleship-rejoined", onBattleshipRejoined);
      s.off("uno-rejoined", onUnoRejoined);
      s.off("ttt-rejoined", onTttRejoined);
      s.off("hang-rejoined", onHangRejoined);
      s.off("carr-rejoined", onCarrRejoined);
      s.off("chess-rejoined", onChessRejoined);
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
    if (id === "battleship") navigate("/battleship");
    if (id === "uno") navigate("/uno");
    if (id === "tictactoe") navigate("/tictactoe");
    if (id === "hangman") navigate("/hangman");
    if (id === "carrom") navigate("/carrom");
    if (id === "chess") navigate("/chess");
    if (id === "snake") navigate("/snake");
  }

  function handleBackToHub() {
    clearSession();
    setSessionData(null);
    navigate("/");
  }

  const path = location.pathname;
  const isInRoom = path.match(/^\/(limn|mafia|monopoly|battleship|uno|tictactoe|hangman|carrom|chess)\/[A-Z0-9]+$/i);
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

        <Route path="/battleship" element={<BattleshipHome playerName={playerName} />} />
        <Route path="/battleship/:code" element={<BattleshipRoomPage sessionData={sessionData} />} />

        <Route path="/uno" element={<UnoHome />} />
        <Route path="/uno/:code" element={<UnoRoomPage sessionData={sessionData} />} />

        <Route path="/tictactoe" element={<TicTacToeHome playerName={playerName} />} />
        <Route path="/tictactoe/ai" element={<TicTacToeGame />} />
        <Route path="/tictactoe/:code" element={<TicTacToeOnline />} />

        <Route path="/hangman" element={<HangmanHome playerName={playerName} />} />
        <Route path="/hangman/:code" element={<HangmanGame />} />

        <Route path="/carrom" element={<CarromHome playerName={playerName} />} />
        <Route path="/carrom/:code" element={<CarromGame />} />

        <Route path="/chess" element={<ChessHome playerName={playerName} />} />
        <Route path="/chess/:code" element={<ChessGame />} />

        <Route path="/snake" element={<SnakeGame />} />

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
