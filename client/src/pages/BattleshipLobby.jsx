import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./BattleshipLobby.css";

export default function BattleshipLobby({ code, roomState, onBack }) {
  const [players, setPlayers] = useState(roomState?.players ?? []);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const socket = getSocket();
  const isHost = players[0]?.id === socket.id;
  const mode = roomState?.mode || "classic";

  useEffect(() => {
    function onRoomState(state) { setPlayers(state.players); }
    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId }) {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    }
    function onError({ message }) { setError(message); }

    socket.on("battleship-room-state", onRoomState);
    socket.on("battleship-player-joined", onPlayerJoined);
    socket.on("battleship-player-left", onPlayerLeft);
    socket.on("battleship-error", onError);
    return () => {
      socket.off("battleship-room-state", onRoomState);
      socket.off("battleship-player-joined", onPlayerJoined);
      socket.off("battleship-player-left", onPlayerLeft);
      socket.off("battleship-error", onError);
    };
  }, []);

  function startGame() {
    setError("");
    socket.emit("battleship-start-game");
  }

  function copyCode() {
    const url = `${window.location.origin}/battleship/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bship-lobby">
      <div className="bship-lobby-card">
        <button className="bship-lobby-back" onClick={onBack}>Back to Romp</button>
        <h2 className="bship-lobby-title">Battleship</h2>
        <span className={`bship-lobby-mode-badge bship-lobby-mode-badge--${mode}`}>
          {mode === "advanced" ? "Advanced" : "Classic"}
        </span>

        <div className="bship-lobby-code-row">
          <span className="bship-lobby-code-label">Room code</span>
          <div className="bship-lobby-code-box">
            <span className="bship-lobby-code-badge">{code}</span>
            <button className="bship-lobby-copy-btn" onClick={copyCode}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="bship-lobby-player-list">
          {players.map((p, i) => (
            <div key={p.id} className="bship-lobby-player-row">
              <span className="bship-lobby-player-icon">{i === 0 ? "\u{1F6A2}" : "\u{2693}"}</span>
              <span className="bship-lobby-player-name">{p.name}</span>
              {i === 0 && <span className="bship-lobby-host-badge">host</span>}
            </div>
          ))}
          {players.length < 2 && (
            <div className="bship-lobby-player-row bship-lobby-player-row--empty">
              <span className="bship-lobby-player-icon">?</span>
              <span className="bship-lobby-player-name bship-lobby-muted">Waiting for opponent...</span>
            </div>
          )}
        </div>

        {error && <p className="bship-lobby-error">{error}</p>}

        {isHost ? (
          <button className="bship-lobby-start-btn" onClick={startGame} disabled={players.length < 2}>
            {players.length < 2 ? "Waiting for opponent..." : "Start Game"}
          </button>
        ) : (
          <p className="bship-lobby-waiting">Waiting for the host to start...</p>
        )}
      </div>
    </div>
  );
}
