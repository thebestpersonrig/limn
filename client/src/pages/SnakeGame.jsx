import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./SnakeGame.css";

export default function SnakeGame() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const root = containerRef.current;
    if (!root) return;

    const settingsScreen = root.querySelector("#settings-screen");
    const gameScreen = root.querySelector("#game-screen");
    const startBtn = root.querySelector("#start-btn");
    const settingsBtn = root.querySelector("#settings-btn");
    const pauseBtn = root.querySelector("#pause-btn");
    const overlay = root.querySelector("#overlay");
    const overlayMsg = root.querySelector("#overlay-msg");
    const overlayBtn = root.querySelector("#overlay-btn");
    const scoreEl = root.querySelector("#score-val");
    const bestEl = root.querySelector("#best-val");
    const diffBadge = root.querySelector("#diff-badge");
    const canvas = root.querySelector("#snake-canvas");
    const ctx = canvas.getContext("2d");
    const diffSel = root.querySelector("#difficulty-select");
    const gridSel = root.querySelector("#grid-select");
    const skinSel = root.querySelector("#skin-select");
    const obstacleSel = root.querySelector("#obstacle-select");

    const DIFFICULTIES = {
      easy: { interval: 260, moveObstacles: false },
      medium: { interval: 150, moveObstacles: false },
      hard: { interval: 85, moveObstacles: true },
    };
    const SKINS = {
      classic: { head: "#4ade80", body: "#22c55e", outline: "#15803d" },
      neon: { head: "#22d3ee", body: "#06b6d4", outline: "#0e7490" },
      fire: { head: "#fb923c", body: "#f97316", outline: "#c2410c" },
      purple: { head: "#c084fc", body: "#a855f7", outline: "#7e22ce" },
      gold: { head: "#fcd34d", body: "#f59e0b", outline: "#b45309" },
      ice: { head: "#e0f2fe", body: "#7dd3fc", outline: "#0284c7" },
    };
    const OBSTACLE_MOVE_EVERY = 4;

    let COLS, ROWS, CELL, intervalId, paused, counting, tickCount;
    let snake, dir, nextDir, food, obstacles, score, best = 0;

    function initCanvas() {
      COLS = ROWS = parseInt(gridSel.value, 10);
      const size = canvas.parentElement.clientWidth;
      canvas.width = size;
      canvas.height = size;
      CELL = size / COLS;
    }

    function rnd(n) { return Math.floor(Math.random() * n); }
    function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

    function blockedSet() {
      const s = new Set(snake.map(s => `${s.x},${s.y}`));
      obstacles.forEach(o => s.add(`${o.x},${o.y}`));
      return s;
    }
    function placeFood() {
      const blocked = blockedSet();
      let pos;
      do { pos = { x: rnd(COLS), y: rnd(ROWS) }; } while (blocked.has(`${pos.x},${pos.y}`));
      food = pos;
    }
    function placeObstacles() {
      obstacles = [];
      const density = parseFloat(obstacleSel.value);
      if (!density) return;
      const count = Math.max(1, Math.floor(COLS * ROWS * density));
      const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
      const forbidden = new Set();
      for (let dx = -5; dx <= 3; dx++)
        for (let dy = -2; dy <= 2; dy++) {
          const nx = cx + dx, ny = cy + dy;
          if (inBounds(nx, ny)) forbidden.add(`${nx},${ny}`);
        }
      const dirs4 = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 40) {
        const ox = rnd(COLS), oy = rnd(ROWS);
        const key = `${ox},${oy}`;
        if (!forbidden.has(key)) {
          const d = dirs4[Math.floor(Math.random() * 4)];
          obstacles.push({ x: ox, y: oy, vx: d.x, vy: d.y });
          forbidden.add(key);
          placed++;
        }
        tries++;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const skin = SKINS[skinSel.value] || SKINS.classic;
      ctx.fillStyle = "#0d3d20";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.032)";
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if ((r + c) % 2 === 0) ctx.fillRect(c * CELL, r * CELL, CELL, CELL);

      const isHard = DIFFICULTIES[diffSel.value].moveObstacles;
      obstacles.forEach(o => {
        const x = o.x * CELL + 1, y = o.y * CELL + 1, w = CELL - 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, w, Math.max(2, CELL * 0.12));
        ctx.fillStyle = isHard ? "#92400e" : "#57534e";
        ctx.fill();
        ctx.strokeStyle = isHard ? "#78350f" : "#44403c";
        ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.13)";
        ctx.fillRect(x + 2, y + 2, Math.max(3, w * 0.35), 2);
      });

      const fx = food.x * CELL + CELL / 2, fy = food.y * CELL + CELL / 2, fr = CELL * 0.36;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fillStyle = "#f87171"; ctx.fill();
      ctx.beginPath(); ctx.arc(fx - fr * 0.28, fy - fr * 0.28, fr * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.38)"; ctx.fill();

      snake.forEach((seg, i) => {
        const x = seg.x * CELL + 1, y = seg.y * CELL + 1, w = CELL - 2;
        const r = Math.max(2, CELL * 0.22);
        ctx.beginPath(); ctx.roundRect(x, y, w, w, r);
        ctx.fillStyle = i === 0 ? skin.head : skin.body; ctx.fill();
        if (CELL > 7) { ctx.strokeStyle = skin.outline; ctx.lineWidth = 1; ctx.stroke(); }
      });

      if (CELL > 8) {
        const h = snake[0];
        const perp = { x: dir.y, y: -dir.x };
        const eyeR = Math.max(1.5, CELL * 0.1);
        const bx = h.x * CELL + CELL / 2 + dir.x * CELL * 0.15;
        const by = h.y * CELL + CELL / 2 + dir.y * CELL * 0.15;
        [-1, 1].forEach(s => {
          const ex = bx + s * perp.x * CELL * 0.2;
          const ey = by + s * perp.y * CELL * 0.2;
          ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
          ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.52, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
        });
      }
    }

    function stepObstacles() {
      const snakeSet = new Set(snake.map(s => `${s.x},${s.y}`));
      const obsSet = new Set(obstacles.map(o => `${o.x},${o.y}`));
      obstacles.forEach(o => {
        let nx = o.x + o.vx, ny = o.y + o.vy;
        if (!inBounds(nx, ny)) { o.vx = -o.vx; o.vy = -o.vy; nx = o.x + o.vx; ny = o.y + o.vy; }
        if (!inBounds(nx, ny)) return;
        const key = `${nx},${ny}`;
        if (snakeSet.has(key)) { o.vx = -o.vx; o.vy = -o.vy; return; }
        if (obsSet.has(key) && !(nx === o.x && ny === o.y)) { o.vx = -o.vx; o.vy = -o.vy; return; }
        if (food.x === nx && food.y === ny) return;
        obsSet.delete(`${o.x},${o.y}`);
        o.x = nx; o.y = ny;
        obsSet.add(key);
      });
    }

    function endGame() {
      clearInterval(intervalId);
      overlayMsg.textContent = `Game Over!\nScore: ${score}`;
      overlay.hidden = false;
    }

    function tick() {
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (!inBounds(head.x, head.y)) return endGame();
      if (snake.some(s => s.x === head.x && s.y === head.y)) return endGame();
      if (obstacles.some(o => o.x === head.x && o.y === head.y)) return endGame();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = score;
        if (score > best) { best = score; bestEl.textContent = best; }
        placeFood();
      } else {
        snake.pop();
      }
      tickCount++;
      const diff = DIFFICULTIES[diffSel.value];
      if (diff.moveObstacles && tickCount % OBSTACLE_MOVE_EVERY === 0) {
        stepObstacles();
        if (obstacles.some(o => o.x === snake[0].x && o.y === snake[0].y)) return endGame();
      }
      draw();
    }

    function runCountdown(cb) {
      const steps = ["3", "2", "1", "GO!"];
      const skin = SKINS[skinSel.value] || SKINS.classic;
      let i = 0;
      function step() {
        draw();
        ctx.fillStyle = "rgba(0,0,0,0.52)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const label = steps[i], isGo = label === "GO!";
        ctx.save();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `bold ${Math.round(canvas.width * (isGo ? 0.17 : 0.26))}px "Segoe UI",sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 16;
        ctx.fillStyle = isGo ? skin.head : "#fff";
        ctx.fillText(label, canvas.width / 2, canvas.height / 2);
        ctx.restore();
        const delay = isGo ? 650 : 850;
        i++;
        if (i < steps.length) setTimeout(step, delay);
        else setTimeout(cb, delay);
      }
      step();
    }

    function startGame() {
      initCanvas();
      const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
      snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      score = 0; tickCount = 0;
      paused = false; counting = true;
      scoreEl.textContent = 0;
      overlay.hidden = true;
      pauseBtn.textContent = "Pause";
      const diff = diffSel.value;
      diffBadge.textContent = diff;
      diffBadge.className = `snk-hud-item snk-diff-badge ${diff}`;
      placeObstacles();
      placeFood();
      clearInterval(intervalId);
      runCountdown(() => {
        counting = false;
        intervalId = setInterval(tick, DIFFICULTIES[diff].interval);
      });
    }

    function togglePause() {
      if (counting) return;
      const diff = diffSel.value;
      if (paused) {
        intervalId = setInterval(tick, DIFFICULTIES[diff].interval);
        pauseBtn.textContent = "Pause";
      } else {
        clearInterval(intervalId);
        pauseBtn.textContent = "Resume";
      }
      paused = !paused;
    }

    function setDir(dx, dy) {
      if (dx === -dir.x && dy === -dir.y) return;
      nextDir = { x: dx, y: dy };
    }

    function onKey(e) {
      if (!gameScreen.classList.contains("active")) return;
      switch (e.key) {
        case "ArrowUp": case "w": e.preventDefault(); setDir(0, -1); break;
        case "ArrowDown": case "s": e.preventDefault(); setDir(0, 1); break;
        case "ArrowLeft": case "a": e.preventDefault(); setDir(-1, 0); break;
        case "ArrowRight": case "d": e.preventDefault(); setDir(1, 0); break;
        case " ": e.preventDefault(); togglePause(); break;
      }
    }
    document.addEventListener("keydown", onKey);

    root.querySelectorAll(".snk-dpad-btn").forEach(btn => {
      btn.addEventListener("pointerdown", e => {
        e.preventDefault();
        const d = btn.dataset.dir;
        if (d === "up") setDir(0, -1);
        if (d === "down") setDir(0, 1);
        if (d === "left") setDir(-1, 0);
        if (d === "right") setDir(1, 0);
      });
    });

    let touchX, touchY;
    canvas.addEventListener("touchstart", e => {
      touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener("touchend", e => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
      else setDir(0, dy > 0 ? 1 : -1);
      touchX = touchY = null;
    }, { passive: true });

    startBtn.addEventListener("click", () => {
      settingsScreen.classList.remove("active");
      gameScreen.classList.add("active");
      startGame();
    });
    settingsBtn.addEventListener("click", () => {
      clearInterval(intervalId);
      gameScreen.classList.remove("active");
      settingsScreen.classList.add("active");
    });
    pauseBtn.addEventListener("click", togglePause);
    overlayBtn.addEventListener("click", startGame);

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (gameScreen.classList.contains("active")) { initCanvas(); draw(); }
      }, 100);
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="snk-page" ref={containerRef}>
      <button className="snk-back" onClick={() => navigate("/")}>Back</button>

      <div className="snk-settings-screen active" id="settings-screen">
        <h1 className="snk-title">Snake</h1>
        <div className="snk-form">
          <label className="snk-field">
            <span>Difficulty</span>
            <select id="difficulty-select" defaultValue="medium">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="snk-field">
            <span>Grid size</span>
            <select id="grid-select" defaultValue="20">
              <option value="15">Small (15x15)</option>
              <option value="20">Medium (20x20)</option>
              <option value="28">Large (28x28)</option>
            </select>
          </label>
          <label className="snk-field">
            <span>Snake skin</span>
            <select id="skin-select" defaultValue="classic">
              <option value="classic">Classic (Green)</option>
              <option value="neon">Neon (Cyan)</option>
              <option value="fire">Fire (Orange-Red)</option>
              <option value="purple">Purple</option>
              <option value="gold">Gold</option>
              <option value="ice">Ice (Blue)</option>
            </select>
          </label>
          <label className="snk-field">
            <span>Obstacles</span>
            <select id="obstacle-select" defaultValue="0">
              <option value="0">None</option>
              <option value="0.015">Few</option>
              <option value="0.04">Many</option>
            </select>
          </label>
        </div>
        <button className="snk-btn-primary" id="start-btn">Start Game</button>
      </div>

      <div className="snk-game-screen" id="game-screen">
        <div className="snk-hud">
          <span className="snk-hud-item">Score: <strong id="score-val">0</strong></span>
          <span className="snk-hud-item">Best: <strong id="best-val">0</strong></span>
          <span className="snk-hud-item snk-diff-badge" id="diff-badge"></span>
        </div>
        <div className="snk-canvas-wrap">
          <canvas id="snake-canvas"></canvas>
          <div className="snk-overlay" id="overlay" hidden>
            <p id="overlay-msg"></p>
            <button className="snk-btn-secondary" id="overlay-btn">Play Again</button>
          </div>
        </div>
        <div className="snk-controls-row">
          <button className="snk-btn-secondary" id="pause-btn">Pause</button>
          <button className="snk-btn-secondary" id="settings-btn">Settings</button>
        </div>
        <div className="snk-dpad" id="dpad">
          <button className="snk-dpad-btn" data-dir="up">&#9650;</button>
          <button className="snk-dpad-btn" data-dir="left">&#9664;</button>
          <button className="snk-dpad-btn" data-dir="down">&#9660;</button>
          <button className="snk-dpad-btn" data-dir="right">&#9654;</button>
        </div>
      </div>
    </div>
  );
}
