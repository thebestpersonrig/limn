import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, getSavedName, saveSession } from "../hooks/useSocket";
import "./UnoHome.css";

function ensureConnected(socket, cb) {
  if (!socket.connected) {
    socket.connect();
    socket.once("connect", () => { socket.off("connect_error", onErr); cb(); });
    function onErr() {
      socket.off("connect", cb);
      cb("Can't reach the server. Try again in a moment.");
    }
    socket.once("connect_error", onErr);
  } else {
    cb();
  }
}

export default function UnoHome() {
  const navigate = useNavigate();
  const [view, setView] = useState("menu");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const playerName = getSavedName() || "Player";

  function handleCreate() {
    const socket = getSocket();
    setError("");
    setLoading(true);

    ensureConnected(socket, (err) => {
      if (err) { setError(err); setLoading(false); return; }

      socket.emit("uno-create-room", { name: playerName });

      socket.once("uno-joined-room", ({ code }) => {
        socket.off("uno-error", onError);
        setLoading(false);
        saveSession(playerName, code, "uno");
        navigate(`/uno/${code}`);
      });

      function onError({ message }) {
        socket.off("uno-joined-room", () => {});
        setLoading(false);
        setError(message);
      }
      socket.once("uno-error", onError);
    });
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const socket = getSocket();
    setError("");
    setLoading(true);

    ensureConnected(socket, (err) => {
      if (err) { setError(err); setLoading(false); return; }

      socket.emit("uno-join-room", { code, name: playerName });

      socket.once("uno-joined-room", ({ code: roomCode }) => {
        socket.off("uno-error", onError);
        setLoading(false);
        saveSession(playerName, roomCode, "uno");
        navigate(`/uno/${roomCode}`);
      });

      function onError({ message }) {
        socket.off("uno-joined-room", () => {});
        setLoading(false);
        setError(message);
      }
      socket.once("uno-error", onError);
    });
  }

  return (
    <div className="uno-home">
      <div className="uno-home-card">
        <button className="uno-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="uno-title">Uno</h1>
        <p className="uno-subtitle">Card Clash</p>
        <p className="uno-playing-as">Playing as <strong>{playerName}</strong></p>

        {error && <p className="uno-error">{error}</p>}

        {view === "menu" && (
          <div className="uno-buttons">
            <button className="uno-btn uno-btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "Create Room"}
            </button>
            <button className="uno-btn uno-btn-secondary" onClick={() => setView("join")} disabled={loading}>
              Join Room
            </button>
          </div>
        )}

        {view === "join" && (
          <>
            <input
              className="uno-input"
              placeholder="Room code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              maxLength={6}
              autoFocus
            />
            <div className="uno-buttons">
              <button className="uno-btn uno-btn-primary" onClick={handleJoin} disabled={!joinCode.trim() || loading}>
                {loading ? "Joining..." : "Join"}
              </button>
              <button className="uno-btn uno-btn-ghost" onClick={() => { setView("menu"); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
