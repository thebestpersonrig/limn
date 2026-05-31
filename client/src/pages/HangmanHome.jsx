import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./HangmanHome.css";

export default function HangmanHome({ playerName }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | "create" | "join"
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
    saveSession(playerName, roomCode, "hangman");
    navigate(`/hangman/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("hang-create-room", { name: playerName });
      socket.once("hang-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("hang-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("hang-join-room", { name: playerName, code: code.trim() });
      socket.once("hang-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("hang-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="hang-home">
      <div className="hang-home-card">
        <button className="hang-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="hang-title">Hangman</h1>
        <p className="hang-subtitle">Word Guess</p>
        {playerName && <div className="hang-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="hang-buttons">
            <button className="hang-btn hang-btn-primary" onClick={() => handleCreate()} disabled={!playerName || pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="hang-btn hang-btn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="hang-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="hang-error">{error}</p>}
            <div className="hang-buttons">
              <button className="hang-btn hang-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="hang-btn hang-btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && mode !== "join" && <p className="hang-error">{error}</p>}
      </div>
    </div>
  );
}
