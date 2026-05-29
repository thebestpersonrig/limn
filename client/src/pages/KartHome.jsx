import { useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./KartHome.css";

export default function KartHome({ playerName, onJoined, onBack }) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function connect(cb) {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => {
        socket.off("connect_error", onErr);
        cb();
      });
      function onErr() {
        socket.off("connect", cb);
        setPending(false);
        setError("Can't reach the server - try again in a moment.");
      }
      socket.once("connect_error", onErr);
    } else {
      cb();
    }
  }

  function handleCreate() {
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("kart-create-room", { name: playerName });
      socket.once("kart-joined-room", ({ code, roomState, playerId, snapshot }) => {
        setPending(false);
        onJoined({ code, roomState, playerId, snapshot });
      });
      socket.once("kart-error", ({ message }) => {
        setPending(false);
        setError(message);
      });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("kart-join-room", { name: playerName, code: code.trim() });
      socket.once("kart-joined-room", ({ code, roomState, playerId, snapshot }) => {
        setPending(false);
        onJoined({ code, roomState, playerId, snapshot });
      });
      socket.once("kart-error", ({ message }) => {
        setPending(false);
        setError(message);
      });
    });
  }

  return (
    <div className="kart-home">
      <div className="kart-home-card">
        {onBack && <button className="kart-home-back" onClick={onBack}>Back to Romp</button>}
        <h1 className="kart-home-title">Kart Clash</h1>
        <p className="kart-home-subtitle">Drift. Blast. Respawn.</p>
        <div className="kart-home-playing-as">Playing as <strong>{playerName}</strong></div>

        {mode === null && (
          <div className="kart-home-buttons">
            <button className="kart-home-btn kart-home-btn-primary" onClick={handleCreate} disabled={pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="kart-home-btn kart-home-btn-secondary" onClick={() => setMode("join")} disabled={pending}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="kart-home-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === "Enter" && handleJoin()}
              autoFocus
            />
            <div className="kart-home-buttons">
              <button className="kart-home-btn kart-home-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button
                className="kart-home-btn kart-home-btn-ghost"
                onClick={() => { setMode(null); setCode(""); setError(""); }}
                disabled={pending}
              >
                Back
              </button>
            </div>
          </>
        )}

        {error && <p className="kart-home-error">{error}</p>}
      </div>
    </div>
  );
}
