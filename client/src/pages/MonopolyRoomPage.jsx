import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import MonopolyLobby from "./MonopolyLobby";
import MonopolyGame from "./MonopolyGame";
import MonopolyEnd from "./MonopolyEnd";

export default function MonopolyRoomPage({ sessionData }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(sessionData?.roomState || null);
  const [gamePhase, setGamePhase] = useState("lobby");
  const [monopolyEnd, setMonopolyEnd] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const playerName = getSavedName() || "Player";

  useEffect(() => {
    const socket = getSocket();

    function onRoomState(state) { setRoomState(state); }
    function onGameStart() { setGamePhase("game"); }
    function onGameEnd({ winnerId, standings }) {
      setMonopolyEnd({ winnerId, standings });
      setGamePhase("end");
      clearSession();
    }

    socket.on("monopoly-room-state", onRoomState);
    socket.on("monopoly-game-start", onGameStart);
    socket.on("monopoly-game-end", onGameEnd);

    return () => {
      socket.off("monopoly-room-state", onRoomState);
      socket.off("monopoly-game-start", onGameStart);
      socket.off("monopoly-game-end", onGameEnd);
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
      socket.emit("monopoly-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ code: roomCode, roomState: rs }) {
        socket.off("monopoly-error", onErr);
        setJoining(false);
        setRoomState(rs);
      }
      function onErr({ message }) {
        socket.off("monopoly-joined-room", onJoined);
        setJoining(false);
        setError(message);
      }

      socket.once("monopoly-joined-room", onJoined);
      socket.once("monopoly-error", onErr);
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
    clearSession();
    navigate("/");
  }

  if (error) {
    return (
      <div className="mono-home">
        <div className="mono-home-card">
          <h1 className="mono-title">Monopoly</h1>
          <p className="mono-error">{error}</p>
          <div className="mono-buttons">
            <button className="mono-btn mono-btn-primary" onClick={() => navigate("/monopoly")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !roomState) {
    return (
      <div className="mono-home">
        <div className="mono-home-card">
          <h1 className="mono-title">Monopoly</h1>
          <p className="mono-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  if (gamePhase === "end" && monopolyEnd) {
    return (
      <MonopolyEnd
        winnerId={monopolyEnd.winnerId}
        standings={monopolyEnd.standings}
        onPlayAgain={() => { setGamePhase("lobby"); setMonopolyEnd(null); }}
        onBackToHub={handleBack}
      />
    );
  }

  if (gamePhase === "game") {
    return <MonopolyGame />;
  }

  return (
    <MonopolyLobby
      code={code.toUpperCase()}
      roomState={roomState}
    />
  );
}
