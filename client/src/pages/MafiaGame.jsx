import { useEffect, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import { RoleCardFull, RoleBadge } from "../components/mafia/RoleCard";
import PlayerGrid from "../components/mafia/PlayerGrid";
import ChatPanel from "../components/mafia/ChatPanel";
import NightPanel from "../components/mafia/NightPanel";
import "./MafiaGame.css";

const TRANSITION_TEXT = {
  night:       { icon: "🌙", title: "Night falls...", sub: "The town sleeps. Evil lurks in the shadows." },
  day:         { icon: "☀️", title: "Dawn breaks", sub: "The town gathers to discuss." },
  vote:        { icon: "🗳️", title: "Time to vote", sub: "Choose who to eliminate." },
  elimResult:  { icon: "⚰️", title: "The verdict...", sub: "" },
  nightResult: { icon: "🌅", title: "The sun rises...", sub: "What happened last night?" },
  hunterShot:  { icon: "🏹", title: "The Hunter strikes!", sub: "A final shot from beyond..." },
};

export default function MafiaGame({ initialRole }) {
  const socket = getSocket();
  const myId = socket.id;

  const [phase,     setPhase]     = useState("roleReveal");
  const [day,       setDay]       = useState(0);
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [players,   setPlayers]   = useState([]);
  const [myRole,    setMyRole]    = useState(initialRole?.role ?? null);
  const [mafiaTeam, setMafiaTeam] = useState(initialRole?.mafiaTeam ?? []);
  const [showRole,  setShowRole]  = useState(!!initialRole?.role);

  // Chat
  const [dayMessages,   setDayMessages]   = useState([]);
  const [mafiaMessages, setMafiaMessages] = useState([]);

  // Vote
  const [votes,     setVotes]     = useState([]);
  const [lastVote,  setLastVote]  = useState(null);

  // Night
  const [nightActionDone,  setNightActionDone]  = useState(false);
  const [detectiveResult,  setDetectiveResult]  = useState(null);
  const [witchReveal,      setWitchReveal]      = useState(null);
  const [witchHealUsed,    setWitchHealUsed]    = useState(false);
  const [witchKillUsed,    setWitchKillUsed]    = useState(false);

  // Results
  const [elimResult,  setElimResult]  = useState(null);
  const [nightResult, setNightResult] = useState(null);

  // Hunter shot
  const [hunterShotActive, setHunterShotActive] = useState(false);
  const [hunterTargets,    setHunterTargets]    = useState([]);
  const [hunterResult,     setHunterResult]     = useState(null);

  // Jester
  const [jesterWin, setJesterWin] = useState(null);

  // Transitions
  const [transition, setTransition] = useState(null);
  const transitionTimer = useRef(null);

  function showTransition(phaseKey) {
    const t = TRANSITION_TEXT[phaseKey];
    if (!t) return;
    setTransition(t);
    clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => setTransition(null), 2000);
  }

  // Auto-dismiss role card when mounting mid-roleReveal
  useEffect(() => {
    if (showRole && myRole) {
      const t = setTimeout(() => setShowRole(false), 4500);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onRoleAssigned({ role, mafiaTeam }) {
      setMyRole(role);
      setMafiaTeam(mafiaTeam);
      setShowRole(true);
      setTimeout(() => setShowRole(false), 4500);
    }

    function onPhase({ phase: p, day: d, timeLeft: tl, players: pl }) {
      if (["night", "day", "vote", "hunterShot"].includes(p)) {
        showTransition(p);
      }

      setPhase(p);
      if (d !== undefined) setDay(d);
      if (tl !== undefined) setTimeLeft(tl);
      if (pl) setPlayers(pl);

      if (p === "day") {
        setVotes([]);
        setLastVote(null);
        setElimResult(null);
        setNightResult(null);
        setHunterResult(null);
        setJesterWin(null);
        setMafiaMessages([]);
      }
      if (p === "vote") {
        setVotes([]);
        setLastVote(null);
      }
      if (p === "night") {
        setNightActionDone(false);
        setDetectiveResult(null);
        setWitchReveal(null);
      }
      if (p === "roleReveal") {
        setShowRole(true);
        setTimeout(() => setShowRole(false), 4500);
      }
      if (p === "hunterShot") {
        setHunterResult(null);
      }
    }

    function onTick({ timeLeft: tl }) { setTimeLeft(tl); }

    function onDayMessage(msg)   { setDayMessages(prev => [...prev, msg]); }
    function onNightMessage(msg) { setMafiaMessages(prev => [...prev, msg]); }

    function onVoteUpdate({ votes: v, latestVote }) {
      setVotes(v);
      if (latestVote) setLastVote(latestVote);
    }

    function onElimResult({ eliminated, players: pl }) {
      setElimResult(eliminated);
      if (pl) setPlayers(pl);
    }

    function onNightResult({ killed, witchKilled, saved, witchSaved, players: pl }) {
      setNightResult({ killed, witchKilled, saved, witchSaved });
      if (pl) setPlayers(pl);
    }

    function onActionConfirmed() { setNightActionDone(true); }
    function onDetectiveResult(result) { setDetectiveResult(result); }

    function onWitchReveal(data) { setWitchReveal(data); }

    function onHunterShot({ targets }) {
      setHunterShotActive(true);
      setHunterTargets(targets || []);
    }

    function onHunterResultEvent({ target, hunterName }) {
      setHunterShotActive(false);
      setHunterResult({ target, hunterName });
    }

    function onJesterWin({ jesterName }) {
      setJesterWin(jesterName);
    }

    function onRoomState(state) {
      setPlayers(state.players);
      setPhase(state.phase);
      setDay(state.day);
      if (state.witchHealUsed !== undefined) setWitchHealUsed(state.witchHealUsed);
      if (state.witchKillUsed !== undefined) setWitchKillUsed(state.witchKillUsed);
    }

    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId, name }) {
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, isAlive: false } : p));
      setDayMessages(prev => [...prev, { system: true, text: `${name || "A player"} disconnected.` }]);
    }

    socket.on("mafia-role-assigned",    onRoleAssigned);
    socket.on("mafia-phase",            onPhase);
    socket.on("mafia-timer-tick",        onTick);
    socket.on("mafia-day-message",       onDayMessage);
    socket.on("mafia-night-message",     onNightMessage);
    socket.on("mafia-vote-update",       onVoteUpdate);
    socket.on("mafia-elim-result",       onElimResult);
    socket.on("mafia-night-result",      onNightResult);
    socket.on("mafia-action-confirmed",  onActionConfirmed);
    socket.on("mafia-detective-result",  onDetectiveResult);
    socket.on("mafia-witch-reveal",      onWitchReveal);
    socket.on("mafia-hunter-shot",       onHunterShot);
    socket.on("mafia-hunter-result",     onHunterResultEvent);
    socket.on("mafia-jester-win",        onJesterWin);
    socket.on("mafia-room-state",        onRoomState);
    socket.on("mafia-player-joined",     onPlayerJoined);
    socket.on("mafia-player-left",       onPlayerLeft);

    return () => {
      socket.off("mafia-role-assigned",    onRoleAssigned);
      socket.off("mafia-phase",            onPhase);
      socket.off("mafia-timer-tick",        onTick);
      socket.off("mafia-day-message",       onDayMessage);
      socket.off("mafia-night-message",     onNightMessage);
      socket.off("mafia-vote-update",       onVoteUpdate);
      socket.off("mafia-elim-result",       onElimResult);
      socket.off("mafia-night-result",      onNightResult);
      socket.off("mafia-action-confirmed",  onActionConfirmed);
      socket.off("mafia-detective-result",  onDetectiveResult);
      socket.off("mafia-witch-reveal",      onWitchReveal);
      socket.off("mafia-hunter-shot",       onHunterShot);
      socket.off("mafia-hunter-result",     onHunterResultEvent);
      socket.off("mafia-jester-win",        onJesterWin);
      socket.off("mafia-room-state",        onRoomState);
      socket.off("mafia-player-joined",     onPlayerJoined);
      socket.off("mafia-player-left",       onPlayerLeft);
      clearTimeout(transitionTimer.current);
    };
  }, []);

  function sendDayChat(text)  { socket.emit("mafia-day-chat",   { text }); }
  function sendNightChat(text) { socket.emit("mafia-night-chat", { text }); }
  function sendVote(targetId)  { socket.emit("mafia-vote",       { targetId }); }
  function sendNightAction(targetId) { socket.emit("mafia-night-action", { targetId }); }
  function sendWitchAction(data) { socket.emit("mafia-witch-action", data); }
  function sendHunterAction(targetId) { socket.emit("mafia-hunter-action", { targetId }); }

  const me = players.find(p => p.id === myId);
  const amAlive = me?.isAlive ?? true;
  const isNight = phase === "night" || phase === "nightResult";
  const timerWarning = timeLeft > 0 && timeLeft <= 10;
  const myVote = votes.find(v => v.voterId === myId)?.targetId ?? null;

  // Phase label
  const phaseLabels = {
    roleReveal: "Role Reveal",
    day: "Discussion",
    vote: "Voting",
    elimResult: "Elimination",
    hunterShot: "Hunter's Shot",
    night: "Night",
    nightResult: "Dawn",
  };

  // Alive count
  const aliveCount = players.filter(p => p.isAlive).length;

  return (
    <div className={`mgame ${isNight ? "mgame--night" : ""}`}>
      {/* Header */}
      <div className="mgame-header">
        <h1 className="mgame-logo">Mafia</h1>
        <div className="mgame-status">
          {day > 0 && <span className="mgame-day">Day {day}</span>}
          <span className={`mgame-phase-badge phase-${phase}`}>
            {phaseLabels[phase] || phase}
          </span>
          {(phase === "day" || phase === "vote" || phase === "night" || phase === "hunterShot") && timeLeft > 0 && (
            <span className={`mgame-timer ${timerWarning ? "mgame-timer--warn" : ""}`}>
              {timeLeft}s
            </span>
          )}
        </div>
        <div className="mgame-header-right">
          <span className="mgame-alive-count">{aliveCount} alive</span>
          {myRole && <RoleBadge role={myRole} />}
        </div>
      </div>

      {/* Dead spectator banner */}
      {!amAlive && phase !== "roleReveal" && phase !== "hunterShot" && (
        <div className="mgame-dead-banner">
          <span>💀</span> You were eliminated. Watching as a ghost...
        </div>
      )}

      {/* Main layout */}
      <div className="mgame-body">
        {/* Left: Player grid */}
        <div className="mgame-players">
          <PlayerGrid
            players={players}
            myId={myId}
            phase={phase}
            votes={votes}
            onVote={sendVote}
            myVote={myVote}
          />
        </div>

        {/* Right: Phase panel */}
        <div className="mgame-panel">
          {(phase === "day" || phase === "vote") && (
            <ChatPanel
              messages={dayMessages}
              onSend={sendDayChat}
              disabled={!amAlive}
              label={phase === "vote" ? "Chat (voting open)" : `Town Discussion -- Day ${day}`}
              variant="day"
            />
          )}

          {phase === "night" && myRole === "mafia" && (
            <div className="mgame-night-split">
              <ChatPanel
                messages={mafiaMessages}
                onSend={sendNightChat}
                disabled={!amAlive}
                label="Mafia Chat"
                variant="mafia"
              />
              <NightPanel
                role={myRole}
                players={players}
                myId={myId}
                onAction={sendNightAction}
                actionDone={nightActionDone}
                detectiveResult={null}
              />
            </div>
          )}

          {phase === "night" && myRole !== "mafia" && (
            <NightPanel
              role={myRole}
              players={players}
              myId={myId}
              onAction={sendNightAction}
              onWitchAction={sendWitchAction}
              actionDone={nightActionDone}
              detectiveResult={detectiveResult}
              witchReveal={witchReveal}
              witchHealUsed={witchHealUsed}
              witchKillUsed={witchKillUsed}
            />
          )}

          {phase === "elimResult" && (
            <div className="mgame-result-overlay mgame-result--elim">
              {elimResult ? (
                <>
                  <span className="mgame-result-icon">⚰️</span>
                  <p className="mgame-result-text">
                    <strong>{elimResult.name}</strong> was eliminated by the town.
                  </p>
                  <p className="mgame-result-role">
                    They were <strong>{elimResult.role}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <span className="mgame-result-icon">🤷</span>
                  <p className="mgame-result-text">
                    The town couldn't agree.
                  </p>
                  <p className="mgame-result-sub">No one was eliminated.</p>
                </>
              )}
              {jesterWin && (
                <div className="mgame-jester-toast">
                  🃏 <strong>{jesterWin}</strong> was the Jester and wins!
                </div>
              )}
            </div>
          )}

          {phase === "hunterShot" && (
            <div className="mgame-result-overlay mgame-result--hunter">
              {hunterShotActive && myRole === "hunter" && !amAlive ? (
                <HunterShotPicker
                  targets={hunterTargets}
                  timeLeft={timeLeft}
                  onShoot={sendHunterAction}
                />
              ) : hunterResult ? (
                <>
                  <span className="mgame-result-icon">🏹</span>
                  <p className="mgame-result-text">
                    <strong>{hunterResult.hunterName}</strong> fires a final shot!
                  </p>
                  {hunterResult.target ? (
                    <p className="mgame-result-role">
                      <strong>{hunterResult.target.name}</strong> ({hunterResult.target.role}) was killed.
                    </p>
                  ) : (
                    <p className="mgame-result-sub">The shot missed.</p>
                  )}
                </>
              ) : (
                <>
                  <span className="mgame-result-icon">🏹</span>
                  <p className="mgame-result-text">The Hunter is taking aim...</p>
                  <div className="mgame-loading-dots"><span /><span /><span /></div>
                </>
              )}
            </div>
          )}

          {phase === "nightResult" && (
            <div className="mgame-result-overlay mgame-result--night">
              {nightResult?.killed ? (
                <>
                  <span className="mgame-result-icon">💀</span>
                  <p className="mgame-result-text">
                    <strong>{nightResult.killed.name}</strong> was found dead.
                  </p>
                  <p className="mgame-result-role">
                    They were <strong>{nightResult.killed.role}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <span className="mgame-result-icon">{nightResult?.saved ? "💊" : "☀️"}</span>
                  <p className="mgame-result-text">
                    {nightResult?.saved
                      ? (nightResult?.witchSaved ? "The Witch saved a life!" : "The Doctor saved a life!")
                      : "A peaceful night. No one was killed."
                    }
                  </p>
                </>
              )}
              {nightResult?.witchKilled && (
                <div className="mgame-witch-kill-result">
                  <span>🧪</span>
                  <p>
                    <strong>{nightResult.witchKilled.name}</strong> was poisoned by the Witch.
                    They were <strong>{nightResult.witchKilled.role}</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {phase === "roleReveal" && !showRole && (
            <div className="mgame-result-overlay">
              <span className="mgame-result-icon">🌅</span>
              <p className="mgame-result-text">The game is about to begin...</p>
              <div className="mgame-loading-dots"><span /><span /><span /></div>
            </div>
          )}
        </div>
      </div>

      {/* Phase transition overlay */}
      {transition && (
        <div className="mgame-transition" key={transition.title}>
          <span className="mgame-transition-icon">{transition.icon}</span>
          <h2 className="mgame-transition-title">{transition.title}</h2>
          {transition.sub && <p className="mgame-transition-sub">{transition.sub}</p>}
        </div>
      )}

      {/* Role reveal overlay */}
      {showRole && myRole && phase === "roleReveal" && (
        <RoleCardFull role={myRole} mafiaTeam={mafiaTeam} />
      )}
    </div>
  );
}

function HunterShotPicker({ targets, timeLeft, onShoot }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="mgame-hunter-picker">
      <span className="mgame-result-icon">🏹</span>
      <p className="mgame-result-text">You died! Choose someone to take with you.</p>
      {timeLeft > 0 && <span className="mgame-hunter-timer">{timeLeft}s</span>}
      <div className="mgame-hunter-targets">
        {targets.map(p => (
          <button
            key={p.id}
            className={`mgame-hunter-target ${selected === p.id ? "selected" : ""}`}
            onClick={() => setSelected(p.id)}
          >
            <span className="mgame-hunter-avatar">{p.name[0].toUpperCase()}</span>
            {p.name}
          </button>
        ))}
      </div>
      <button
        className="mgame-hunter-shoot"
        disabled={!selected}
        onClick={() => { if (selected) onShoot(selected); }}
      >
        Shoot
      </button>
    </div>
  );
}
