import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FastForward,
  HardDrive,
  Moon,
  RefreshCw,
  RotateCcw,
  Send,
  ServerCrash,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react';
import { DEPLOYMENT_RINGS, ENTERPRISE_ASSETS, PATCH_BULLETINS } from '../data/initialData';
import {
  DeploymentRingId,
  LabState,
  RecommendedFixType,
  SimulationIncident,
  SimulationLogEntry,
} from '../types/patchday';

interface SimulationTelemetryModuleProps {
  state: LabState;
  onAdvanceTime: (mode: '4h' | 'night_window' | 'reportnow') => void;
  onTriggerDrill: () => void;
  onWsusRemovalFix: (patchId: string, ringId: DeploymentRingId) => void;
  onExecuteWinRm: (targetHost: string, command: string) => void;
  onRevertSnapshot: (assetId: string) => void;
  onResolveDeadline: (incidentId: string) => void;
  onOpenWsusConsole: () => void;
}

type RecoveryTab = 'via1_wsus' | 'via2_winrm' | 'via3_hypervisor';

const WINRM_TARGETS = [
  { id: 'Ring 2 Estaciones', label: 'Ring 2 · 150 Estaciones Windows 11' },
  { id: 'Ring 3 Servidores Críticos', label: 'Ring 3 · Servidores Críticos (Batch WinRM)' },
  { id: 'DEV-SQL-01.corp.local', label: 'DEV-SQL-01.corp.local (Ring 1 · SQL Piloto)' },
  { id: 'WS-IT-09.corp.local', label: 'WS-IT-09.corp.local (Ring 1 · WinRE)' },
  { id: 'WS-OPS-21.corp.local', label: 'WS-OPS-21.corp.local (Ring 2 · Proxy/DNS)' },
  { id: 'FILE-PROD-02.corp.local', label: 'FILE-PROD-02.corp.local (Ring 2 · ACL)' },
  { id: 'DC-CORE-01.corp.local', label: 'DC-CORE-01.corp.local (Ring 3 · AD FSMO)' },
  { id: 'DC-CORE-02.corp.local', label: 'DC-CORE-02.corp.local (Ring 3 · AD Secundario)' },
  { id: 'EXCH-DAG-01.corp.local', label: 'EXCH-DAG-01.corp.local (Ring 3 · Exchange/IIS)' },
  { id: 'PRT-SRV-01.corp.local', label: 'PRT-SRV-01.corp.local (Ring 2 · Impresión)' },
  { id: 'LAB-WIN11-01.corp.local', label: 'LAB-WIN11-01.corp.local (Ring 0 · Sandbox)' },
];

const QUICK_COMMANDS: Array<{
  label: string;
  command: string;
  hint: string;
}> = [
  {
    label: 'Get-HotFix',
    command: 'Get-HotFix',
    hint: 'Inventario de KBs instalados',
  },
  {
    label: 'wusa /kb:5035432',
    command: 'wusa /uninstall /kb:5035432 /quiet /norestart',
    hint: 'Desinstala SQL CU12 en DEV-SQL-01 (Misión 3)',
  },
  {
    label: 'DISM /Remove-Package',
    command:
      'DISM /Online /Remove-Package /PackageName:Package_for_RollupFix~31bf3856ad364e35~amd64~~22621.3447.1.11',
    hint: 'Retira KB5036893 LCU cuando wusa falla',
  },
  {
    label: 'DISM /RestoreHealth',
    command: 'DISM /Online /Cleanup-Image /RestoreHealth',
    hint: 'Repara almacén SxS (0x800f081f)',
  },
  {
    label: 'Reset-WuAgent',
    command: 'Reset-WuAgent',
    hint: 'Limpia SoftwareDistribution (0x8024402c / 0x80070005)',
  },
  {
    label: 'Resize-WinRE',
    command: 'Resize-WinRE',
    hint: 'Amplía WinRE +250 MB (0x800f0922)',
  },
  {
    label: 'Restart-Service IIS/Spooler',
    command: 'Restart-Service Spooler, W3SVC, MSExchangeTransport',
    hint: 'Restaura servicios detenidos',
  },
];

const HYPERVISOR_VMS = ENTERPRISE_ASSETS.filter(
  (a) =>
    a.ringId === 'ring-3' ||
    a.id === 'PRT-SRV-01' ||
    a.id === 'FILE-PROD-02',
);

