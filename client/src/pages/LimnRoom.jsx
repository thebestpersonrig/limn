import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import Lobby from "./Lobby";
import Game from "./Game";
import GameEnd from "./GameEnd";

/**
 * /limn/:code — smart wrapper that auto-joins via URL
 * then renders Lobby → Game → GameEnd based on gamePhase.
 */
export default function LimnRoom({
  sessionData,
  gamePhase,
  roundData,
  finalPlayers,
  playerName,
  onJoined,
  onPlayAgain,
  onBackToHub,
}) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  // If we navigated here via URL (e.g. shareable link) without session data,
  // auto-join the room.
  useEffect(() => {
    if (sessionData && sessionData.code === code.toUpperCase()) return; // already in this room
    if (!playerName) { navigate("/"); return; } // no name yet
    if (joining) return;

    setJoining(true);
    setError("");

    const socket = getSocket();

    function doJoin() {
      socket.emit("join-room", { name: playerName, code: code.toUpperCase() });

      function onJoinedRoom({ code: roomCode, roomState }) {
        socket.off("error", onJoinError);
        setJoining(false);
        onJoined({ code: roomCode, roomState });
      }
      function onJoinError({ message }) {
        socket.off("joined-room", onJoinedRoom);
        setJoining(false);
        setError(message);
      }

      socket.once("joined-room", onJoinedRoom);
      socket.once("error", onJoinError);
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

  // Error state
  if (error) {
    return (
      <div className="home">
        <div className="home-card">
          <h1 className="home-title">Limn</h1>
          <p className="home-error">{error}</p>
          <div className="home-buttons">
            <button className="btn btn-primary" onClick={() => navigate("/limn")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // Joining state
  if (joining || !sessionData) {
    return (
      <div className="home">
        <div className="home-card">
          <h1 className="home-title">Limn</h1>
          <p className="home-subtitle">Joining room {code.toUpperCase()}…</p>
        </div>
      </div>
    );
  }

  // ── Render based on game phase ──
  if (gamePhase === "end" && finalPlayers) {
    return (
      <GameEnd
        players={finalPlayers}
        onPlayAgain={onPlayAgain}
        onBackToHub={onBackToHub}
      />
    );
  }

  if (gamePhase === "game") {
    return <Game initialRoundData={roundData} />;
  }

  // Default: lobby
  return (
    <Lobby
      code={sessionData.code}
      roomState={sessionData.roomState}
      playerName={sessionData.playerName}
    />
  );
}
