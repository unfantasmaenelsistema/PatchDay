import {
  createEmptyWsusPatchApproval,
  createInitialLabState,
  createInitialSimulationState,
  DEPLOYMENT_RINGS,
  PATCH_BULLETINS,
} from '../data/initialData';
import {
  DeploymentRingId,
  EnterpriseAsset,
  GlobalMetrics,
  LabState,
  OperationalPriority,
  PatchBulletin,
  WsusPatchApproval,
} from '../types/patchday';

const STORAGE_KEY = 'patchday_lab_state_v1';

function mergeWsusApprovals(
  raw?: Record<string, WsusPatchApproval>,
): Record<string, WsusPatchApproval> {
  const base: Record<string, WsusPatchApproval> = {};
  for (const b of PATCH_BULLETINS) {
    const existing = raw?.[b.id];
    base[b.id] = existing
      ? {
          declinedGlobally: Boolean(existing.declinedGlobally),
          rings: {
            'ring-0': existing.rings?.['ring-0'] ?? { action: 'Not Approved' },
            'ring-1': existing.rings?.['ring-1'] ?? { action: 'Not Approved' },
            'ring-2': existing.rings?.['ring-2'] ?? { action: 'Not Approved' },
            'ring-3': existing.rings?.['ring-3'] ?? { action: 'Not Approved' },
          },
        }
      : createEmptyWsusPatchApproval();
  }
  return base;
}

export function loadLabState(): LabState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialLabState();
    const parsed = JSON.parse(raw) as Partial<LabState>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return createInitialLabState();
    }
    const fallback = createInitialLabState();
    return {
      ...fallback,
      ...parsed,
      activeMissionId: parsed.activeMissionId ?? fallback.activeMissionId,
      studentAlias: typeof parsed.studentAlias === 'string' ? parsed.studentAlias : '',
      studentGroup: typeof parsed.studentGroup === 'string' ? parsed.studentGroup : '',
      triageDecisions:
        parsed.triageDecisions && typeof parsed.triageDecisions === 'object'
          ? parsed.triageDecisions
          : {},
      inspectedAssetIds: Array.isArray(parsed.inspectedAssetIds)
        ? parsed.inspectedAssetIds
        : [],
      ringMaintenanceWindows:
        parsed.ringMaintenanceWindows && typeof parsed.ringMaintenanceWindows === 'object'
          ? { ...fallback.ringMaintenanceWindows, ...parsed.ringMaintenanceWindows }
          : fallback.ringMaintenanceWindows,
      blackoutPeriods: Array.isArray(parsed.blackoutPeriods)
        ? parsed.blackoutPeriods
        : fallback.blackoutPeriods,
      rfcSubmissions: Array.isArray(parsed.rfcSubmissions)
        ? parsed.rfcSubmissions
        : [],
      wsusApprovals: mergeWsusApprovals(parsed.wsusApprovals),
      wsusAutoApproval:
        parsed.wsusAutoApproval && typeof parsed.wsusAutoApproval === 'object'
          ? { ...fallback.wsusAutoApproval, ...parsed.wsusAutoApproval }
          : fallback.wsusAutoApproval,
      simulation:
        parsed.simulation && typeof parsed.simulation === 'object'
          ? {
              ...createInitialSimulationState(),
              ...parsed.simulation,
              installedPatchesByRing: {
                ...createInitialSimulationState().installedPatchesByRing,
                ...(parsed.simulation.installedPatchesByRing ?? {}),
              },
              incidents: Array.isArray(parsed.simulation.incidents)
                ? parsed.simulation.incidents
                : [],
              eventLogs: Array.isArray(parsed.simulation.eventLogs)
                ? parsed.simulation.eventLogs
                : createInitialSimulationState().eventLogs,
              terminalHistory: Array.isArray(parsed.simulation.terminalHistory)
                ? parsed.simulation.terminalHistory
                : [],
            }
          : createInitialSimulationState(),
    };
  } catch {
    return createInitialLabState();
  }
}

