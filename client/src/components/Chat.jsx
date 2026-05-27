import { useEffect, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Chat.css";

export default function Chat({ isDrawer }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const socket = getSocket();

  useEffect(() => {
    function onChatMessage({ name, text }) {
      setMessages(prev => [...prev, { name, text, type: "chat" }]);
    }
    function onPlayerJoined({ player }) {
      setMessages(prev => [...prev, { text: `${player.name} joined`, type: "system" }]);
    }
    function onPlayerLeft({ name }) {
      setMessages(prev => [...prev, { text: `${name} left`, type: "system" }]);
    }
    function onRoundStart() {
      setMessages([]);
    }

    socket.on("chat-message", onChatMessage);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("round-start", onRoundStart);

    return () => {
      socket.off("chat-message", onChatMessage);
      socket.off("player-joined", onPlayerJoined);
      socket.off("player-left", onPlayerLeft);
      socket.off("round-start", onRoundStart);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    socket.emit("chat", { text });
    setInput("");
  }

  return (
    <div className="chat">
      <div className="chat-header">Chat</div>
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
          placeholder={isDrawer ? "Drawer can't chat" : "Say something…"}
          disabled={isDrawer}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button className="chat-send" disabled={isDrawer} onClick={send}>→</button>
      </div>
    </div>
  );
}
