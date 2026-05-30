import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import MafiaLobby from "./MafiaLobby";
import MafiaGame from "./MafiaGame";
import MafiaEnd from "./MafiaEnd";

export default function MafiaRoomPage({ sessionData }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(sessionData?.roomState || null);
  const [gamePhase, setGamePhase] = useState("lobby");
  const [mafiaRole, setMafiaRole] = useState(null);
  const [mafiaEnd, setMafiaEnd] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const playerName = getSavedName() || "Player";

  useEffect(() => {
    const socket = getSocket();

    function onRoomState(state) { setRoomState(state); }
    function onRoleAssigned({ role, mafiaTeam }) {
      setMafiaRole({ role, mafiaTeam });
    }
    function onPhase({ phase }) {
      if (phase === "roleReveal") setGamePhase("game");
    }
    function onGameEnd({ winner, players }) {
      setMafiaEnd({ winner, players });
      setGamePhase("end");
      clearSession();
    }

    socket.on("mafia-room-state", onRoomState);
    socket.on("mafia-role-assigned", onRoleAssigned);
    socket.on("mafia-phase", onPhase);
    socket.on("mafia-game-end", onGameEnd);

    return () => {
      socket.off("mafia-room-state", onRoomState);
      socket.off("mafia-role-assigned", onRoleAssigned);
      socket.off("mafia-phase", onPhase);
      socket.off("mafia-game-end", onGameEnd);
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
      socket.emit("mafia-join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ code: roomCode, roomState: rs }) {
        socket.off("mafia-error", onErr);
        setJoining(false);
        setRoomState(rs);
      }
      function onErr({ message }) {
        socket.off("mafia-joined-room", onJoined);
        setJoining(false);
        setError(message);
      }

      socket.once("mafia-joined-room", onJoined);
      socket.once("mafia-error", onErr);
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

  if (joining || !roomState) {
    return (
      <div className="mafia-home">
        <div className="mafia-home-card">
          <h1 className="mafia-title">Mafia</h1>
          <p className="mafia-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  if (gamePhase === "end" && mafiaEnd) {
    return (
      <MafiaEnd
        winner={mafiaEnd.winner}
        players={mafiaEnd.players}
        onPlayAgain={() => { setGamePhase("lobby"); setMafiaEnd(null); setMafiaRole(null); }}
        onBackToHub={handleBack}
      />
    );
  }

  if (gamePhase === "game") {
    return <MafiaGame initialRole={mafiaRole} />;
  }

  return (
    <MafiaLobby
      code={code.toUpperCase()}
      roomState={roomState}
      playerName={playerName}
    />
  );
}
