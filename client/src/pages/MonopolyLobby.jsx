import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./MonopolyLobby.css";

const MODE_LABELS = { classic: "Classic", speed: "Speed", simplified: "Simple" };
const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

export default function MonopolyLobby({ code, roomState }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState(roomState?.players ?? []);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);
  const socket = getSocket();
  const isHost = players[0]?.id === socket.id;
  const settings = roomState?.settings ?? {};

  useEffect(() => {
    function onRoomState(state) { setPlayers(state.players); }
    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId }) {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    }
    function onError({ message }) { setError(message); }

    socket.on("monopoly-room-state",    onRoomState);
    socket.on("monopoly-player-joined", onPlayerJoined);
    socket.on("monopoly-player-left",   onPlayerLeft);
    socket.on("monopoly-error",         onError);
    return () => {
      socket.off("monopoly-room-state",    onRoomState);
      socket.off("monopoly-player-joined", onPlayerJoined);
      socket.off("monopoly-player-left",   onPlayerLeft);
      socket.off("monopoly-error",         onError);
    };
  }, []);

  function startGame() {
    setError("");
    socket.emit("monopoly-start-game");
  }

  function copyCode() {
    const url = `${window.location.origin}/monopoly/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mono-lobby">
      <div className="mono-lobby-card">
        <button className="mono-lobby-back" onClick={() => { clearSession(); navigate("/"); }}>Back to Romp</button>
        <h2 className="mono-lobby-title">Monopoly</h2>

        <div className="mono-lobby-code-row">
          <span className="mono-lobby-code-label">Room code</span>
          <div className="mono-lobby-code-box">
            <span className="mono-lobby-code-badge">{code}</span>
            <button className="mono-lobby-copy-btn" onClick={copyCode}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="mono-lobby-settings">
          <span className="mono-lobby-setting">${settings.startingMoney || 1500}</span>
          <span className="mono-lobby-setting">{MODE_LABELS[settings.mode] || "Classic"}</span>
          <span className="mono-lobby-setting">{settings.turnTimer ? `${settings.turnTimer}s timer` : "No timer"}</span>
          {settings.freeParking && <span className="mono-lobby-setting">Free Parking $</span>}
        </div>

        <div className="mono-lobby-player-list">
          {players.map((p, i) => (
            <div key={p.id} className="mono-lobby-player-row">
              <span className="mono-lobby-player-color" style={{ background: PLAYER_COLORS[i] }} />
              <span className="mono-lobby-player-name">{p.name}</span>
              {i === 0 && <span className="mono-lobby-host-badge">host</span>}
            </div>
          ))}
        </div>

        {error && <p className="mono-lobby-error">{error}</p>}

        {isHost ? (
          <button className="mono-lobby-start-btn" onClick={startGame} disabled={players.length < 2}>
            {players.length < 2 ? "Waiting for players…" : "Start Game"}
          </button>
        ) : (
          <p className="mono-lobby-waiting">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}
