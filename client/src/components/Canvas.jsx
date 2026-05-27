import { useEffect, useRef } from "react";
import { getSocket } from "../hooks/useSocket";

export default function Canvas({ isDrawer }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const startPos = useRef(null);
  const lastPos = useRef(null);
  const snapshot = useRef(null);
  const toolRef = useRef({ color: "#000000", size: 6, mode: "pen" });
  const socket = getSocket();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (canvas.width / rect.width),
        y: (src.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function applyStroke(x0, y0, x1, y1, color, size, erase = false) {
      const prev = ctx.globalCompositeOperation;
      if (erase) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalCompositeOperation = prev;
    }

    function applyShape(type, x0, y0, x1, y1, color, size) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (type === "line") {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      } else if (type === "rect") {
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      } else if (type === "circle") {
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function onDown(e) {
      if (!isDrawer) return;
      drawing.current = true;
      const pos = getPos(e);
      startPos.current = pos;
      lastPos.current = pos;
      const { mode } = toolRef.current;
      if (mode === "line" || mode === "rect" || mode === "circle") {
        snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    }

    function onMove(e) {
      if (!isDrawer || !drawing.current) return;
      e.preventDefault();
      const pos = getPos(e);
      const { color, size, mode } = toolRef.current;

      if (mode === "pen") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, color, size, false);
        socket.emit("draw", { x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color, size });
      } else if (mode === "eraser") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, "#ffffff", size, true);
        socket.emit("draw", { x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color: "#ffffff", size });
      } else if (snapshot.current) {
        ctx.putImageData(snapshot.current, 0, 0);
        applyShape(mode, startPos.current.x, startPos.current.y, pos.x, pos.y, color, size);
      }

      lastPos.current = pos;
    }

    function onUp() {
      if (!drawing.current) return;
      const { color, size, mode } = toolRef.current;
      if (isDrawer && snapshot.current && lastPos.current && startPos.current &&
          (mode === "line" || mode === "rect" || mode === "circle")) {
        ctx.putImageData(snapshot.current, 0, 0);
        applyShape(mode, startPos.current.x, startPos.current.y, lastPos.current.x, lastPos.current.y, color, size);
        socket.emit("draw-shape", {
          type: mode,
          x0: startPos.current.x, y0: startPos.current.y,
          x1: lastPos.current.x, y1: lastPos.current.y,
          color, size,
        });
      }
      drawing.current = false;
      startPos.current = null;
      snapshot.current = null;
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
      applyStroke(x0, y0, x1, y1, color, size, false);
    }

    function onDrawShape({ type, x0, y0, x1, y1, color, size }) {
      applyShape(type, x0, y0, x1, y1, color, size);
    }

    function onCanvasCleared() {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    socket.on("draw-update", onDrawUpdate);
    socket.on("draw-shape", onDrawShape);
    socket.on("canvas-cleared", onCanvasCleared);

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
      socket.off("draw-shape", onDrawShape);
      socket.off("canvas-cleared", onCanvasCleared);
    };
  }, [isDrawer]);

  useEffect(() => {
    window.__lmnTool = toolRef.current;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      style={{ display: "block", cursor: isDrawer ? "crosshair" : "default", background: "#fff", width: "100%", height: "100%" }}
    />
  );
}
