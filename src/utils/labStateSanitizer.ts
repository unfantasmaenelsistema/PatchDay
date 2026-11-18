/**
 * Saneado del estado del laboratorio que llega de localStorage o de una importación (JSON / Base64).
 *
 * Antes se mezclaba tal cual: un RFC sin `input` dejaba la aplicación en blanco (y, como el estado se
 * guarda, seguía en blanco en cada recarga), y un RFC importado con estado «APROBADO» desbloqueaba
 * parches aunque incumpliera las reglas del CAB. Aquí cada campo se comprueba con su forma esperada y
 * los RFC se vuelven a dictaminar con el mismo validador que usa el formulario.
 */
import {
  createEmptyWsusPatchApproval,
  createInitialLabState,
  createInitialSimulationState,
  DEPLOYMENT_RINGS,
  MAINTENANCE_WINDOW_OPTIONS,
  PATCH_BULLETINS,
  ROLLBACK_STRATEGIES,
} from '../data/initialData';
import {
  BlackoutPeriod,
  ChangeType,
  DeploymentRingId,
  GuidedMissionId,
  LabState,
  MaintenanceWindowId,
  ModuleId,
  OperationalPriority,
  PatchClassification,
  RecommendedFixType,
  RfcFormInput,
  RfcSubmission,
  RollbackStrategy,
  ScenarioId,
  SimulationIncident,
  SimulationIncidentType,
  SimulationLogEntry,
  SimulationState,
  TerminalHistoryEntry,
  TriageDecision,
  WsusApprovalAction,
  WsusPatchApproval,
  WsusRingApproval,
} from '../types/patchday';
import { evaluateCabSubmission } from './cabValidator';

type Dict = Record<string, unknown>;

const isObj = (v: unknown): v is Dict => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

const RING_IDS = DEPLOYMENT_RINGS.map((r) => r.id) as DeploymentRingId[];
const PATCH_IDS = PATCH_BULLETINS.map((b) => b.id);
const WINDOW_IDS = MAINTENANCE_WINDOW_OPTIONS.map((w) => w.id) as MaintenanceWindowId[];
const ROLLBACK_IDS = ROLLBACK_STRATEGIES.map((r) => r.id) as RollbackStrategy[];
const MODULE_IDS: ModuleId[] = ['triage', 'rfc', 'wsus', 'maintenance', 'ctf'];
const SCENARIO_IDS: ScenarioId[] = ['patch-tuesday', 'zero-day-kev', 'wsus-hygiene'];
const MISSION_IDS: GuidedMissionId[] = ['mission-1', 'mission-2', 'mission-3', 'mission-4'];
const PRIORITIES: OperationalPriority[] = ['P1', 'P2', 'P3', 'P4'];
const CHANGE_TYPES: ChangeType[] = ['Estándar', 'Normal', 'Emergencia'];
const WSUS_ACTIONS: WsusApprovalAction[] = ['Not Approved', 'Approved for Install', 'Approved for Removal', 'Declined'];
const CLASSIFICATIONS: PatchClassification[] = ['Security Update', 'Critical Update', 'Update Rollup', 'WSUS Update', 'Feature Pack', 'Service Pack'];
const INCIDENT_TYPES: SimulationIncidentType[] = ['bsod_loop', 'service_down', 'kerberos_auth', 'wua_error', 'deadline_complaint'];
const FIX_TYPES: RecommendedFixType[] = ['wsus_removal', 'winrm_dism', 'winrm_dism_restore', 'winrm_wusa', 'winrm_reset_wu', 'winrm_winre', 'winrm_service', 'hypervisor_snapshot', 'wait_window'];
const LOG_SOURCES: SimulationLogEntry['source'][] = ['WSUS', 'System', 'WindowsUpdateClient', 'WindowsUpdate.log', 'WinRM', 'Hypervisor', 'Helpdesk'];
const LOG_SEVERITIES: SimulationLogEntry['severity'][] = ['info', 'warning', 'error', 'success'];