export function saveLabState(state: LabState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors silently in restricted browsers
  }
}

export function resetLabStorage(): LabState {
  const fresh = createInitialLabState();
  saveLabState(fresh);
  return fresh;
}

export function exportStateToJson(state: LabState): string {
  return JSON.stringify(state, null, 2);
}

export function exportStateToBase64(state: LabState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function importStateFromInput(rawInput: string): {
  ok: true;
  state: LabState;
} | {
  ok: false;
  error: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: 'El campo de importación está vacío.' };
  }

  let jsonText = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      const binary = atob(trimmed);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      jsonText = new TextDecoder().decode(bytes);
    } catch {
      return {
        ok: false,
        error: 'Formato inválido. Pega un JSON válido o una cadena Base64 generada por PatchDay.',
      };
    }
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<LabState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.selectedPatchId !== 'string' ||
      typeof parsed.triageDecisions !== 'object'
    ) {
      return {
        ok: false,
        error: 'El JSON no corresponde a un snapshot válido de PatchDay.',
      };
    }

    const fallback = createInitialLabState();
    const validPatchExists = PATCH_BULLETINS.some((b) => b.id === parsed.selectedPatchId);
    const hydrated: LabState = {
      ...fallback,
      ...parsed,
      version: 1,
      activeMissionId: parsed.activeMissionId ?? fallback.activeMissionId,
      studentAlias: typeof parsed.studentAlias === 'string' ? parsed.studentAlias : '',
      studentGroup: typeof parsed.studentGroup === 'string' ? parsed.studentGroup : '',
      selectedPatchId: validPatchExists ? parsed.selectedPatchId : fallback.selectedPatchId,
      triageDecisions: parsed.triageDecisions ?? {},
      inspectedAssetIds: Array.isArray(parsed.inspectedAssetIds)
        ? parsed.inspectedAssetIds
        : [],
      ringMaintenanceWindows:
        parsed.ringMaintenanceWindows && typeof parsed.ringMaintenanceWindows === 'object'
          ? { ...fallback.ringMaintenanceWindows, ...parsed.ringMaintenanceWindows }
          : fallback.ringMaintenanceWindows,
      blackoutPeriods: Array.isArray(parsed.blackoutPeriods)
        ? parsed.blackoutPeriods
        : fallback.blackoutPeriods,
      rfcSubmissions: Array.isArray(parsed.rfcSubmissions)
        ? parsed.rfcSubmissions
        : [],
      wsusApprovals: mergeWsusApprovals(parsed.wsusApprovals),
      wsusAutoApproval:
        parsed.wsusAutoApproval && typeof parsed.wsusAutoApproval === 'object'
          ? { ...fallback.wsusAutoApproval, ...parsed.wsusAutoApproval }
          : fallback.wsusAutoApproval,
      simulation:
        parsed.simulation && typeof parsed.simulation === 'object'
          ? {
              ...createInitialSimulationState(),
              ...parsed.simulation,
              installedPatchesByRing: {
                ...createInitialSimulationState().installedPatchesByRing,
                ...(parsed.simulation.installedPatchesByRing ?? {}),
              },
              incidents: Array.isArray(parsed.simulation.incidents)
                ? parsed.simulation.incidents
                : [],
              eventLogs: Array.isArray(parsed.simulation.eventLogs)
                ? parsed.simulation.eventLogs
                : createInitialSimulationState().eventLogs,
              terminalHistory: Array.isArray(parsed.simulation.terminalHistory)
                ? parsed.simulation.terminalHistory
                : [],
            }
          : createInitialSimulationState(),
      lastModified: new Date().toISOString(),
    };
    return { ok: true, state: hydrated };
  } catch {
    return {
      ok: false,
      error: 'Error al analizar JSON. Verifica que la cadena esté completa sin recortes.',
    };
  }
}

