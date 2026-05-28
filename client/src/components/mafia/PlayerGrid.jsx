import "./PlayerGrid.css";

const ROLE_COLORS = {
  mafia: "#dc2626",
  detective: "#3b82f6",
  doctor: "#22c55e",
  civilian: "#6b7280",
};

const ROLE_EMOJI = {
  mafia: "🔪",
  detective: "🔍",
  doctor: "💊",
  civilian: "🏠",
};

export default function PlayerGrid({ players, myId, phase, votes, onVote, myVote }) {
  // Build vote count + voter names map
  const voteData = {};
  (votes || []).forEach(({ voterId, voterName, targetId }) => {
    if (!voteData[targetId]) voteData[targetId] = { count: 0, voters: [] };
    voteData[targetId].count++;
    if (voterName) voteData[targetId].voters.push(voterName);
  });

  const isVoting = phase === "vote";
  const amAlive = players.find(p => p.id === myId)?.isAlive;

  return (
    <div className="pgrid">
      <div className="pgrid-section-label">
        {isVoting ? "Click to vote" : `Players (${players.filter(p => p.isAlive).length} alive)`}
      </div>
      {players.map(p => {
        const dead = !p.isAlive;
        const isMe = p.id === myId;
        // Allow re-voting: only block if dead or self
        const canVote = isVoting && amAlive && !isMe && !dead;
        const data = voteData[p.id];
        const votedByMe = myVote === p.id;

        return (
          <div
            key={p.id}
            className={[
              "pgrid-tile",
              dead && "dead",
              canVote && "votable",
              votedByMe && "voted-by-me",
              isMe && "is-me",
            ].filter(Boolean).join(" ")}
            onClick={() => canVote && onVote?.(p.id)}
          >
            <div className="pgrid-avatar" data-dead={dead}>
              {dead ? "💀" : p.name[0].toUpperCase()}
            </div>
            <span className="pgrid-name">
              {p.name}{isMe ? " (you)" : ""}
            </span>
            {dead && p.role && (
              <span className="pgrid-role-tag" style={{ color: ROLE_COLORS[p.role] || "#777" }}>
                {ROLE_EMOJI[p.role] || ""} {p.role}
              </span>
            )}
            {isVoting && data && (
              <div className="pgrid-vote-info">
                <span className="pgrid-vote-count">{data.count}</span>
                {data.voters.length > 0 && (
                  <span className="pgrid-vote-names">
                    {data.voters.join(", ")}
                  </span>
                )}
              </div>
            )}
            {votedByMe && <div className="pgrid-my-vote-marker">YOUR VOTE</div>}
          </div>
        );
      })}
    </div>
  );
}
