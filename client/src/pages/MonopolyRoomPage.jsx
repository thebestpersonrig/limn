import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../hooks/useSocket";
import MonopolyLobby from "./MonopolyLobby";
import MonopolyGame from "./MonopolyGame";
import MonopolyEnd from "./MonopolyEnd";

export default function MonopolyRoomPage({
  sessionData,
  gamePhase,
  monopolyEnd,
  playerName,
  onJoined,
  onPlayAgain,
  onBackToHub,
}) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionData && sessionData.code === code.toUpperCase()) return;
    if (!playerName) { navigate("/"); return; }
    if (joining) return;

    setJoining(true);
    setError("");

    const socket = getSocket();

    function doJoin() {
      socket.emit("monopoly-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoinedRoom({ code: roomCode, roomState }) {
        socket.off("monopoly-error", onJoinError);
        setJoining(false);
        onJoined({ code: roomCode, roomState });
      }
      function onJoinError({ message }) {
        socket.off("monopoly-joined-room", onJoinedRoom);
        setJoining(false);
        setError(message);
      }

      socket.once("monopoly-joined-room", onJoinedRoom);
      socket.once("monopoly-error", onJoinError);
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

  if (joining || !sessionData) {
    return (
      <div className="mono-home">
        <div className="mono-home-card">
          <h1 className="mono-title">Monopoly</h1>
          <p className="mono-subtitle">Joining room {code.toUpperCase()}…</p>
        </div>
      </div>
    );
  }

  if (gamePhase === "end" && monopolyEnd) {
    return (
      <MonopolyEnd
        winnerId={monopolyEnd.winnerId}
        standings={monopolyEnd.standings}
        onPlayAgain={onPlayAgain}
        onBackToHub={onBackToHub}
      />
    );
  }

  if (gamePhase === "game") {
    return <MonopolyGame />;
  }

  return (
    <MonopolyLobby
      code={sessionData.code}
      roomState={sessionData.roomState}
    />
  );
}