export function computeGlobalMetrics(
  state: LabState,
  bulletins: PatchBulletin[],
  assets: EnterpriseAsset[],
): GlobalMetrics {
  const decisions = state.triageDecisions;
  const totalCount = bulletins.length;

  let triagedCount = 0;
  let queuedRfcCount = 0;
  let kevTotalCount = 0;
  let kevMitigatedCount = 0;
  let exposureAccumulator = 0;
  let maxExposure = 0;

  for (const b of bulletins) {
    const d = decisions[b.id];
    if (d?.priority) {
      triagedCount += 1;
    }
    if (d?.queuedForRfc) {
      queuedRfcCount += 1;
    }

    const isActionableKev = b.inCisaKev && !b.supersededBy;
    if (isActionableKev) {
      kevTotalCount += 1;
      if (d?.queuedForRfc && (d.priority === 'P1' || d.priority === 'P2')) {
        kevMitigatedCount += 1;
      }
    }

    // Weight exposure by EPSS, KEV, and CVSS (skip superseded if properly P4 deferred)
    const patchWeight =
      (b.inCisaKev && !b.supersededBy ? 35 : 0) +
      b.epssScore * 45 +
      (b.cvssScore / 10) * 20;

    maxExposure += patchWeight;

    const isMitigatedInQueue =
      d?.queuedForRfc && (d.priority === 'P1' || d.priority === 'P2');
    const isProperlyDeferred = b.supersededBy && d?.priority === 'P4';

    if (isMitigatedInQueue) {
      exposureAccumulator += patchWeight * 0.15;
    } else if (isProperlyDeferred) {
      exposureAccumulator += 0;
    } else if (d?.priority) {
      exposureAccumulator += patchWeight * 0.65;
    } else {
      exposureAccumulator += patchWeight;
    }
  }

  const activeIncidents = state.simulation?.incidents?.filter(
    (inc) => inc.status === 'active',
  ) ?? [];
  const userComplaints = state.simulation?.userComplaints ?? 0;

  const baseSlaPct =
    totalCount > 0 ? Math.round((triagedCount / totalCount) * 100) : 0;
  const slaCompliancePct = Math.max(
    0,
    baseSlaPct - Math.min(25, userComplaints),
  );

  const totalFleet = DEPLOYMENT_RINGS.reduce((acc, r) => acc + r.fleetCount, 0);
  let rawDown = 0;
  let rawDegraded = 0;

  for (const inc of activeIncidents) {
    if (inc.type === 'bsod_loop' || inc.type === 'kerberos_auth') {
      rawDown += inc.affectedCount;
    } else {
      rawDegraded += inc.affectedCount;
    }
  }

  const downAssets = Math.min(totalFleet, rawDown);
  const degradedAssets = Math.min(totalFleet - downAssets, rawDegraded);
  const operationalAssets = Math.max(0, totalFleet - downAssets - degradedAssets);
  const networkHealthPct =
    totalFleet > 0
      ? Math.max(
          0,
          Math.round(
            ((totalFleet - downAssets - degradedAssets * 0.4) / totalFleet) * 100,
          ),
        )
      : 100;

  const exposureScore =
    maxExposure > 0 ? Math.round((exposureAccumulator / maxExposure) * 100) : 0;

  let exposureRiskLevel: GlobalMetrics['exposureRiskLevel'] = 'Controlado';
  if (exposureScore >= 75) {
    exposureRiskLevel = 'Crítico';
  } else if (exposureScore >= 50) {
    exposureRiskLevel = 'Alto';
  } else if (exposureScore >= 25) {
    exposureRiskLevel = 'Moderado';
  }

  const unlockedMap = getUnlockedPatchesMap(state);
  const approvedRfcCount = state.rfcSubmissions.filter(
    (s) => s.status === 'APROBADO',
  ).length;

  return {
    slaCompliancePct,
    triagedCount,
    totalActionableCount: totalCount,
    queuedRfcCount,
    approvedRfcCount,
    unlockedPatchCount: unlockedMap.size,
    kevTotalCount,
    kevMitigatedCount,
    networkHealthPct,
    operationalAssets,
    degradedAssets,
    downAssets,
    totalAssets: totalFleet || assets.length,
    exposureRiskLevel,
    exposureScore,
    activeIncidentsCount: activeIncidents.length,
    userComplaints,
  };
}

