import React from 'react';
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  GitBranch,
  Info,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { DEPLOYMENT_RINGS, ENTERPRISE_ASSETS, PRIORITY_LABELS } from '../data/initialData';
import { OperationalPriority, PatchBulletin, TriageDecision } from '../types/patchday';
import { evaluateTriageFeedback, parseCvssVector } from '../utils/labStorage';

interface TriageInspectorProps {
  bulletin: PatchBulletin;
  decision?: TriageDecision;
  onAssignPriority: (patchId: string, priority: OperationalPriority) => void;
  onToggleRfcQueue: (patchId: string) => void;
  onUpdateNote: (patchId: string, note: string) => void;
  onSelectPatch: (patchId: string) => void;
  onOpenAssetInWsus: (assetId: string) => void;
}

export const TriageInspector: React.FC<TriageInspectorProps> = ({
  bulletin,
  decision,
  onAssignPriority,
  onToggleRfcQueue,
  onUpdateNote,
  onSelectPatch,
  onOpenAssetInWsus,
}) => {
  const vectorParts = parseCvssVector(bulletin.cvssVector);
  const feedback = evaluateTriageFeedback(bulletin, decision?.priority);

  const affectedAssets = ENTERPRISE_ASSETS.filter((asset) =>
    bulletin.affectedAssetIds.includes(asset.id),
  );

  const epssPct = Math.round(bulletin.epssScore * 100);
  const isClassicParadox =
    (bulletin.cvssScore < 8.5 && bulletin.epssScore >= 0.7 && bulletin.inCisaKev) ||
    (bulletin.cvssScore >= 9.0 && bulletin.epssScore <= 0.05 && !bulletin.inCisaKev);

  const feedbackStyle =
    feedback.status === 'optimal'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : feedback.status === 'suboptimal'
        ? 'border-red-500/40 bg-red-500/10 text-red-200'
        : feedback.status === 'acceptable'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
          : 'border-slate-700 bg-slate-900/80 text-slate-300';

  return (
    <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="border-b border-slate-800 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span className="font-semibold text-sky-400">{bulletin.id}</span>
            <span aria-hidden="true">/</span>
            <span>{bulletin.cve}</span>
            <span aria-hidden="true">·</span>
            <span>{bulletin.releaseDate}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium">
            {bulletin.inCisaKev ? (
              <span className="inline-flex items-center gap-1 font-mono text-red-400">
                <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>CISA KEV ACTIVO</span>
              </span>
            ) : (
              <span className="font-mono text-slate-400">No figura en KEV</span>
            )}
          </div>
        </div>

        <h3 className="mt-1.5 font-display text-base font-semibold text-slate-50 leading-snug">
          {bulletin.title}
        </h3>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <span>{bulletin.vendor}</span>
          <span aria-hidden="true">·</span>
          <span>{bulletin.affectedProduct}</span>
          <span aria-hidden="true">·</span>
          <span>{bulletin.classification}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Reinicio: {bulletin.requiresReboot}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{bulletin.sizeMb} MB</span>
        </div>
      </div>

      {/* Supersession Alert if applicable */}
      {bulletin.supersededBy && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <GitBranch className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold text-amber-300">
                Boletín reemplazado en WSUS (Superseded)
              </div>
              <p className="mt-0.5 text-amber-100/90">
                Este paquete ha sido sustituido por{' '}
                <span className="font-mono font-semibold">{bulletin.supersededBy}</span>.
                Instalación directa desaconsejada.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectPatch(bulletin.supersededBy!)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1.5 font-mono text-xs font-medium text-amber-200 hover:bg-amber-500/30 whitespace-nowrap cursor-pointer"
          >
            <span>Ir a {bulletin.supersededBy}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {bulletin.supersedes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 border-b border-slate-800 pb-3">
          <GitBranch className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <span>Reemplaza en catálogo WSUS a:</span>
          {bulletin.supersedes.map((oldId) => (
            <button
              key={oldId}
              type="button"
              onClick={() => onSelectPatch(oldId)}
              className="font-mono text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
            >
              {oldId}
            </button>
          ))}
        </div>
      )}

      {/* Tri-Metric Pedagogical Breakdown: CVSS vs EPSS vs KEV */}
      <div className="grid grid-cols-3 gap-3 border-b border-slate-800 pb-3.5">
        <div>
          <div className="text-[11px] text-slate-400">CVSS v3.1 Base</div>
          <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-slate-50">
            {bulletin.cvssScore.toFixed(1)}
            <span className="text-xs font-normal text-slate-400"> / 10</span>
          </div>
          <div className="text-[11px] text-slate-400">Severidad técnica</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400">EPSS (30 días)</div>
          <div
            className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${
              epssPct >= 70
                ? 'text-red-400'
                : epssPct >= 25
                  ? 'text-amber-400'
                  : 'text-sky-400'
            }`}
          >
            {epssPct}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            Percentil {bulletin.epssPercentile.toFixed(1)}%
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400">CISA KEV</div>
          <div
            className={`mt-0.5 font-mono text-xl font-bold ${
              bulletin.inCisaKev ? 'text-red-400' : 'text-slate-300'
            }`}
          >
            {bulletin.inCisaKev ? 'TRUE' : 'FALSE'}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {bulletin.inCisaKev
              ? `Vence ${bulletin.kevDueDate ?? 'Inmediato'}`
              : 'Sin explotación KEV'}
          </div>
        </div>
      </div>

      {/* Pedagogical Comparison Analysis */}
      <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
            <Info className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <span>Inspector de Priorización Pedagógico</span>
          </span>
          {isClassicParadox && (
            <button
              type="button"
              onClick={() =>
                onSelectPatch(
                  bulletin.id === 'APACHE-2.4.62' ? 'KB5036893' : 'APACHE-2.4.62',
                )
              }
              className="text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap cursor-pointer"
            >
              {bulletin.id === 'APACHE-2.4.62'
                ? 'Comparar con KB5036893 (CVSS 7.8 / KEV)'
                : 'Comparar con APACHE-2.4.62 (CVSS 9.8 / EPSS 2%)'}
            </button>
          )}
        </div>
        <p className="text-slate-300 leading-relaxed">{bulletin.summary}</p>
        <p className="text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-100">Contexto de Amenaza: </span>
          {bulletin.exploitContext}
        </p>
        <p className="text-sky-200/90 leading-relaxed">
          <span className="font-semibold text-sky-300">Criterio SecOps: </span>
          {bulletin.pedagogicalRationale}
        </p>
      </div>

      {/* CVSS Vector Metrics */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Desglose de Vector CVSS</span>
          <span className="font-mono text-slate-400 truncate max-w-[260px]">
            {bulletin.cvssVector}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {vectorParts.map((item) => (
            <div
              key={item.code}
              className="rounded border border-slate-800 bg-[#0B1120] px-2 py-1.5 text-[11px]"
            >
              <div className="text-slate-400 truncate">{item.label}</div>
              <div className="font-mono font-medium text-slate-200 truncate">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Affected Assets in Enterprise Inventory */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-200 inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Activos Impactados en Inventario ({affectedAssets.length})</span>
          </span>
          <span className="text-[11px] text-slate-400">Clic para ver en WSUS</span>
        </div>
        <div className="max-h-32 overflow-y-auto rounded-md border border-slate-800 divide-y divide-slate-800/80 bg-[#0B1120]">
          {affectedAssets.map((asset) => {
            const ring = DEPLOYMENT_RINGS.find((r) => r.id === asset.ringId);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onOpenAssetInWsus(asset.id)}
                className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <span className="font-mono font-medium text-slate-200">
                    {asset.id}
                  </span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className="text-slate-400 truncate">{asset.role}</span>
                </div>
                <span className="font-mono text-[11px] text-sky-400 shrink-0">
                  {ring?.shortName ?? asset.ringId}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Student Operational Priority Action */}
      <div className="border-t border-slate-800 pt-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-100">
            Asignar Prioridad Operativa
          </span>
          {decision?.priority && (
            <span className="font-mono text-xs text-sky-400">
              Actual: {PRIORITY_LABELS[decision.priority].title}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(['P1', 'P2', 'P3', 'P4'] as OperationalPriority[]).map((pKey) => {
            const pInfo = PRIORITY_LABELS[pKey];
            const isSelected = decision?.priority === pKey;
            const activeColors =
              pKey === 'P1'
                ? 'border-red-500 bg-red-500/15 text-red-200'
                : pKey === 'P2'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-200'
                  : pKey === 'P3'
                    ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                    : 'border-slate-500 bg-slate-700/40 text-slate-100';

            return (
              <button
                key={pKey}
                type="button"
                onClick={() => onAssignPriority(bulletin.id, pKey)}
                className={`rounded-md border px-3 py-2 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? activeColors
                    : 'border-slate-800 bg-[#0B1120] text-slate-300 hover:border-slate-600 hover:bg-slate-800/50'
                }`}
              >
                <div className="text-xs font-semibold">{pInfo.title}</div>
                <div className="text-[11px] text-slate-400">{pInfo.sla}</div>
              </button>
            );
          })}
        </div>

        {/* Immediate Pedagogical Evaluation */}
        <div className={`rounded-md border p-2.5 text-xs ${feedbackStyle}`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {feedback.status === 'optimal' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.headline}</span>
          </div>
          <p className="mt-1 opacity-90 leading-relaxed">{feedback.detail}</p>
        </div>

        {/* Analyst Justification + Send to RFC Queue */}
        <div className="space-y-2">
          <label
            htmlFor="triage-analyst-note"
            className="block text-xs font-medium text-slate-300"
          >
            Justificación técnica para el Comité CAB (opcional)
          </label>
          <textarea
            id="triage-analyst-note"
            rows={2}
            value={decision?.analystNote ?? ''}
            onChange={(e) => onUpdateNote(bulletin.id, e.target.value)}
            placeholder="Ej: Priorizado P1 por exposición en FW-EDGE-01 y presencia en CISA KEV..."
            className="w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {decision?.queuedForRfc
              ? 'Este boletín ya se encuentra en la cola Pendiente de RFC.'
              : 'Asigna prioridad y envía a la cola para redactar el RFC en Fase 2.'}
          </div>
          <button
            type="button"
            disabled={!decision?.priority}
            onClick={() => onToggleRfcQueue(bulletin.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
              decision?.queuedForRfc
                ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {decision?.queuedForRfc ? 'En Cola RFC (Quitar)' : 'Enviar a Cola RFC'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
