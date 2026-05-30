import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./Home.css";

export default function Home({ playerName }) {
  const navigate = useNavigate();
  const [code,    setCode]    = useState("");
  const [mode,    setMode]    = useState(null); // "create" | "join"
  const [error,   setError]   = useState("");
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
    saveSession(playerName, roomCode, "limn");
    navigate(`/limn/${roomCode}`);
  }

  function handleCreate() {
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("create-room", { name: playerName });
      socket.once("joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("join-room", { name: playerName, code: code.trim() });
      socket.once("joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="home">
      <div className="home-card">
        <button className="home-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="home-title">Limn</h1>
        <p className="home-subtitle">Draw. Guess. Win.</p>

        {playerName && (
          <div className="home-playing-as">
            Playing as <strong>{playerName}</strong>
          </div>
        )}

        {mode === "join" && (
          <input
            className="home-input"
            placeholder="Room code (e.g. K9XMTP)"
            value={code}
            maxLength={6}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            autoFocus
          />
        )}

        {error && <p className="home-error">{error}</p>}

        <div className="home-buttons">
          {mode !== "join" ? (
            <>
              <button className="btn btn-primary" onClick={handleCreate} disabled={pending || !playerName}>
                {pending ? "Creating..." : "Create Room"}
              </button>
              <button className="btn btn-secondary" onClick={() => setMode("join")} disabled={pending || !playerName}>
                Join Room
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }} disabled={pending}>
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
