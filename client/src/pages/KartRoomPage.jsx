import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import { useKartStore } from "../kart/kartStore";
import KartBattle from "./KartBattle";
import "./KartHome.css";

export default function KartRoomPage({ sessionData }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const playerName = getSavedName() || "Racer";

  useEffect(() => {
    // If we have session data matching this room, we're already in
    if (sessionData && sessionData.code === code.toUpperCase()) {
      if (sessionData.playerId && sessionData.snapshot) {
        useKartStore.getState().setJoined(sessionData.playerId, sessionData.snapshot);
      }
      setReady(true);
      return;
    }

    // Otherwise try to join
    const socket = getSocket();

    function doJoin() {
      socket.emit("kart-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ playerId, snapshot }) {
        socket.off("kart-error", onError);
        useKartStore.getState().setJoined(playerId, snapshot);
        setReady(true);
      }
      function onError({ message }) {
        socket.off("kart-joined-room", onJoined);
        setError(message);
      }

      socket.once("kart-joined-room", onJoined);
      socket.once("kart-error", onError);
    }

    if (!socket.connected) {
      socket.connect();
      socket.once("connect", doJoin);
      socket.once("connect_error", () => setError("Can't reach the server."));
    } else {
      doJoin();
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBack() {
    clearSession();
    useKartStore.getState().resetKart();
    navigate("/");
  }

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

  if (!ready) {
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
      code={code.toUpperCase()}
      playerName={playerName}
      onBack={handleBack}
    />
  );
}
