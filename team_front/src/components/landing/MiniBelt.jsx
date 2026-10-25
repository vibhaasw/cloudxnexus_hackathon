// =============================================================
// MiniBelt — "See it in action" live interactive sorting demo
// Features:
// - Lightweight 2D canvas simulation
// - Boxes drop onto the belt, pass through the IR gate, and sort:
//     * Under 10 kg → Continues forward to Left Lane
//     * 10 kg & over → Diverts downward to Right Lane
// - Interactive: click anywhere on the canvas to drop a random box
// - Live counters tick up on arrival in each lane
// =============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { laneFor } from '../../data/mock';

export function MiniBelt() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [leftCount, setLeftCount] = useState(14);
  const [rightCount, setRightCount] = useState(8);

  const spawnBoxRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = 220);

    const onResize = () => {
      if (!container) return;
      width = canvas.width = container.clientWidth;
      height = canvas.height = 220;
    };
    window.addEventListener('resize', onResize);

    // Belt geometry
    const beltY = 120;
    const gateX = width * 0.48;
    const forkX = gateX + 50;

    // Active simulated boxes
    let boxes = [
      { x: 30, y: beltY, w: 32, h: 22, weight: 6.5, lane: 'L', scanned: false, flash: 0 },
      { x: 180, y: beltY, w: 42, h: 28, weight: 16.0, lane: 'R', scanned: false, flash: 0 },
    ];

    const spawnBox = (customX, customWeight) => {
      const weight = customWeight || (Math.random() > 0.5 ? 4 + Math.random() * 5 : 11 + Math.random() * 14);
      const isL = laneFor(weight) === 'L';
      const size = Math.max(26, Math.min(46, 22 + (weight / 25) * 22));
      boxes.push({
        x: customX !== undefined ? customX : 10,
        y: 20,
        w: size,
        h: size * 0.72,
        weight: Math.round(weight * 10) / 10,
        lane: isL ? 'L' : 'R',
        scanned: false,
        flash: 0,
        dropping: true,
      });
    };
    spawnBoxRef.current = spawnBox;

    // Auto spawn every 2.4s
    const spawnInterval = setInterval(() => {
      if (boxes.length < 5) {
        spawnBox(15);
      }
    }, 2400);

    let animId;
    let treadOffset = 0;

    const loop = () => {
      ctx.clearRect(0, 0, width, height);
      treadOffset = (treadOffset + 1.6) % 20;

      // 1. Draw Conveyor Belt (Main infeed)
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, beltY, forkX, 14);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, beltY, forkX, 14);

      // Treads on main belt
      ctx.strokeStyle = '#282828';
      ctx.lineWidth = 1.5;
      for (let x = treadOffset; x < forkX; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, beltY + 1);
        ctx.lineTo(x, beltY + 13);
        ctx.stroke();
      }

      // Upper Belt (Left Lane: straight forward)
      ctx.fillStyle = '#181818';
      ctx.fillRect(forkX, beltY, width - forkX - 70, 14);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(forkX, beltY, width - forkX - 70, 14);

      // Lower Chute (Right Lane: tilted downward)
      ctx.save();
      ctx.translate(forkX, beltY + 14);
      ctx.rotate(0.38);
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, width - forkX - 80, 12);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(0, 0, width - forkX - 80, 12);
      ctx.restore();

      // 2. IR Sensor Gate
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gateX - 10, beltY + 14);
      ctx.lineTo(gateX - 10, beltY - 45);
      ctx.lineTo(gateX + 10, beltY - 45);
      ctx.lineTo(gateX + 10, beltY + 14);
      ctx.stroke();

      // Red laser beam
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gateX - 8, beltY - 32);
      ctx.lineTo(gateX + 8, beltY - 32);
      ctx.stroke();

      // 3. Lane Bins on the right
      // Left bin (top right)
      ctx.strokeStyle = '#2547D0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(width - 65, beltY - 18, 55, 42);
      ctx.fillStyle = 'rgba(37, 71, 208, 0.1)';
      ctx.fillRect(width - 65, beltY - 18, 55, 42);
      ctx.fillStyle = '#8EA4FF';
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LEFT', width - 38, beltY + 6);

      // Right bin (bottom right)
      ctx.strokeStyle = '#F2A900';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(width - 65, height - 52, 55, 42);
      ctx.fillStyle = 'rgba(242, 169, 0, 0.1)';
      ctx.fillRect(width - 65, height - 52, 55, 42);
      ctx.fillStyle = '#FFC733';
      ctx.fillText('RIGHT', width - 38, height - 28);

      // 4. Update and Draw Boxes
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];

        // Drop animation
        if (b.dropping) {
          b.y += 3.5;
          if (b.y >= beltY - b.h) {
            b.y = beltY - b.h;
            b.dropping = false;
          }
        } else {
          // Belt travel
          b.x += 1.8;

          // Gate scan check
          if (!b.scanned && b.x + b.w / 2 >= gateX - 6 && b.x + b.w / 2 <= gateX + 6) {
            b.scanned = true;
            b.flash = 8;
          }

          // Path fork check
          if (b.x > forkX) {
            if (b.lane === 'R') {
              // Heavy parcels slide down chute
              b.y += 0.72;
            }
          }
        }

        // Draw Box
        ctx.save();
        const flashColor = b.flash > 0 ? '#FFFFFF' : (b.lane === 'L' ? '#8EA4FF' : '#FFC733');
        if (b.flash > 0) b.flash--;

        // Box body
        ctx.fillStyle = b.flash > 0 ? '#FFFFFF' : '#B87333';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = flashColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        // Weight tag
        ctx.fillStyle = '#111';
        ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, 12);
        ctx.fillStyle = '#FFF';
        ctx.font = '700 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${b.weight} kg`, b.x + b.w / 2, b.y + 12);

        ctx.restore();

        // Arrival in bin
        if (b.x >= width - 65) {
          if (b.lane === 'L') {
            setLeftCount((c) => c + 1);
          } else {
            setRightCount((c) => c + 1);
          }
          boxes.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(spawnInterval);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const handleCanvasClick = useCallback(() => {
    if (spawnBoxRef.current) {
      spawnBoxRef.current(20);
    }
  }, []);

  return (
    <section className="mini-belt-section" id="mini-belt">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Interactive Demo</span>
          </div>
          <h2 className="landing-section-title">See the sorting belt in action</h2>
          <p className="landing-section-subtitle">
            Every parcel passes the IR gate, flashes on scan, and is sorted by weight in real time. Click anywhere to drop a new box.
          </p>
        </div>

        <div className="mini-belt-card">
          <div className="mini-belt-stats">
            <div className="mini-belt-stats-left">
              <div className="belt-counter-pill blue">
                <span className="belt-counter-label">Left Lane (&lt; 10 kg)</span>
                <span className="belt-counter-num">{String(leftCount).padStart(2, '0')}</span>
              </div>
              <div className="belt-counter-pill gold">
                <span className="belt-counter-label">Right Lane (≥ 10 kg)</span>
                <span className="belt-counter-num">{String(rightCount).padStart(2, '0')}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: '38px', padding: '6px 14px', fontSize: '13.5px' }}
              onClick={handleCanvasClick}
            >
              + Drop a parcel
            </button>
          </div>

          <div
            ref={containerRef}
            className="mini-belt-canvas-wrap"
            onClick={handleCanvasClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCanvasClick(); }}
            aria-label="Conveyor belt animation. Click to drop a parcel."
          >
            <div className="mini-belt-instruction">
              ⚡ Click anywhere to drop a box
            </div>
            <canvas ref={canvasRef} className="mini-belt-canvas" />
          </div>

          <div className="mini-belt-rules-row">
            <div className="mini-belt-rule-item">
              <span>🔵</span>
              <span><strong>Under 10 kg</strong> goes left</span>
            </div>
            <div className="mini-belt-rule-item">
              <span>🟡</span>
              <span><strong>10 kg & over</strong> goes right</span>
            </div>
            <div className="mini-belt-rule-item">
              <span>📡</span>
              <span><strong>Sensor gate</strong> confirms intake</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
