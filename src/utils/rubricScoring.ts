import { PATCH_BULLETINS } from '../data/initialData';
import {
  GuidedMissionEvaluation,
  LabState,
  RubricKpi,
  SecOpsRubric,
} from '../types/patchday';
import {
  computeGlobalMetrics,
  computeWsusHygieneMetrics,
  getUnlockedPatchesMap,
} from './labStorage';

export function evaluateGuidedMissions(
  state: LabState,
): GuidedMissionEvaluation[] {
  const d = state.triageDecisions;
  const approvals = state.wsusApprovals;
  const incidents = state.simulation.incidents;
  const termHistory = state.simulation.terminalHistory;
  const approvedRfcs = state.rfcSubmissions.filter((s) => s.status === 'APROBADO');

  // --- MISIÓN 1: El Espejismo del CVSS 9.8 ---
  const highEpssKevs = PATCH_BULLETINS.filter(
    (b) => b.inCisaKev && !b.supersededBy && b.epssScore >= 0.85,
  );
  const prioritizedHighKevs = highEpssKevs.filter(
    (b) => d[b.id]?.priority === 'P1' && Boolean(d[b.id]?.queuedForRfc),
  );
  const m1Obj1 = prioritizedHighKevs.length >= 2;

  const apacheDecision = d['APACHE-2.4.62'];
  const apacheApp = approvals['APACHE-2.4.62'];
  const apacheUrgentInProd =
    apacheApp?.rings['ring-2']?.action === 'Approved for Install' ||
    apacheApp?.rings['ring-3']?.action === 'Approved for Install';
  const m1Obj2 =
    Boolean(apacheDecision?.priority) &&
    apacheDecision?.priority !== 'P1' &&
    !apacheUrgentInProd;

  const declinedSupersededCount = ['KB5026361', 'KB5029377'].filter(
    (id) => approvals[id]?.declinedGlobally,
  ).length;
  const m1Obj3 = declinedSupersededCount >= 2;
  const m1Done = m1Obj1 && m1Obj2 && m1Obj3;

  // --- MISIÓN 2: Gobernanza CAB y Ventana Nocturna ---
  const m2ValidRfc = approvedRfcs.find(
    (s) =>
      s.input.selectedPatchIds.includes('KB5035857') &&
      s.input.targetRings.includes('ring-3') &&
      s.input.maintenanceWindowId === 'win-ring3-sun-strict',
  );
  const m2Obj1 = Boolean(m2ValidRfc);

  const kb5035857Ring3 = approvals['KB5035857']?.rings['ring-3'];
  const m2Obj2 =
    kb5035857Ring3?.action === 'Approved for Install' &&
    Boolean(kb5035857Ring3?.linkedRfcCode) &&
    !kb5035857Ring3?.deadline?.includes('Forzado');

  const kb5035857InstalledRing3 =
    state.simulation.installedPatchesByRing['ring-3']?.includes('KB5035857') ?? false;
  const exchActiveIssues = incidents.some(
    (i) =>
      i.status === 'active' &&
      i.ringId === 'ring-3' &&
      (i.patchId === 'KB5035857' || i.type === 'deadline_complaint'),
  );
  const m2Obj3 =
    kb5035857InstalledRing3 &&
    !exchActiveIssues &&
    state.simulation.userComplaints === 0;
  const m2Done = m2Obj1 && m2Obj2 && m2Obj3;

  // --- MISIÓN 3: Pánico en el Anillo Piloto (Rollback Táctico) ---
  const pilotInc = incidents.find((i) => i.id === 'inc-pilot-sql-ring1');
  const m3Obj1 = Boolean(pilotInc);

  const sqlApp = approvals['KB5035432'];
  const promotedToProd =
    sqlApp?.rings['ring-2']?.action === 'Approved for Install' ||
    sqlApp?.rings['ring-3']?.action === 'Approved for Install';
  const m3Obj2 = Boolean(pilotInc) && !promotedToProd;

  const ring1Clean =
    pilotInc?.status === 'resolved' &&
    !incidents.some((i) => i.status === 'active' && i.ringId === 'ring-1');
  const m3Obj3 = Boolean(pilotInc) && ring1Clean;
  const m3Done = m3Obj1 && m3Obj2 && m3Obj3;

  // --- MISIÓN 4: Caos en el Agente Windows Update ---
  const m4IncIds = ['inc-m4-dc01', 'inc-m4-dc02', 'inc-m4-exch01'];
  const m4Incs = incidents.filter((i) => m4IncIds.includes(i.id));
  const m4Obj1 = m4Incs.length === 3;

  const ranResetWu = termHistory.some(
    (h) =>
      !h.isError &&
      (h.command.toLowerCase().includes('reset-wuagent') ||
        h.command.toLowerCase().includes('softwaredistribution')),
  );
  const ranDismRestore = termHistory.some(
    (h) =>
      !h.isError &&
      h.command.toLowerCase().includes('dism') &&
      h.command.toLowerCase().includes('restorehealth'),
  );
  const m4Obj2 = ranResetWu && ranDismRestore;

  const m4Obj3 =
    m4Incs.length === 3 && m4Incs.every((i) => i.status === 'resolved');
  const m4Done = m4Obj1 && m4Obj2 && m4Obj3;

  return [
    {
      id: 'mission-1',
      number: 'MISIÓN 01',
      title: 'El Espejismo del CVSS 9.8',
      subtitle: 'Priorización real CVSS vs EPSS (>85%) + CISA KEV e higiene Superseded',
      briefing:
        'Tienes presupuesto de ventana para desplegar solo 2 parches urgentes hoy. Identifica 2 amenazas reales activas en CISA KEV con EPSS > 85%, ignora la trampa teórica CVSS 9.8 de Apache (EPSS 2%) y declina 2 boletines reemplazados en WSUS.',
      flagToken: 'FLAG{CVSS_98_M1RAGE_EPSS_KEV_WINS}',
      completed: m1Done,
      recommendedModule: 'triage',
      actionLabel: 'Trabajar en Triage & WSUS',
      objectives: [
        {
          id: 'm1-o1',
          label: `Clasifica como P1 y encola para RFC al menos 2 boletines KEV con EPSS > 85% (${prioritizedHighKevs.length}/2)`,
          completed: m1Obj1,
        },
        {
          id: 'm1-o2',
          label:
            'Ignora el espejismo APACHE-2.4.62 (CVSS 9.8 / EPSS 2%): clasifícalo en P2–P4 sin prioridad P1 ni despliegue urgente',
          completed: m1Obj2,
        },
        {
          id: 'm1-o3',
          label: `Declina (Declined) en Consola WSUS los dos parches Superseded KB5026361 y KB5029377 (${declinedSupersededCount}/2)`,
          completed: m1Obj3,
        },
      ],
    },
    {
      id: 'mission-2',
      number: 'MISIÓN 02',
      title: 'Gobernanza CAB y Ventana Nocturna',
      subtitle: 'RFC válido para Exchange/IIS en Anillo 3 y despliegue sin impacto laboral',
      briefing:
        'Debes mitigar el 0-day crítico de Exchange/IIS (KB5035857) en Anillo 3. Supera las reglas del Comité CAB con ventana nocturna de domingo, aprueba en WSUS con el código RFC-2026-XXXX y completa la ventana nocturna recuperando cualquier servicio si se detiene.',
      flagToken: 'FLAG{CAB_NOCTURNO_EXCHANGE_ZERO_DOWNTIME}',
      completed: m2Done,
      recommendedModule: 'rfc',
      actionLabel: 'Ir a RFC & CAB',
      objectives: [
        {
          id: 'm2-o1',
          label:
            'Obtén un RFC APROBADO por el CAB para KB5035857 en Anillo 3 con ventana nocturna (Domingo 01:00–04:00)',
          completed: m2Obj1,
        },
        {
          id: 'm2-o2',
          label:
            'Aprueba KB5035857 en WSUS para Ring 3 vinculando su RFC-2026-XXXX (sin Deadline forzado en horario laboral)',
          completed: m2Obj2,
        },
        {
          id: 'm2-o3',
          label:
            'Ejecuta Ventana Nocturna en Módulo 4, restaura servicios IIS/Exchange si caen y mantén 0 quejas laborales',
          completed: m2Obj3,
        },
      ],
    },
    {
      id: 'mission-3',
      number: 'MISIÓN 03',
      title: 'Pánico en el Anillo Piloto (Rollback Táctico)',
      subtitle: 'Contención en Anillo 1 tras caída de base de datos en DEV-SQL-01',
      briefing:
        'El boletín KB5035432 (SQL Server CU12) provoca caída del servicio MSSQLSERVER al probarse en Anillo 1 (DEV-SQL-01). Detecta la anomalía en Telemetría, impide su promoción a Ring 2/3 y ejecuta Rollback en Anillo 1.',
      flagToken: 'FLAG{RING1_PILOT_ROLLBACK_SAVED_PROD}',
      completed: m3Done,
      recommendedModule: 'maintenance',
      actionLabel: 'Abrir Escenario en Simulador',
      objectives: [
        {
          id: 'm3-o1',
          label:
            'Detecta la anomalía de KB5035432 en DEV-SQL-01 (Anillo 1) en el Monitor de Incidentes / Logs',
          completed: m3Obj1,
        },
        {
          id: 'm3-o2',
          label:
            'Bloquea la promoción del parche: KB5035432 NO debe aprobarse para instalación en Ring 2 ni Ring 3',
          completed: m3Obj2,
        },
        {
          id: 'm3-o3',
          label:
            'Ejecuta Rollback en Anillo 1 (wusa /uninstall /kb:5035432 o WSUS Approved for Removal) restaurando 100% disponibilidad',
          completed: m3Obj3,
        },
      ],
    },
    {
      id: 'mission-4',
      number: 'MISIÓN 04',
      title: 'Caos en el Agente Windows Update',
      subtitle: 'Diagnóstico de 0x8024402c y 0x800f081f en WindowsUpdate.log y reparación WinRM',
      briefing:
        'Tres servidores críticos de Anillo 3 (DC-CORE-01, DC-CORE-02 y EXCH-DAG-01) fallan con códigos 0x8024402c y 0x800f081f. Diagnostica las trazas en WindowsUpdate.log y repáralos desde la terminal WinRM limpiando SoftwareDistribution y ejecutando DISM /RestoreHealth.',
      flagToken: 'FLAG{WUA_CACHE_DISM_RESTOREHEALTH_OK}',
      completed: m4Done,
      recommendedModule: 'maintenance',
      actionLabel: 'Abrir Escenario en Terminal WinRM',
      objectives: [
        {
          id: 'm4-o1',
          label: `Activa y diagnostica los 3 servidores Ring 3 afectados en WindowsUpdate.log (${m4Incs.length}/3 detectados)`,
          completed: m4Obj1,
        },
        {
          id: 'm4-o2',
          label:
            'Ejecuta en Terminal WinRM Reset-WuAgent (SoftwareDistribution) y DISM /Online /Cleanup-Image /RestoreHealth',
          completed: m4Obj2,
        },
        {
          id: 'm4-o3',
          label: `Restaura los 3 servidores de Anillo 3 a estado Operativo (${
            m4Incs.filter((i) => i.status === 'resolved').length
          }/3 reparados)`,
          completed: m4Obj3,
        },
      ],
    },
  ];
}

