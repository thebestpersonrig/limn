import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Hub.css";

const GAMES = [
  {
    id: "limn",
    name: "Limn",
    tagline: "Draw & Guess",
    description: "One player draws, everyone else races to guess. Score big by thinking fast.",
    players: "2 – 8 players",
    emoji: "🎨",
    color: "#6c63ff",
    available: true,
  },
  {
    id: "monopoly",
    name: "Monopoly",
    tagline: "Property Trading",
    description: "Buy, build, and bankrupt your friends. The classic board game, online.",
    players: "2 – 6 players",
    emoji: "🏠",
    color: "#00A651",
    available: true,
  },
  {
    id: "mafia",
    name: "Mafia",
    tagline: "Social Deduction",
    description: "The Mafia hides among you. Discuss, accuse, and vote before night falls.",
    players: "4 – 12 players",
    emoji: "🔪",
    color: "#dc2626",
    available: true,
  },
];

function NamePrompt({ title, defaultValue = "", onConfirm }) {
  const [value, setValue] = useState(defaultValue);

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="name-overlay">
      <div className="name-card">
        <h2 className="name-card-title">{title}</h2>
        <p className="name-card-sub">This is how other players will see you across all games.</p>
        <input
          className="name-card-input"
          autoFocus
          placeholder="Your name"
          maxLength={20}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        <button className="name-card-btn" onClick={submit} disabled={!value.trim()}>
          {defaultValue ? "Save" : "Let's play →"}
        </button>
      </div>
    </div>
  );
}

export default function Hub({ playerName, onNameChange, onSelectGame }) {
  const [editing, setEditing] = useState(false);

  function handleNameSet(name) {
    onNameChange(name);
    setEditing(false);
  }

  return (
    <div className="hub">
      <header className="hub-header">
        <div className="hub-header-row">
          <h1 className="hub-logo">Romp</h1>
          {playerName && (
            <button className="hub-name-chip" onClick={() => setEditing(true)} title="Change name">
              <span className="hub-name-text">{playerName}</span>
              <span className="hub-name-edit">✎</span>
            </button>
          )}
        </div>
        <p className="hub-tagline">Pick a game. Play with friends.</p>
      </header>

      <div className="hub-grid">
        {GAMES.map(game => (
          <div
            key={game.id}
            className={`game-card ${game.available ? "game-card--active" : "game-card--soon"}`}
            style={{ "--card-color": game.color }}
            onClick={() => game.available && playerName && onSelectGame(game.id)}
          >
            <div className="game-card-accent" />
            <div className="game-card-body">
              <span className="game-card-emoji">{game.emoji}</span>
              <div className="game-card-info">
                <div className="game-card-title-row">
                  <h2 className="game-card-name">{game.name}</h2>
                  {!game.available && <span className="soon-badge">SOON</span>}
                </div>
                <p className="game-card-tagline">{game.tagline}</p>
                <p className="game-card-desc">{game.description}</p>
              </div>
              <div className="game-card-footer">
                <span className="game-card-players">{game.players}</span>
                {game.available
                  ? <button className="game-card-btn" tabIndex={-1}>Play →</button>
                  : <span className="game-card-coming">Coming soon</span>
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* First-time name prompt */}
      {!playerName && (
        <NamePrompt
          title="Welcome to Romp"
          onConfirm={handleNameSet}
        />
      )}

      {/* Change-name prompt */}
      {editing && (
        <NamePrompt
          title="Change your name"
          defaultValue={playerName}
          onConfirm={handleNameSet}
        />
      )}
    </div>
  );
}
