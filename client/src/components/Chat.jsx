import { useEffect, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Chat.css";

export default function Chat({ isDrawer, hasGuessedCorrectly }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const socket = getSocket();

  useEffect(() => {
    function onChatMessage({ name, text }) {
      setMessages(prev => [...prev, { name, text, type: "chat" }]);
    }
    function onCorrectGuess({ name }) {
      setMessages(prev => [...prev, { text: `${name} guessed correctly!`, type: "correct" }]);
    }
    function onPlayerJoined({ player }) {
      setMessages(prev => [...prev, { text: `${player.name} joined`, type: "system" }]);
    }
    function onPlayerLeft({ name }) {
      setMessages(prev => [...prev, { text: `${name} left`, type: "system" }]);
    }
    function onRoundEnd({ word }) {
      setMessages(prev => [...prev, { text: `The word was: ${word}`, type: "reveal" }]);
    }

    socket.on("chat-message", onChatMessage);
    socket.on("correct-guess", onCorrectGuess);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("round-end", onRoundEnd);

    return () => {
      socket.off("chat-message", onChatMessage);
      socket.off("correct-guess", onCorrectGuess);
      socket.off("player-joined", onPlayerJoined);
      socket.off("player-left", onPlayerLeft);
      socket.off("round-end", onRoundEnd);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendGuess() {
    const text = input.trim();
    if (!text) return;
    socket.emit("guess", { text });
    setInput("");
  }

  const blocked = isDrawer || hasGuessedCorrectly;

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.type}`}>
            {m.name && <span className="chat-name">{m.name}: </span>}
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder={isDrawer ? "You are drawing…" : hasGuessedCorrectly ? "You guessed it!" : "Type your guess…"}
          value={input}
          disabled={blocked}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendGuess()}
        />
        <button className="chat-send" disabled={blocked} onClick={sendGuess}>
          →
        </button>
      </div>
    </div>
  );
}
