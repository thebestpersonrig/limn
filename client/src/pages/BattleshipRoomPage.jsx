import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import BattleshipLobby from "./BattleshipLobby";
import BattleshipGame from "./BattleshipGame";
import BattleshipEnd from "./BattleshipEnd";
import "./BattleshipHome.css";

export default function BattleshipRoomPage({ sessionData }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(sessionData?.roomState || null);
  const [phase, setPhase] = useState(roomState?.phase || "lobby");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [endData, setEndData] = useState(null);
  const playerName = getSavedName() || "Player";

  useEffect(() => {
    const socket = getSocket();

    // Listen for phase changes
    function onPhase({ phase: p }) { setPhase(p); }
    function onRoomState(state) { setRoomState(state); }
    function onGameOver(data) {
      setEndData(data);
      setPhase("ended");
    }

    socket.on("battleship-phase", onPhase);
    socket.on("battleship-room-state", onRoomState);
    socket.on("battleship-game-over", onGameOver);

    return () => {
      socket.off("battleship-phase", onPhase);
      socket.off("battleship-room-state", onRoomState);
      socket.off("battleship-game-over", onGameOver);
    };
  }, []);

  // Auto-join if navigating via URL
  useEffect(() => {
    if (sessionData && sessionData.code === code.toUpperCase()) {
      setRoomState(sessionData.roomState);
      return;
    }
    if (joining) return;

    setJoining(true);
    setError("");

    const socket = getSocket();

    function doJoin() {
      socket.emit("battleship-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ code: roomCode, roomState: rs }) {
        socket.off("battleship-error", onError);
        setJoining(false);
        setRoomState(rs);
      }
      function onError({ message }) {
        socket.off("battleship-joined-room", onJoined);
        setJoining(false);
        setError(message);
      }

      socket.once("battleship-joined-room", onJoined);
      socket.once("battleship-error", onError);
    }

    if (!socket.connected) {
      socket.connect();
      socket.once("connect", doJoin);
      socket.once("connect_error", () => {
        setJoining(false);
        setError("Can't reach the server.");
      });
    } else {
      doJoin();
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBack() {
    const socket = getSocket();
    socket.emit("battleship-leave");
    clearSession();
    navigate("/");
  }

  if (error) {
    return (
      <div className="bship-home">
        <div className="bship-home-card">
          <h1 className="bship-title">Battleship</h1>
          <p className="bship-error">{error}</p>
          <div className="bship-buttons">
            <button className="bship-btn bship-btn-primary" onClick={() => navigate("/battleship")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !roomState) {
    return (
      <div className="bship-home">
        <div className="bship-home-card">
          <h1 className="bship-title">Battleship</h1>
          <p className="bship-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  if (phase === "ended" && endData) {
    return (
      <BattleshipEnd
        winnerId={endData.winnerId}
        winnerName={endData.winnerName}
        reason={endData.reason}
        onBackToHub={handleBack}
      />
    );
  }

  if (phase === "placing" || phase === "playing") {
    return (
      <BattleshipGame
        code={code.toUpperCase()}
        roomState={roomState}
        playerName={playerName}
        onBack={handleBack}
      />
    );
  }

  // Default: lobby
  return (
    <BattleshipLobby
      code={code.toUpperCase()}
      roomState={roomState}
      onBack={handleBack}
    />
  );
}
