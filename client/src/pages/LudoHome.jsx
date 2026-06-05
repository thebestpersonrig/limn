import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./LudoHome.css";

export default function LudoHome({ playerName }) {
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
    } else {
      cb();
    }
  }

  function handleJoined({ code: roomCode }) {
    saveSession(playerName, roomCode, "ludo");
    navigate(`/ludo/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      function onJoined(data) { socket.off("ludo-error", onErr); setPending(false); handleJoined(data); }
      function onErr({ message }) { socket.off("ludo-joined-room", onJoined); setPending(false); setError(message); }
      socket.once("ludo-joined-room", onJoined);
      socket.once("ludo-error", onErr);
      socket.emit("ludo-create-room", { name: playerName });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      function onJoined(data) { socket.off("ludo-error", onErr); setPending(false); handleJoined(data); }
      function onErr({ message }) { socket.off("ludo-joined-room", onJoined); setPending(false); setError(message); }
      socket.once("ludo-joined-room", onJoined);
      socket.once("ludo-error", onErr);
      socket.emit("ludo-join-room", { name: playerName, code: code.trim() });
    });
  }

  return (
    <div className="ludo-home">
      <div className="ludo-home-card">
        <button className="ludo-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="ludo-title">Ludo</h1>
        <p className="ludo-subtitle">Roll. Race. Win.</p>
        {playerName && <div className="ludo-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="ludo-buttons">
            <button className="lbtn lbtn-primary" onClick={handleCreate} disabled={!playerName || pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="lbtn lbtn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "join" && (
          <>
            <input
              className="ludo-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="ludo-error">{error}</p>}
            <div className="ludo-buttons">
              <button className="lbtn lbtn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="lbtn lbtn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && mode !== "join" && <p className="ludo-error">{error}</p>}
      </div>
    </div>
  );
}
