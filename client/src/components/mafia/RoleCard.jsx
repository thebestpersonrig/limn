import "./RoleCard.css";

const ROLE_DATA = {
  mafia: {
    emoji: "🔪",
    label: "Mafia",
    color: "#dc2626",
    bg: "#450a0a",
    desc: "Eliminate the townspeople at night without getting caught. Blend in during the day.",
    tip: "Coordinate with your team. Act natural in chat.",
  },
  detective: {
    emoji: "🔍",
    label: "Detective",
    color: "#3b82f6",
    bg: "#172554",
    desc: "Each night, investigate one player to learn if they are Mafia.",
    tip: "Share your findings carefully — the Mafia might target you.",
  },
  doctor: {
    emoji: "💊",
    label: "Doctor",
    color: "#22c55e",
    bg: "#052e16",
    desc: "Each night, protect one player (including yourself) from being killed.",
    tip: "Think about who the Mafia might target next.",
  },
  civilian: {
    emoji: "🏠",
    label: "Civilian",
    color: "#9ca3af",
    bg: "#1c1c2e",
    desc: "Find and vote out the Mafia during the day. Your voice matters.",
    tip: "Pay attention to who's acting suspicious.",
  },
};

export function RoleCardFull({ role, mafiaTeam }) {
  const data = ROLE_DATA[role] || ROLE_DATA.civilian;
  return (
    <div className="role-card-full" style={{ "--role-color": data.color, "--role-bg": data.bg }}>
      <div className="role-card-inner">
        <div className="role-card-alignment">
          {role === "mafia" ? "MAFIA" : "TOWN"}
        </div>
        <span className="role-card-emoji">{data.emoji}</span>
        <h2 className="role-card-label">You are the {data.label}</h2>
        <p className="role-card-desc">{data.desc}</p>
        <p className="role-card-tip">{data.tip}</p>
        {role === "mafia" && mafiaTeam.length > 1 && (
          <div className="role-card-team">
            <span className="role-card-team-label">Your allies:</span>
            {mafiaTeam.map(m => (
              <span key={m.id} className="role-card-team-name">{m.name}</span>
            ))}
          </div>
        )}
        <div className="role-card-dismiss">Memorize your role...</div>
      </div>
    </div>
  );
}

export function RoleBadge({ role }) {
  const data = ROLE_DATA[role] || ROLE_DATA.civilian;
  return (
    <div className="role-badge" style={{ "--role-color": data.color, "--role-bg": data.bg }}>
      <span className="role-badge-emoji">{data.emoji}</span>
      <span className="role-badge-label">{data.label}</span>
    </div>
  );
}
