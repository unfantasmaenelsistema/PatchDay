export type ModuleId = 'triage' | 'rfc' | 'wsus' | 'maintenance' | 'ctf';

export type OperationalPriority = 'P1' | 'P2' | 'P3' | 'P4';

export type PatchClassification =
  | 'Security Update'
  | 'Critical Update'
  | 'Update Rollup'
  | 'WSUS Update'
  | 'Feature Pack'
  | 'Service Pack';

export type RebootPolicy = 'Siempre' | 'Posiblemente' | 'Nunca';

export type VendorCategory = 'Microsoft' | 'Linux / Infraestructura' | 'Terceros';

export type DeploymentRingId = 'ring-0' | 'ring-1' | 'ring-2' | 'ring-3';

export type AssetStatus = 'Operativo' | 'Degradado' | 'Caído';

export type ScenarioId = 'patch-tuesday' | 'zero-day-kev' | 'wsus-hygiene';

export interface PatchBulletin {
  id: string;
  cve: string;
  title: string;
  vendor: string;
  vendorCategory: VendorCategory;
  affectedProduct: string;
  classification: PatchClassification;
  cvssScore: number;
  cvssVector: string;
  epssScore: number; // 0.01 to 0.99
  epssPercentile: number; // 0 to 100
  inCisaKev: boolean;
  kevDueDate?: string;
  requiresReboot: RebootPolicy;
  supersedes: string[];
  supersededBy: string | null;
  hiddenRisk: string;
  summary: string;
  exploitContext: string;
  affectedAssetIds: string[];
  recommendedPriority: OperationalPriority;
  pedagogicalRationale: string;
  releaseDate: string;
  sizeMb: number;
  supportsWusaUninstall?: boolean;
  rollbackHint?: string;
  architecture?: 'x64' | 'ARM64' | 'Multiplataforma';
  prerequisites?: string[];
  wsusStatusDefault?: 'Needed' | 'Failed' | 'Installed' | 'Not Applicable';
}

export interface DeploymentRing {
  id: DeploymentRingId;
  name: string;
  wsusGroupName: string;
  shortName: string;
  description: string;
  fleetCount: number;
  fleetComposition: string;
  maintenanceWindow: string;
  autoApproveDelay: string;
  requiresCab: boolean;
  rollbackThresholdPct: number;
}

export interface EnterpriseAsset {
  id: string;
  hostname: string;
  ip: string;
  os: string;
  ringId: DeploymentRingId;
  role: string;
  department: string;
  status: AssetStatus;
  lastCheckIn: string;
  installedKbCount: number;
  criticality: 'Baja' | 'Media' | 'Alta' | 'Crítica';
  notes: string;
}

export interface TriageDecision {
  priority?: OperationalPriority;
  queuedForRfc: boolean;
  analystNote: string;
  updatedAt: string;
}

export type ChangeType = 'Estándar' | 'Normal' | 'Emergencia';

export type RollbackStrategy =
  | 'none'
  | 'wusa-uninstall'
  | 'hypervisor-snapshot'
  | 'cluster-failover'
  | 'package-downgrade';

export type MaintenanceWindowId =
  | 'win-ring0-24x7'
  | 'win-ring1-tue-thu'
  | 'win-ring2-sat-night'
  | 'win-ring3-sun-strict'
  | 'win-business-hours'
  | 'win-blackout-billing';

export interface MaintenanceWindowOption {
  id: MaintenanceWindowId;
  ringId: DeploymentRingId | 'custom';
  label: string;
  schedule: string;
  days: string[];
  hours: string;
  isBusinessHours: boolean;
  isBlackoutConflict: boolean;
  snapshotRequired: boolean;
  notes: string;
}

export interface BlackoutPeriod {
  id: string;
  title: string;
  dateRange: string;
  reason: string;
  affectedRings: DeploymentRingId[];
  active: boolean;
}

export interface RfcFormInput {
  title: string;
  selectedPatchIds: string[];
  targetRings: DeploymentRingId[];
  changeType: ChangeType;
  declaredReboot: 'Sí' | 'Posiblemente' | 'No';
  affectedServices: string[];
  estimatedDowntimeMin: number;
  ring01Tested: boolean;
  testingNotes: string;
  rollbackStrategy: RollbackStrategy;
  rollbackThreshold: string;
  maintenanceWindowId: MaintenanceWindowId;
  justification: string;
}

export interface CabRuleFinding {
  ruleId: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'pass';
  title: string;
  detail: string;
}

export interface RfcSubmission {
  id: string;
  rfcCode: string | null;
  status: 'APROBADO' | 'RECHAZADO';
  submittedAt: string;
  input: RfcFormInput;
  findings: CabRuleFinding[];
  summaryVerdict: string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  subtitle: string;
  briefing: string;
  targetSlaPct: number;
  focusFilter: 'all' | 'kev' | 'superseded';
}

export type WsusApprovalAction =
  | 'Not Approved'
  | 'Approved for Install'
  | 'Approved for Removal'
  | 'Declined';

