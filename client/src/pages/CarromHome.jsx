import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./CarromHome.css";

export default function CarromHome({ playerName }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function connect(cb) {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => { socket.off("connect_error", onErr); cb(); });
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

  function handleJoined({ code: roomCode }) {
    saveSession(playerName, roomCode, "carrom");
    navigate(`/carrom/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("carr-create-room", { name: playerName });
      socket.once("carr-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("carr-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("carr-join-room", { name: playerName, code: code.trim() });
      socket.once("carr-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("carr-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="carr-home">
      <div className="carr-home-card">
        <button className="carr-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="carr-title">Carrom</h1>
        <p className="carr-subtitle">Disc Flicking</p>
        {playerName && <div className="carr-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="carr-buttons">
            <button className="carr-btn carr-btn-primary" onClick={handleCreate} disabled={!playerName || pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="carr-btn carr-btn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="carr-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="carr-error">{error}</p>}
            <div className="carr-buttons">
              <button className="carr-btn carr-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="carr-btn carr-btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && mode !== "join" && <p className="carr-error">{error}</p>}
      </div>
    </div>
  );
}
