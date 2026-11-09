/**
 * The spectrum ribbon: a categorical strip chart on a logarithmic frequency axis.
 *
 * The overview is nine staves, one per ITU band, each spanning exactly one decade
 * across the full width. Stacking decades is what makes the plan readable: on a
 * single nine-decade axis the whole of VLF through HF collapses into a few
 * millimetres, whereas a stave apiece gives every part of the spectrum equal room.
 * It is also the layout the printable poster uses, so screen and paper agree.
 *
 * Below the staves sits the detail tier, which renders only the current window —
 * wide enough to label bands directly — and takes wheel-zoom and drag-pan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scaleLog } from 'd3-scale';
import {
  AXIS_MAX,
  AXIS_MIN,
  ITU_BANDS,
  LANDMARKS,
  dominantFamily,
  familiesOf,
  familyColour,
  formatHz,
  formatTick,
  plotRange,
  type Landmark,
  type ItuBand,
} from '../lib/spectrum';
import type { Band, SpectrumData } from '../lib/types';

/** Narrowest window the detail tier will zoom to, as a ratio of hi/lo. */
const MIN_SPAN_RATIO = 1.00002;

export interface Window {
  lo: number;
  hi: number;
}

interface Props {
  data: SpectrumData;
  /** Bands surviving the current filters; others are drawn recessed. */
  visible: Set<number>;
  selectedId: number | null;
  window: Window;
  textured: boolean;
  onWindowChange: (next: Window) => void;
  onSelect: (band: Band) => void;
}

/** Geometry, in CSS pixels. */
const LABEL_W = 136;
const STAVE_H = 22;
const STAVE_GAP = 16;
const STAVE_PITCH = STAVE_H + STAVE_GAP;
const DETAIL_H = 92;
const AXIS_H = 24;
const DETAIL_TOP_GAP = 18;

