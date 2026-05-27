import "./PlayerGrid.css";

const ROLE_COLORS = {
  mafia: "#dc2626",
  detective: "#3b82f6",
  doctor: "#22c55e",
  civilian: "#6b7280",
};

export default function PlayerGrid({ players, myId, phase, votes, onVote }) {
  // Build vote count map
  const voteCounts = {};
  (votes || []).forEach(({ targetId }) => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });
  const myVote = (votes || []).find(v => v.voterId === myId)?.targetId;
  const isVoting = phase === "vote";
  const amAlive = players.find(p => p.id === myId)?.isAlive;

  return (
    <div className="pgrid">
      {players.map(p => {
        const dead = !p.isAlive;
        const isMe = p.id === myId;
        const canVote = isVoting && amAlive && !isMe && !dead && !myVote;
        const voteCount = voteCounts[p.id] || 0;
        const votedByMe = myVote === p.id;

        return (
          <div
            key={p.id}
            className={`pgrid-tile ${dead ? "dead" : ""} ${canVote ? "votable" : ""} ${votedByMe ? "voted-by-me" : ""}`}
            onClick={() => canVote && onVote?.(p.id)}
          >
            <div className="pgrid-avatar" data-dead={dead}>
              {dead ? "💀" : p.name[0].toUpperCase()}
            </div>
            <span className={`pgrid-name ${isMe ? "is-me" : ""}`}>
              {p.name}{isMe ? " (you)" : ""}
            </span>
            {dead && p.role && (
              <span className="pgrid-role-tag" style={{ color: ROLE_COLORS[p.role] || "#777" }}>
                {p.role}
              </span>
            )}
            {isVoting && voteCount > 0 && (
              <span className="pgrid-vote-count">{voteCount} vote{voteCount > 1 ? "s" : ""}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
