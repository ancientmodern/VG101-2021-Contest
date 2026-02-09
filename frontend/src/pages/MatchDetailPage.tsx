import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { MatchDetail, MatchRecordResponse } from '../api/types';

const BOARD_SIZE = 30;
const CELL_SIZE = 20;

function drawFrame(canvas: HTMLCanvasElement, frame: MatchRecordResponse['record'][number] | undefined, p1: string, p2: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Legacy-inspired board tones.
  ctx.fillStyle = '#dfe8ed';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const shrink = frame?.shrink ?? -1;
  const activeStart = (Math.max(shrink, 0) + 5) * CELL_SIZE;
  const activeSize = Math.max(0, (20 - Math.max(shrink, 0) * 2) * CELL_SIZE);

  if (activeSize > 0) {
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(activeStart, activeStart, activeSize, activeSize);
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(95, 159, 214, 0.25)';
  for (let i = 0; i <= BOARD_SIZE; i += 1) {
    const p = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }

  if (!frame) return;

  for (const bullet of frame.bullets) {
    const x = (bullet.position[0] + 5) * CELL_SIZE + CELL_SIZE / 2;
    const y = (bullet.position[1] + 5) * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = bullet.owner === 0 ? '#f39800' : '#2b8ac6';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const directionArrow: Record<number, [number, number]> = {
    0: [-8, 0],
    1: [0, -8],
    2: [8, 0],
    3: [0, 8],
  };

  frame.tanks.forEach((tank, index) => {
    const x = (tank.position[0] + 5) * CELL_SIZE + CELL_SIZE / 2;
    const y = (tank.position[1] + 5) * CELL_SIZE + CELL_SIZE / 2;

    ctx.fillStyle = index === 0 ? '#ed5f82' : '#5f9fd6';
    ctx.fillRect(x - 7, y - 7, 14, 14);

    const [dx, dy] = directionArrow[tank.direction] ?? [0, 0];
    ctx.strokeStyle = '#2f2f2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.font = '11px Monaco, monospace';
    const name = index === 0 ? p1 : p2;
    ctx.fillText(`${name}: ${tank.life}`, x - 25, y - 11);
  });
}

export function MatchDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [record, setRecord] = useState<MatchRecordResponse | null>(null);
  const [mode, setMode] = useState<'animation' | 'stdio'>('animation');
  const [fps, setFps] = useState(5);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const [d, r] = await Promise.all([api.matchDetail(id), api.matchRecord(id)]);
        if (!mounted) return;
        setDetail(d);
        setRecord(r);
        setFrameIndex(0);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load match');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !record) return;
    drawFrame(canvas, record.record[frameIndex], record.p1, record.p2);
  }, [record, frameIndex]);

  useEffect(() => {
    if (!record || !playing || mode !== 'animation') return;
    const delay = Math.max(1, 1000 / Math.max(1, fps));
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= record.record.length - 1) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, delay);

    return () => {
      window.clearInterval(timer);
    };
  }, [record, playing, fps, mode]);

  const resultText = useMemo(() => {
    if (!detail) return '';
    if (detail.winner === -1) return 'Draw';
    if (detail.winner === 0) return `Winner: ${detail.p1}`;
    return `Winner: ${detail.p2}`;
  }, [detail]);

  if (error) return <p className="error-text">{error}</p>;
  if (!detail || !record) return <p className="loading-state">Loading...</p>;

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Replay</p>
          <h1>
            Game between {detail.p1} and {detail.p2}
          </h1>
          <p className="muted-text">{resultText}</p>
        </div>
        <div className="stat-chip">
          <span className="k">Frames</span>
          <span className="v">{record.record.length}</span>
        </div>
      </div>
      <div className="card">
        <p className="status-line">
          <strong>Exit caused by:</strong> <span className="mono">{detail.error}</span>
        </p>

        <div className="toolbar playback-bar">
          <button className="secondary" onClick={() => setMode(mode === 'animation' ? 'stdio' : 'animation')}>
            {mode === 'animation' ? 'Switch to STDIO' : 'Switch to Animation'}
          </button>
          {mode === 'animation' ? (
            <>
              <button
                onClick={() => {
                  if (frameIndex >= record.record.length - 1) {
                    setFrameIndex(0);
                  }
                  setPlaying((v) => !v);
                }}
              >
                {playing ? 'Pause' : frameIndex >= record.record.length - 1 ? 'Replay' : 'Resume'}
              </button>
              <label>
                Speed (FPS)
                <input
                  className="number-input"
                  type="number"
                  min={1}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value) || 1)}
                />
              </label>
              <span className="frame-indicator">
                Frame {frameIndex + 1}/{Math.max(record.record.length, 1)}
              </span>
            </>
          ) : null}
        </div>

        {mode === 'animation' ? (
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              width={BOARD_SIZE * CELL_SIZE}
              height={BOARD_SIZE * CELL_SIZE}
              className="board-canvas"
            />
          </div>
        ) : (
          <div className="split-grid">
            <article>
              <h3>STDOUT A</h3>
              <pre>{record.A.stdout || 'No Record'}</pre>
            </article>
            <article>
              <h3>STDOUT B</h3>
              <pre>{record.B.stdout || 'No Record'}</pre>
            </article>
            <article>
              <h3>STDERR A</h3>
              <pre>{record.A.stderr || 'No Record'}</pre>
            </article>
            <article>
              <h3>STDERR B</h3>
              <pre>{record.B.stderr || 'No Record'}</pre>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
