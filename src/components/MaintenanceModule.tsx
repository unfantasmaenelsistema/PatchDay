import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import {
  DEPLOYMENT_RINGS,
  ENTERPRISE_ASSETS,
  MAINTENANCE_WINDOW_OPTIONS,
} from '../data/initialData';
import {
  BlackoutPeriod,
  DeploymentRingId,
  LabState,
  MaintenanceWindowId,
} from '../types/patchday';
import { SimulationTelemetryModule } from './SimulationTelemetryModule';

interface MaintenanceModuleProps {
  state: LabState;
  ringMaintenanceWindows: Record<DeploymentRingId, MaintenanceWindowId>;
  blackoutPeriods: BlackoutPeriod[];
  onChangeRingWindow: (
    ringId: DeploymentRingId,
    windowId: MaintenanceWindowId,
  ) => void;
  onToggleBlackout: (blackoutId: string) => void;
  onOpenRfcModule: () => void;
  onOpenWsusConsole: () => void;
  onAdvanceTime: (mode: '4h' | 'night_window' | 'reportnow') => void;
  onTriggerDrill: () => void;
  onWsusRemovalFix: (patchId: string, ringId: DeploymentRingId) => void;
  onExecuteWinRm: (targetHost: string, command: string) => void;
  onRevertSnapshot: (assetId: string) => void;
  onResolveDeadline: (incidentId: string) => void;
}

const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

const TIME_SLOTS: Array<{
  id: string;
  label: string;
  range: string;
}> = [
  { id: 'night-early', label: 'Madrugada', range: '01:00 – 06:00' },
  { id: 'morning', label: 'Mañana Laboral', range: '08:00 – 13:00' },
  { id: 'afternoon', label: 'Tarde Piloto', range: '14:00 – 18:00' },
  { id: 'evening', label: 'Noche / Batch', range: '19:00 – 24:00' },
];

