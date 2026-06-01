import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./ChessHome.css";

export default function ChessHome({ playerName }) {
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
    saveSession(playerName, roomCode, "chess");
    navigate(`/chess/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("chess-create-room", { name: playerName });
      socket.once("chess-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("chess-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("chess-join-room", { name: playerName, code: code.trim() });
      socket.once("chess-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("chess-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="chess-home">
      <div className="chess-home-card">
        <button className="chess-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="chess-title">Chess</h1>
        <p className="chess-subtitle">Classic Strategy</p>
        {playerName && <div className="chess-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="chess-buttons">
            <button className="chess-btn chess-btn-primary" onClick={handleCreate} disabled={!playerName || pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="chess-btn chess-btn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="chess-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="chess-error">{error}</p>}
            <div className="chess-buttons">
              <button className="chess-btn chess-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="chess-btn chess-btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && mode !== "join" && <p className="chess-error">{error}</p>}
      </div>
    </div>
  );
}
