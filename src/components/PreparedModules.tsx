import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  FileCheck2,
  FileText,
  Flag,
  Play,
  ShieldCheck,
} from 'lucide-react';
import {
  GuidedMissionEvaluation,
  GuidedMissionId,
  LabState,
  SecOpsRubric,
} from '../types/patchday';
import { CtfFlagStatus } from '../utils/labStorage';

interface CtfMissionsModuleProps {
  flags: CtfFlagStatus[];
  missions: GuidedMissionEvaluation[];
  rubric: SecOpsRubric;
  state: LabState;
  onActivateMission: (missionId: GuidedMissionId) => void;
  onOpenAuditReport: () => void;
  onJumpToTriagePatch: (patchId: string) => void;
  onOpenWsus: () => void;
  onOpenRfc: () => void;
  onOpenMaintenance: () => void;
}

export const CtfMissionsModule: React.FC<CtfMissionsModuleProps> = ({
  flags,
  missions,
  rubric,
  state,
  onActivateMission,
  onOpenAuditReport,
  onJumpToTriagePatch,
  onOpenWsus,
  onOpenRfc,
  onOpenMaintenance,
}) => {
  const [copiedFlagId, setCopiedFlagId] = useState<string | null>(null);
  const completedMissions = missions.filter((m) => m.completed).length;
  const completedMicro = flags.filter((f) => f.completed).length;

  const handleCopyFlag = async (missionId: string, token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedFlagId(missionId);
      setTimeout(() => setCopiedFlagId(null), 1800);
    } catch {
      // Ignore clipboard failure in restricted iframes
    }
  };

  const scoreToneClass =
    rubric.totalScore >= 85
      ? 'text-emerald-400'
      : rubric.totalScore >= 60
        ? 'text-sky-400'
        : rubric.totalScore >= 40
          ? 'text-amber-300'
          : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Module Header + Audit Report Trigger */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-sky-400">
            Módulo 5 · Misiones CTF &quot;Martes de Parches&quot;, Rúbrica Automática y Evidencias
          </div>
          <h2 className="font-display text-lg font-bold text-slate-50">
            Centro de Evaluación SecOps ({completedMissions}/{missions.length} Misiones ·{' '}
            {completedMicro}/{flags.length} Flags Técnicas)
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl">
            Completa las 4 misiones guiadas para desbloquear sus tokens FLAG verificables, monitoriza tu nota en tiempo real sobre 100 puntos y genera el informe técnico de auditoría.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAuditReport}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span>Generar Informe de Auditoría PatchDay (Imprimir / PDF / JSON)</span>
        </button>
      </div>

      {/* Real-Time SecOps Rubric Panel (0-100 across 4 KPIs) */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-3">
            <Award className={`h-7 w-7 shrink-0 ${scoreToneClass}`} aria-hidden="true" />
            <div>
              <div className="text-xs font-medium text-slate-400">
                Rúbrica Automática de Evaluación SecOps (Tiempo Real)
              </div>
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`font-mono text-2xl font-bold tabular-nums ${scoreToneClass}`}
                >
                  {rubric.totalScore} / 100
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  · Calificación: {rubric.gradeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Alumno:{' '}
            <span className="text-slate-200">
              {state.studentAlias.trim() || 'Sin asignar (configurar al exportar)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {rubric.kpis.map((kpi) => {
            const pct = Math.round((kpi.score / kpi.maxScore) * 100);
            const barColor =
              kpi.status === 'Óptimo'
                ? 'bg-emerald-500'
                : kpi.status === 'En Progreso'
                  ? 'bg-sky-500'
                  : 'bg-amber-400';

            const statusColor =
              kpi.status === 'Óptimo'
                ? 'text-emerald-400'
                : kpi.status === 'En Progreso'
                  ? 'text-sky-400'
                  : 'text-amber-300';

            return (
              <div
                key={kpi.id}
                className="rounded-md border border-slate-800 bg-[#0B1120] p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-100 leading-snug">
                    {kpi.title}
                  </div>
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 ${statusColor}`}
                  >
                    {kpi.score}/{kpi.maxScore}
                  </span>
                </div>

                <div className="h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {kpi.summary}
                </div>

                <ul className="space-y-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-300">
                  {kpi.findings.map((f, idx) => (
                    <li key={idx} className="leading-snug">
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 Guided CTF Missions with Verifiable FLAG{...} */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Motor de 4 Misiones Guiadas CTF (Verificación Automática de Objetivos)
            </h3>
            <p className="text-xs text-slate-400">
              Activa una misión para cargar su contexto operativo en el simulador o completa sus objetivos directamente entre módulos.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {missions.map((mission) => {
            const isSelected = state.activeMissionId === mission.id;

            return (
              <div
                key={mission.id}
                className={`rounded-lg border p-4 flex flex-col justify-between gap-3.5 ${
                  mission.completed
                    ? 'border-emerald-500/45 bg-emerald-500/5'
                    : isSelected
                      ? 'border-sky-500/50 bg-[#111827]'
                      : 'border-slate-800 bg-[#111827]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-sky-400">
                      {mission.number}
                    </span>
                    {mission.completed ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>MISIÓN SUPERADA</span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-400">
                        {mission.objectives.filter((o) => o.completed).length}/
                        {mission.objectives.length} objetivos
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-display text-base font-bold text-slate-50">
                      {mission.title}
                    </h4>
                    <div className="text-xs text-sky-300/90 mt-0.5">
                      {mission.subtitle}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {mission.briefing}
                  </p>

                  {/* Objectives Checklist */}
                  <ul className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                    {mission.objectives.map((obj) => (
                      <li
                        key={obj.id}
                        className={`flex items-start gap-2 text-xs ${
                          obj.completed ? 'text-emerald-300' : 'text-slate-300'
                        }`}
                      >
                        {obj.completed ? (
                          <CheckCircle2
                            className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            className="h-4 w-4 text-slate-500 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        <span className="leading-snug">{obj.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Flag Reward & Action Bar */}
                <div className="space-y-2.5 border-t border-slate-800/80 pt-3">
                  <div className="rounded border border-slate-800 bg-[#0B1120] px-3 py-2 flex items-center justify-between gap-2 font-mono text-xs">
                    <span className="text-slate-400">FLAG:</span>
                    {mission.completed ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-emerald-400 font-semibold select-all truncate">
                          {mission.flagToken}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyFlag(mission.id, mission.flagToken)
                          }
                          title="Copiar FLAG"
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800 shrink-0 cursor-pointer"
                        >
                          {copiedFlagId === mission.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                              <span>Copiada</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-500">
                        FLAG&#123;••••••••••••••••••••••••••&#125;
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onActivateMission(mission.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {mission.id === 'mission-3' || mission.id === 'mission-4'
                          ? 'Activar Escenario e Ir al Simulador'
                          : mission.actionLabel}
                      </span>
                    </button>

                    {mission.id === 'mission-1' && (
                      <button
                        type="button"
                        onClick={onOpenWsus}
                        className="text-xs text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Ir a Consola WSUS
                      </button>
                    )}
                    {mission.id === 'mission-2' && (
                      <button
                        type="button"
                        onClick={onOpenMaintenance}
                        className="text-xs text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Ir a Ventana Nocturna
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Granular Technical CTF Flags (CTF-01..CTF-10) */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-100">
          Checklist Técnico Detallado ({completedMicro}/{flags.length} Hitos Técnicos)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className={`rounded-lg border p-3.5 space-y-2 ${
                flag.completed
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-800 bg-[#111827]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-sky-400">
                  {flag.code}
                </span>
                {flag.completed ? (
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>CAPTURADA</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-400">
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>PENDIENTE</span>
                  </span>
                )}
              </div>

              <div className="font-display text-sm font-semibold text-slate-100">
                {flag.title}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {flag.description}
              </p>
              <div className="text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Pista: </span>
                {flag.hint}
              </div>

              <div className="pt-0.5">
                {flag.id === 'flag-sim-wua-remediate' ||
                flag.id === 'flag-sim-emergency-rollback' ? (
                  <button
                    type="button"
                    onClick={onOpenMaintenance}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ir a Simulación, Telemetría &amp; Rollback</span>
                  </button>
                ) : flag.id === 'flag-ring-recon' ||
                  flag.id === 'flag-wsus-ring-deploy' ||
                  flag.id === 'flag-wsus-decline-hygiene' ? (
                  <button
                    type="button"
                    onClick={onOpenWsus}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ir a Consola WSUS &amp; Anillos</span>
                  </button>
                ) : flag.id === 'flag-cab-prod-unlock' ||
                  flag.id === 'flag-cab-expedited-kev' ? (
                  <button
                    type="button"
                    onClick={onOpenRfc}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ir a Gestión de Cambios (RFC &amp; CAB)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToTriagePatch(
                        flag.id === 'flag-superseded' ? 'KB5029377' : 'KB5036893',
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    <span>Abrir boletín en Triage</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
