import { useEffect, useRef } from "react";
import { getSocket } from "../hooks/useSocket";

export default function Canvas({ isDrawer }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const toolRef = useRef({ color: "#000000", size: 6, eraser: false });
  const socket = getSocket();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function applyStroke(x0, y0, x1, y1, color, size) {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (canvas.width / rect.width),
        y: (src.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function onDown(e) {
      if (!isDrawer) return;
      drawing.current = true;
      lastPos.current = getPos(e);
    }

    function onMove(e) {
      if (!isDrawer || !drawing.current) return;
      e.preventDefault();
      const pos = getPos(e);
      const { color, size, eraser } = toolRef.current;
      const strokeColor = eraser ? "#ffffff" : color;
      applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, strokeColor, size);
      socket.emit("draw", { x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color: strokeColor, size });
      lastPos.current = pos;
    }

    function onUp() {
      drawing.current = false;
      lastPos.current = null;
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);

    function onDrawUpdate({ x0, y0, x1, y1, color, size }) {
      applyStroke(x0, y0, x1, y1, color, size);
    }

    function onCanvasCleared() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    socket.on("draw-update", onDrawUpdate);
    socket.on("canvas-cleared", onCanvasCleared);

    // Fill white on mount
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onUp);
      socket.off("draw-update", onDrawUpdate);
      socket.off("canvas-cleared", onCanvasCleared);
    };
  }, [isDrawer]);

  // Expose tool setter globally so Toolbar can update it
  useEffect(() => {
    window.__lmnTool = toolRef.current;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      style={{
        display: "block",
        cursor: isDrawer ? "crosshair" : "not-allowed",
        background: "#fff",
        borderRadius: 8,
        width: "100%",
        height: "auto",
      }}
    />
  );
}
