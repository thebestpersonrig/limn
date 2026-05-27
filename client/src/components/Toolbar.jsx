import { useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Toolbar.css";

const COLORS = [
  "#000000", "#ffffff", "#ff4444", "#ff8800", "#ffdd00",
  "#44cc44", "#0088ff", "#8844ff", "#ff44aa", "#00cccc",
  "#884400", "#666666", "#aaaaaa",
];

const SIZES = [4, 8, 14, 22];

export default function Toolbar({ isDrawer }) {
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const socket = getSocket();

  function setTool(updates) {
    if (window.__lmnTool) Object.assign(window.__lmnTool, updates);
  }

  function pickColor(c) {
    setColor(c);
    setEraser(false);
    setTool({ color: c, eraser: false });
  }

  function pickSize(s) {
    setSize(s);
    setTool({ size: s });
  }

  function toggleEraser() {
    const next = !eraser;
    setEraser(next);
    setTool({ eraser: next });
  }

  function clearCanvas() {
    socket.emit("clear-canvas");
    if (window.__lmnCanvasClear) window.__lmnCanvasClear();
  }

  if (!isDrawer) return null;

  return (
    <div className="toolbar">
      <div className="toolbar-colors">
        {COLORS.map(c => (
          <button
            key={c}
            className={`color-swatch ${color === c && !eraser ? "selected" : ""}`}
            style={{ background: c, border: c === "#ffffff" ? "1px solid #ccc" : "none" }}
            onClick={() => pickColor(c)}
          />
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-sizes">
        {SIZES.map(s => (
          <button
            key={s}
            className={`size-btn ${size === s ? "selected" : ""}`}
            onClick={() => pickSize(s)}
          >
            <span style={{ width: s, height: s, borderRadius: "50%", background: eraser ? "#bbb" : color, display: "inline-block" }} />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <button className={`tool-btn ${eraser ? "active" : ""}`} onClick={toggleEraser} title="Eraser">
        eraser
      </button>
      <button className="tool-btn danger" onClick={clearCanvas} title="Clear canvas">
        clear
      </button>
    </div>
  );
}
