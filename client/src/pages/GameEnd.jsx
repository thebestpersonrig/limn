import "./GameEnd.css";

const RANK_COLORS = ["#fbbf24", "#9ca3af", "#d97706"];
const PODIUM_HEIGHTS = [90, 120, 70]; // 2nd, 1st, 3rd

export default function GameEnd({ players, onPlayAgain }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const top3   = sorted.slice(0, 3);
  const rest   = sorted.slice(3);

  // Podium order: 2nd, 1st, 3rd
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumRanks = top3[1] ? [2, 1, 3] : [1];

  return (
    <div className="game-end">
      <div className="ge-card">
        <h2 className="ge-title">Game Over</h2>

        {sorted.length >= 2 && (
          <div className="ge-podium">
            {podium.map((p, i) => {
              const rank = podiumRanks[i];
              return (
                <div key={p.id} className={`ge-podium-slot rank-${rank}`}>
                  <div className="ge-podium-name">{p.name}</div>
                  <div className="ge-podium-score" style={{ color: RANK_COLORS[rank - 1] }}>
                    {p.score}
                  </div>
                  <div className="ge-podium-bar" style={{ height: PODIUM_HEIGHTS[i], background: RANK_COLORS[rank - 1] }}>
                    <span className="ge-podium-rank">#{rank}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rest.length > 0 && (
          <div className="ge-rest">
            {rest.map((p, i) => (
              <div key={p.id} className="ge-rest-row">
                <span className="ge-rest-rank">#{i + 4}</span>
                <span className="ge-rest-name">{p.name}</span>
                <span className="ge-rest-score">{p.score}</span>
              </div>
            ))}
          </div>
        )}

        {sorted.length === 1 && (
          <div className="ge-solo">
            <div className="ge-solo-name">{sorted[0].name}</div>
            <div className="ge-solo-score">{sorted[0].score} pts</div>
          </div>
        )}

        <button className="ge-play-again" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
