import { useState } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";

export default function App() {
  const [screen, setScreen] = useState("home"); // home | lobby | game | end
  const [sessionData, setSessionData] = useState(null);
  const [roundData, setRoundData] = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);

  function handleJoined({ code, roomState, playerName }) {
    setSessionData({ code, roomState, playerName });
    setScreen("lobby");
  }

  function handleGameStart(data) {
    setRoundData(data);
    setScreen("game");
  }

  function handleGameEnd(players) {
    setFinalPlayers(players);
    setScreen("end");
  }

  if (screen === "home") {
    return <Home onJoined={handleJoined} />;
  }

  if (screen === "lobby") {
    return (
      <Lobby
        code={sessionData.code}
        roomState={sessionData.roomState}
        playerName={sessionData.playerName}
        onGameStart={handleGameStart}
      />
    );
  }

  if (screen === "game") {
    return <Game initialRoundData={roundData} onGameEnd={handleGameEnd} />;
  }

  if (screen === "end") {
    const sorted = [...(finalPlayers ?? [])].sort((a, b) => b.score - a.score);
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f13", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 16, padding: "40px 48px", textAlign: "center", minWidth: 320 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 36, color: "#fff", margin: "0 0 8px" }}>Game Over</h2>
          <p style={{ color: "#555", marginBottom: 24 }}>Final Scores</p>
          {sorted.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={{ width: 28, color: i === 0 ? "#facc15" : "#555", fontWeight: 700 }}>#{i + 1}</span>
              <span style={{ flex: 1, color: "#ddd", textAlign: "left" }}>{p.name}</span>
              <span style={{ color: "#6c63ff", fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
          <button
            onClick={() => { setScreen("home"); setSessionData(null); setRoundData(null); setFinalPlayers(null); }}
            style={{ marginTop: 24, width: "100%", padding: "13px", background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }
}