export interface UnlockedPatchApproval {
  rfcCode: string;
  rings: DeploymentRingId[];
  approvedAt: string;
}

export function getUnlockedPatchesMap(
  state: LabState,
): Map<string, UnlockedPatchApproval> {
  const map = new Map<string, UnlockedPatchApproval>();
  for (const sub of state.rfcSubmissions) {
    if (sub.status !== 'APROBADO' || !sub.rfcCode) continue;
    for (const patchId of sub.input.selectedPatchIds) {
      const existing = map.get(patchId);
      if (existing) {
        const mergedRings = Array.from(
          new Set([...existing.rings, ...sub.input.targetRings]),
        );
        map.set(patchId, {
          rfcCode: sub.rfcCode,
          rings: mergedRings,
          approvedAt: sub.submittedAt,
        });
      } else {
        map.set(patchId, {
          rfcCode: sub.rfcCode,
          rings: [...sub.input.targetRings],
          approvedAt: sub.submittedAt,
        });
      }
    }
  }
  return map;
}

export interface WsusHygieneMetrics {
  supersededApprovedIds: string[];
  arm64ApprovedIds: string[];
  wastedBandwidthMb: number;
  wastedRebootMinutes: number;
}

export function computeWsusHygieneMetrics(
  state: LabState,
  bulletins: PatchBulletin[],
): WsusHygieneMetrics {
  const supersededApprovedIds: string[] = [];
  const arm64ApprovedIds: string[] = [];
  let wastedBandwidthMb = 0;
  let wastedRebootMinutes = 0;

  for (const b of bulletins) {
    const app = state.wsusApprovals[b.id];
    if (!app || app.declinedGlobally) continue;

    const approvedRings = DEPLOYMENT_RINGS.filter(
      (r) => app.rings[r.id]?.action === 'Approved for Install',
    );
    if (approvedRings.length === 0) continue;

    const totalEndpoints = approvedRings.reduce((acc, r) => acc + r.fleetCount, 0);

    if (b.supersededBy) {
      supersededApprovedIds.push(b.id);
      wastedBandwidthMb += b.sizeMb * totalEndpoints;
      wastedRebootMinutes +=
        (b.requiresReboot === 'Nunca' ? 2 : 18) * approvedRings.length;
    } else if (b.architecture === 'ARM64') {
      arm64ApprovedIds.push(b.id);
      wastedBandwidthMb += b.sizeMb * approvedRings.length;
    }
  }

  return {
    supersededApprovedIds,
    arm64ApprovedIds,
    wastedBandwidthMb,
    wastedRebootMinutes,
  };
}

export interface CvssComponentItem {
  code: string;
  label: string;
  value: string;
}

const CVSS_MAP: Record<string, { label: string; values: Record<string, string> }> = {
  AV: {
    label: 'Vector de Ataque',
    values: { N: 'Red (Remoto)', A: 'Red Adyacente', L: 'Local', P: 'Físico' },
  },
  AC: {
    label: 'Complejidad',
    values: { L: 'Baja', H: 'Alta' },
  },
  PR: {
    label: 'Privilegios Req.',
    values: { N: 'Ninguno', L: 'Bajos', H: 'Altos' },
  },
  UI: {
    label: 'Interacción Usuario',
    values: { N: 'Ninguna', R: 'Requerida' },
  },
  S: {
    label: 'Alcance (Scope)',
    values: { U: 'Sin cambios', C: 'Cambiado' },
  },
  C: {
    label: 'Confidencialidad',
    values: { H: 'Alta', L: 'Baja', N: 'Nula' },
  },
  I: {
    label: 'Integridad',
    values: { H: 'Alta', L: 'Baja', N: 'Nula' },
  },
  A: {
    label: 'Disponibilidad',
    values: { H: 'Alta', L: 'Baja', N: 'Nula' },
  },
};

