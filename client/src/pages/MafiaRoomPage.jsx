import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../hooks/useSocket";
import MafiaLobby from "./MafiaLobby";
import MafiaGame from "./MafiaGame";
import MafiaEnd from "./MafiaEnd";

/**
 * /mafia/:code — smart wrapper that auto-joins via URL
 * then renders MafiaLobby → MafiaGame → MafiaEnd based on gamePhase.
 */
export default function MafiaRoomPage({
  sessionData,
  gamePhase,
  mafiaEnd,
  mafiaRole,
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
      socket.emit("mafia-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoinedRoom({ code: roomCode, roomState }) {
        socket.off("mafia-error", onJoinError);
        setJoining(false);
        onJoined({ code: roomCode, roomState });
      }
      function onJoinError({ message }) {
        socket.off("mafia-joined-room", onJoinedRoom);
        setJoining(false);
        setError(message);
      }

      socket.once("mafia-joined-room", onJoinedRoom);
      socket.once("mafia-error", onJoinError);
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
      <div className="mafia-home">
        <div className="mafia-home-card">
          <h1 className="mafia-title">Mafia</h1>
          <p className="mafia-error">{error}</p>
          <div className="mafia-buttons">
            <button className="mbtn mbtn-primary" onClick={() => navigate("/mafia")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !sessionData) {
    return (
      <div className="mafia-home">
        <div className="mafia-home-card">
          <h1 className="mafia-title">Mafia</h1>
          <p className="mafia-subtitle">Joining room {code.toUpperCase()}…</p>
        </div>
      </div>
    );
  }

  if (gamePhase === "end" && mafiaEnd) {
    return (
      <MafiaEnd
        winner={mafiaEnd.winner}
        players={mafiaEnd.players}
        onPlayAgain={onPlayAgain}
        onBackToHub={onBackToHub}
      />
    );
  }

  if (gamePhase === "game") {
    return <MafiaGame initialRole={mafiaRole} />;
  }

  return (
    <MafiaLobby
      code={sessionData.code}
      roomState={sessionData.roomState}
      playerName={sessionData.playerName}
    />
  );
}
