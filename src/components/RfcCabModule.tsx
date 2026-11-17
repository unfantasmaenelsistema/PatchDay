import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  History,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  CRITICAL_SERVICE_OPTIONS,
  DEPLOYMENT_RINGS,
  ENTERPRISE_ASSETS,
  MAINTENANCE_WINDOW_OPTIONS,
  PATCH_BULLETINS,
  PRIORITY_LABELS,
  ROLLBACK_STRATEGIES,
} from '../data/initialData';
import {
  BlackoutPeriod,
  ChangeType,
  DeploymentRingId,
  MaintenanceWindowId,
  RfcFormInput,
  RfcSubmission,
  RollbackStrategy,
  TriageDecision,
} from '../types/patchday';
import { evaluateCabSubmission } from '../utils/cabValidator';
import { UnlockedPatchApproval } from '../utils/labStorage';

interface RfcCabModuleProps {
  decisions: Record<string, TriageDecision>;
  blackoutPeriods: BlackoutPeriod[];
  rfcSubmissions: RfcSubmission[];
  unlockedMap: Map<string, UnlockedPatchApproval>;
  onSubmitRfc: (submission: RfcSubmission) => void;
  onJumpToTriage: (patchId: string) => void;
  onOpenWsusConsole: () => void;
  onOpenMaintenance: () => void;
}

const THRESHOLD_PRESETS = [
  'Si falla más del 5% de los nodos o cae el servicio crítico durante 2 min',
  'Si falla el 1% de los Domain Controllers o errores de autenticación Kerberos',
  'Si se detecta BSOD o pérdida de túnel VPN SSL tras el reinicio HA',
];

