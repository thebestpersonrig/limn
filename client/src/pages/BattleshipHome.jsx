import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./BattleshipHome.css";

export default function BattleshipHome({ playerName }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState(null); // null | "create" | "join"
  const [gameMode, setGameMode] = useState("classic");
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
    saveSession(playerName, roomCode, "battleship");
    navigate(`/battleship/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("battleship-create-room", { name: playerName, mode: gameMode });
      socket.once("battleship-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("battleship-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("battleship-join-room", { name: playerName, code: code.trim() });
      socket.once("battleship-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("battleship-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="bship-home">
      <div className="bship-home-card">
        <button className="bship-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="bship-title">Battleship</h1>
        <p className="bship-subtitle">Place. Fire. Sink.</p>
        {playerName && <div className="bship-playing-as">Playing as <strong>{playerName}</strong></div>}

        {mode === null && (
          <div className="bship-buttons">
            <button className="bship-btn bship-btn-primary" onClick={() => setMode("create")} disabled={!playerName}>
              Create Room
            </button>
            <button className="bship-btn bship-btn-secondary" onClick={() => setMode("join")} disabled={!playerName}>
              Join Room
            </button>
          </div>
        )}

        {mode === "create" && (
          <>
            <div className="bship-config">
              <h3 className="bship-config-title">Game Mode</h3>
              <div className="bship-config-row">
                <button
                  className={`bship-config-opt${gameMode === "classic" ? " active" : ""}`}
                  onClick={() => setGameMode("classic")}
                >
                  <span className="bship-config-opt-name">Classic</span>
                  <span className="bship-config-opt-desc">1 shot per turn, no abilities</span>
                </button>
                <button
                  className={`bship-config-opt${gameMode === "advanced" ? " active" : ""}`}
                  onClick={() => setGameMode("advanced")}
                >
                  <span className="bship-config-opt-name">Advanced</span>
                  <span className="bship-config-opt-desc">3 shots per turn + ship abilities</span>
                </button>
              </div>
            </div>

            {error && <p className="bship-error">{error}</p>}

            <div className="bship-buttons">
              <button className="bship-btn bship-btn-primary" onClick={handleCreate} disabled={pending}>
                {pending ? "Creating..." : "Create Room"}
              </button>
              <button className="bship-btn bship-btn-ghost" onClick={() => { setMode(null); setError(""); }} disabled={pending}>
                Back
              </button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <input
              className="bship-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="bship-error">{error}</p>}
            <div className="bship-buttons">
              <button className="bship-btn bship-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="bship-btn bship-btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }} disabled={pending}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
