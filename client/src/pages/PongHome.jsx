import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./PongHome.css";

export default function PongHome({ playerName }) {
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
        setError("Can't reach the server — try again in a moment.");
      }
      socket.once("connect_error", onErr);
    } else cb();
  }

  function handleJoined({ code: roomCode }) {
    saveSession(playerName, roomCode, "pong");
    navigate(`/pong/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      function onJoined(data) { socket.off("pong-error", onErr); setPending(false); handleJoined(data); }
      function onErr({ message }) { socket.off("pong-joined-room", onJoined); setPending(false); setError(message); }
      socket.once("pong-joined-room", onJoined);
      socket.once("pong-error", onErr);
      socket.emit("pong-create-room", { name: playerName });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      function onJoined(data) { socket.off("pong-error", onErr); setPending(false); handleJoined(data); }
      function onErr({ message }) { socket.off("pong-joined-room", onJoined); setPending(false); setError(message); }
      socket.once("pong-joined-room", onJoined);
      socket.once("pong-error", onErr);
      socket.emit("pong-join-room", { name: playerName, code: code.trim() });
    });
  }

  return (
    <div className="pong-home">
      <div className="pong-home-card">
        <button className="pong-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="pong-title">Pong</h1>
        <p className="pong-subtitle">Retro Arcade.</p>
        {playerName && <div className="pong-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="pong-buttons">
            <button className="pbtn pbtn-primary" onClick={handleCreate} disabled={!playerName || pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="pbtn pbtn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="pong-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="pong-error">{error}</p>}
            <div className="pong-buttons">
              <button className="pbtn pbtn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="pbtn pbtn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && mode !== "join" && <p className="pong-error">{error}</p>}
      </div>
    </div>
  );
}