export interface WsusRingApproval {
  action: WsusApprovalAction;
  deadline?: string;
  linkedRfcCode?: string;
  updatedAt?: string;
}

export interface WsusPatchApproval {
  declinedGlobally: boolean;
  rings: Record<DeploymentRingId, WsusRingApproval>;
}

export interface WsusAutoApprovalRule {
  enabled: boolean;
  classifications: PatchClassification[];
  targetRings: DeploymentRingId[];
  lastRunAt?: string;
  lastApprovedCount?: number;
}

export type SimulationIncidentType =
  | 'bsod_loop'
  | 'service_down'
  | 'kerberos_auth'
  | 'wua_error'
  | 'deadline_complaint';

export type SimulationIncidentStatus = 'active' | 'resolved';

export type RecommendedFixType =
  | 'wsus_removal'
  | 'winrm_dism'
  | 'winrm_dism_restore'
  | 'winrm_wusa'
  | 'winrm_reset_wu'
  | 'winrm_winre'
  | 'winrm_service'
  | 'hypervisor_snapshot'
  | 'wait_window';

export interface SimulationIncident {
  id: string;
  patchId: string;
  ringId: DeploymentRingId;
  targetHostLabel: string;
  affectedCount: number;
  type: SimulationIncidentType;
  errorCode?: string;
  title: string;
  detail: string;
  recommendedFix: RecommendedFixType;
  winrmReachable: boolean;
  status: SimulationIncidentStatus;
  detectedAtClock: string;
  resolvedAtClock?: string;
  resolutionMethod?: string;
}

export interface SimulationLogEntry {
  id: string;
  simClock: string;
  source:
    | 'WSUS'
    | 'System'
    | 'WindowsUpdateClient'
    | 'WindowsUpdate.log'
    | 'WinRM'
    | 'Hypervisor'
    | 'Helpdesk';
  severity: 'info' | 'warning' | 'error' | 'success';
  eventId?: string;
  host: string;
  message: string;
}

export interface TerminalHistoryEntry {
  id: string;
  target: string;
  command: string;
  output: string[];
  isError: boolean;
  timestamp: string;
}

export interface SimulationState {
  simHoursElapsed: number;
  simClockLabel: string;
  isNightWindow: boolean;
  ringSoakHours: Record<string, number>;
  installedPatchesByRing: Record<DeploymentRingId, string[]>;
  incidents: SimulationIncident[];
  eventLogs: SimulationLogEntry[];
  terminalHistory: TerminalHistoryEntry[];
  userComplaints: number;
  snapshotsTakenAt: string;
  lastScanClock?: string;
}

export type GuidedMissionId =
  | 'mission-1'
  | 'mission-2'
  | 'mission-3'
  | 'mission-4';

export interface GuidedMissionObjective {
  id: string;
  label: string;
  completed: boolean;
}

export interface GuidedMissionEvaluation {
  id: GuidedMissionId;
  number: string;
  title: string;
  subtitle: string;
  briefing: string;
  flagToken: string;
  completed: boolean;
  objectives: GuidedMissionObjective[];
  recommendedModule: ModuleId;
  actionLabel: string;
}

export interface RubricKpi {
  id: 'exposure' | 'governance' | 'hygiene' | 'availability';
  title: string;
  score: number;
  maxScore: number;
  status: 'Óptimo' | 'En Progreso' | 'En Riesgo';
  summary: string;
  findings: string[];
}

export interface SecOpsRubric {
  totalScore: number;
  gradeLabel: 'Sobresaliente' | 'Notable' | 'Aprobado' | 'Insuficiente';
  kpis: RubricKpi[];
}

export interface LabState {
  version: number;
  activeModule: ModuleId;
  activeScenario: ScenarioId;
  activeMissionId: GuidedMissionId;
  studentAlias: string;
  studentGroup: string;
  selectedPatchId: string;
  selectedRingFilter: DeploymentRingId | 'all';
  triageDecisions: Record<string, TriageDecision>;
  inspectedAssetIds: string[];
  ringMaintenanceWindows: Record<DeploymentRingId, MaintenanceWindowId>;
  blackoutPeriods: BlackoutPeriod[];
  rfcSubmissions: RfcSubmission[];
  wsusApprovals: Record<string, WsusPatchApproval>;
  wsusAutoApproval: WsusAutoApprovalRule;
  simulation: SimulationState;
  lastModified: string;
}

export interface GlobalMetrics {
  slaCompliancePct: number;
  triagedCount: number;
  totalActionableCount: number;
  queuedRfcCount: number;
  approvedRfcCount: number;
  unlockedPatchCount: number;
  kevTotalCount: number;
  kevMitigatedCount: number;
  networkHealthPct: number;
  operationalAssets: number;
  degradedAssets: number;
  downAssets: number;
  totalAssets: number;
  exposureRiskLevel: 'Crítico' | 'Alto' | 'Moderado' | 'Controlado';
  exposureScore: number;
  activeIncidentsCount: number;
  userComplaints: number;
}