export function SpectrumChart({
  data,
  visible,
  selectedId,
  window: win,
  textured,
  onWindowChange,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const [hover, setHover] = useState<{ band: Band; x: number; y: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(360, entry.contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(120, width - LABEL_W);

  /** One log scale per stave, each covering that ITU band's single decade. */
  const staveScales = useMemo(
    () =>
      ITU_BANDS.map((itu) =>
        scaleLog().domain([itu.lo, itu.hi]).range([LABEL_W, LABEL_W + plotW]).clamp(true),
      ),
    [plotW],
  );

  const detail = useMemo(
    () => scaleLog().domain([win.lo, win.hi]).range([0, width]).clamp(true),
    [width, win.lo, win.hi],
  );

  const plotted = useMemo(
    () =>
      data.bands
        .map((band) => ({ band, range: plotRange(band) }))
        .filter((e): e is { band: Band; range: { lo: number; hi: number } } => e.range !== null),
    [data.bands],
  );

  /** Bands that touch each stave, resolved once rather than per render pass. */
  const perStave = useMemo(
    () =>
      ITU_BANDS.map((itu) =>
        plotted.filter(({ range }) => range.hi > itu.lo && range.lo < itu.hi),
      ),
    [plotted],
  );

  const inWindow = useMemo(
    () => plotted.filter(({ range }) => range.hi > win.lo && range.lo < win.hi),
    [plotted, win.lo, win.hi],
  );

  const setWindowClamped = useCallback(
    (lo: number, hi: number) => {
      let nextLo = Math.max(AXIS_MIN, Math.min(lo, hi));
      let nextHi = Math.min(AXIS_MAX, Math.max(lo, hi));
      if (nextHi / nextLo < MIN_SPAN_RATIO) {
        const centre = Math.sqrt(nextLo * nextHi);
        nextLo = centre / Math.sqrt(MIN_SPAN_RATIO);
        nextHi = centre * Math.sqrt(MIN_SPAN_RATIO);
      }
      onWindowChange({ lo: nextLo, hi: nextHi });
    },
    [onWindowChange],
  );

  function localX(clientX: number): number {
    const host = hostRef.current;
    return host ? clientX - host.getBoundingClientRect().left : 0;
  }

  // --- stave brush: drag across any stave to set the window ---------------
  const [brush, setBrush] = useState<{ stave: number; from: number; to: number } | null>(null);

  /**
   * Staves navigate; the detail strip selects. A plain click on a stave frames
   * that whole ITU band below, which is the view you want before picking a band
   * out of it — dragging is there for when you already know the sub-range.
   */
  const onStavePointerDown = (staveIndex: number) => (event: React.PointerEvent<SVGRectElement>) => {
    const scale = staveScales[staveIndex];
    const itu = ITU_BANDS[staveIndex];
    const originX = localX(event.clientX);
    setBrush({ stave: staveIndex, from: originX, to: originX });

    const move = (e: PointerEvent) =>
      setBrush({ stave: staveIndex, from: originX, to: clampToPlot(localX(e.clientX)) });

    const up = (e: PointerEvent) => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
      const endX = clampToPlot(localX(e.clientX));
      setBrush(null);

      if (Math.abs(endX - originX) < 4) {
        setWindowClamped(itu.lo, itu.hi);
      } else {
        setWindowClamped(scale.invert(originX), scale.invert(endX));
      }
    };

    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up);
  };

  /** Row headers do the same thing, so the whole row reads as one control. */
  const zoomToStave = (staveIndex: number) => {
    const itu = ITU_BANDS[staveIndex];
    setWindowClamped(itu.lo, itu.hi);
  };

  const clampToPlot = (x: number) => Math.max(LABEL_W, Math.min(LABEL_W + plotW, x));

  // --- detail tier: wheel zoom ---------------------------------------------
  useEffect(() => {
    const surface = hostRef.current?.querySelector('[data-detail-surface]');
    if (!surface) return;

    const onWheel = (event: Event) => {
      const e = event as WheelEvent;
      e.preventDefault();
      const anchor = detail.invert(e.clientX - surface.getBoundingClientRect().left);
      const factor = Math.exp((e.deltaY > 0 ? 1 : -1) * 0.18);
      setWindowClamped(anchor * (win.lo / anchor) ** factor, anchor * (win.hi / anchor) ** factor);
    };

    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [detail, setWindowClamped, win.lo, win.hi]);

  const onDetailPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    const startX = localX(event.clientX);
    const startWindow = win;
    let moved = false;

    const move = (e: PointerEvent) => {
      const dx = localX(e.clientX) - startX;
      if (Math.abs(dx) < 3) return;
      moved = true;
      // Panning a log axis is a multiplicative shift.
      const factor = 10 ** (-dx * (Math.log10(startWindow.hi / startWindow.lo) / width));
      const lo = startWindow.lo * factor;
      const hi = startWindow.hi * factor;
      if (lo >= AXIS_MIN && hi <= AXIS_MAX) onWindowChange({ lo, hi });
    };
    const up = () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
      if (!moved) {
        const hz = detail.invert(startX);
        const hit = inWindow.find(({ range }) => hz >= range.lo && hz < range.hi);
        if (hit) onSelect(hit.band);
      }
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up);
  };

  const ticks = useMemo(() => windowTicks(win.lo, win.hi), [win.lo, win.hi]);
  const stavesH = ITU_BANDS.length * STAVE_PITCH;
  const detailY = stavesH + DETAIL_TOP_GAP;
  const totalHeight = detailY + DETAIL_H + AXIS_H;

  return (
    <div className="chart" ref={hostRef}>
      <svg
        width={width}
        height={totalHeight}
        role="img"
        aria-label={`The Irish radio spectrum from ${formatHz(AXIS_MIN)} to ${formatHz(AXIS_MAX)}, laid out as one stave per ITU band. The lower strip is zoomed to ${formatHz(win.lo)} to ${formatHz(win.hi)}.`}
      >
        <defs>
          {/* The accessibility channel: one line fill, at 45° and its 135° mirror. */}
          <pattern id="tex-a" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />
          </pattern>
          <pattern id="tex-b" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {ITU_BANDS.map((itu, i) => (
          <Stave
            key={itu.abbr}
            itu={itu}
            y={i * STAVE_PITCH}
            scale={staveScales[i]}
            bands={perStave[i]}
            plotW={plotW}
            visible={visible}
            selectedId={selectedId}
            textured={textured}
            window={win}
            brush={brush?.stave === i ? brush : null}
            onPointerDown={onStavePointerDown(i)}
            onZoomToStave={() => zoomToStave(i)}
            onHover={(band, x) => setHover(band ? { band, x, y: i * STAVE_PITCH + STAVE_H } : null)}
          />
        ))}

        {/* Detail tier ---------------------------------------------------- */}
        <g transform={`translate(0,${detailY})`}>
          <rect x={0} y={0} width={width} height={DETAIL_H} className="detail-plane" rx={4} />

          {inWindow.map(({ band, range }) => {
            const x0 = detail(Math.max(range.lo, win.lo));
            const x1 = detail(Math.min(range.hi, win.hi));
            // A 2px surface gap between neighbouring fills keeps edges legible.
            const w = Math.max(1, x1 - x0 - 2);
            const family = dominantFamily(band);
            const dimmed = !visible.has(band.id);
            return (
              <g key={band.id}>
                <rect x={x0} y={0} width={w} height={DETAIL_H} fill={familyColour(family)} opacity={dimmed ? 0.2 : 1} />
                {textured && (
                  <rect
                    x={x0}
                    y={0}
                    width={w}
                    height={DETAIL_H}
                    fill={`url(#tex-${(family?.slot ?? 0) % 2 ? 'a' : 'b'})`}
                    opacity={dimmed ? 0.12 : 0.55}
                    pointerEvents="none"
                  />
                )}
                {band.id === selectedId && (
                  <rect x={x0} y={0} width={w} height={DETAIL_H} className="detail-selected" pointerEvents="none" />
                )}
                {/* Direct labels wherever a band is wide enough — the relief for
                    the palette's low-contrast slots. */}
                {w > 54 && !dimmed && (
                  <text x={x0 + 6} y={15} className="detail-label" pointerEvents="none">
                    {truncate(band.n, Math.floor(w / 6.2))}
                  </text>
                )}
                {w > 90 && !dimmed && (
                  <text x={x0 + 6} y={30} className="detail-sublabel" pointerEvents="none">
                    {truncate(familiesOf(band).map((f) => f.label).join(', '), Math.floor(w / 5.6))}
                  </text>
                )}
              </g>
            );
          })}

          <rect
            x={0}
            y={0}
            width={width}
            height={DETAIL_H}
            fill="transparent"
            data-detail-surface
            className="detail-surface"
            onPointerDown={onDetailPointerDown}
            onPointerMove={(event) => {
              const x = localX(event.clientX);
              const hz = detail.invert(x);
              const hit = inWindow.find(({ range }) => hz >= range.lo && hz < range.hi);
              setHover(hit ? { band: hit.band, x, y: detailY + DETAIL_H } : null);
            }}
            onPointerLeave={() => setHover(null)}
          />

          <g transform={`translate(0,${DETAIL_H})`} className="axis">
            <line x1={0} y1={0} x2={width} y2={0} className="axis-line" />
            {ticks.map((tick) => {
              const x = detail(tick);
              // Anchor the end labels inwards; a centred label at x=0 is clipped.
              const anchor = x < 28 ? 'start' : x > width - 28 ? 'end' : 'middle';
              return (
                <g key={tick} transform={`translate(${x},0)`}>
                  <line y1={0} y2={5} className="axis-tick" />
                  <text y={16} textAnchor={anchor}>
                    {formatTick(tick)}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {hover && <Tooltip band={hover.band} x={hover.x} y={hover.y} width={width} />}

      <p className="chart-hint">
        Click a stave to frame that band below · drag across one to zoom further · click a band in
        the lower strip to open it
        <span className="chart-span">
          Showing {formatHz(win.lo)} – {formatHz(win.hi)}
        </span>
      </p>
    </div>
  );
}

// --- one ITU-band stave ----------------------------------------------------

interface StaveProps {
  itu: ItuBand;
  y: number;
  scale: ReturnType<typeof scaleLog<number, number>>;
  bands: { band: Band; range: { lo: number; hi: number } }[];
  plotW: number;
  visible: Set<number>;
  selectedId: number | null;
  textured: boolean;
  window: Window;
  brush: { from: number; to: number } | null;
  onPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
  onZoomToStave: () => void;
  onHover: (band: Band | null, x: number) => void;
}

function Stave({
  itu,
  y,
  scale,
  bands,
  plotW,
  visible,
  selectedId,
  textured,
  window: win,
  brush,
  onPointerDown,
  onZoomToStave,
  onHover,
}: StaveProps) {
  const marks = useMemo(
    () => placeLandmarks(itu, scale, plotW),
    [itu, scale, plotW],
  );

  // How much of this decade the zoom window covers, if any.
  const overlapLo = Math.max(itu.lo, win.lo);
  const overlapHi = Math.min(itu.hi, win.hi);
  const hasWindow = overlapHi > overlapLo;

  return (
    <g transform={`translate(0,${y})`}>
      {/* Row header — a control in its own right: activating it frames the
          whole band in the detail strip, same as clicking the stave. */}
      <g
        className="stave-head"
        role="button"
        tabIndex={0}
        aria-label={`Zoom to ${itu.name}, ${formatHz(itu.lo)} to ${formatHz(itu.hi)}`}
        onClick={onZoomToStave}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onZoomToStave();
          }
        }}
      >
        <rect x={0} y={0} width={LABEL_W - 8} height={STAVE_H} fill="transparent" />
        <text x={0} y={STAVE_H - 7} className="stave-abbr">
          {itu.abbr}
        </text>
        <text x={38} y={STAVE_H - 7} className="stave-range">
          {formatHz(itu.lo)}–{formatHz(itu.hi)}
        </text>
      </g>

      <rect x={LABEL_W} y={0} width={plotW} height={STAVE_H} className="stave-plane" />

      {bands.map(({ band, range }) => {
        const x0 = scale(range.lo);
        const w = Math.max(0.7, scale(range.hi) - x0);
        const family = dominantFamily(band);
        const dimmed = !visible.has(band.id);
        return (
          <g key={band.id}>
            <rect x={x0} y={0} width={w} height={STAVE_H} fill={familyColour(family)} opacity={dimmed ? 0.16 : 1} />
            {textured && (
              <rect
                x={x0}
                y={0}
                width={w}
                height={STAVE_H}
                fill={`url(#tex-${(family?.slot ?? 0) % 2 ? 'a' : 'b'})`}
                opacity={dimmed ? 0.1 : 0.5}
              />
            )}
            {band.id === selectedId && (
              <rect x={x0 - 0.5} y={-1} width={w + 1} height={STAVE_H + 2} className="stave-selected" />
            )}
          </g>
        );
      })}

      {/* Pointer surface, above the fills and below the frame. */}
      <rect
        x={LABEL_W}
        y={0}
        width={plotW}
        height={STAVE_H}
        fill="transparent"
        className="stave-surface"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          const host = (event.currentTarget.ownerSVGElement?.parentElement as HTMLElement) ?? null;
          const x = host ? event.clientX - host.getBoundingClientRect().left : 0;
          const hz = scale.invert(x);
          const hit = bands.find(({ range }) => hz >= range.lo && hz < range.hi);
          onHover(hit?.band ?? null, x);
        }}
        onPointerLeave={() => onHover(null, 0)}
      />

      {/* The zoom window, shown on whichever staves it crosses. */}
      {hasWindow && (
        <rect
          x={scale(overlapLo)}
          y={-1}
          width={Math.max(2, scale(overlapHi) - scale(overlapLo))}
          height={STAVE_H + 2}
          className="window-frame"
        />
      )}

      {brush && (
        <rect
          x={Math.min(brush.from, brush.to)}
          y={-1}
          width={Math.abs(brush.to - brush.from)}
          height={STAVE_H + 2}
          className="brush-rect"
        />
      )}

      {/* Decade ticks and landmark captions share the gap below the stave. */}
      <g transform={`translate(0,${STAVE_H})`} className="stave-axis">
        {staveTicks(itu).map((tick) => (
          <line key={tick} x1={scale(tick)} y1={0} x2={scale(tick)} y2={3} />
        ))}
        {marks.map(({ mark, x }) => (
          <g key={mark.label} className={`landmark${mark.minor ? ' minor' : ''}`}>
            <title>
              {`${mark.label}: ${formatHz(mark.lo)} – ${formatHz(mark.hi)}`}
              {mark.note ? `\n${mark.note}` : ''}
            </title>
            <line x1={x} y1={0} x2={x} y2={3} />
            <text x={x} y={STAVE_GAP - 4} textAnchor="middle">
              {mark.label}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

// --- tooltip ---------------------------------------------------------------

function Tooltip({ band, x, y, width }: { band: Band; x: number; y: number; width: number }) {
  const usage = band.c[2]?.find((item) => item.t === 2 && item.c != null)?.x;
  return (
    <div
      className="tooltip"
      style={{ left: Math.min(Math.max(x - 110, 8), width - 250), top: y + 26 }}
      role="tooltip"
    >
      <strong>{band.n}</strong>
      {band.lo != null && band.hi != null && (
        <div className="tooltip-sub">{formatHz(band.hi - band.lo, 3)} wide</div>
      )}
      <ul>
        {familiesOf(band).map((family) => (
          <li key={family.key}>
            <span className="swatch" style={{ background: familyColour(family) }} />
            {family.label}
          </li>
        ))}
      </ul>
      {usage && <div className="tooltip-usage">{usage}</div>}
      <div className="tooltip-hint">Click for the full entry</div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (max < 4) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** 1-2-3-5-7 ticks inside a single decade, excluding the stave's own edges. */
function staveTicks(itu: ItuBand): number[] {
  const exp = Math.round(Math.log10(itu.lo));
  return [1.5, 2, 3, 5, 7].map((step) => step * 10 ** exp).filter((v) => v > itu.lo && v < itu.hi);
}

/**
 * Landmark captions for one stave, dropping any that would overprint a
 * neighbour. Major landmarks are placed first and minor ones fill the gaps, so
 * a crowded decade like UHF keeps DTT and GSM rather than whichever amateur
 * band happened to come first in the list.
 */
function placeLandmarks(itu: ItuBand, scale: (hz: number) => number, plotW: number) {
  const mine = LANDMARKS.filter((mark) => {
    const centre = Math.sqrt(mark.lo * mark.hi);
    return centre >= itu.lo && centre < itu.hi;
  });

  const placed: { mark: Landmark; x: number }[] = [];
  const spans: [number, number][] = [];

  const tryPlace = (mark: Landmark) => {
    const x = scale(Math.sqrt(mark.lo * mark.hi));
    // Measured: the system sans averages ~4.4px per character at 8.5px, across
    // these labels' mix of digits, spaces and lower-case. Plus 4px of air.
    const half = (mark.label.length * 4.4) / 2 + 4;
    if (x - half < LABEL_W || x + half > LABEL_W + plotW) return;
    if (spans.some(([lo, hi]) => x - half < hi && x + half > lo)) return;
    spans.push([x - half, x + half]);
    placed.push({ mark, x });
  };

  for (const mark of mine) if (!mark.minor) tryPlace(mark);
  for (const mark of mine) if (mark.minor) tryPlace(mark);

  return placed.sort((a, b) => a.x - b.x);
}

/** 1-2-5 ticks across the zoom window, thinned so labels never collide. */
function windowTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let exp = Math.floor(Math.log10(lo)); exp <= Math.ceil(Math.log10(hi)); exp++) {
    for (const step of [1, 2, 5]) {
      const value = step * 10 ** exp;
      if (value >= lo && value <= hi) out.push(value);
    }
  }
  if (out.length > 14) return out.filter((_, i) => i % Math.ceil(out.length / 14) === 0);
  // A window narrower than a couple of steps gets its own edges instead.
  if (out.length < 3) return [lo, Math.sqrt(lo * hi), hi];
  return out;
}
