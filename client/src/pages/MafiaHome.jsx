import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./MafiaHome.css";

export default function MafiaHome({ playerName }) {
  const navigate = useNavigate();
  const [code,    setCode]    = useState("");
  const [mode,    setMode]    = useState(null); // null | "create" | "join"
  const [error,   setError]   = useState("");
  const [pending, setPending] = useState(false);

  // Role config (for creation)
  const [mafiaCount, setMafiaCount] = useState(1);
  const [detective,  setDetective]  = useState(true);
  const [doctor,     setDoctor]     = useState(true);
  const [hunter,     setHunter]     = useState(false);
  const [jester,     setJester]     = useState(false);
  const [witch,      setWitch]      = useState(false);

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
    saveSession(playerName, roomCode, "mafia");
    navigate(`/mafia/${roomCode}`);
  }

  function handleCreate() {
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("mafia-create-room", {
        name: playerName,
        roleConfig: { mafiaCount, detective, doctor, hunter, jester, witch },
      });
      socket.once("mafia-joined-room", (data) => { setPending(false); handleJoined(data); });
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
      socket.once("mafia-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("mafia-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="mafia-home">
      <div className="mafia-home-card">
        <button className="mafia-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="mafia-title">Mafia</h1>
        <p className="mafia-subtitle">Deceive. Accuse. Survive.</p>
        {playerName && <div className="mafia-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="mafia-buttons">
            <button className="mbtn mbtn-primary" onClick={() => setMode("create")} disabled={!playerName}>Create Room</button>
            <button className="mbtn mbtn-secondary" onClick={() => setMode("join")} disabled={!playerName}>Join Room</button>
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

              <div className="config-row">
                <span className="config-label">Hunter</span>
                <button className={`config-toggle ${hunter ? "on" : ""}`} onClick={() => setHunter(!hunter)}>
                  {hunter ? "ON" : "OFF"}
                </button>
              </div>

              <div className="config-row">
                <span className="config-label">Witch</span>
                <button className={`config-toggle ${witch ? "on" : ""}`} onClick={() => setWitch(!witch)}>
                  {witch ? "ON" : "OFF"}
                </button>
              </div>

              <div className="config-row">
                <span className="config-label">Jester</span>
                <button className={`config-toggle ${jester ? "on" : ""}`} onClick={() => setJester(!jester)}>
                  {jester ? "ON" : "OFF"}
                </button>
              </div>

              <div className="config-min">
                Min players: {mafiaCount + (detective ? 1 : 0) + (doctor ? 1 : 0) + (hunter ? 1 : 0) + (witch ? 1 : 0) + (jester ? 1 : 0) + 2}
              </div>
            </div>

            {error && <p className="mafia-error">{error}</p>}

            <div className="mafia-buttons">
              <button className="mbtn mbtn-primary" onClick={handleCreate} disabled={pending}>
                {pending ? "Creating..." : "Create Room"}
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
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="mbtn mbtn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }} disabled={pending}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