export const SimulationTelemetryModule: React.FC<
  SimulationTelemetryModuleProps
> = ({
  state,
  onAdvanceTime,
  onTriggerDrill,
  onWsusRemovalFix,
  onExecuteWinRm,
  onRevertSnapshot,
  onResolveDeadline,
  onOpenWsusConsole,
}) => {
  const sim = state.simulation;
  const activeIncidents = sim.incidents.filter((i) => i.status === 'active');
  const resolvedIncidents = sim.incidents.filter((i) => i.status === 'resolved');

  const [recoveryTab, setRecoveryTab] = useState<RecoveryTab>('via2_winrm');
  const [winrmTarget, setWinrmTarget] = useState<string>('Ring 2 Estaciones');
  const [commandInput, setCommandInput] = useState<string>('');
  const [cmdCursor, setCmdCursor] = useState<number>(-1);
  const [logSourceFilter, setLogSourceFilter] = useState<
    'ALL' | SimulationLogEntry['source']
  >('ALL');

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sim.terminalHistory.length]);

  const soakKb5036893 = sim.ringSoakHours['KB5036893'] ?? 0;

  // Per-ring fleet health computed from active incidents
  const ringStats = useMemo(() => {
    return DEPLOYMENT_RINGS.map((ring) => {
      const ringIncs = activeIncidents.filter((i) => i.ringId === ring.id);
      let down = 0;
      let degraded = 0;
      for (const inc of ringIncs) {
        if (inc.type === 'bsod_loop' || inc.type === 'kerberos_auth') {
          down += inc.affectedCount;
        } else {
          degraded += inc.affectedCount;
        }
      }
      const clampedDown = Math.min(ring.fleetCount, down);
      const clampedDeg = Math.min(ring.fleetCount - clampedDown, degraded);
      const op = Math.max(0, ring.fleetCount - clampedDown - clampedDeg);
      const healthPct = Math.max(
        0,
        Math.round(
          ((ring.fleetCount - clampedDown - clampedDeg * 0.4) / ring.fleetCount) *
            100,
        ),
      );
      return {
        ring,
        operational: op,
        degraded: clampedDeg,
        down: clampedDown,
        healthPct,
        activeCount: ringIncs.length,
      };
    });
  }, [activeIncidents]);

  const filteredLogs = useMemo(() => {
    if (logSourceFilter === 'ALL') return sim.eventLogs;
    return sim.eventLogs.filter((l) => l.source === logSourceFilter);
  }, [sim.eventLogs, logSourceFilter]);

  const handleDiagnoseIncident = (inc: SimulationIncident) => {
    const fix: RecommendedFixType = inc.recommendedFix;
    if (fix === 'hypervisor_snapshot') {
      setRecoveryTab('via3_hypervisor');
      return;
    }
    if (fix === 'wsus_removal') {
      setRecoveryTab('via1_wsus');
      return;
    }

    setRecoveryTab('via2_winrm');
    if (inc.targetHostLabel.includes('150 Estaciones')) {
      setWinrmTarget('Ring 2 Estaciones');
    } else {
      const matched = WINRM_TARGETS.find((t) =>
        inc.targetHostLabel.includes(t.id.split('.')[0]),
      );
      if (matched) setWinrmTarget(matched.id);
    }

    if (fix === 'winrm_dism') {
      setCommandInput(
        'DISM /Online /Remove-Package /PackageName:Package_for_RollupFix~31bf3856ad364e35~amd64~~22621.3447.1.11',
      );
    } else if (fix === 'winrm_dism_restore') {
      setCommandInput('DISM /Online /Cleanup-Image /RestoreHealth');
    } else if (fix === 'winrm_reset_wu') {
      setCommandInput('Reset-WuAgent');
    } else if (fix === 'winrm_winre') {
      setCommandInput('Resize-WinRE');
    } else if (fix === 'winrm_service') {
      setCommandInput('Restart-Service Spooler, W3SVC, MSExchangeTransport');
    } else if (fix === 'winrm_wusa') {
      setCommandInput(`wusa /uninstall /kb:${inc.patchId.replace('KB', '')} /quiet`);
    }
  };

  const submitWinRmCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onExecuteWinRm(winrmTarget, commandInput);
    setCommandInput('');
    setCmdCursor(-1);
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sim.terminalHistory.length === 0) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx =
        cmdCursor === -1
          ? sim.terminalHistory.length - 1
          : Math.max(0, cmdCursor - 1);
      setCmdCursor(nextIdx);
      setCommandInput(sim.terminalHistory[nextIdx]?.command ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdCursor === -1) return;
      const nextIdx = cmdCursor + 1;
      if (nextIdx >= sim.terminalHistory.length) {
        setCmdCursor(-1);
        setCommandInput('');
      } else {
        setCmdCursor(nextIdx);
        setCommandInput(sim.terminalHistory[nextIdx]?.command ?? '');
      }
    }
  };

  const wsusRemovablePatches = useMemo(() => {
    const patchIds = new Set<string>(['KB5036893', 'KB5034848', 'KB5035857', 'KB5034763']);
    for (const inc of activeIncidents) {
      patchIds.add(inc.patchId);
    }
    return PATCH_BULLETINS.filter((b) => patchIds.has(b.id));
  }, [activeIncidents]);

  return (
    <div className="space-y-5">
      {/* Time Control Engine */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-sky-400">
              Motor de Simulación Temporal · WSUS Sync &amp; Ventanas de Mantenimiento
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-base font-bold text-slate-50 tabular-nums">
                <Clock className="h-4 w-4 text-sky-400" aria-hidden="true" />
                <span>{sim.simClockLabel}</span>
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                · +{sim.simHoursElapsed}h transcurridas
              </span>
              <span
                className={`text-xs font-mono tabular-nums ${
                  soakKb5036893 >= 24 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                · Soak KB5036893 (Ring 0/1): {soakKb5036893}h / 24h rec.
              </span>
              {sim.userComplaints > 0 && (
                <span className="text-xs font-mono tabular-nums text-red-400">
                  · {sim.userComplaints} quejas Helpdesk (Penalización SLA)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAdvanceTime('4h')}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-600 px-3.5 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Avanzar +4 Horas (Test en Anillo 0/1)</span>
            </button>

            <button
              type="button"
              onClick={() => onAdvanceTime('night_window')}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-indigo-500/50 bg-indigo-500/15 px-3.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Moon className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
              <span>Ejecutar Ventana de Mantenimiento Nocturna</span>
            </button>

            <button
              type="button"
              onClick={() => onAdvanceTime('reportnow')}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Forzar Reporte wuauclt /reportnow · UsoClient StartScan</span>
            </button>

            <button
              type="button"
              onClick={onTriggerDrill}
              title="Inyecta incidentes realistas (BSOD, Kerberos, IIS y errores WUA) para entrenar las 3 vías de rollback"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/20 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Simular Regresión de Parches</span>
            </button>
          </div>
        </div>

        {/* Ring Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
          {ringStats.map((st) => {
            const toneClass =
              st.healthPct < 70
                ? 'border-red-500/50 bg-red-500/5'
                : st.healthPct < 100
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-slate-800 bg-[#0B1120]';

            const barColor =
              st.healthPct < 70
                ? 'bg-red-500'
                : st.healthPct < 100
                  ? 'bg-amber-400'
                  : 'bg-emerald-500';

            return (
              <div key={st.ring.id} className={`rounded-md border p-3 space-y-2 ${toneClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {st.ring.wsusGroupName}
                  </span>
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${
                      st.healthPct < 70
                        ? 'text-red-400'
                        : st.healthPct < 100
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                    }`}
                  >
                    {st.healthPct}%
                  </span>
                </div>

                <div className="h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${st.healthPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                  <span>
                    {st.operational}/{st.ring.fleetCount} Op · {st.down} Caídos ·{' '}
                    {st.degraded} Deg
                  </span>
                  {st.activeCount > 0 && (
                    <span className="text-red-400 font-semibold">
                      {st.activeCount} alerta(s)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Incidents + 3-Way Recovery Console */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Incidents & Telemetry Alerts */}
        <section className="xl:col-span-5 rounded-lg border border-slate-800 bg-[#111827] flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              {activeIncidents.length > 0 ? (
                <AlertOctagon className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              )}
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Telemetría de Errores e Incidentes ({activeIncidents.length} activos)
              </h3>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-slate-400">
              {resolvedIncidents.length} resueltos
            </span>
          </div>

          <div className="p-4 space-y-3 flex-1 max-h-[560px] overflow-y-auto">
            {activeIncidents.length === 0 ? (
              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  <span>Sin incidentes críticos activos en la red</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Ejecuta <span className="text-slate-200 font-medium">Avanzar +4 Horas</span>,{' '}
                  <span className="text-slate-200 font-medium">Ventana Nocturna</span> o{' '}
                  <span className="text-slate-200 font-medium">Forzar Reporte</span> para simular el comportamiento de los parches aprobados en WSUS, o activa{' '}
                  <span className="text-amber-300 font-medium">Simular Regresión de Parches</span> para entrenar el rollback de emergencia.
                </p>
              </div>
            ) : (
              activeIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`rounded-md border p-3 space-y-2 ${
                    inc.type === 'bsod_loop' || inc.type === 'kerberos_auth'
                      ? 'border-red-500/45 bg-red-500/5'
                      : 'border-amber-500/40 bg-amber-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-red-300">
                      {inc.errorCode ?? inc.type} · {inc.patchId}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {inc.detectedAtClock} · {inc.affectedCount} eq
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-100">
                    {inc.title}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {inc.detail}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
                    <span className="font-mono text-[11px] text-slate-400">
                      WinRM/WSUS:{' '}
                      <span
                        className={
                          inc.winrmReachable ? 'text-emerald-400' : 'text-red-400 font-semibold'
                        }
                      >
                        {inc.winrmReachable ? 'Alcanzable' : 'Sin respuesta (BSOD)'}
                      </span>
                    </span>

                    {inc.type === 'deadline_complaint' ? (
                      <button
                        type="button"
                        onClick={() => onResolveDeadline(inc.id)}
                        className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 cursor-pointer whitespace-nowrap"
                      >
                        <span>Corregir Deadline a Ventana Estándar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDiagnoseIncident(inc)}
                        className="inline-flex items-center gap-1 rounded bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {inc.recommendedFix === 'hypervisor_snapshot'
                            ? 'Abrir Vía 3 (Hipervisor)'
                            : 'Cargar Remediación en Consola'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {resolvedIncidents.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">
                  Historial de Incidentes Recuperados ({resolvedIncidents.length})
                </div>
                {resolvedIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-emerald-300 font-mono">
                      <span>
                        ✓ {inc.patchId} · {inc.targetHostLabel}
                      </span>
                      <span>{inc.resolvedAtClock}</span>
                    </div>
                    <div className="text-slate-300">{inc.resolutionMethod}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: 3-Way Emergency Recovery Console */}
        <section className="xl:col-span-7 rounded-lg border border-slate-800 bg-[#111827] flex flex-col">
          <div className="border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Consola de Emergencia y Vuelta Atrás (3 Vías de Recuperación)
              </h3>
              <p className="text-xs text-slate-400">
                Selecciona WSUS Removal, Terminal WinRM (DISM / wusa / WUA) o Snapshot de Hipervisor según alcance.
              </p>
            </div>
          </div>

          {/* 3-Way Tabs */}
          <div className="border-b border-slate-800 bg-[#0D1425] px-4 py-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRecoveryTab('via1_wsus')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
                recoveryTab === 'via1_wsus'
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Vía 1 · WSUS Approved for Removal</span>
            </button>

            <button
              type="button"
              onClick={() => setRecoveryTab('via2_winrm')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
                recoveryTab === 'via2_winrm'
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Vía 2 · Terminal PowerShell / WinRM</span>
            </button>

            <button
              type="button"
              onClick={() => setRecoveryTab('via3_hypervisor')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
                recoveryTab === 'via3_hypervisor'
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Vía 3 · Hipervisor Snapshot (Ring 3 / BSOD)</span>
            </button>
          </div>

          <div className="p-4 flex-1">
            {/* VIA 1: WSUS APPROVED FOR REMOVAL */}
            {recoveryTab === 'via1_wsus' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                  <span>
                    Cambia un boletín a <span className="font-mono text-amber-300">Approved for Removal</span> con{' '}
                    <span className="font-mono text-red-300">Deadline: Inmediato</span>. Funciona en equipos con agente Windows Update operativo.
                  </span>
                  <button
                    type="button"
                    onClick={onOpenWsusConsole}
                    className="text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Abrir Consola WSUS completa
                  </button>
                </div>

                <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0B1120]">
                  {wsusRemovablePatches.map((b) => {
                    const app = state.wsusApprovals[b.id];
                    const matchingIncs = activeIncidents.filter(
                      (i) => i.patchId === b.id,
                    );
                    const targetRing: DeploymentRingId =
                      matchingIncs[0]?.ringId ??
                      (b.id === 'KB5034763' || b.id === 'KB5035857'
                        ? 'ring-3'
                        : 'ring-2');
                    const currentAction = app?.rings[targetRing]?.action ?? 'Not Approved';

                    return (
                      <div
                        key={b.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-sky-400">
                              {b.id}
                            </span>
                            <span className="text-slate-100 font-medium truncate">
                              {b.title}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                            Objetivo: {targetRing} · Estado WSUS actual: {currentAction} ·{' '}
                            {b.supportsWusaUninstall === false
                              ? 'Paquete SSU/Complejo (requiere DISM/Snapshot si falla agente)'
                              : 'Soporta desinstalación estándar'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onWsusRemovalFix(b.id, targetRing)}
                          className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Approved for Removal · Deadline Inmediato</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIA 2: INTERACTIVE POWERSHELL / WINRM TERMINAL */}
            {recoveryTab === 'via2_winrm' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="winrm-target-select"
                      className="text-xs font-medium text-slate-300 whitespace-nowrap"
                    >
                      Equipo / Grupo Destino:
                    </label>
                    <select
                      id="winrm-target-select"
                      value={winrmTarget}
                      onChange={(e) => setWinrmTarget(e.target.value)}
                      className="h-8 rounded-md border border-slate-700 bg-[#0B1120] px-2.5 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                    >
                      {WINRM_TARGETS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Usa flechas ↑/↓ para historial o &quot;help&quot;
                  </span>
                </div>

                {/* Quick Technical Command Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_COMMANDS.map((qc) => (
                    <button
                      key={qc.label}
                      type="button"
                      title={qc.hint}
                      onClick={() => setCommandInput(qc.command)}
                      className="rounded border border-slate-700 bg-[#0B1120] px-2.5 py-1 font-mono text-[11px] text-sky-300 hover:border-sky-500/60 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      {qc.label}
                    </button>
                  ))}
                </div>

                {/* Terminal Output Screen */}
                <div className="rounded-md border border-slate-800 bg-[#060913] p-3 font-mono text-xs h-64 overflow-y-auto space-y-2.5">
                  <div className="text-slate-400">
                    Windows PowerShell SecOps Remoting [WinRM TCP/5985] — Sesión:{' '}
                    <span className="text-sky-400">{winrmTarget}</span>
                  </div>
                  {sim.terminalHistory.length === 0 && (
                    <div className="text-slate-500">
                      Escribe un comando (ej. Get-HotFix, Reset-WuAgent, Resize-WinRE, DISM...) o pulsa un botón superior.
                    </div>
                  )}
                  {sim.terminalHistory.map((item) => (
                    <div key={item.id} className="space-y-1">
                      <div className="text-emerald-400">
                        PS [{item.target}]&gt;{' '}
                        <span className="text-slate-100">{item.command}</span>
                      </div>
                      <div
                        className={`pl-2 whitespace-pre-wrap leading-relaxed ${
                          item.isError ? 'text-red-400' : 'text-slate-300'
                        }`}
                      >
                        {item.output.join('\n')}
                      </div>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>

                <form onSubmit={submitWinRmCommand} className="flex gap-2">
                  <div className="flex-1 flex items-center rounded-md border border-slate-700 bg-[#060913] px-3 focus-within:border-sky-500">
                    <span className="font-mono text-xs text-emerald-400 mr-2 shrink-0">
                      PS&gt;
                    </span>
                    <input
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      onKeyDown={handleTerminalKeyDown}
                      placeholder="Ej: Reset-WuAgent | Resize-WinRE | DISM /Online /Remove-Package ..."
                      className="h-9 w-full bg-transparent font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ejecutar</span>
                  </button>
                </form>
              </div>
            )}

            {/* VIA 3: HYPERVISOR SNAPSHOT CONSOLE */}
            {recoveryTab === 'via3_hypervisor' && (
              <div className="space-y-3">
                <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 text-xs text-slate-300 flex items-center justify-between gap-2">
                  <span>
                    Consola VMware vCenter / Proxmox VE · Snapshot base:{' '}
                    <span className="font-mono text-sky-400">{sim.snapshotsTakenAt}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Recupera nodos en BSOD / Kerberos
                  </span>
                </div>

                <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0B1120]">
                  {HYPERVISOR_VMS.map((vm) => {
                    const vmInc = activeIncidents.find(
                      (i) =>
                        i.targetHostLabel.includes(vm.id) ||
                        (vm.id === 'DC-CORE-02' && i.id === 'inc-kerberos-dc02') ||
                        (vm.id === 'PRT-SRV-01' && i.id === 'inc-bsod-prt-srv-01') ||
                        (vm.id === 'EXCH-DAG-01' && i.id === 'inc-service-exch') ||
                        (vm.id === 'FILE-PROD-02' && i.id === 'inc-wua-0x80070005'),
                    );

                    const isDown =
                      vmInc &&
                      (vmInc.type === 'bsod_loop' || vmInc.type === 'kerberos_auth');

                    return (
                      <div
                        key={vm.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {isDown ? (
                              <ServerCrash
                                className="h-4 w-4 text-red-400 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <ShieldAlert
                                className={`h-4 w-4 shrink-0 ${
                                  vmInc ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                                aria-hidden="true"
                              />
                            )}
                            <span className="font-mono font-semibold text-slate-100">
                              {vm.id}
                            </span>
                            <span className="text-slate-400">({vm.role})</span>
                            <span
                              className={`font-mono text-[11px] font-semibold ${
                                isDown
                                  ? 'text-red-400'
                                  : vmInc
                                    ? 'text-amber-300'
                                    : 'text-emerald-400'
                              }`}
                            >
                              {isDown
                                ? `CAÍDO (${vmInc.errorCode})`
                                : vmInc
                                  ? `DEGRADADO (${vmInc.errorCode})`
                                  : 'OPERATIVO'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {vm.os} · IP {vm.ip} · Snapshot: pre_patch_snap_2026
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRevertSnapshot(vm.id)}
                          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            vmInc
                              ? 'bg-red-600 text-white hover:bg-red-500'
                              : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Revertir a Snapshot Pre-Mantenimiento</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live Windows / WSUS Event Viewer */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Visor de Eventos Corporativo (Event Viewer · System / WUA / WSUS / Hypervisor)
            </h3>
            <p className="text-xs text-slate-400">
              Registro cronológico de sincronizaciones, regresiones, errores hexadecimales WUA y acciones de rollback.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                'ALL',
                'System',
                'WindowsUpdateClient',
                'WindowsUpdate.log',
                'WSUS',
                'WinRM',
                'Hypervisor',
                'Helpdesk',
              ] as const
            ).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setLogSourceFilter(src)}
                className={`rounded px-2.5 py-1 font-mono text-[11px] border whitespace-nowrap cursor-pointer ${
                  logSourceFilter === src
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
                }`}
              >
                {src === 'ALL' ? 'Todos' : src}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#0B1120] border-b border-slate-800 text-[11px] font-semibold text-slate-400">
              <tr>
                <th className="px-3.5 py-2 w-32">Reloj Sim</th>
                <th className="px-3 py-2 w-24">Event ID</th>
                <th className="px-3 py-2 w-40">Origen</th>
                <th className="px-3 py-2 w-44">Equipo / Anillo</th>
                <th className="px-3.5 py-2">Mensaje Técnico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
              {filteredLogs.map((log) => {
                const sevClass =
                  log.severity === 'error'
                    ? 'text-red-400'
                    : log.severity === 'warning'
                      ? 'text-amber-300'
                      : log.severity === 'success'
                        ? 'text-emerald-400'
                        : 'text-sky-300';

                return (
                  <tr key={log.id} className="hover:bg-slate-800/30 align-top">
                    <td className="px-3.5 py-2 text-slate-400 whitespace-nowrap">
                      {log.simClock}
                    </td>
                    <td className={`px-3 py-2 font-semibold whitespace-nowrap ${sevClass}`}>
                      {log.eventId ?? '1000'}
                    </td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                      {log.source}
                    </td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                      {log.host}
                    </td>
                    <td className="px-3.5 py-2 font-sans text-xs text-slate-200 leading-relaxed">
                      {log.message}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
