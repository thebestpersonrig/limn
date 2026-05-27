import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Home.css";

export default function Home({ playerName, onJoined, onBack }) {
  const [code,    setCode]    = useState("");
  const [mode,    setMode]    = useState(null); // "create" | "join"
  const [error,   setError]   = useState("");
  const [pending, setPending] = useState(false);

  // Pre-fill code if URL has #join/CODE (shareable link)
  useEffect(() => {
    const match = window.location.hash.match(/join\/([A-Z0-9]+)/i);
    if (match) {
      setCode(match[1].toUpperCase());
      setMode("join");
    }
  }, []);

  function connect(cb) {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => {
        socket.off("connect_error", onErr);
        cb();
      });
      function onErr(err) {
        socket.off("connect", cb);
        setPending(false);
        setError("Can't reach the server — try again in a moment.");
        console.error("Socket connect error:", err.message);
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
      socket.emit("create-room", { name: playerName });
      socket.once("joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
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
      socket.once("joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
      socket.once("error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="home">
      <div className="home-card">
        {onBack && (
          <button className="home-back" onClick={onBack}>← Romp</button>
        )}
        <h1 className="home-title">Limn</h1>
        <p className="home-subtitle">Draw. Guess. Win.</p>

        <div className="home-playing-as">
          Playing as <strong>{playerName}</strong>
        </div>

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
              <button className="btn btn-primary" onClick={handleCreate} disabled={pending}>
                {pending ? "Creating…" : "Create Room"}
              </button>
              <button className="btn btn-secondary" onClick={() => setMode("join")} disabled={pending}>
                Join Room
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining…" : "Join"}
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
