import { useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./MafiaHome.css";

export default function MafiaHome({ playerName, onJoined, onBack }) {
  const [code,    setCode]    = useState("");
  const [mode,    setMode]    = useState(null); // null | "create" | "join"
  const [error,   setError]   = useState("");
  const [pending, setPending] = useState(false);

  // Role config (for creation)
  const [mafiaCount, setMafiaCount] = useState(1);
  const [detective,  setDetective]  = useState(true);
  const [doctor,     setDoctor]     = useState(true);

  // No URL parsing needed — /mafia/:code routes handle join links directly

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
      socket.emit("mafia-create-room", {
        name: playerName,
        roleConfig: { mafiaCount, detective, doctor },
      });
      socket.once("mafia-joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
      socket.once("mafia-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("mafia-join-room", { name: playerName, code: code.trim() });
      socket.once("mafia-joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
      socket.once("mafia-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="mafia-home">
      <div className="mafia-home-card">
        {onBack && <button className="mafia-back" onClick={onBack}>← Romp</button>}
        <h1 className="mafia-title">Mafia</h1>
        <p className="mafia-subtitle">Deceive. Accuse. Survive.</p>
        <div className="mafia-playing-as">Playing as <strong>{playerName}</strong></div>

        {mode === null && (
          <div className="mafia-buttons">
            <button className="mbtn mbtn-primary" onClick={() => setMode("create")}>Create Room</button>
            <button className="mbtn mbtn-secondary" onClick={() => setMode("join")}>Join Room</button>
          </div>
        )}

        {mode === "create" && (
          <>
            <div className="mafia-config">
              <h3 className="mafia-config-title">Role Setup</h3>

              <div className="config-row">
                <span className="config-label">Mafia</span>
                <div className="config-toggle-group">
                  {[1, 2].map(n => (
                    <button key={n}
                      className={`config-option ${mafiaCount === n ? "active" : ""}`}
                      onClick={() => setMafiaCount(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              <div className="config-row">
                <span className="config-label">Detective</span>
                <button className={`config-toggle ${detective ? "on" : ""}`} onClick={() => setDetective(!detective)}>
                  {detective ? "ON" : "OFF"}
                </button>
              </div>

              <div className="config-row">
                <span className="config-label">Doctor</span>
                <button className={`config-toggle ${doctor ? "on" : ""}`} onClick={() => setDoctor(!doctor)}>
                  {doctor ? "ON" : "OFF"}
                </button>
              </div>

              <div className="config-min">
                Min players: {mafiaCount + (detective ? 1 : 0) + (doctor ? 1 : 0) + 2}
              </div>
            </div>

            {error && <p className="mafia-error">{error}</p>}

            <div className="mafia-buttons">
              <button className="mbtn mbtn-primary" onClick={handleCreate} disabled={pending}>
                {pending ? "Creating…" : "Create Room →"}
              </button>
              <button className="mbtn mbtn-ghost" onClick={() => { setMode(null); setError(""); }} disabled={pending}>Back</button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <input
              className="mafia-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="mafia-error">{error}</p>}
            <div className="mafia-buttons">
              <button className="mbtn mbtn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining…" : "Join"}
              </button>
              <button className="mbtn mbtn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }} disabled={pending}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
