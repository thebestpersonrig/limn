import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./MafiaLobby.css";

export default function MafiaLobby({ code, roomState, playerName }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState(roomState?.players ?? []);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);
  const socket = getSocket();
  const isHost = players[0]?.id === socket.id;
  const config = roomState?.roleConfig ?? {};

  useEffect(() => {
    function onRoomState(state) { setPlayers(state.players); }
    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId }) {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    }
    function onError({ message }) { setError(message); }

    socket.on("mafia-room-state",    onRoomState);
    socket.on("mafia-player-joined", onPlayerJoined);
    socket.on("mafia-player-left",   onPlayerLeft);
    socket.on("mafia-error",         onError);
    return () => {
      socket.off("mafia-room-state",    onRoomState);
      socket.off("mafia-player-joined", onPlayerJoined);
      socket.off("mafia-player-left",   onPlayerLeft);
      socket.off("mafia-error",         onError);
    };
  }, []);

  function startGame() {
    setError("");
    socket.emit("mafia-start-game");
  }

  function copyCode() {
    const url = `${window.location.origin}/mafia/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const minPlayers = (config.mafiaCount || 1) + (config.detective ? 1 : 0) + (config.doctor ? 1 : 0) + (config.hunter ? 1 : 0) + (config.witch ? 1 : 0) + (config.jester ? 1 : 0) + 2;
  const canStart = players.length >= minPlayers;

  return (
    <div className="mlobby">
      <div className="mlobby-card">
        <button className="mlobby-back" onClick={() => { clearSession(); navigate("/"); }}>Back to Romp</button>
        <h2 className="mlobby-title">Mafia</h2>

        <div className="mlobby-code-row">
          <span className="mlobby-code-label">Room code</span>
          <div className="mlobby-code-box">
            <span className="mlobby-code-badge">{code}</span>
            <button className="mlobby-copy-btn" onClick={copyCode}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="mlobby-roles">
          <span className="mlobby-role-tag mafia">{config.mafiaCount || 1}x Mafia</span>
          {config.detective && <span className="mlobby-role-tag detective">Detective</span>}
          {config.doctor && <span className="mlobby-role-tag doctor">Doctor</span>}
          {config.hunter && <span className="mlobby-role-tag hunter">Hunter</span>}
          {config.witch && <span className="mlobby-role-tag witch">Witch</span>}
          {config.jester && <span className="mlobby-role-tag jester">Jester</span>}
          <span className="mlobby-role-tag civilian">Civilians</span>
        </div>

        <div className="mlobby-player-list">
          {players.map((p, i) => (
            <div key={p.id} className="mlobby-player-row">
              <span className="mlobby-player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="mlobby-player-name">{p.name}</span>
              {i === 0 && <span className="mlobby-host-badge">host</span>}
            </div>
          ))}
        </div>

        {error && <p className="mlobby-error">{error}</p>}

        {isHost ? (
          <button className="mlobby-start-btn" onClick={startGame} disabled={!canStart}>
            {canStart ? "Start Game" : `Need ${minPlayers - players.length} more player${minPlayers - players.length > 1 ? "s" : ""}…`}
          </button>
        ) : (
          <p className="mlobby-waiting">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}