export const RfcCabModule: React.FC<RfcCabModuleProps> = ({
  decisions,
  blackoutPeriods,
  rfcSubmissions,
  unlockedMap,
  onSubmitRfc,
  onJumpToTriage,
  onOpenWsusConsole,
  onOpenMaintenance,
}) => {
  const queuedIds = useMemo(
    () =>
      PATCH_BULLETINS.filter((b) => decisions[b.id]?.queuedForRfc).map(
        (b) => b.id,
      ),
    [decisions],
  );

  const [selectedPatchIds, setSelectedPatchIds] = useState<string[]>(() =>
    queuedIds.length > 0 ? queuedIds.slice(0, 2) : ['KB5034848'],
  );
  const [title, setTitle] = useState(
    'Despliegue de parches críticos de seguridad — Ventana controlada',
  );
  const [targetRings, setTargetRings] = useState<DeploymentRingId[]>([
    'ring-2',
  ]);
  const [changeType, setChangeType] = useState<ChangeType>('Normal');
  const [declaredReboot, setDeclaredReboot] = useState<'Sí' | 'Posiblemente' | 'No'>(
    'Posiblemente',
  );
  const [affectedServices, setAffectedServices] = useState<string[]>([
    'Ninguno (Estaciones de usuario)',
  ]);
  const [estimatedDowntimeMin, setEstimatedDowntimeMin] = useState<number>(10);
  const [ring01Tested, setRing01Tested] = useState<boolean>(true);
  const [testingNotes, setTestingNotes] = useState(
    'Validado en LAB-WIN11-01 (Anillo 0) y grupo Piloto IT (Anillo 1) sin regresiones de arranque ni errores en visor de eventos.',
  );
  const [rollbackStrategy, setRollbackStrategy] =
    useState<RollbackStrategy>('hypervisor-snapshot');
  const [rollbackThreshold, setRollbackThreshold] = useState<string>(
    THRESHOLD_PRESETS[0],
  );
  const [maintenanceWindowId, setMaintenanceWindowId] =
    useState<MaintenanceWindowId>('win-ring2-sat-night');
  const [justification, setJustification] = useState('');

  const [latestVerdict, setLatestVerdict] = useState<RfcSubmission | null>(
    () => rfcSubmissions[0] ?? null,
  );

  const selectedBulletins = useMemo(
    () => PATCH_BULLETINS.filter((b) => selectedPatchIds.includes(b.id)),
    [selectedPatchIds],
  );

  // Determine which rings actually contain impacted assets for the selected KBs
  const impactedRingsForSelection = useMemo(() => {
    const ringSet = new Set<DeploymentRingId>();
    for (const b of selectedBulletins) {
      for (const assetId of b.affectedAssetIds) {
        const asset = ENTERPRISE_ASSETS.find((a) => a.id === assetId);
        if (asset) ringSet.add(asset.ringId);
      }
    }
    return ringSet;
  }, [selectedBulletins]);

  const togglePatch = (id: string) => {
    setSelectedPatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleRing = (ringId: DeploymentRingId) => {
    setTargetRings((prev) =>
      prev.includes(ringId)
        ? prev.filter((r) => r !== ringId)
        : [...prev, ringId],
    );
  };

  const toggleService = (service: string) => {
    setAffectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service],
    );
  };

  const handleLoadQueuedFromPhase1 = () => {
    if (queuedIds.length === 0) return;
    setSelectedPatchIds(queuedIds);
  };

  const handleSubmitToCab = (e: React.FormEvent) => {
    e.preventDefault();
    const formInput: RfcFormInput = {
      title: title.trim() || 'Petición de cambio de parcheo corporativo',
      selectedPatchIds,
      targetRings,
      changeType,
      declaredReboot,
      affectedServices,
      estimatedDowntimeMin,
      ring01Tested,
      testingNotes: testingNotes.trim(),
      rollbackStrategy,
      rollbackThreshold: rollbackThreshold.trim(),
      maintenanceWindowId,
      justification: justification.trim(),
    };

    const verdict = evaluateCabSubmission(
      formInput,
      blackoutPeriods,
      rfcSubmissions,
    );
    setLatestVerdict(verdict);
    onSubmitRfc(verdict);
  };

  const handleLoadSubmission = (sub: RfcSubmission) => {
    setTitle(sub.input.title);
    setSelectedPatchIds(sub.input.selectedPatchIds);
    setTargetRings(sub.input.targetRings);
    setChangeType(sub.input.changeType);
    setDeclaredReboot(sub.input.declaredReboot);
    setAffectedServices(sub.input.affectedServices);
    setEstimatedDowntimeMin(sub.input.estimatedDowntimeMin);
    setRing01Tested(sub.input.ring01Tested);
    setTestingNotes(sub.input.testingNotes);
    setRollbackStrategy(sub.input.rollbackStrategy);
    setRollbackThreshold(sub.input.rollbackThreshold);
    setMaintenanceWindowId(sub.input.maintenanceWindowId);
    setJustification(sub.input.justification);
    setLatestVerdict(sub);
  };

  const activeRollbackDef = ROLLBACK_STRATEGIES.find(
    (r) => r.id === rollbackStrategy,
  );

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-sky-400">
            Módulo 2 · Gestión de Cambios ITIL (Formulario RFC &amp; Motor CAB)
          </div>
          <h2 className="mt-0.5 font-display text-lg font-bold text-slate-50">
            Petición de Cambio (RFC) &amp; Comité de Aprobación (CAB)
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl">
            Para desbloquear parches en los Anillos 2 y 3 dentro de WSUS, presenta un RFC técnicamente coherente. El Motor CAB validará tipo de cambio, ventana, impacto y plan de rollback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenMaintenance}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <CalendarClock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Ver Ventanas y Blackouts</span>
          </button>
          <button
            type="button"
            onClick={onOpenWsusConsole}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <span>Ver Desbloqueos en WSUS ({unlockedMap.size})</span>
          </button>
        </div>
      </div>

      {/* Main 12-Col Split: RFC Form (7 cols) | CAB Verdict & History (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Interactive RFC Form */}
        <form
          onSubmit={handleSubmitToCab}
          className="xl:col-span-7 rounded-lg border border-slate-800 bg-[#111827] p-4 sm:p-5 space-y-5"
        >
          {/* 1. Title & Patch Selection */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                1. Alcance del Cambio y Boletines Seleccionados
              </h3>
              <div className="flex items-center gap-2">
                {queuedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleLoadQueuedFromPhase1}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    Cargar cola de Triage ({queuedIds.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onJumpToTriage('KB5036893')}
                  className="text-xs text-slate-400 hover:text-slate-200 hover:underline cursor-pointer"
                >
                  Ir a Triage
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="rfc-title-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Título de la Petición de Cambio (RFC)
              </label>
              <input
                id="rfc-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">
                  Boletines / KBs incluidos ({selectedPatchIds.length} seleccionados)
                </span>
                <span className="text-[11px] text-slate-400">
                  Prioridad de Fase 1 mostrada junto a cada KB
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-md border border-slate-800 bg-[#0B1120] divide-y divide-slate-800/80">
                {PATCH_BULLETINS.map((b) => {
                  const checked = selectedPatchIds.includes(b.id);
                  const d = decisions[b.id];
                  const approval = unlockedMap.get(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex items-start gap-3 px-3 py-2 text-xs cursor-pointer transition-colors ${
                        checked ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePatch(b.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-semibold text-slate-100">
                              {b.id}
                            </span>
                            <span className="text-slate-400">{b.cve}</span>
                            {b.inCisaKev && (
                              <span className="text-red-400 font-semibold">
                                KEV
                              </span>
                            )}
                            {b.supersededBy && (
                              <span className="inline-flex items-center gap-0.5 text-amber-400">
                                <GitBranch className="h-3 w-3" aria-hidden="true" />
                                Reemplazado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            {d?.priority && (
                              <span className="text-sky-400">
                                {PRIORITY_LABELS[d.priority].code}
                              </span>
                            )}
                            {d?.queuedForRfc && (
                              <span className="text-emerald-400">En cola</span>
                            )}
                            {approval && (
                              <span className="text-emerald-300 font-semibold">
                                {approval.rfcCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-0.5 truncate text-slate-300">
                          {b.title}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                          CVSS {b.cvssScore.toFixed(1)} · EPSS{' '}
                          {Math.round(b.epssScore * 100)}% · Reinicio:{' '}
                          {b.requiresReboot}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Target Rings */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">
                  Anillos de Despliegue Objetivo
                </span>
                <span className="text-[11px] text-slate-400">
                  Resaltados los anillos con equipos impactados
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEPLOYMENT_RINGS.map((ring) => {
                  const selected = targetRings.includes(ring.id);
                  const impacted = impactedRingsForSelection.has(ring.id);
                  return (
                    <button
                      key={ring.id}
                      type="button"
                      onClick={() => toggleRing(ring.id)}
                      className={`rounded-md border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        selected
                          ? 'border-sky-500 bg-sky-500/15 text-slate-50'
                          : 'border-slate-800 bg-[#0B1120] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{ring.shortName}</span>
                        {impacted && (
                          <span className="font-mono text-[10px] text-amber-400">
                            Impactado
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                        {ring.maintenanceWindow}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Change Type & Technical Justification */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              2. Clasificación ITIL del Tipo de Cambio
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    type: 'Estándar' as ChangeType,
                    desc: 'Preaprobado: solo Anillo 0/1 o parches sin reinicio.',
                  },
                  {
                    type: 'Normal' as ChangeType,
                    desc: 'Revisión CAB + pruebas previas en Anillo 0/1.',
                  },
                  {
                    type: 'Emergencia' as ChangeType,
                    desc: 'Expedited: solo CISA KEV o EPSS ≥ 70% + justificación.',
                  },
                ]
              ).map((item) => {
                const active = changeType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setChangeType(item.type)}
                    className={`rounded-md border p-2.5 text-left transition-colors cursor-pointer ${
                      active
                        ? item.type === 'Emergencia'
                          ? 'border-red-500 bg-red-500/15 text-red-100'
                          : 'border-sky-500 bg-sky-500/15 text-slate-50'
                        : 'border-slate-800 bg-[#0B1120] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      {item.type === 'Emergencia'
                        ? 'Emergencia (Expedited)'
                        : item.type}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400 leading-snug">
                      {item.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label
                htmlFor="rfc-justification"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Justificación Técnica del Cambio{' '}
                {changeType === 'Emergencia' && (
                  <span className="text-red-400">
                    (Obligatoria ≥ 25 caracteres para Emergencia)
                  </span>
                )}
              </label>
              <textarea
                id="rfc-justification"
                rows={2}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ej: Explotación activa confirmada en CISA KEV (EPSS > 90%) sobre activos perimetrales/corporativos..."
                className="w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 3. Impact & Risk Assessment + Testing Plan */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              3. Evaluación de Impacto, Riesgo y Plan de Pruebas
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="rfc-reboot-select"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  ¿Requiere reinicio de sistema?
                </label>
                <select
                  id="rfc-reboot-select"
                  value={declaredReboot}
                  onChange={(e) =>
                    setDeclaredReboot(
                      e.target.value as 'Sí' | 'Posiblemente' | 'No',
                    )
                  }
                  className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  <option value="Sí">Sí (Reinicio obligatorio)</option>
                  <option value="Posiblemente">Posiblemente</option>
                  <option value="No">No requiere reinicio</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rfc-downtime-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Downtime estimado (minutos)
                </label>
                <input
                  id="rfc-downtime-input"
                  type="number"
                  min={0}
                  max={240}
                  value={estimatedDowntimeMin}
                  onChange={(e) =>
                    setEstimatedDowntimeMin(Number(e.target.value) || 0)
                  }
                  className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 font-mono text-xs tabular-nums text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">
                Servicios Críticos potencialmente afectados
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CRITICAL_SERVICE_OPTIONS.map((svc) => {
                  const active = affectedServices.includes(svc);
                  return (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => toggleService(svc)}
                      className={`rounded border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                          : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {svc}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3 space-y-2">
              <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ring01Tested}
                  onChange={(e) => setRing01Tested(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>
                  <span className="font-semibold">Plan de Pruebas (Testing Plan):</span>{' '}
                  Confirmo que los boletines han superado validación previa en Anillo 0 (Sandbox) y Anillo 1 (Piloto IT) sin errores críticos.
                </span>
              </label>
              <input
                type="text"
                value={testingNotes}
                onChange={(e) => setTestingNotes(e.target.value)}
                placeholder="Evidencia de pruebas en Anillo 0 / Anillo 1..."
                className="h-8 w-full rounded border border-slate-800 bg-[#111827] px-2.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 4. Rollback Plan & Maintenance Window */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              4. Plan de Vuelta Atrás (Rollback) y Ventana de Mantenimiento
            </h3>

            <div>
              <label
                htmlFor="rfc-rollback-strategy"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Estrategia Técnica de Rollback (Obligatoria)
              </label>
              <select
                id="rfc-rollback-strategy"
                value={rollbackStrategy}
                onChange={(e) =>
                  setRollbackStrategy(e.target.value as RollbackStrategy)
                }
                className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {ROLLBACK_STRATEGIES.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {activeRollbackDef && (
                <div className="mt-1.5 rounded border border-slate-800 bg-[#0B1120] px-3 py-2 text-[11px] space-y-0.5">
                  <div className="font-mono text-sky-400">
                    {activeRollbackDef.commandOrDetail}
                  </div>
                  <div className="text-slate-400">{activeRollbackDef.description}</div>
                </div>
              )}
              {selectedBulletins.some((b) => b.rollbackHint) && (
                <div className="mt-1.5 text-[11px] text-amber-300/90 space-y-0.5">
                  {selectedBulletins
                    .filter((b) => b.rollbackHint)
                    .map((b) => (
                      <div key={b.id}>
                        <span className="font-mono font-semibold">{b.id}:</span>{' '}
                        {b.rollbackHint}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="rfc-rollback-threshold"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Umbral de Activación de Rollback
              </label>
              <input
                id="rfc-rollback-threshold"
                type="text"
                value={rollbackThreshold}
                onChange={(e) => setRollbackThreshold(e.target.value)}
                placeholder='Ej: "Si falla más del 5% de los nodos o cae el servicio IIS"'
                className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {THRESHOLD_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRollbackThreshold(preset)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                  >
                    Usar plantilla {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="rfc-maintenance-window"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Ventana de Mantenimiento Asignada
              </label>
              <select
                id="rfc-maintenance-window"
                value={maintenanceWindowId}
                onChange={(e) =>
                  setMaintenanceWindowId(e.target.value as MaintenanceWindowId)
                }
                className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {MAINTENANCE_WINDOW_OPTIONS.map((win) => (
                  <option key={win.id} value={win.id}>
                    {win.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              El Motor CAB auditará automáticamente todas las reglas ITIL al enviar.
            </span>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Enviar al CAB</span>
            </button>
          </div>
        </form>

        {/* Right: CAB Verdict Panel & Submission History */}
        <div className="xl:col-span-5 space-y-4">
          {/* Verdict Display */}
          <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Dictamen del Comité CAB (Change Advisory Board)
                </h3>
              </div>
              {latestVerdict?.rfcCode && (
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {latestVerdict.rfcCode}
                </span>
              )}
            </div>

            {!latestVerdict ? (
              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-6 text-center space-y-2">
                <FileCheck2 className="mx-auto h-7 w-7 text-slate-500" aria-hidden="true" />
                <div className="text-xs font-semibold text-slate-200">
                  Esperando envío de petición RFC
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Completa el formulario de la izquierda y pulsa &quot;Enviar al CAB&quot; para recibir la evaluación automática de ingeniería del cambio.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Official Stamp Box */}
                <div
                  className={`rounded-md border p-3.5 ${
                    latestVerdict.status === 'APROBADO'
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-red-500/50 bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {latestVerdict.status === 'APROBADO' ? (
                        <CheckCircle2
                          className="h-5 w-5 text-emerald-400 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle
                          className="h-5 w-5 text-red-400 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`font-display text-base font-bold ${
                          latestVerdict.status === 'APROBADO'
                            ? 'text-emerald-300'
                            : 'text-red-300'
                        }`}
                      >
                        {latestVerdict.status}
                      </span>
                    </div>

                    {latestVerdict.rfcCode ? (
                      <div className="rounded border border-emerald-400/50 bg-emerald-950/60 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-emerald-300">
                        SELLO: {latestVerdict.rfcCode}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-red-300">
                        SIN CÓDIGO RFC
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-200 leading-relaxed">
                    {latestVerdict.summaryVerdict}
                  </p>

                  {latestVerdict.status === 'APROBADO' && (
                    <button
                      type="button"
                      onClick={onOpenWsusConsole}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                    >
                      <span>Desplegar / Revisar en Consola WSUS</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Rule-by-rule Findings */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {latestVerdict.findings.map((f) => {
                    const style =
                      f.severity === 'error'
                        ? 'border-red-500/35 bg-red-500/5 text-red-200'
                        : f.severity === 'warning'
                          ? 'border-amber-500/35 bg-amber-500/5 text-amber-200'
                          : 'border-slate-800 bg-[#0B1120] text-slate-300';

                    return (
                      <div key={f.ruleId} className={`rounded border p-2.5 text-xs ${style}`}>
                        <div className="flex items-center justify-between gap-2 font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            {f.severity === 'error' ? (
                              <AlertOctagon className="h-3.5 w-3.5 text-red-400 shrink-0" aria-hidden="true" />
                            ) : f.severity === 'warning' ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                            )}
                            <span>{f.title}</span>
                          </span>
                          <span className="font-mono text-[10px] opacity-75 shrink-0">
                            {f.ruleId}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] opacity-90 leading-relaxed">
                          {f.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* RFC Submission History */}
          <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <History className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Historial de Peticiones CAB ({rfcSubmissions.length})</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Clic para cargar en formulario
              </span>
            </div>

            {rfcSubmissions.length === 0 ? (
              <p className="text-xs text-slate-400">
                Aún no se han enviado peticiones RFC en esta sesión.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-800 rounded border border-slate-800 bg-[#0B1120]">
                {rfcSubmissions.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleLoadSubmission(sub)}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono">
                        <span
                          className={`font-semibold ${
                            sub.status === 'APROBADO'
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {sub.rfcCode ?? 'RECHAZADO'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-300">{sub.input.changeType}</span>
                      </div>
                      <div className="truncate text-slate-300 mt-0.5">
                        {sub.input.selectedPatchIds.join(', ')}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {sub.input.targetRings
                        .map((r) => r.replace('ring-', 'A'))
                        .join(',')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
