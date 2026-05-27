import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Lobby.css";

export default function Lobby({ code, roomState, playerName, onGameStart }) {
  const [players, setPlayers] = useState(roomState?.players ?? []);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const socket = getSocket();
  const isHost = players[0]?.id === socket.id;

  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players);
    }
    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId }) {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    }
    function onError({ message }) {
      setError(message);
    }

    socket.on("room-state", onRoomState);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("round-start", onGameStart);
    socket.on("error", onError);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("player-joined", onPlayerJoined);
      socket.off("player-left", onPlayerLeft);
      socket.off("round-start", onGameStart);
      socket.off("error", onError);
    };
  }, []);

  function startGame() {
    setError("");
    socket.emit("start-game");
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h2 className="lobby-title">Limn</h2>

        <div className="lobby-code-row">
          <span className="lobby-code-label">Room code</span>
          <div className="lobby-code-box">
            <span className="code-badge">{code}</span>
            <button className="copy-btn" onClick={copyCode}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="player-list">
          {players.map((p, i) => (
            <div key={p.id} className="player-row">
              <span className="player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="player-name">{p.name}</span>
              {i === 0 && <span className="host-badge">host</span>}
            </div>
          ))}
        </div>

        {error && <p className="lobby-error">{error}</p>}

        {isHost ? (
          <button
            className="btn btn-start"
            onClick={startGame}
            disabled={players.length < 2}
          >
            {players.length < 2 ? "Waiting for players…" : "Start Game"}
          </button>
        ) : (
          <p className="lobby-waiting">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}
