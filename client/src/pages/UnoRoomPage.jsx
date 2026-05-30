import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import UnoLobby from "./UnoLobby";
import UnoGame from "./UnoGame";
import UnoEnd from "./UnoEnd";
import "./UnoHome.css";

export default function UnoRoomPage({ sessionData }) {
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

    function onPhase({ phase: p }) { setPhase(p); }
    function onRoomState(state) { setRoomState(state); }
    function onGameOver(data) {
      setEndData(data);
      setPhase("ended");
    }

    socket.on("uno-phase", onPhase);
    socket.on("uno-room-state", onRoomState);
    socket.on("uno-game-over", onGameOver);

    return () => {
      socket.off("uno-phase", onPhase);
      socket.off("uno-room-state", onRoomState);
      socket.off("uno-game-over", onGameOver);
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
      socket.emit("uno-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ code: roomCode, roomState: rs }) {
        socket.off("uno-error", onError);
        setJoining(false);
        setRoomState(rs);
      }
      function onError({ message }) {
        socket.off("uno-joined-room", onJoined);
        setJoining(false);
        setError(message);
      }

      socket.once("uno-joined-room", onJoined);
      socket.once("uno-error", onError);
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
    socket.emit("uno-leave");
    clearSession();
    navigate("/");
  }

  if (error) {
    return (
      <div className="uno-home">
        <div className="uno-home-card">
          <h1 className="uno-title">Uno</h1>
          <p className="uno-error">{error}</p>
          <div className="uno-buttons">
            <button className="uno-btn uno-btn-primary" onClick={() => navigate("/uno")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !roomState) {
    return (
      <div className="uno-home">
        <div className="uno-home-card">
          <h1 className="uno-title">Uno</h1>
          <p className="uno-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  if (phase === "ended" && endData) {
    return (
      <UnoEnd
        winnerId={endData.winnerId}
        winnerName={endData.winnerName}
        reason={endData.reason}
        onBackToHub={handleBack}
      />
    );
  }

  if (phase === "playing") {
    return (
      <UnoGame
        code={code.toUpperCase()}
        roomState={roomState}
        onBack={handleBack}
      />
    );
  }

  // Default: lobby
  return (
    <UnoLobby
      code={code.toUpperCase()}
      roomState={roomState}
      onBack={handleBack}
    />
  );
}