export function computeSecOpsRubric(state: LabState): SecOpsRubric {
  const metrics = computeGlobalMetrics(state, PATCH_BULLETINS, []);
  const hygiene = computeWsusHygieneMetrics(state, PATCH_BULLETINS);
  const unlocked = getUnlockedPatchesMap(state);

  // 1. Exposure Surface Reduction (0–25)
  const kevTotal = Math.max(1, metrics.kevTotalCount);
  const kevTriagedRatio = metrics.kevMitigatedCount / kevTotal;
  const activeKevs = PATCH_BULLETINS.filter((b) => b.inCisaKev && !b.supersededBy);
  const kevUnlockedOrApproved = activeKevs.filter((b) => {
    const app = state.wsusApprovals[b.id];
    const hasWsusInstall =
      app &&
      !app.declinedGlobally &&
      Object.values(app.rings).some((r) => r.action === 'Approved for Install');
    return unlocked.has(b.id) || hasWsusInstall;
  }).length;
  const kevExecRatio = kevUnlockedOrApproved / kevTotal;

  let exposureScore = Math.round(kevTriagedRatio * 15 + kevExecRatio * 10);
  const exposureFindings: string[] = [
    `Boletines CISA KEV priorizados en cola RFC: ${metrics.kevMitigatedCount}/${metrics.kevTotalCount}.`,
    `Boletines KEV desbloqueados/desplegados en WSUS: ${kevUnlockedOrApproved}/${metrics.kevTotalCount}.`,
  ];
  if (state.triageDecisions['APACHE-2.4.62']?.priority === 'P1') {
    exposureScore = Math.max(0, exposureScore - 4);
    exposureFindings.push(
      'Penalización (-4 pts): APACHE-2.4.62 (EPSS 2%) clasificado erróneamente como emergencia P1.',
    );
  }
  exposureScore = Math.min(25, Math.max(0, exposureScore));

  // 2. ITIL Governance Compliance (0–25)
  let governanceScore = 10; // Base compliance when zero unauthorized changes exist
  const approvedRfcs = state.rfcSubmissions.filter((s) => s.status === 'APROBADO');
  const rejectedRfcs = state.rfcSubmissions.filter((s) => s.status === 'RECHAZADO');

  // Check for any Ring 2/3 install without linkedRfcCode
  let unauthorizedProdCount = 0;
  for (const b of PATCH_BULLETINS) {
    const app = state.wsusApprovals[b.id];
    if (!app || app.declinedGlobally) continue;
    if (
      (app.rings['ring-2']?.action === 'Approved for Install' &&
        !app.rings['ring-2']?.linkedRfcCode) ||
      (app.rings['ring-3']?.action === 'Approved for Install' &&
        !app.rings['ring-3']?.linkedRfcCode)
    ) {
      unauthorizedProdCount += 1;
    }
  }

  governanceScore += Math.min(15, approvedRfcs.length * 6);
  if (rejectedRfcs.length > 0 && approvedRfcs.length === 0) {
    governanceScore = Math.max(0, governanceScore - 3);
  }
  if (unauthorizedProdCount > 0) {
    governanceScore = Math.max(0, governanceScore - unauthorizedProdCount * 10);
  }
  governanceScore = Math.min(25, Math.max(0, governanceScore));

  const governanceFindings: string[] = [
    `RFCs aprobados por el CAB: ${approvedRfcs.length} (rechazados: ${rejectedRfcs.length}).`,
    unauthorizedProdCount === 0
      ? 'Cero despliegues en Producción (Ring 2/3) sin RFC autorizado.'
      : `Alerta (-${unauthorizedProdCount * 10} pts): ${unauthorizedProdCount} parche(s) en Producción sin código RFC.`,
  ];

  // 3. WSUS Hygiene & Ring Discipline (0–25)
  const declinedSuperseded = ['KB5026361', 'KB5029377'].filter(
    (id) => state.wsusApprovals[id]?.declinedGlobally,
  ).length;
  const declinedArm64 = state.wsusApprovals['KB5037224']?.declinedGlobally ? 1 : 0;

  let ring01SoakedCount = 0;
  for (const hrs of Object.values(state.simulation.ringSoakHours)) {
    if (hrs >= 4) ring01SoakedCount += 1;
  }

  let hygieneScore =
    declinedSuperseded * 6 +
    declinedArm64 * 5 +
    Math.min(8, ring01SoakedCount * 4);

  if (hygiene.supersededApprovedIds.length > 0) {
    hygieneScore = Math.max(
      0,
      hygieneScore - hygiene.supersededApprovedIds.length * 6,
    );
  }
  if (hygiene.arm64ApprovedIds.length > 0) {
    hygieneScore = Math.max(0, hygieneScore - 4);
  }
  hygieneScore = Math.min(25, Math.max(0, hygieneScore));

  const hygieneFindings: string[] = [
    `Superseded declinados en WSUS: ${declinedSuperseded}/2 · ARM64 declinado: ${declinedArm64}/1.`,
    `Parches validados en anillos previos Ring 0/1: ${ring01SoakedCount}.`,
    hygiene.wastedBandwidthMb > 0
      ? `Penalización: ${hygiene.wastedBandwidthMb} MB desperdiciados por parches reemplazados/ARM64 aprobados.`
      : 'Ancho de banda WSUS optimizado (0 MB desperdiciados).',
  ];

  // 4. Service Availability & SLA (0–25)
  const healthRatio = metrics.networkHealthPct / 100;
  let availabilityScore = Math.round(healthRatio * 25);
  const availabilityFindings: string[] = [
    `Salud actual de la flota: ${metrics.networkHealthPct}% (${metrics.operationalAssets}/${metrics.totalAssets} operativos).`,
  ];

  if (state.simulation.userComplaints > 0) {
    const penalty = Math.min(10, Math.ceil(state.simulation.userComplaints / 3));
    availabilityScore = Math.max(0, availabilityScore - penalty);
    availabilityFindings.push(
      `Penalización (-${penalty} pts): ${state.simulation.userComplaints} quejas por reinicios en horario laboral.`,
    );
  }

  const bsodNoSoak = state.simulation.incidents.find(
    (i) => i.id === 'inc-bsod-kb5036893-ws',
  );
  if (bsodNoSoak?.status === 'active') {
    availabilityFindings.push(
      'Regresión crítica activa en Ring 2 por desplegar KB5036893 sin 24h de soak en Ring 0/1.',
    );
  } else if (bsodNoSoak?.status === 'resolved') {
    availabilityFindings.push(
      'Regresión Ring 2 contenida mediante Rollback y disponibilidad recuperada.',
    );
  }

  availabilityScore = Math.min(25, Math.max(0, availabilityScore));

  const statusFor = (score: number): RubricKpi['status'] =>
    score >= 20 ? 'Óptimo' : score >= 11 ? 'En Progreso' : 'En Riesgo';

  const kpis: RubricKpi[] = [
    {
      id: 'exposure',
      title: 'Reducción Superficie de Exposición',
      score: exposureScore,
      maxScore: 25,
      status: statusFor(exposureScore),
      summary: 'Priorización CISA KEV / EPSS alto y contención de falsas emergencias.',
      findings: exposureFindings,
    },
    {
      id: 'governance',
      title: 'Cumplimiento Gobernanza ITIL',
      score: governanceScore,
      maxScore: 25,
      status: statusFor(governanceScore),
      summary: 'Cambios en Producción respaldados por RFC-2026-XXXX aprobado por CAB.',
      findings: governanceFindings,
    },
    {
      id: 'hygiene',
      title: 'Higiene WSUS & Disciplina de Anillos',
      score: hygieneScore,
      maxScore: 25,
      status: statusFor(hygieneScore),
      summary: 'Decline de Superseded/ARM64 y pruebas previas en Ring 0 y Ring 1.',
      findings: hygieneFindings,
    },
    {
      id: 'availability',
      title: 'Disponibilidad del Servicio & SLA',
      score: availabilityScore,
      maxScore: 25,
      status: statusFor(availabilityScore),
      summary: 'Continuidad operativa sin reinicios laborales ni caídas sin rollback.',
      findings: availabilityFindings,
    },
  ];

  const totalScore = kpis.reduce((acc, k) => acc + k.score, 0);
  const gradeLabel: SecOpsRubric['gradeLabel'] =
    totalScore >= 85
      ? 'Sobresaliente'
      : totalScore >= 70
        ? 'Notable'
        : totalScore >= 50
          ? 'Aprobado'
          : 'Insuficiente';

  return {
    totalScore,
    gradeLabel,
    kpis,
  };
}

export function buildEvidenceHash(state: LabState): string {
  const payload = JSON.stringify({
    alias: state.studentAlias || 'Anonimo',
    triage: Object.keys(state.triageDecisions).length,
    rfcs: state.rfcSubmissions.map((r) => r.rfcCode ?? r.status),
    term: state.simulation.terminalHistory.map((t) => t.command),
    resolved: state.simulation.incidents
      .filter((i) => i.status === 'resolved')
      .map((i) => i.id),
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `PD-2026-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
