import { useEffect, useRef, useState } from "react";
import "./ChatPanel.css";

export default function ChatPanel({ messages, onSend, disabled, label, variant }) {
  const [text, setText] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  }

  const cls = variant === "mafia" ? "cpanel cpanel--mafia" : "cpanel";

  return (
    <div className={cls}>
      <div className="cpanel-header">{label}</div>
      <div className="cpanel-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`cpanel-msg ${m.system ? "cpanel-msg--system" : ""}`}>
            {!m.system && <span className="cpanel-msg-name">{m.name}</span>}
            <span className="cpanel-msg-text">{m.text}</span>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="cpanel-empty">No messages yet.</div>
        )}
      </div>
      <form className="cpanel-input-row" onSubmit={submit}>
        <input
          className="cpanel-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={disabled ? "You can't speak…" : "Type a message…"}
          disabled={disabled}
          maxLength={200}
        />
        <button className="cpanel-send" type="submit" disabled={disabled || !text.trim()}>→</button>
      </form>
    </div>
  );
}