function sanitizeTriage(raw: unknown): Record<string, TriageDecision> {
  const out: Record<string, TriageDecision> = {};
  if (!isObj(raw)) return out;
  for (const id of PATCH_IDS) {
    const d = raw[id];
    if (!isObj(d)) continue;
    out[id] = {
      priority: PRIORITIES.includes(d.priority as OperationalPriority) ? (d.priority as OperationalPriority) : undefined,
      queuedForRfc: bool(d.queuedForRfc),
      analystNote: str(d.analystNote),
      updatedAt: str(d.updatedAt),
    };
  }
  return out;
}

function sanitizeBlackouts(raw: unknown, fallback: BlackoutPeriod[]): BlackoutPeriod[] {
  // Los periodos son fijos del escenario; del snapshot solo se conserva si cada uno está activo o no.
  const list = Array.isArray(raw) ? raw.filter(isObj) : [];
  return fallback.map((blk) => {
    const found = list.find((b) => b.id === blk.id);
    return found ? { ...blk, active: bool(found.active, blk.active) } : blk;
  });
}

function sanitizeRfcInput(raw: unknown): RfcFormInput | null {
  if (!isObj(raw) || !Array.isArray(raw.selectedPatchIds) || !Array.isArray(raw.targetRings)) return null;
  return {
    title: str(raw.title),
    selectedPatchIds: strArray(raw.selectedPatchIds).filter((id) => PATCH_IDS.includes(id)),
    targetRings: strArray(raw.targetRings).filter((r): r is DeploymentRingId => RING_IDS.includes(r as DeploymentRingId)),
    changeType: oneOf(raw.changeType, CHANGE_TYPES, 'Normal'),
    declaredReboot: oneOf(raw.declaredReboot, ['Sí', 'Posiblemente', 'No'] as const, 'Posiblemente'),
    affectedServices: strArray(raw.affectedServices),
    estimatedDowntimeMin: num(raw.estimatedDowntimeMin),
    ring01Tested: bool(raw.ring01Tested),
    ...(Array.isArray(raw.validatedPatchIds)
      ? { validatedPatchIds: strArray(raw.validatedPatchIds).filter((id) => PATCH_IDS.includes(id)) }
      : {}),
    testingNotes: str(raw.testingNotes),
    rollbackStrategy: oneOf(raw.rollbackStrategy, ROLLBACK_IDS, 'none'),
    rollbackThreshold: str(raw.rollbackThreshold),
    maintenanceWindowId: oneOf(raw.maintenanceWindowId, WINDOW_IDS, WINDOW_IDS[0]),
    justification: str(raw.justification),
  };
}

/** Vuelve a dictaminar cada RFC en orden; devuelve también el mapa código antiguo → código nuevo. */
function sanitizeRfcs(
  raw: unknown,
  blackouts: BlackoutPeriod[],
): { submissions: RfcSubmission[]; codeMap: Map<string, string> } {
  const submissions: RfcSubmission[] = [];
  const codeMap = new Map<string, string>();
  const list = Array.isArray(raw) ? raw.filter(isObj) : [];
  // El estado guarda los RFC del más reciente al más antiguo: se dictaminan en orden cronológico.
  for (const sub of [...list].reverse()) {
    const input = sanitizeRfcInput(sub.input);
    if (!input) continue;
    const verdict = evaluateCabSubmission(input, blackouts, submissions);
    const rechecked: RfcSubmission = {
      ...verdict,
      id: str(sub.id, verdict.id),
      submittedAt: str(sub.submittedAt, verdict.submittedAt),
    };
    if (rechecked.rfcCode && typeof sub.rfcCode === 'string') codeMap.set(sub.rfcCode, rechecked.rfcCode);
    submissions.push(rechecked);
  }
  return { submissions: submissions.reverse(), codeMap };
}