export function parseCvssVector(vector: string): CvssComponentItem[] {
  const parts = vector.split('/').slice(1);
  return parts
    .map((part) => {
      const [key, val] = part.split(':');
      const def = CVSS_MAP[key];
      if (!def) return null;
      return {
        code: `${key}:${val}`,
        label: def.label,
        value: def.values[val] ?? val,
      };
    })
    .filter((item): item is CvssComponentItem => item !== null);
}

export function evaluateTriageFeedback(
  bulletin: PatchBulletin,
  assigned?: OperationalPriority,
): {
  status: 'pending' | 'optimal' | 'acceptable' | 'suboptimal';
  headline: string;
  detail: string;
} {
  if (!assigned) {
    return {
      status: 'pending',
      headline: 'Pendiente de clasificación operativa',
      detail:
        'Analiza el balance entre CVSS, EPSS, presencia en CISA KEV y activos afectados antes de asignar P1–P4.',
    };
  }

  if (bulletin.supersededBy) {
    if (assigned === 'P4') {
      return {
        status: 'optimal',
        headline: 'Decisión óptima de higiene WSUS',
        detail: `Correcto: ${bulletin.id} está reemplazado por ${bulletin.supersededBy}. Diferirlo como P4 evita conflictos de dependencias y reinicios duplicados.`,
      };
    }
    return {
      status: 'suboptimal',
      headline: 'Advertencia: Boletín reemplazado (Superseded)',
      detail: `Este parche fue reemplazado por ${bulletin.supersededBy}. Aprobarlo en ${assigned} viola las buenas prácticas WSUS; considera P4 y prioriza ${bulletin.supersededBy}.`,
    };
  }

  if (assigned === bulletin.recommendedPriority) {
    return {
      status: 'optimal',
      headline: `Clasificación óptima (${assigned})`,
      detail: bulletin.pedagogicalRationale,
    };
  }

  if (bulletin.inCisaKev && (assigned === 'P3' || assigned === 'P4')) {
    return {
      status: 'suboptimal',
      headline: 'Riesgo crítico subestimado (CISA KEV activo)',
      detail: `${bulletin.id} figura en CISA KEV con explotación activa (${Math.round(
        bulletin.epssScore * 100,
      )}% EPSS). Asignar ${assigned} incumpliría el SLA de emergencia.`,
    };
  }

  if (
    bulletin.cvssScore >= 9.0 &&
    bulletin.epssScore <= 0.05 &&
    !bulletin.inCisaKev &&
    assigned === 'P1'
  ) {
    return {
      status: 'suboptimal',
      headline: 'Falsa emergencia por CVSS teórico',
      detail: `Aunque el CVSS es ${bulletin.cvssScore}, su EPSS es apenas ${Math.round(
        bulletin.epssScore * 100,
      )}% sin explotación activa (KEV=No). P1 consume ventanas de emergencia innecesariamente.`,
    };
  }

  return {
    status: 'acceptable',
    headline: `Clasificación ${assigned} registrada (Recomendada: ${bulletin.recommendedPriority})`,
    detail: bulletin.pedagogicalRationale,
  };
}

export interface CtfFlagStatus {
  id: string;
  code: string;
  title: string;
  description: string;
  completed: boolean;
  hint: string;
}

