import { useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Toolbar.css";

const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
  "#92400e", "#6b7280", "#d1d5db",
];

const SIZES = [3, 7, 14, 24];

function PenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2l3 3-7.5 7.5L3 14l1.5-2.5L11 2z"/>
    </svg>
  );
}
function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="2" y1="14" x2="14" y2="2"/>
    </svg>
  );
}
function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="4" width="12" height="9" rx="1.5"/>
    </svg>
  );
}
function CircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="5.5"/>
    </svg>
  );
}
function FillIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 13.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5S4.3 15 3.5 15 2 14.3 2 13.5z" fill="currentColor" stroke="none"/>
      <path d="M3.5 12L9 6.5 4.5 2 2 4.5 7.5 10"/>
      <path d="M9 6.5l3.5-3.5 1 1-3.5 3.5"/>
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l4 4-5.5 7H4l-1.5-1.5 7-9.5z"/>
      <line x1="6" y1="13.5" x2="14" y2="13.5"/>
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7H9.5a3.5 3.5 0 010 7H7"/>
      <polyline points="3,4 3,7 6,7"/>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4"/>
      <path d="M5 4V2.5h6V4"/>
      <path d="M3.5 4.5l1 9h7l1-9"/>
    </svg>
  );
}

const TOOLS = [
  { id: "pen",    label: "Pen",    Icon: PenIcon },
  { id: "line",   label: "Line",   Icon: LineIcon },
  { id: "rect",   label: "Rect",   Icon: RectIcon },
  { id: "circle", label: "Circle", Icon: CircleIcon },
  { id: "fill",   label: "Fill",   Icon: FillIcon },
  { id: "eraser", label: "Eraser", Icon: EraserIcon },
];

export default function Toolbar({ isDrawer }) {
  const [color, setColor] = useState("#000000");
  const [size,  setSize]  = useState(7);
  const [mode,  setMode]  = useState("pen");
  const socket = getSocket();

  function setTool(updates) {
    if (window.__lmnTool) Object.assign(window.__lmnTool, updates);
  }

  function pickColor(c) {
    setColor(c);
    const next = mode === "eraser" ? "pen" : mode;
    if (mode === "eraser") setMode("pen");
    setTool({ color: c, mode: next });
  }

  function pickSize(s) { setSize(s); setTool({ size: s }); }

  function pickMode(m) { setMode(m); setTool({ mode: m }); }

  function doUndo() { window.__lmnUndo?.(); }

  function clearCanvas() {
    socket.emit("clear-canvas");
    if (window.__lmnCanvasClear) window.__lmnCanvasClear();
  }

  if (!isDrawer) return null;

  const dotColor = mode === "eraser" ? "#555" : color;

  return (
    <div className="toolbar">

      <div className="toolbar-colors">
        {COLORS.map(c => (
          <button
            key={c}
            className={`color-swatch ${color === c && mode !== "eraser" ? "selected" : ""}`}
            style={{ background: c }}
            onClick={() => pickColor(c)}
            title={c}
          />
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-tools">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tool-icon-btn ${mode === id ? "active" : ""}`}
            onClick={() => pickMode(id)}
            title={label}
          >
            <Icon />
          </button>
        ))}
        <div className="toolbar-divider-v" />
        <button className="tool-icon-btn" onClick={doUndo} title="Undo (Ctrl+Z)">
          <UndoIcon />
        </button>
        <button className="tool-icon-btn clear-btn" onClick={clearCanvas} title="Clear canvas">
          <TrashIcon />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-sizes">
        {SIZES.map(s => (
          <button
            key={s}
            className={`size-btn ${size === s ? "selected" : ""}`}
            onClick={() => pickSize(s)}
            title={`Size ${s}`}
          >
            <span className="size-dot" style={{ width: Math.min(s, 22), height: Math.min(s, 22), background: dotColor }} />
          </button>
        ))}
      </div>

    </div>
  );
}
