import "./RoleCard.css";

const ROLE_DATA = {
  mafia: {
    emoji: "🔪",
    label: "Mafia",
    color: "#dc2626",
    bg: "#450a0a",
    desc: "You are the Mafia. Eliminate the townspeople at night without getting caught.",
  },
  detective: {
    emoji: "🔍",
    label: "Detective",
    color: "#3b82f6",
    bg: "#172554",
    desc: "You are the Detective. Each night you can investigate one player to learn if they are Mafia.",
  },
  doctor: {
    emoji: "💊",
    label: "Doctor",
    color: "#22c55e",
    bg: "#052e16",
    desc: "You are the Doctor. Each night you can protect one player from being killed.",
  },
  civilian: {
    emoji: "🏠",
    label: "Civilian",
    color: "#9ca3af",
    bg: "#1c1c2e",
    desc: "You are a Civilian. Find and vote out the Mafia during the day.",
  },
};

export function RoleCardFull({ role, mafiaTeam }) {
  const data = ROLE_DATA[role] || ROLE_DATA.civilian;
  return (
    <div className="role-card-full" style={{ "--role-color": data.color, "--role-bg": data.bg }}>
      <div className="role-card-inner">
        <span className="role-card-emoji">{data.emoji}</span>
        <h2 className="role-card-label">{data.label}</h2>
        <p className="role-card-desc">{data.desc}</p>
        {role === "mafia" && mafiaTeam.length > 1 && (
          <div className="role-card-team">
            <span className="role-card-team-label">Your team:</span>
            {mafiaTeam.map(m => (
              <span key={m.id} className="role-card-team-name">{m.name}</span>
            ))}
          </div>
        )}
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
