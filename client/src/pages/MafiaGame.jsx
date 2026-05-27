import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import { RoleCardFull, RoleBadge } from "../components/mafia/RoleCard";
import PlayerGrid from "../components/mafia/PlayerGrid";
import ChatPanel from "../components/mafia/ChatPanel";
import NightPanel from "../components/mafia/NightPanel";
import "./MafiaGame.css";

export default function MafiaGame() {
  const socket = getSocket();
  const myId = socket.id;

  const [phase,     setPhase]     = useState("roleReveal");
  const [day,       setDay]       = useState(0);
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [players,   setPlayers]   = useState([]);
  const [myRole,    setMyRole]    = useState(null);
  const [mafiaTeam, setMafiaTeam] = useState([]);
  const [showRole,  setShowRole]  = useState(true);

  // Chat
  const [dayMessages,   setDayMessages]   = useState([]);
  const [mafiaMessages, setMafiaMessages] = useState([]);

  // Vote
  const [votes, setVotes] = useState([]);

  // Night
  const [nightActionDone,  setNightActionDone]  = useState(false);
  const [detectiveResult,  setDetectiveResult]  = useState(null);

  // Results
  const [elimResult,  setElimResult]  = useState(null);
  const [nightResult, setNightResult] = useState(null);

  useEffect(() => {
    function onRoleAssigned({ role, mafiaTeam }) {
      setMyRole(role);
      setMafiaTeam(mafiaTeam);
      setShowRole(true);
    }

    function onPhase({ phase, day, timeLeft, alivePlayers }) {
      setPhase(phase);
      if (day !== undefined) setDay(day);
      if (timeLeft !== undefined) setTimeLeft(timeLeft);
      if (alivePlayers) setPlayers(prev => {
        // Merge alive status into existing players
        const map = new Map(prev.map(p => [p.id, p]));
        alivePlayers.forEach(p => map.set(p.id, { ...map.get(p.id), ...p }));
        return [...map.values()];
      });

      if (phase === "day" || phase === "vote") {
        setElimResult(null);
        setNightResult(null);
      }
      if (phase === "day") {
        setVotes([]);
      }
      if (phase === "night") {
        setNightActionDone(false);
        setDetectiveResult(null);
      }
      if (phase === "roleReveal") {
        setShowRole(true);
        setTimeout(() => setShowRole(false), 4500);
      }
    }

    function onTick({ timeLeft }) { setTimeLeft(timeLeft); }

    function onDayMessage(msg)   { setDayMessages(prev => [...prev, msg]); }
    function onNightMessage(msg) { setMafiaMessages(prev => [...prev, msg]); }

    function onVoteUpdate({ votes }) { setVotes(votes); }

    function onElimResult({ eliminated }) {
      setElimResult(eliminated);
      if (eliminated) {
        setPlayers(prev => prev.map(p =>
          p.id === eliminated.id ? { ...p, isAlive: false, role: eliminated.role } : p
        ));
      }
    }

    function onNightResult({ killed, saved }) {
      setNightResult({ killed, saved });
      if (killed) {
        setPlayers(prev => prev.map(p =>
          p.id === killed.id ? { ...p, isAlive: false, role: killed.role } : p
        ));
      }
    }

    function onActionConfirmed() { setNightActionDone(true); }
    function onDetectiveResult(result) { setDetectiveResult(result); }

    function onRoomState(state) {
      setPlayers(state.players);
      setPhase(state.phase);
      setDay(state.day);
    }

    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }
    function onPlayerLeft({ playerId }) {
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, isAlive: false } : p));
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
      socket.off("mafia-room-state",        onRoomState);
      socket.off("mafia-player-joined",     onPlayerJoined);
      socket.off("mafia-player-left",       onPlayerLeft);
    };
  }, []);

  function sendDayChat(text)  { socket.emit("mafia-day-chat",   { text }); }
  function sendNightChat(text) { socket.emit("mafia-night-chat", { text }); }
  function sendVote(targetId)  { socket.emit("mafia-vote",       { targetId }); }
  function sendNightAction(targetId) { socket.emit("mafia-night-action", { targetId }); }

  const amAlive = players.find(p => p.id === myId)?.isAlive ?? true;
  const isNight = phase === "night" || phase === "nightResult";

  // Phase label
  const phaseLabels = {
    roleReveal: "Role Reveal",
    day: "Discussion",
    vote: "Voting",
    elimResult: "Elimination",
    night: "Night",
    nightResult: "Dawn",
  };

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
          {timeLeft > 0 && <span className="mgame-timer">{timeLeft}s</span>}
        </div>
        {myRole && <RoleBadge role={myRole} />}
      </div>

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
          />
        </div>

        {/* Right: Phase panel */}
        <div className="mgame-panel">
          {(phase === "day" || phase === "vote") && (
            <ChatPanel
              messages={dayMessages}
              onSend={sendDayChat}
              disabled={!amAlive}
              label={phase === "vote" ? "Chat (voting open)" : "Town Discussion"}
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
              actionDone={nightActionDone}
              detectiveResult={detectiveResult}
            />
          )}

          {phase === "elimResult" && (
            <div className="mgame-result-overlay">
              {elimResult ? (
                <>
                  <span className="mgame-result-icon">⚰️</span>
                  <p className="mgame-result-text">
                    <strong>{elimResult.name}</strong> was eliminated.
                  </p>
                  <p className="mgame-result-role">
                    They were a <strong>{elimResult.role}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <span className="mgame-result-icon">🤷</span>
                  <p className="mgame-result-text">
                    The town couldn't decide. No one was eliminated.
                  </p>
                </>
              )}
            </div>
          )}

          {phase === "nightResult" && (
            <div className="mgame-result-overlay">
              {nightResult?.killed ? (
                <>
                  <span className="mgame-result-icon">💀</span>
                  <p className="mgame-result-text">
                    <strong>{nightResult.killed.name}</strong> was killed last night.
                  </p>
                  <p className="mgame-result-role">
                    They were a <strong>{nightResult.killed.role}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <span className="mgame-result-icon">{nightResult?.saved ? "💊" : "☀️"}</span>
                  <p className="mgame-result-text">
                    {nightResult?.saved
                      ? "The Doctor saved someone! No one died last night."
                      : "No one was killed last night."
                    }
                  </p>
                </>
              )}
            </div>
          )}

          {phase === "roleReveal" && !showRole && (
            <div className="mgame-result-overlay">
              <span className="mgame-result-icon">🌅</span>
              <p className="mgame-result-text">The game is about to begin…</p>
            </div>
          )}
        </div>
      </div>

      {/* Role reveal overlay */}
      {showRole && myRole && phase === "roleReveal" && (
        <RoleCardFull role={myRole} mafiaTeam={mafiaTeam} />
      )}
    </div>
  );
}
