import React, { useMemo, useState } from 'react';
import { PatchBulletin, TriageDecision } from '../types/patchday';

interface DecisionMatrixChartProps {
  bulletins: PatchBulletin[];
  selectedPatchId: string;
  decisions: Record<string, TriageDecision>;
  onSelectPatch: (id: string) => void;
}

export const DecisionMatrixChart: React.FC<DecisionMatrixChartProps> = ({
  bulletins,
  selectedPatchId,
  decisions,
  onSelectPatch,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const width = 620;
  const height = 340;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 44;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Map CVSS 4.0..10.0 on X axis so points aren't crushed on the right,
  // while still clamping any lower score cleanly.
  const minCvss = 5.0;
  const maxCvss = 10.0;

  const xForCvss = (cvss: number) => {
    const clamped = Math.max(minCvss, Math.min(maxCvss, cvss));
    return padLeft + ((clamped - minCvss) / (maxCvss - minCvss)) * plotW;
  };

  const yForEpss = (epss: number) => {
    const clamped = Math.max(0, Math.min(1, epss));
    return padTop + (1 - clamped) * plotH;
  };

  const cvssThresholdX = xForCvss(7.0);
  const epssThresholdY = yForEpss(0.3);

  const hoveredBulletin = useMemo(
    () => bulletins.find((b) => b.id === hoveredId) ?? null,
    [bulletins, hoveredId],
  );

  // Small deterministic offset for overlapping coordinates (e.g., if two share CVSS/EPSS)
  const plottedPoints = useMemo(() => {
    const seen = new Map<string, number>();
    return bulletins.map((b) => {
      const key = `${b.cvssScore.toFixed(1)}-${b.epssScore.toFixed(2)}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      const jitterX = count === 0 ? 0 : (count % 2 === 0 ? -1 : 1) * 8;
      const jitterY = count === 0 ? 0 : (count % 2 === 0 ? 6 : -6);
      return {
        bulletin: b,
        cx: xForCvss(b.cvssScore) + jitterX,
        cy: yForEpss(b.epssScore) + jitterY,
      };
    });
  }, [bulletins]);

  return (
    <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Matriz de Decisión Visual (CVSS v3.1 vs EPSS 30 días)
          </h3>
          <p className="text-xs text-slate-400">
            Haz clic en cualquier nodo para inspeccionar por qué EPSS y CISA KEV superan al CVSS aislado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-500/40" />
            <span>CISA KEV activo</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />
            <span>Sin KEV</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-400 bg-slate-700" />
            <span>Reemplazado</span>
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-md border border-slate-800/90 bg-[#0B1120]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label="Matriz de dispersión CVSS versus EPSS"
        >
          {/* Quadrant Backgrounds */}
          {/* Top Right: Critical Immediate */}
          <rect
            x={cvssThresholdX}
            y={padTop}
            width={padLeft + plotW - cvssThresholdX}
            height={epssThresholdY - padTop}
            fill="rgba(220, 38, 38, 0.08)"
          />
          {/* Top Left: High EPSS / Moderate CVSS */}
          <rect
            x={padLeft}
            y={padTop}
            width={cvssThresholdX - padLeft}
            height={epssThresholdY - padTop}
            fill="rgba(217, 119, 6, 0.06)"
          />
          {/* Bottom Right: High CVSS / Low EPSS (Theoretical) */}
          <rect
            x={cvssThresholdX}
            y={epssThresholdY}
            width={padLeft + plotW - cvssThresholdX}
            height={padTop + plotH - epssThresholdY}
            fill="rgba(14, 165, 233, 0.05)"
          />
          {/* Bottom Left: Low Risk */}
          <rect
            x={padLeft}
            y={epssThresholdY}
            width={cvssThresholdX - padLeft}
            height={padTop + plotH - epssThresholdY}
            fill="rgba(30, 41, 59, 0.25)"
          />

          {/* Gridlines Y (EPSS) */}
          {[0, 0.25, 0.5, 0.75, 1].map((val) => {
            const y = yForEpss(val);
            return (
              <g key={`y-${val}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {Math.round(val * 100)}%
                </text>
              </g>
            );
          })}

          {/* Gridlines X (CVSS) */}
          {[5, 6, 7, 8, 9, 10].map((val) => {
            const x = xForCvss(val);
            return (
              <g key={`x-${val}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#1E293B"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Decision Threshold Lines */}
          <line
            x1={cvssThresholdX}
            y1={padTop}
            x2={cvssThresholdX}
            y2={padTop + plotH}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />
          <line
            x1={padLeft}
            y1={epssThresholdY}
            x2={padLeft + plotW}
            y2={epssThresholdY}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />

          {/* Quadrant Labels */}
          <text
            x={padLeft + plotW - 8}
            y={padTop + 16}
            textAnchor="end"
            className="fill-red-300/90 text-[10px] font-semibold"
          >
            Prioridad Crítica Inmediata (KEV / Alto EPSS)
          </text>
          <text
            x={padLeft + 8}
            y={padTop + 16}
            textAnchor="start"
            className="fill-amber-300/80 text-[10px] font-medium"
          >
            Amenaza Activa (EPSS ≥ 30%)
          </text>
          <text
            x={padLeft + plotW - 8}
            y={padTop + plotH - 8}
            textAnchor="end"
            className="fill-sky-300/80 text-[10px] font-medium"
          >
            CVSS Alto / Bajo EPSS (Validar Exposición)
          </text>
          <text
            x={padLeft + 8}
            y={padTop + plotH - 8}
            textAnchor="start"
            className="fill-slate-400 text-[10px]"
          >
            Mantenimiento Planificado
          </text>

          {/* Axis Titles */}
          <text
            x={padLeft + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[11px] font-medium"
          >
            Eje X: CVSS v3.1 Base Score (Severidad Técnica)
          </text>
          <text
            x={14}
            y={padTop + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${padTop + plotH / 2})`}
            className="fill-slate-400 text-[11px] font-medium"
          >
            Eje Y: EPSS (Prob. Explotación 30d)
          </text>

          {/* Data Points */}
          {plottedPoints.map(({ bulletin, cx, cy }) => {
            const isSelected = bulletin.id === selectedPatchId;
            const isHovered = bulletin.id === hoveredId;
            const isSuperseded = Boolean(bulletin.supersededBy);
            const decision = decisions[bulletin.id];
            const isQueued = Boolean(decision?.queuedForRfc);

            const fillColor = isSuperseded
              ? '#475569'
              : bulletin.inCisaKev
                ? '#EF4444'
                : bulletin.epssScore >= 0.7
                  ? '#F59E0B'
                  : '#38BDF8';

            return (
              <g
                key={bulletin.id}
                className="cursor-pointer"
                onClick={() => onSelectPatch(bulletin.id)}
                onMouseEnter={() => setHoveredId(bulletin.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* CISA KEV Pulsing Beacon */}
                {bulletin.inCisaKev && !isSuperseded && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="1.5"
                    className="kev-beacon"
                  />
                )}

                {/* Selection Halo */}
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="none"
                    stroke="#F8FAFC"
                    strokeWidth="2"
                  />
                )}

                {/* Queued Ring */}
                {isQueued && !isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9.5}
                    fill="none"
                    stroke="#22C55E"
                    strokeWidth="1.5"
                  />
                )}

                {/* Main Node */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected || isHovered ? 7 : 5.5}
                  fill={fillColor}
                  stroke={isSuperseded ? '#CBD5E1' : '#0B1120'}
                  strokeDasharray={isSuperseded ? '2 2' : undefined}
                  strokeWidth={isSuperseded ? '1.5' : '1.5'}
                />

                {/* Label for Selected or KEV / Notable contrast points */}
                {(isSelected || isHovered || bulletin.id === 'APACHE-2.4.62' || bulletin.id === 'KB5036893') && (
                  <text
                    x={cx}
                    y={cy - 12}
                    textAnchor={cx > padLeft + plotW - 70 ? 'end' : cx < padLeft + 70 ? 'start' : 'middle'}
                    className={`font-mono text-[10px] font-semibold ${
                      isSelected ? 'fill-white' : 'fill-slate-300'
                    }`}
                  >
                    {bulletin.id}
                    {bulletin.inCisaKev && !isSuperseded ? ' [KEV]' : ''}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip inside matrix */}
        {hoveredBulletin && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:top-3 sm:bottom-auto sm:w-64 rounded-md border border-slate-700 bg-slate-950/95 p-2.5 text-xs shadow-lg">
            <div className="flex items-center justify-between gap-2 font-mono font-semibold text-slate-100">
              <span>{hoveredBulletin.id}</span>
              {hoveredBulletin.inCisaKev && (
                <span className="text-red-400">CISA KEV</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-slate-300">{hoveredBulletin.title}</div>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-400">
              <span>CVSS {hoveredBulletin.cvssScore.toFixed(1)}</span>
              <span>·</span>
              <span>EPSS {Math.round(hoveredBulletin.epssScore * 100)}%</span>
              {hoveredBulletin.supersededBy && (
                <>
                  <span>·</span>
                  <span className="text-amber-400">Reemplazado</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