function sanitizeWsus(
  raw: unknown,
  submissions: RfcSubmission[],
  codeMap: Map<string, string>,
): Record<string, WsusPatchApproval> {
  const approvedRfcs = submissions.filter((s) => s.status === 'APROBADO' && s.rfcCode);
  const rfcCovers = (code: string, patchId: string, ring: DeploymentRingId) =>
    approvedRfcs.some(
      (s) => s.rfcCode === code && s.input.selectedPatchIds.includes(patchId) && s.input.targetRings.includes(ring),
    );
  const out: Record<string, WsusPatchApproval> = {};
  const src = isObj(raw) ? raw : {};
  for (const patchId of PATCH_IDS) {
    const existing = src[patchId];
    const base = createEmptyWsusPatchApproval();
    if (!isObj(existing)) {
      out[patchId] = base;
      continue;
    }
    const rings = isObj(existing.rings) ? existing.rings : {};
    const cleanRings = { ...base.rings };
    for (const ring of RING_IDS) {
      const r = rings[ring];
      if (!isObj(r)) continue;
      const oldCode = optStr(r.linkedRfcCode);
      const newCode = oldCode ? codeMap.get(oldCode) : undefined;
      const entry: WsusRingApproval = {
        action: oneOf(r.action, WSUS_ACTIONS, 'Not Approved'),
        deadline: optStr(r.deadline),
        updatedAt: optStr(r.updatedAt),
        // Un código RFC solo vale si corresponde a un RFC aprobado que cubre ese parche y ese anillo
        linkedRfcCode: newCode && rfcCovers(newCode, patchId, ring) ? newCode : undefined,
      };
      cleanRings[ring] = entry;
    }
    out[patchId] = { declinedGlobally: bool(existing.declinedGlobally), rings: cleanRings };
  }
  return out;
}

function sanitizeIncident(raw: unknown): SimulationIncident | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !INCIDENT_TYPES.includes(raw.type as SimulationIncidentType)) {
    return null;
  }
  return {
    id: raw.id,
    patchId: str(raw.patchId),
    ringId: oneOf(raw.ringId, RING_IDS, 'ring-0'),
    targetHostLabel: str(raw.targetHostLabel),
    affectedCount: Math.max(0, num(raw.affectedCount)),
    type: raw.type as SimulationIncidentType,
    errorCode: optStr(raw.errorCode),
    title: str(raw.title),
    detail: str(raw.detail),
    recommendedFix: oneOf(raw.recommendedFix, FIX_TYPES, 'wait_window'),
    winrmReachable: bool(raw.winrmReachable),
    status: oneOf(raw.status, ['active', 'resolved'] as const, 'active'),
    detectedAtClock: str(raw.detectedAtClock),
    resolvedAtClock: optStr(raw.resolvedAtClock),
    resolutionMethod: optStr(raw.resolutionMethod),
  };
}

function sanitizeLog(raw: unknown): SimulationLogEntry | null {
  if (!isObj(raw) || typeof raw.message !== 'string') return null;
  return {
    id: str(raw.id, `log-${Math.random().toString(36).slice(2, 8)}`),
    simClock: str(raw.simClock),
    source: oneOf(raw.source, LOG_SOURCES, 'System'),
    severity: oneOf(raw.severity, LOG_SEVERITIES, 'info'),
    eventId: optStr(raw.eventId),
    host: str(raw.host),
    message: raw.message,
  };
}

function sanitizeTerminal(raw: unknown): TerminalHistoryEntry | null {
  if (!isObj(raw) || typeof raw.command !== 'string') return null;
  return {
    id: str(raw.id, `term-${Math.random().toString(36).slice(2, 8)}`),
    target: str(raw.target),
    command: raw.command,
    output: strArray(raw.output),
    isError: bool(raw.isError),
    timestamp: str(raw.timestamp),
  };
}