export function evaluateCtfFlags(state: LabState): CtfFlagStatus[] {
  const d = state.triageDecisions;

  const flag1Done =
    d['KB5036893']?.priority === 'P1' &&
    Boolean(d['KB5036893']?.queuedForRfc) &&
    (d['APACHE-2.4.62']?.priority === 'P2' || d['APACHE-2.4.62']?.priority === 'P3');

  const flag2Done =
    d['KB5029377']?.priority === 'P4' &&
    d['KB5034848']?.priority === 'P1' &&
    Boolean(d['KB5034848']?.queuedForRfc);

  const activeKevs = PATCH_BULLETINS.filter((b) => b.inCisaKev && !b.supersededBy);
  const flag3Done = activeKevs.every(
    (b) =>
      (d[b.id]?.priority === 'P1' || (b.id === 'XZ-5.6.1-REV' && d[b.id]?.priority === 'P2')) &&
      Boolean(d[b.id]?.queuedForRfc),
  );

  const flag4Done =
    state.inspectedAssetIds.includes('DC-CORE-02') ||
    state.inspectedAssetIds.includes('PRT-SRV-01');

  const approvedSubmissions = state.rfcSubmissions.filter(
    (s) => s.status === 'APROBADO',
  );

  const flag5Done = approvedSubmissions.some(
    (s) =>
      s.input.targetRings.includes('ring-2') ||
      s.input.targetRings.includes('ring-3'),
  );

  const flag6Done = approvedSubmissions.some(
    (s) =>
      s.input.changeType === 'Emergencia' &&
      s.input.selectedPatchIds.some((id) => {
        const b = PATCH_BULLETINS.find((p) => p.id === id);
        return Boolean(b?.inCisaKev);
      }) &&
      (s.input.rollbackStrategy === 'hypervisor-snapshot' ||
        s.input.rollbackStrategy === 'cluster-failover'),
  );

  const flag7Done = PATCH_BULLETINS.some((b) => {
    const app = state.wsusApprovals[b.id];
    if (!app || app.declinedGlobally) return false;
    return (
      (app.rings['ring-2']?.action === 'Approved for Install' &&
        Boolean(app.rings['ring-2']?.linkedRfcCode)) ||
      (app.rings['ring-3']?.action === 'Approved for Install' &&
        Boolean(app.rings['ring-3']?.linkedRfcCode))
    );
  });

  const declinedSuperseded =
    state.wsusApprovals['KB5029377']?.declinedGlobally &&
    state.wsusApprovals['KB5026361']?.declinedGlobally;
  const declinedArm64 = state.wsusApprovals['KB5037224']?.declinedGlobally;
  const flag8Done = Boolean(declinedSuperseded && declinedArm64);

  const incidents = state.simulation?.incidents ?? [];
  const flag9Done = incidents.some(
    (inc) => inc.type === 'wua_error' && inc.status === 'resolved',
  );
  const flag10Done = incidents.some(
    (inc) =>
      (inc.type === 'bsod_loop' ||
        inc.type === 'kerberos_auth' ||
        inc.type === 'service_down') &&
      inc.status === 'resolved',
  );

  return [
    {
      id: 'flag-epss-paradox',
      code: 'CTF-01',
      title: 'La paradoja CVSS vs EPSS',
      description:
        'Prioriza KB5036893 (CVSS 7.8 / EPSS 92% / KEV) como P1 en cola RFC y clasifica APACHE-2.4.62 (CVSS 9.8 / EPSS 2%) como P2 o P3 sin pánico.',
      completed: flag1Done,
      hint: 'Compara ambos boletines en la Matriz 2D de Triage.',
    },
    {
      id: 'flag-superseded',
      code: 'CTF-02',
      title: 'Higiene de catálogo WSUS',
      description:
        'Detecta el parche reemplazado KB5029377 (márcalo como P4 - Diferir/Omitir) y envía su reemplazo KB5034848 como P1 a la cola RFC.',
      completed: flag2Done,
      hint: 'Revisa el campo "Reemplazado por" en el Inspector Pedagógico.',
    },
    {
      id: 'flag-kev-sweep',
      code: 'CTF-03',
      title: 'Contención total CISA KEV',
      description:
        'Clasifica y envía a cola RFC todos los boletines activos de CISA KEV (P1 para producción/perímetro, P1 o P2 para XZ-5.6.1-REV en laboratorio).',
      completed: flag3Done,
      hint: 'Usa el filtro "Solo CISA KEV" en la barra de herramientas de Triage.',
    },
    {
      id: 'flag-ring-recon',
      code: 'CTF-04',
      title: 'Reconocimiento de dependencias en Anillos',
      description:
        'Inspecciona PRT-SRV-01 (Anillo 2) o DC-CORE-02 (Anillo 3) dentro de la Consola WSUS para identificar riesgos de controladores y prerequisitos.',
      completed: flag4Done,
      hint: 'Navega al módulo "Consola WSUS & Anillos" y selecciona uno de esos servidores.',
    },
    {
      id: 'flag-cab-prod-unlock',
      code: 'CTF-05',
      title: 'Sello CAB para Producción (Anillo 2 / Anillo 3)',
      description:
        'Completa un formulario RFC válido para Anillo 2 o Anillo 3 con ventana nocturna y rollback coherente hasta obtener un dictamen APROBADO (RFC-2026-XXXX).',
      completed: flag5Done,
      hint: 'Evita ventanas en horario laboral o periodos Blackout y elige un plan de rollback compatible.',
    },
    {
      id: 'flag-cab-expedited-kev',
      code: 'CTF-06',
      title: 'RFC de Emergencia KEV con Snapshot / Failover',
      description:
        'Tramita y logra aprobación CAB de un Cambio de Emergencia (Expedited) para al menos un boletín CISA KEV respaldado por Snapshot de hipervisor o Conmutación Failover.',
      completed: flag6Done,
      hint: 'Incluye justificación técnica ≥ 25 caracteres en el Módulo 2 (Gestión de Cambios).',
    },
    {
      id: 'flag-wsus-ring-deploy',
      code: 'CTF-07',
      title: 'Despliegue WSUS con Gobernanza RFC en Producción',
      description:
        'Aprueba para instalación (Approved for Install) un parche en Ring 2 o Ring 3 dentro de la Consola WSUS vinculando un código RFC-2026-XXXX aprobado.',
      completed: flag7Done,
      hint: 'Usa el botón "Approve Updates..." en la Consola WSUS (Módulo 3).',
    },
    {
      id: 'flag-wsus-decline-hygiene',
      code: 'CTF-08',
      title: 'Limpieza WSUS: Cadena de Supersedencia y ARM64',
      description:
        'Declina en WSUS los boletines reemplazados (KB5026361 y KB5029377) y el paquete ARM64 no aplicable (KB5037224) para evitar consumo inútil de ancho de banda.',
      completed: flag8Done,
      hint: 'Filtra en WSUS por Updates o busca KB5026361, KB5029377 y KB5037224 y márcalos como Declined.',
    },
    {
      id: 'flag-sim-wua-remediate',
      code: 'CTF-09',
      title: 'Diagnóstico y Remediación de Agente WUA (WinRM)',
      description:
        'Ejecuta un ciclo de simulación o escaneo wuauclt /reportnow y resuelve al menos un error real de agente Windows Update (0x800f0922, 0x8024402c o 0x80070005) vía terminal WinRM.',
      completed: flag9Done,
      hint: 'En el Módulo 4, abre la Terminal WinRM y ejecuta Resize-WinRE o Reset-WuAgent sobre el equipo afectado.',
    },
    {
      id: 'flag-sim-emergency-rollback',
      code: 'CTF-10',
      title: 'Rollback de Emergencia ante Regresión (BSOD / Kerberos)',
      description:
        'Contén una regresión crítica de parche en Producción (BSOD, Kerberos o caída IIS) mediante WSUS Approved for Removal, DISM /Remove-Package, Restart-Service o Snapshot de Hipervisor.',
      completed: flag10Done,
      hint: 'Ejecuta la Ventana Nocturna (o el Simulacro de Crisis) en el Módulo 4 y aplica la vía de recuperación adecuada según si el nodo responde por WinRM.',
    },
  ];
}
