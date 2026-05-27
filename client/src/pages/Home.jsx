import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Home.css";

export default function Home({ onJoined }) {
  const [name,    setName]    = useState("");
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
      socket.once("connect", cb);
    } else {
      cb();
    }
  }

  function handleCreate() {
    if (!name.trim()) return setError("Enter your name first.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("create-room", { name: name.trim() });
      socket.once("joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState, playerName: name.trim() });
      });
      socket.once("error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!name.trim()) return setError("Enter your name first.");
    if (!code.trim()) return setError("Enter a room code.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("join-room", { name: name.trim(), code: code.trim() });
      socket.once("joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState, playerName: name.trim() });
      });
      socket.once("error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="home">
      <div className="home-card">
        <h1 className="home-title">Limn</h1>
        <p className="home-subtitle">Draw. Guess. Win.</p>

        <input
          className="home-input"
          placeholder="Your name"
          value={name}
          maxLength={20}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && mode === "join" && handleJoin()}
        />

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
              <button className="btn btn-primary" onClick={handleCreate}>Create Room</button>
              <button className="btn btn-secondary" onClick={() => setMode("join")}>Join Room</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleJoin}>Join</button>
              <button className="btn btn-ghost" onClick={() => { setMode(null); setCode(""); }}>Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
