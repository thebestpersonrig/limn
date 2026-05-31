import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, saveSession } from "../hooks/useSocket";
import "./TicTacToeHome.css";

export default function TicTacToeHome({ playerName }) {
  const navigate = useNavigate();
  const [view, setView] = useState(null); // null | "online" | "create" | "join"
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
    saveSession(playerName, roomCode, "tictactoe");
    navigate(`/tictactoe/${roomCode}`);
  }

  function handleCreate() {
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("ttt-create-room", { name: playerName });
      socket.once("ttt-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("ttt-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError(""); setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("ttt-join-room", { name: playerName, code: code.trim() });
      socket.once("ttt-joined-room", (data) => { setPending(false); handleJoined(data); });
      socket.once("ttt-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="ttt-home">
      <div className="ttt-home-card">
        <button className="ttt-home-back" onClick={() => navigate("/")}>Back to Romp</button>
        <h1 className="ttt-home-title">Tic-Tac-Toe</h1>
        <p className="ttt-home-subtitle">Classic Strategy</p>
        {playerName && <div className="ttt-home-playing-as">Playing as <strong>{playerName}</strong></div>}

        {view === null && (
          <div className="ttt-home-buttons">
            <button className="ttt-home-btn ttt-home-btn-primary" onClick={() => setView("online")} disabled={!playerName}>
              Play Online
            </button>
            <button className="ttt-home-btn ttt-home-btn-secondary" onClick={() => navigate("/tictactoe/ai")}>
              Play vs AI
            </button>
          </div>
        )}

        {view === "online" && (
          <div className="ttt-home-buttons">
            <button className="ttt-home-btn ttt-home-btn-primary" onClick={handleCreate} disabled={pending}>
              {pending ? "Creating..." : "Create Room"}
            </button>
            <button className="ttt-home-btn ttt-home-btn-secondary" onClick={() => setView("join")} disabled={pending}>
              Join Room
            </button>
            <button className="ttt-home-btn ttt-home-btn-ghost" onClick={() => { setView(null); setError(""); }}>
              Back
            </button>
          </div>
        )}

        {view === "join" && (
          <>
            <input
              className="ttt-home-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="ttt-home-error">{error}</p>}
            <div className="ttt-home-buttons">
              <button className="ttt-home-btn ttt-home-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining..." : "Join"}
              </button>
              <button className="ttt-home-btn ttt-home-btn-ghost" onClick={() => { setView("online"); setCode(""); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {error && view !== "join" && <p className="ttt-home-error">{error}</p>}
      </div>
    </div>
  );
}
