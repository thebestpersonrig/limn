import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket } from "../hooks/useSocket";
import KartBattle from "./KartBattle";
import "./KartHome.css";

export default function KartRoomPage({
  sessionData,
  playerName,
  onJoined,
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
      socket.emit("kart-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoinedRoom({ code: roomCode, roomState, playerId, snapshot }) {
        socket.off("kart-error", onJoinError);
        setJoining(false);
        onJoined({ code: roomCode, roomState, playerId, snapshot });
      }
      function onJoinError({ message }) {
        socket.off("kart-joined-room", onJoinedRoom);
        setJoining(false);
        setError(message);
      }

      socket.once("kart-joined-room", onJoinedRoom);
      socket.once("kart-error", onJoinError);
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
      <div className="kart-home">
        <div className="kart-home-card">
          <h1 className="kart-home-title">Kart Clash</h1>
          <p className="kart-home-error">{error}</p>
          <div className="kart-home-buttons">
            <button className="kart-home-btn kart-home-btn-primary" onClick={() => navigate("/kart")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !sessionData) {
    return (
      <div className="kart-home">
        <div className="kart-home-card">
          <h1 className="kart-home-title">Kart Clash</h1>
          <p className="kart-home-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  return (
    <KartBattle
      code={sessionData.code}
      playerName={playerName}
      playerId={sessionData.playerId}
      snapshot={sessionData.snapshot}
      onBack={onBackToHub}
    />
  );
}