export const MaintenanceModule: React.FC<MaintenanceModuleProps> = ({
  state,
  ringMaintenanceWindows,
  blackoutPeriods,
  onChangeRingWindow,
  onToggleBlackout,
  onOpenRfcModule,
  onOpenWsusConsole,
  onAdvanceTime,
  onTriggerDrill,
  onWsusRemovalFix,
  onExecuteWinRm,
  onRevertSnapshot,
  onResolveDeadline,
}) => {
  const [subTab, setSubTab] = useState<'simulation' | 'windows'>('simulation');
  const activeBlackoutCount = blackoutPeriods.filter((b) => b.active).length;
  const activeIncidentsCount = state.simulation.incidents.filter(
    (i) => i.status === 'active',
  ).length;

  const getSlotContent = (day: string, slotId: string) => {
    const items: Array<{ label: string; tone: 'ring' | 'blackout' }> = [];

    if (slotId === 'night-early') {
      items.push({ label: 'Anillo 0 (24/7)', tone: 'ring' });
      if (day === 'Sáb') items.push({ label: 'Anillo 2 (02–06h)', tone: 'ring' });
      if (day === 'Dom') items.push({ label: 'Anillo 3 (01–04h)', tone: 'ring' });
    } else if (slotId === 'morning') {
      items.push({ label: 'Anillo 0 (24/7)', tone: 'ring' });
      if (day !== 'Sáb' && day !== 'Dom') {
        const peakActive = blackoutPeriods.find(
          (b) => b.id === 'blk-peak-hours',
        )?.active;
        if (peakActive) {
          items.push({ label: 'Blackout Comercial (A2/A3)', tone: 'blackout' });
        }
      }
    } else if (slotId === 'afternoon') {
      items.push({ label: 'Anillo 0 (24/7)', tone: 'ring' });
      if (day === 'Mar' || day === 'Jue') {
        items.push({ label: 'Anillo 1 (14–16h)', tone: 'ring' });
      }
      if (day !== 'Sáb' && day !== 'Dom') {
        const peakActive = blackoutPeriods.find(
          (b) => b.id === 'blk-peak-hours',
        )?.active;
        if (peakActive) {
          items.push({ label: 'Blackout Comercial (A2/A3)', tone: 'blackout' });
        }
      }
    } else if (slotId === 'evening') {
      items.push({ label: 'Anillo 0 (24/7)', tone: 'ring' });
      const billingActive = blackoutPeriods.find(
        (b) => b.id === 'blk-billing',
      )?.active;
      if (billingActive && day !== 'Sáb' && day !== 'Dom') {
        items.push({ label: 'Cierre Días 28–31', tone: 'blackout' });
      }
    }

    return items;
  };

  return (
    <div className="space-y-5">
      {/* Module Header & Sub-Tab Switcher */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-sky-400">
              Módulo 4 · Ventanas de Mantenimiento, Telemetría &amp; Rollback
            </div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-slate-50">
              Motor de Simulación, Respuesta a Regresiones y Calendario por Anillo
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl">
              Ejecuta ciclos de sincronización WSUS y ventanas nocturnas, diagnostica fallos WUA o BSOD reales, aplica rollback en 3 vías y ajusta ventanas protegidas.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenRfcModule}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Ir a Formulario RFC &amp; CAB</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setSubTab('simulation')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'simulation'
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Simulación, Telemetría &amp; Rollback
              {activeIncidentsCount > 0 ? ` (${activeIncidentsCount} alertas)` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('windows')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'windows'
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ventanas de Mantenimiento &amp; Blackout ({activeBlackoutCount})</span>
          </button>
        </div>
      </div>

      {subTab === 'simulation' ? (
        <SimulationTelemetryModule
          state={state}
          onAdvanceTime={onAdvanceTime}
          onTriggerDrill={onTriggerDrill}
          onWsusRemovalFix={onWsusRemovalFix}
          onExecuteWinRm={onExecuteWinRm}
          onRevertSnapshot={onRevertSnapshot}
          onResolveDeadline={onResolveDeadline}
          onOpenWsusConsole={onOpenWsusConsole}
        />
      ) : (
        <>

      {/* Ring Configurator Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEPLOYMENT_RINGS.map((ring) => {
          const ringAssets = ENTERPRISE_ASSETS.filter((a) => a.ringId === ring.id);
          const assignedWinId = ringMaintenanceWindows[ring.id];
          const assignedWin =
            MAINTENANCE_WINDOW_OPTIONS.find((w) => w.id === assignedWinId) ??
            MAINTENANCE_WINDOW_OPTIONS[0];

          const hasScheduleRisk =
            (ring.id === 'ring-3' &&
              (assignedWin.isBusinessHours || assignedWin.isBlackoutConflict)) ||
            (ring.id === 'ring-2' &&
              (assignedWin.id === 'win-business-hours' ||
                assignedWin.isBlackoutConflict));

          return (
            <div
              key={ring.id}
              className={`rounded-lg border p-4 space-y-3 ${
                hasScheduleRisk
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-slate-800 bg-[#111827]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    {ring.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                    {ring.description}
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-emerald-400 whitespace-nowrap shrink-0">
                  {ringAssets.length}/{ringAssets.length} Op.
                </span>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`ring-win-${ring.id}`}
                  className="block text-[11px] font-medium text-slate-300"
                >
                  Ventana de Mantenimiento Configurada
                </label>
                <select
                  id={`ring-win-${ring.id}`}
                  value={assignedWinId}
                  onChange={(e) =>
                    onChangeRingWindow(
                      ring.id,
                      e.target.value as MaintenanceWindowId,
                    )
                  }
                  className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  {MAINTENANCE_WINDOW_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-mono text-slate-300">
                  <CalendarClock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>{assignedWin.schedule}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  Umbral Rollback: &gt; {ring.rollbackThresholdPct}% ·{' '}
                  {ring.requiresCab ? 'CAB Obligatorio' : 'Sin CAB'}
                </span>
              </div>

              {hasScheduleRisk && (
                <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Conflicto de política: este anillo productivo tiene asignado un horario laboral o Blackout. El CAB rechazará los RFCs que utilicen esta ventana.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visual Weekly Maintenance & Blackout Matrix */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Matriz Semanal de Despliegue y Ventanas Protegidas
            </h3>
            <p className="text-xs text-slate-400">
              Distribución operativa de ventanas autorizadas frente a franjas de Blackout comercial y contable.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-300">
            <span className="text-sky-400 font-medium">● Ventana de Anillo</span>
            <span className="text-red-400 font-medium">▲ Blackout Activo</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B1120] text-[11px] font-semibold text-slate-400">
                <th className="px-3.5 py-2.5 w-40">Franja Horaria</th>
                {WEEK_DAYS.map((day) => (
                  <th key={day} className="px-2.5 py-2.5 text-center">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {TIME_SLOTS.map((slot) => (
                <tr key={slot.id} className="align-top">
                  <td className="px-3.5 py-2.5 bg-[#0D1425] border-r border-slate-800/80 whitespace-nowrap">
                    <div className="font-medium text-slate-200">{slot.label}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {slot.range}
                    </div>
                  </td>
                  {WEEK_DAYS.map((day) => {
                    const items = getSlotContent(day, slot.id);
                    return (
                      <td
                        key={`${slot.id}-${day}`}
                        className="px-2 py-2 border-r border-slate-800/40 last:border-r-0 min-w-[120px]"
                      >
                        <div className="space-y-1">
                          {items.map((item, idx) => (
                            <div
                              key={idx}
                              className={`rounded px-1.5 py-1 text-[10px] font-mono leading-tight ${
                                item.tone === 'blackout'
                                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                                  : 'bg-sky-500/10 text-sky-300 border border-sky-500/25'
                              }`}
                            >
                              {item.label}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Blackout Periods Manager */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Periodos Blackout Activos ({activeBlackoutCount}/{blackoutPeriods.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Durante un periodo Blackout, el CAB bloqueará cambios con reinicio en los anillos afectados.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {blackoutPeriods.map((blk) => (
            <div
              key={blk.id}
              className={`rounded-md border p-3 flex flex-col justify-between gap-3 ${
                blk.active
                  ? 'border-red-500/35 bg-red-500/5'
                  : 'border-slate-800 bg-[#0B1120] opacity-75'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-red-400">
                    {blk.dateRange}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      blk.active ? 'text-red-300' : 'text-slate-500'
                    }`}
                  >
                    {blk.active ? 'BLOQUEO ACTIVO' : 'Desactivado'}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-100">
                  {blk.title}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {blk.reason}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px]">
                <span className="font-mono text-slate-400">
                  Afecta:{' '}
                  {blk.affectedRings
                    .map((r) => r.replace('ring-', 'Anillo '))
                    .join(', ')}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleBlackout(blk.id)}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  {blk.active ? (
                    <>
                      <Lock className="h-3 w-3 text-red-400" aria-hidden="true" />
                      <span>Levantar Blackout</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                      <span>Reactivar Blackout</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
        </>
      )}
    </div>
  );
};