function sanitizeSimulation(raw: unknown): SimulationState {
  const base = createInitialSimulationState();
  if (!isObj(raw)) return base;
  const installedRaw = isObj(raw.installedPatchesByRing) ? raw.installedPatchesByRing : {};
  const installed = { ...base.installedPatchesByRing };
  for (const ring of RING_IDS) {
    installed[ring] = strArray(installedRaw[ring]).filter((id) => PATCH_IDS.includes(id));
  }
  const soak: Record<string, number> = {};
  if (isObj(raw.ringSoakHours)) {
    for (const [k, v] of Object.entries(raw.ringSoakHours)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) soak[k] = v;
    }
  }
  return {
    simHoursElapsed: Math.max(0, num(raw.simHoursElapsed)),
    simClockLabel: str(raw.simClockLabel, base.simClockLabel),
    isNightWindow: bool(raw.isNightWindow),
    ringSoakHours: soak,
    installedPatchesByRing: installed,
    incidents: Array.isArray(raw.incidents)
      ? raw.incidents.map(sanitizeIncident).filter((x): x is SimulationIncident => x !== null)
      : [],
    eventLogs: Array.isArray(raw.eventLogs)
      ? raw.eventLogs.map(sanitizeLog).filter((x): x is SimulationLogEntry => x !== null)
      : base.eventLogs,
    terminalHistory: Array.isArray(raw.terminalHistory)
      ? raw.terminalHistory.map(sanitizeTerminal).filter((x): x is TerminalHistoryEntry => x !== null)
      : [],
    userComplaints: Math.max(0, num(raw.userComplaints)),
    snapshotsTakenAt: str(raw.snapshotsTakenAt, base.snapshotsTakenAt),
    lastScanClock: optStr(raw.lastScanClock),
  };
}

/** Convierte cualquier objeto en un LabState válido; lo que no encaja vuelve a su valor inicial. */
export function sanitizeLabState(raw: unknown): LabState {
  const fallback = createInitialLabState();
  if (!isObj(raw)) return fallback;

  const windowsRaw = isObj(raw.ringMaintenanceWindows) ? raw.ringMaintenanceWindows : {};
  const ringMaintenanceWindows = { ...fallback.ringMaintenanceWindows };
  for (const ring of RING_IDS) {
    ringMaintenanceWindows[ring] = oneOf(windowsRaw[ring], WINDOW_IDS, fallback.ringMaintenanceWindows[ring]);
  }

  const blackoutPeriods = sanitizeBlackouts(raw.blackoutPeriods, fallback.blackoutPeriods);
  const { submissions, codeMap } = sanitizeRfcs(raw.rfcSubmissions, blackoutPeriods);
  const auto = isObj(raw.wsusAutoApproval) ? raw.wsusAutoApproval : {};

  return {
    version: 1,
    activeModule: oneOf(raw.activeModule, MODULE_IDS, fallback.activeModule),
    activeScenario: oneOf(raw.activeScenario, SCENARIO_IDS, fallback.activeScenario),
    activeMissionId: oneOf(raw.activeMissionId, MISSION_IDS, fallback.activeMissionId),
    studentAlias: str(raw.studentAlias).slice(0, 120),
    studentGroup: str(raw.studentGroup).slice(0, 120),
    selectedPatchId: oneOf(raw.selectedPatchId, PATCH_IDS, fallback.selectedPatchId),
    selectedRingFilter: oneOf(raw.selectedRingFilter, [...RING_IDS, 'all'] as const, 'all'),
    triageDecisions: sanitizeTriage(raw.triageDecisions),
    inspectedAssetIds: strArray(raw.inspectedAssetIds),
    ringMaintenanceWindows,
    blackoutPeriods,
    rfcSubmissions: submissions,
    wsusApprovals: sanitizeWsus(raw.wsusApprovals, submissions, codeMap),
    wsusAutoApproval: {
      enabled: bool(auto.enabled, fallback.wsusAutoApproval.enabled),
      classifications: Array.isArray(auto.classifications)
        ? strArray(auto.classifications).filter((c): c is PatchClassification => CLASSIFICATIONS.includes(c as PatchClassification))
        : fallback.wsusAutoApproval.classifications,
      targetRings: Array.isArray(auto.targetRings)
        ? strArray(auto.targetRings).filter((r): r is DeploymentRingId => RING_IDS.includes(r as DeploymentRingId))
        : fallback.wsusAutoApproval.targetRings,
      lastRunAt: optStr(auto.lastRunAt),
      lastApprovedCount: typeof auto.lastApprovedCount === 'number' ? num(auto.lastApprovedCount) : undefined,
    },
    simulation: sanitizeSimulation(raw.simulation),
    lastModified: str(raw.lastModified, fallback.lastModified),
  };
}
