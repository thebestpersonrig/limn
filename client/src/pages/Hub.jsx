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
    id: "blitz",
    name: "Blitz",
    tagline: "Trivia Quiz",
    description: "Rapid-fire trivia rounds across wild categories. First to answer scores the most.",
    players: "2 – 10 players",
    emoji: "⚡",
    color: "#f59e0b",
    available: false,
  },
  {
    id: "cipher",
    name: "Cipher",
    tagline: "Word Puzzle",
    description: "Decode a hidden word before the clock runs out. Every letter costs you.",
    players: "2 – 6 players",
    emoji: "🔐",
    color: "#10b981",
    available: false,
  },
  {
    id: "heist",
    name: "Heist",
    tagline: "Social Deduction",
    description: "Someone in the room is the impostor. Vote smart. Trust no one.",
    players: "4 – 12 players",
    emoji: "🎭",
    color: "#ef4444",
    available: false,
  },
];

export default function Hub({ onSelectGame }) {
  return (
    <div className="hub">
      <header className="hub-header">
        <h1 className="hub-logo">Romp</h1>
        <p className="hub-tagline">Pick a game. Play with friends.</p>
      </header>

      <div className="hub-grid">
        {GAMES.map(game => (
          <div
            key={game.id}
            className={`game-card ${game.available ? "game-card--active" : "game-card--soon"}`}
            style={{ "--card-color": game.color }}
            onClick={() => game.available && onSelectGame(game.id)}
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
    </div>
  );
}
