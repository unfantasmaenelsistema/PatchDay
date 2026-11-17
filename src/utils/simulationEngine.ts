import { DEPLOYMENT_RINGS, PATCH_BULLETINS } from '../data/initialData';
import {
  DeploymentRingId,
  GuidedMissionId,
  LabState,
  SimulationIncident,
  SimulationLogEntry,
  SimulationState,
  TerminalHistoryEntry,
} from '../types/patchday';

const DAYS_ES = [
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
  'Lunes',
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function formatSimClock(hoursElapsed: number): {
  shortClock: string;
  fullLabel: string;
  isNightWindow: boolean;
  dayName: string;
  hour: number;
} {
  // Starts Tuesday 09:00
  const totalHoursFromTueMidnight = 9 + hoursElapsed;
  const dayIndex = Math.floor(totalHoursFromTueMidnight / 24) % DAYS_ES.length;
  const hour = totalHoursFromTueMidnight % 24;
  const dayName = DAYS_ES[dayIndex];
  const hh = String(hour).padStart(2, '0');
  const shortClock = `${dayName} · ${hh}:00`;

  const isNight = hour >= 1 && hour <= 6;
  const isBusiness =
    dayName !== 'Sábado' && dayName !== 'Domingo' && hour >= 8 && hour < 19;

  const fullLabel = isNight
    ? `${shortClock} (Ventana Nocturna)`
    : isBusiness
      ? `${shortClock} (Horario Laboral)`
      : `${shortClock} (Fuera de Jornada)`;

  return {
    shortClock,
    fullLabel,
    isNightWindow: isNight,
    dayName,
    hour,
  };
}

function appendLog(
  logs: SimulationLogEntry[],
  entry: Omit<SimulationLogEntry, 'id'>,
): SimulationLogEntry[] {
  return [{ id: uid('log'), ...entry }, ...logs].slice(0, 80);
}

function upsertIncident(
  incidents: SimulationIncident[],
  next: SimulationIncident,
): SimulationIncident[] {
  const idx = incidents.findIndex((i) => i.id === next.id);
  if (idx === -1) {
    return [next, ...incidents];
  }
  // Do not re-open an incident that the student already resolved cleanly
  if (incidents[idx].status === 'resolved') {
    return incidents;
  }
  const copy = [...incidents];
  copy[idx] = next;
  return copy;
}

function isForcedDeadline(deadline?: string): boolean {
  if (!deadline) return false;
  return (
    deadline.includes('Forzado') ||
    deadline.includes('Inmediato') ||
    deadline.includes('Auto-Aprobación')
  );
}

export function advanceSimulationTime(
  state: LabState,
  mode: '4h' | 'night_window' | 'reportnow',
): LabState {
  const sim = state.simulation;
  let nextHours = sim.simHoursElapsed;
  let logs = [...sim.eventLogs];
  let incidents = [...sim.incidents];
  const nextSoak = { ...sim.ringSoakHours };
  const nextInstalled: Record<DeploymentRingId, string[]> = {
    'ring-0': [...sim.installedPatchesByRing['ring-0']],
    'ring-1': [...sim.installedPatchesByRing['ring-1']],
    'ring-2': [...sim.installedPatchesByRing['ring-2']],
    'ring-3': [...sim.installedPatchesByRing['ring-3']],
  };
  let userComplaints = sim.userComplaints;
  let nextApprovals = { ...state.wsusApprovals };

  if (mode === '4h') {
    nextHours += 4;
  } else if (mode === 'night_window') {
    // Jump to next nocturnal maintenance window (02:00 / Sábado-Domingo cycle)
    const curHour = (9 + nextHours) % 24;
    const hoursToTwoAm = curHour < 2 ? 2 - curHour : 24 - curHour + 2;
    nextHours += Math.max(4, hoursToTwoAm);
  }

  const clock = formatSimClock(nextHours);
  const deltaHours = Math.max(0, nextHours - sim.simHoursElapsed);

  if (mode === 'reportnow') {
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdateClient',
      severity: 'info',
      eventId: '16',
      host: 'Flota WSUS (197 eq)',
      message:
        'Ejecutado comando remoto: wuauclt /reportnow && UsoClient StartScan. Sincronizando metadatos con SRV-WSUS-01.',
    });
  } else if (mode === '4h') {
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WSUS',
      severity: 'info',
      eventId: '10035',
      host: 'SRV-WSUS-01',
      message: `Avance temporal +4h (${clock.fullLabel}). Evaluando anillos de prueba Ring 0/1 y fechas límite (Deadlines).`,
    });
  } else {
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WSUS',
      severity: 'info',
      eventId: '10040',
      host: 'SRV-WSUS-01',
      message: `Iniciada Ventana de Mantenimiento Nocturna (${clock.shortClock}). Procesando descargas e instalaciones aprobadas en Rings 0–3.`,
    });
  }

  // 1. Accumulate soak time in Ring 0 / Ring 1 when time advances
  if (deltaHours > 0) {
    for (const b of PATCH_BULLETINS) {
      const app = nextApprovals[b.id];
      if (!app || app.declinedGlobally) continue;
      const inLabOrPilot =
        app.rings['ring-0']?.action === 'Approved for Install' ||
        app.rings['ring-1']?.action === 'Approved for Install';

      if (inLabOrPilot) {
        const prevSoak = nextSoak[b.id] ?? 0;
        const addedSoak = mode === 'night_window' ? Math.max(deltaHours, 24) : deltaHours;
        nextSoak[b.id] = prevSoak + addedSoak;

        if (!nextInstalled['ring-0'].includes(b.id) && app.rings['ring-0']?.action === 'Approved for Install') {
          nextInstalled['ring-0'].push(b.id);
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'WindowsUpdateClient',
            severity: 'success',
            eventId: '19',
            host: 'LAB-WIN11-01 (Ring 0)',
            message: `Instalación completada en sandbox: ${b.id} (${b.title}). Soak acumulado: ${nextSoak[b.id]}h.`,
          });
        }

        // Early detection in Ring 0/1 for KB5036893
        if (b.id === 'KB5036893' && prevSoak === 0) {
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'System',
            severity: 'warning',
            eventId: '41',
            host: 'LAB-WIN11-01 (Ring 0)',
            message:
              'Telemetría temprana Ring 0: KB5036893 detectó conflicto potencial con controlador Kyocera v3 / hook EDR. Se recomienda completar 24h de soak y verificar PRT-SRV-01 antes de Ring 2.',
          });
        }

        // Ring 1 Pilot check for KB5034441 -> triggers Case C 0x800f0922 on WS-IT-09
        if (
          b.id === 'KB5034441' &&
          app.rings['ring-1']?.action === 'Approved for Install'
        ) {
          const alreadyResolved = incidents.some(
            (i) => i.id === 'inc-wua-0x800f0922' && i.status === 'resolved',
          );
          if (!alreadyResolved) {
            incidents = upsertIncident(incidents, {
              id: 'inc-wua-0x800f0922',
              patchId: 'KB5034441',
              ringId: 'ring-1',
              targetHostLabel: 'WS-IT-09.corp.local',
              affectedCount: 1,
              type: 'wua_error',
              errorCode: '0x800f0922',
              title: 'Fallo agente WUA 0x800f0922 en WS-IT-09 (Partición WinRE llena)',
              detail:
                'CBS_E_INSTALL_FAILED (0x800f0922): la partición de recuperación WinRE en WS-IT-09 solo dispone de 190 MB (requiere ≥ 250 MB libres) al aplicar KB5034441.',
              recommendedFix: 'winrm_winre',
              winrmReachable: true,
              status: 'active',
              detectedAtClock: clock.shortClock,
            });
            logs = appendLog(logs, {
              simClock: clock.shortClock,
              source: 'WindowsUpdateClient',
              severity: 'error',
              eventId: '20',
              host: 'WS-IT-09',
              message:
                'Error 0x800f0922 (CBS_E_INSTALL_FAILED) al instalar KB5034441: partición WinRE insuficiente (< 250 MB). Ejecutar Resize-WinRE vía WinRM.',
            });
          }
        }

        // Ring 1 Pilot regression for KB5035432 (SQL Server CU12) -> Mission 3
        if (
          b.id === 'KB5035432' &&
          app.rings['ring-1']?.action === 'Approved for Install'
        ) {
          const alreadyResolved = incidents.some(
            (i) => i.id === 'inc-pilot-sql-ring1' && i.status === 'resolved',
          );
          if (!alreadyResolved) {
            incidents = upsertIncident(incidents, {
              id: 'inc-pilot-sql-ring1',
              patchId: 'KB5035432',
              ringId: 'ring-1',
              targetHostLabel: 'DEV-SQL-01.corp.local',
              affectedCount: 1,
              type: 'service_down',
              errorCode: 'MSSQLSERVER_DOWN (7031)',
              title: 'Caída de servicio MSSQLSERVER en DEV-SQL-01 (Anillo 1 Piloto)',
              detail:
                'Al probar KB5035432 en Anillo 1, el servicio MSSQLSERVER falló tras el reinicio. Bloquea promoción a Ring 2/3 y ejecuta rollback (wusa /uninstall /kb:5035432 o Approved for Removal en Ring 1).',
              recommendedFix: 'winrm_wusa',
              winrmReachable: true,
              status: 'active',
              detectedAtClock: clock.shortClock,
            });
            logs = appendLog(logs, {
              simClock: clock.shortClock,
              source: 'System',
              severity: 'error',
              eventId: '7031',
              host: 'DEV-SQL-01 (Ring 1)',
              message:
                'Servicio MSSQLSERVER terminado de forma inesperada tras aplicar KB5035432 en Anillo 1 Piloto. NO promover a Ring 2.',
            });
          }
        }
      }
    }
  }

  // 2. Process WSUS 'Approved for Removal' when running reportnow or night_window
  if (mode === 'reportnow' || mode === 'night_window') {
    for (const b of PATCH_BULLETINS) {
      const app = nextApprovals[b.id];
      if (!app) continue;
      for (const ring of DEPLOYMENT_RINGS) {
        if (app.rings[ring.id]?.action === 'Approved for Removal') {
          // Resolve any reachable incidents for this patch & ring
          let removedAny = false;
          incidents = incidents.map((inc) => {
            if (
              inc.status === 'active' &&
              inc.patchId === b.id &&
              inc.ringId === ring.id &&
              inc.winrmReachable
            ) {
              removedAny = true;
              return {
                ...inc,
                status: 'resolved',
                resolvedAtClock: clock.shortClock,
                resolutionMethod: `WSUS Approved for Removal (${ring.shortName})`,
              };
            }
            return inc;
          });
          nextInstalled[ring.id] = nextInstalled[ring.id].filter((id) => id !== b.id);
          if (removedAny) {
            logs = appendLog(logs, {
              simClock: clock.shortClock,
              source: 'WSUS',
              severity: 'success',
              eventId: '10045',
              host: `${ring.wsusGroupName}`,
              message: `Agentes operativos completaron desinstalación por WSUS (Approved for Removal) de ${b.id}.`,
            });
          }
        }
      }
    }
  }

  // 3. Forced Deadlines during Business Hours -> User complaints & SLA impact!
  if (mode === '4h' && !clock.isNightWindow) {
    for (const b of PATCH_BULLETINS) {
      const app = nextApprovals[b.id];
      if (!app || app.declinedGlobally || b.requiresReboot === 'Nunca') continue;

      (['ring-2', 'ring-3'] as DeploymentRingId[]).forEach((ringId) => {
        const ringApp = app.rings[ringId];
        if (
          ringApp?.action === 'Approved for Install' &&
          isForcedDeadline(ringApp.deadline)
        ) {
          const count = ringId === 'ring-2' ? 14 : 3;
          userComplaints += count;
          const incId = `inc-deadline-${ringId}-${b.id}`;
          incidents = upsertIncident(incidents, {
            id: incId,
            patchId: b.id,
            ringId,
            targetHostLabel:
              ringId === 'ring-2'
                ? 'Ring 2 · 150 Estaciones Producción'
                : 'Ring 3 · Servidores Críticos',
            affectedCount: ringId === 'ring-2' ? 18 : 2,
            type: 'deadline_complaint',
            errorCode: 'REBOOT_FORCED_161',
            title: `Reinicio forzado en horario laboral por Deadline vencido (${b.id})`,
            detail: `El Deadline "${ringApp.deadline}" forzó el reinicio inmediato de equipos en ${
              ringId === 'ring-2' ? 'Ring 2 Producción' : 'Ring 3 Crítico'
            } durante jornada laboral, generando ${count} tickets críticos en Helpdesk y caída de SLA.`,
            recommendedFix: 'wait_window',
            winrmReachable: true,
            status: 'active',
            detectedAtClock: clock.shortClock,
          });
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'Helpdesk',
            severity: 'error',
            eventId: '1074',
            host: ringId === 'ring-2' ? 'Ring 2 (Prod)' : 'Ring 3 (Critical)',
            message: `¡Alerta SLA! Deadline forzado de ${b.id} provocó reinicios no programados en horario laboral (+${count} quejas de usuarios).`,
          });
        }
      });
    }
  }

  // 4. Night Window Execution OR ReportNow Agent Telemetry
  if (mode === 'night_window') {
    for (const b of PATCH_BULLETINS) {
      const app = nextApprovals[b.id];
      if (!app || app.declinedGlobally) continue;

      for (const ring of DEPLOYMENT_RINGS) {
        if (app.rings[ring.id]?.action !== 'Approved for Install') continue;

        if (!nextInstalled[ring.id].includes(b.id)) {
          nextInstalled[ring.id].push(b.id);
        }

        // Case A: KB5036893 on Ring 2
        if (b.id === 'KB5036893' && ring.id === 'ring-2') {
          const soak = nextSoak['KB5036893'] ?? 0;
          if (soak < 24) {
            // Massive Ring 2 BSOD outage!
            incidents = upsertIncident(incidents, {
              id: 'inc-bsod-kb5036893-ws',
              patchId: 'KB5036893',
              ringId: 'ring-2',
              targetHostLabel: 'Ring 2 · 150 Estaciones Windows 11',
              affectedCount: 150,
              type: 'bsod_loop',
              errorCode: 'CRITICAL_PROCESS_DIED (0xEF)',
              title: 'BSOD masivo en 150 estaciones Ring 2 tras instalar KB5036893 sin soak',
              detail:
                'KB5036893 fue desplegado directamente en Ring 2 sin completar 24h de validación en Ring 0/1. Las 150 estaciones presentan bucles CRITICAL_PROCESS_DIED en modo recuperación WinRM.',
              recommendedFix: 'winrm_dism',
              winrmReachable: true,
              status: 'active',
              detectedAtClock: clock.shortClock,
            });
            logs = appendLog(logs, {
              simClock: clock.shortClock,
              source: 'System',
              severity: 'error',
              eventId: '1001',
              host: 'Ring 2 (150 Estaciones)',
              message:
                'BugCheck 0x000000EF (CRITICAL_PROCESS_DIED) tras aplicar KB5036893 sin validación previa Ring 0/1. Desinstalación requerida (WSUS Removal o DISM).',
            });
          } else {
            logs = appendLog(logs, {
              simClock: clock.shortClock,
              source: 'WindowsUpdateClient',
              severity: 'success',
              eventId: '19',
              host: 'Ring 2 (150 Estaciones)',
              message: `Las 150 estaciones Windows 11 instalaron KB5036893 correctamente gracias al soak previo de ${soak}h con exclusión EDR.`,
            });
          }

          // PRT-SRV-01 always suffers Kyocera v3 BSOD regardless of workstation soak
          incidents = upsertIncident(incidents, {
            id: 'inc-bsod-prt-srv-01',
            patchId: 'KB5036893',
            ringId: 'ring-2',
            targetHostLabel: 'PRT-SRV-01.corp.local',
            affectedCount: 1,
            type: 'bsod_loop',
            errorCode: 'KMODE_EXCEPTION_NOT_HANDLED',
            title: 'BSOD en PRT-SRV-01 por conflicto KB5036893 + driver Kyocera v3',
            detail:
              'PRT-SRV-01 no responde por red ni WinRM (bucle BSOD KMODE_EXCEPTION_NOT_HANDLED en win32kfull.sys). Requiere Vía 3: Revertir Snapshot en Hipervisor.',
            recommendedFix: 'hypervisor_snapshot',
            winrmReachable: false,
            status: 'active',
            detectedAtClock: clock.shortClock,
          });
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'System',
            severity: 'error',
            eventId: '1001',
            host: 'PRT-SRV-01',
            message:
              'BugCheck KMODE_EXCEPTION_NOT_HANDLED (Kyocera v3 + KB5036893). Equipo inalcanzable por WinRM/WSUS; requiere Snapshot en Hipervisor.',
          });
        }

        // Case B1: KB5034763 on Ring 3 breaks Kerberos on DC-CORE-02
        if (b.id === 'KB5034763' && ring.id === 'ring-3') {
          incidents = upsertIncident(incidents, {
            id: 'inc-kerberos-dc02',
            patchId: 'KB5034763',
            ringId: 'ring-3',
            targetHostLabel: 'DC-CORE-02.corp.local',
            affectedCount: 1,
            type: 'kerberos_auth',
            errorCode: 'KDC_ERR_PREAUTH_FAILED (4768)',
            title: 'Fallo de autenticación Kerberos/LDAP en DC-CORE-02',
            detail:
              'KB5034763 se aplicó sin el prerequisito KB5032189 en DC-CORE-02. Los servicios KDC y WinRM están bloqueados. Requiere Vía 3: Revertir Snapshot pre-mantenimiento.',
            recommendedFix: 'hypervisor_snapshot',
            winrmReachable: false,
            status: 'active',
            detectedAtClock: clock.shortClock,
          });
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'System',
            severity: 'error',
            eventId: '4768',
            host: 'DC-CORE-02',
            message:
              'Fallo crítico Kerberos PAC/LDAP tras instalar KB5034763 sin KB5032189. WinRM inoperativo; usar Snapshot de Hipervisor.',
          });
        }

        // Case B2: KB5035857 on Ring 3 stops IIS / Exchange / Spooler services
        if (b.id === 'KB5035857' && ring.id === 'ring-3') {
          incidents = upsertIncident(incidents, {
            id: 'inc-service-exch',
            patchId: 'KB5035857',
            ringId: 'ring-3',
            targetHostLabel: 'EXCH-DAG-01.corp.local',
            affectedCount: 1,
            type: 'service_down',
            errorCode: 'SERVICE_STOPPED (7036)',
            title: 'Servicios W3SVC (IIS) y MSExchangeTransport detenidos en EXCH-DAG-01',
            detail:
              'Tras reiniciar EXCH-DAG-01 con KB5035857, los servicios IIS (W3SVC), Spooler y MSExchangeTransport no arrancaron automáticamente. Puede recuperarse con Restart-Service por WinRM.',
            recommendedFix: 'winrm_service',
            winrmReachable: true,
            status: 'active',
            detectedAtClock: clock.shortClock,
          });
          logs = appendLog(logs, {
            simClock: clock.shortClock,
            source: 'System',
            severity: 'error',
            eventId: '7036',
            host: 'EXCH-DAG-01',
            message:
              'Servicios W3SVC y MSExchangeTransport pasaron a estado Detenido tras actualización KB5035857.',
          });
        }
      }
    }
  }

  // Case C: Real Windows Update Agent errors during scan / reportnow / night window
  if (mode === 'reportnow' || mode === 'night_window' || mode === '4h') {
    const resolvedDns = incidents.some(
      (i) => i.id === 'inc-wua-0x8024402c' && i.status === 'resolved',
    );
    if (!resolvedDns) {
      incidents = upsertIncident(incidents, {
        id: 'inc-wua-0x8024402c',
        patchId: 'KB5035001',
        ringId: 'ring-2',
        targetHostLabel: 'WS-OPS-21.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x8024402c',
        title: 'Error de agente WUA 0x8024402c en WS-OPS-21 (Proxy/DNS hacia WSUS)',
        detail:
          'WU_E_PT_WINHTTP_NAME_NOT_RESOLVED (0x8024402c): el cliente no logra resolver SRV-WSUS-01 por configuración WinHTTP proxy residual. Ejecuta Reset-WuAgent vía WinRM.',
        recommendedFix: 'winrm_reset_wu',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      });
    }

    const resolvedAcl = incidents.some(
      (i) => i.id === 'inc-wua-0x80070005' && i.status === 'resolved',
    );
    if (!resolvedAcl && (mode === 'reportnow' || mode === 'night_window')) {
      incidents = upsertIncident(incidents, {
        id: 'inc-wua-0x80070005',
        patchId: 'KB5034848',
        ringId: 'ring-2',
        targetHostLabel: 'FILE-PROD-02.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x80070005',
        title: 'Error de agente WUA 0x80070005 en FILE-PROD-02 (Access Denied)',
        detail:
          'E_ACCESSDENIED (0x80070005) al escribir en C:\\Windows\\SoftwareDistribution\\Download. Ejecuta Reset-WuAgent en WinRM para regenerar permisos y caché.',
        recommendedFix: 'winrm_reset_wu',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      });
    }

    const resolvedWinRe = incidents.some(
      (i) => i.id === 'inc-wua-0x800f0922' && i.status === 'resolved',
    );
    if (!resolvedWinRe && (mode === 'night_window' || mode === 'reportnow')) {
      incidents = upsertIncident(incidents, {
        id: 'inc-wua-0x800f0922',
        patchId: 'KB5034441',
        ringId: 'ring-1',
        targetHostLabel: 'WS-IT-09.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x800f0922',
        title: 'Fallo agente WUA 0x800f0922 en WS-IT-09 (Partición WinRE llena)',
        detail:
          'CBS_E_INSTALL_FAILED (0x800f0922): la partición WinRE de WS-IT-09 tiene menos de 250 MB libres para KB5034441. Ejecuta Resize-WinRE vía WinRM.',
        recommendedFix: 'winrm_winre',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      });
    }
  }

  return {
    ...state,
    wsusApprovals: nextApprovals,
    simulation: {
      ...sim,
      simHoursElapsed: nextHours,
      simClockLabel: clock.fullLabel,
      isNightWindow: clock.isNightWindow,
      ringSoakHours: nextSoak,
      installedPatchesByRing: nextInstalled,
      incidents,
      eventLogs: logs,
      userComplaints,
      lastScanClock: mode === 'reportnow' ? clock.shortClock : sim.lastScanClock,
    },
  };
}

/**
 * Triggers a realistic multi-ring regression drill so learners can practice
 * all 3 rollback paths immediately even before configuring all WSUS approvals.
 */
export function triggerRegressionDrill(state: LabState): LabState {
  const sim = state.simulation;
  const nextHours = sim.simHoursElapsed + 2;
  const clock = formatSimClock(nextHours);
  let logs = [...sim.eventLogs];
  let incidents = [...sim.incidents];

  const drillIncidents: SimulationIncident[] = [
    {
      id: 'inc-bsod-kb5036893-ws',
      patchId: 'KB5036893',
      ringId: 'ring-2',
      targetHostLabel: 'Ring 2 · 150 Estaciones Windows 11',
      affectedCount: 150,
      type: 'bsod_loop',
      errorCode: 'CRITICAL_PROCESS_DIED (0xEF)',
      title: 'BSOD masivo en 150 estaciones Ring 2 tras instalar KB5036893',
      detail:
        'KB5036893 provocó bucle CRITICAL_PROCESS_DIED por conflicto EDR en estaciones Ring 2. Desinstala mediante Vía 1 (WSUS Removal + UsoClient) o Vía 2 (DISM /Remove-Package).',
      recommendedFix: 'winrm_dism',
      winrmReachable: true,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
    {
      id: 'inc-bsod-prt-srv-01',
      patchId: 'KB5036893',
      ringId: 'ring-2',
      targetHostLabel: 'PRT-SRV-01.corp.local',
      affectedCount: 1,
      type: 'bsod_loop',
      errorCode: 'KMODE_EXCEPTION_NOT_HANDLED',
      title: 'BSOD total en PRT-SRV-01 (Driver Kyocera v3 + KB5036893)',
      detail:
        'PRT-SRV-01 está en bucle BSOD sin acceso WinRM ni agente WSUS. Requiere Vía 3: Revertir Snapshot en Hipervisor.',
      recommendedFix: 'hypervisor_snapshot',
      winrmReachable: false,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
    {
      id: 'inc-kerberos-dc02',
      patchId: 'KB5034763',
      ringId: 'ring-3',
      targetHostLabel: 'DC-CORE-02.corp.local',
      affectedCount: 1,
      type: 'kerberos_auth',
      errorCode: 'KDC_ERR_PREAUTH_FAILED (4768)',
      title: 'Fallo Kerberos/LDAP en DC-CORE-02 tras KB5034763 sin KB5032189',
      detail:
        'Controlador de dominio secundario bloqueado sin prerequisito KB5032189. WinRM inoperativo; usar Vía 3 (Snapshot Pre-Mantenimiento).',
      recommendedFix: 'hypervisor_snapshot',
      winrmReachable: false,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
    {
      id: 'inc-service-exch',
      patchId: 'KB5035857',
      ringId: 'ring-3',
      targetHostLabel: 'EXCH-DAG-01.corp.local',
      affectedCount: 1,
      type: 'service_down',
      errorCode: 'SERVICE_STOPPED (7036)',
      title: 'Servicios IIS (W3SVC) y MSExchangeTransport caídos en EXCH-DAG-01',
      detail:
        'Los servicios de mensajería y cola de impresión se detuvieron tras aplicar KB5035857. Recuperable con Restart-Service vía WinRM.',
      recommendedFix: 'winrm_service',
      winrmReachable: true,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
    {
      id: 'inc-wua-0x800f0922',
      patchId: 'KB5034441',
      ringId: 'ring-1',
      targetHostLabel: 'WS-IT-09.corp.local',
      affectedCount: 1,
      type: 'wua_error',
      errorCode: '0x800f0922',
      title: 'Error WUA 0x800f0922 en WS-IT-09 (Partición WinRE < 250 MB)',
      detail:
        'Fallo de actualización de entorno de recuperación WinRE. Ejecutar Resize-WinRE vía WinRM.',
      recommendedFix: 'winrm_winre',
      winrmReachable: true,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
    {
      id: 'inc-wua-0x8024402c',
      patchId: 'KB5035001',
      ringId: 'ring-2',
      targetHostLabel: 'WS-OPS-21.corp.local',
      affectedCount: 1,
      type: 'wua_error',
      errorCode: '0x8024402c',
      title: 'Error WUA 0x8024402c en WS-OPS-21 (Proxy/DNS WSUS)',
      detail:
        'WU_E_PT_WINHTTP_NAME_NOT_RESOLVED hacia SRV-WSUS-01. Ejecutar Reset-WuAgent vía WinRM.',
      recommendedFix: 'winrm_reset_wu',
      winrmReachable: true,
      status: 'active',
      detectedAtClock: clock.shortClock,
    },
  ];

  for (const inc of drillIncidents) {
    incidents = upsertIncident(incidents, inc);
  }

  logs = appendLog(logs, {
    simClock: clock.shortClock,
    source: 'System',
    severity: 'error',
    eventId: '1001',
    host: 'Producción (Rings 1–3)',
    message:
      'Simulacro de Crisis activado: regresiones detectadas en Ring 2 (KB5036893 BSOD), Ring 3 (DC-CORE-02 Kerberos / EXCH-DAG-01 W3SVC) y errores WUA 0x800f0922 / 0x8024402c.',
  });

  return {
    ...state,
    simulation: {
      ...sim,
      simHoursElapsed: nextHours,
      simClockLabel: clock.fullLabel,
      isNightWindow: clock.isNightWindow,
      incidents,
      eventLogs: logs,
    },
  };
}

/**
 * Vía 1: WSUS Approved for Removal + Deadline: Inmediato
 */
export function applyWsusRemovalFix(
  state: LabState,
  patchId: string,
  ringId: DeploymentRingId,
): LabState {
  const sim = state.simulation;
  const clock = formatSimClock(sim.simHoursElapsed);
  const existingApp = state.wsusApprovals[patchId] ?? {
    declinedGlobally: false,
    rings: {
      'ring-0': { action: 'Not Approved' },
      'ring-1': { action: 'Not Approved' },
      'ring-2': { action: 'Not Approved' },
      'ring-3': { action: 'Not Approved' },
    },
  };

  const nextApprovals = {
    ...state.wsusApprovals,
    [patchId]: {
      ...existingApp,
      declinedGlobally: false,
      rings: {
        ...existingApp.rings,
        [ringId]: {
          action: 'Approved for Removal' as const,
          deadline: 'Inmediato (Rollback de Emergencia)',
          updatedAt: new Date().toISOString(),
        },
      },
    },
  };

  let resolvedCount = 0;
  let unreachableBlocked = false;

  const nextIncidents = sim.incidents.map((inc) => {
    if (
      inc.status === 'active' &&
      inc.patchId === patchId &&
      inc.ringId === ringId
    ) {
      if (inc.winrmReachable) {
        resolvedCount += 1;
        return {
          ...inc,
          status: 'resolved' as const,
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 1: WSUS Approved for Removal (Deadline: Inmediato)',
        };
      } else {
        unreachableBlocked = true;
      }
    }
    return inc;
  });

  let logs = [...sim.eventLogs];
  logs = appendLog(logs, {
    simClock: clock.shortClock,
    source: 'WSUS',
    severity: resolvedCount > 0 ? 'success' : 'warning',
    eventId: '10046',
    host: 'SRV-WSUS-01',
    message:
      resolvedCount > 0
        ? `Aprobado para eliminación (Approved for Removal · Deadline Inmediato) ${patchId} en ${ringId}. ${resolvedCount} grupo(s) operativos revertidos.`
        : `Marcado ${patchId} como Approved for Removal en ${ringId}. ${
            unreachableBlocked
              ? 'ATENCIÓN: equipos en BSOD total (sin agente WUA vivo) no pudieron recibir la orden; usar Hipervisor Snapshot.'
              : 'Pendiente de próximo check-in.'
          }`,
  });

  return {
    ...state,
    wsusApprovals: nextApprovals,
    simulation: {
      ...sim,
      incidents: nextIncidents,
      eventLogs: logs,
      installedPatchesByRing: {
        ...sim.installedPatchesByRing,
        [ringId]: sim.installedPatchesByRing[ringId].filter((id) => id !== patchId),
      },
    },
  };
}

/**
 * Vía 2: Interactive PowerShell / WinRM Remote Terminal
 */
export function executeWinRmCommand(
  state: LabState,
  targetHost: string,
  rawCommand: string,
): LabState {
  const cmd = rawCommand.trim();
  if (!cmd) return state;

  const sim = state.simulation;
  const clock = formatSimClock(sim.simHoursElapsed);
  let logs = [...sim.eventLogs];
  let incidents = [...sim.incidents];
  let output: string[] = [];
  let isError = false;

  const lower = cmd.toLowerCase();

  // Check if target is currently in non-reachable BSOD state
  const unreachableInc = incidents.find(
    (i) =>
      i.status === 'active' &&
      !i.winrmReachable &&
      (i.targetHostLabel.toLowerCase().includes(targetHost.toLowerCase()) ||
        targetHost.toLowerCase().includes(i.targetHostLabel.split('.')[0].toLowerCase())),
  );

  if (lower === 'cls' || lower === 'clear') {
    return {
      ...state,
      simulation: {
        ...sim,
        terminalHistory: [],
      },
    };
  }

  if (lower === 'help' || lower === '?') {
    output = [
      'Comandos técnicos disponibles en consola WinRM de PatchDay:',
      '  Get-HotFix                                  Lista KBs instalados en el destino',
      '  Get-WinEvent -LogName System -MaxEvents 10  Muestra últimos eventos de sistema',
      '  Get-Content WindowsUpdate.log -Tail 10      Inspecciona trazas del agente WUA',
      '  Get-Service / sc query wuauserv             Estado de wuauserv, bits, Spooler, W3SVC',
      '  netsh winhttp show proxy                    Verifica configuración de proxy WinHTTP',
      '  UsoClient StartScan / wuauclt /reportnow    Fuerza escaneo y reporte hacia SRV-WSUS-01',
      '  wusa /uninstall /kb:5035432 /quiet          Desinstala boletín independiente (ej. KB5035432)',
      '  DISM /Online /Remove-Package /PackageName:Package_for_RollupFix~31bf3856ad364e35~amd64~~22621.3447.1.11',
      '  DISM /Online /Cleanup-Image /RestoreHealth  Repara almacén de componentes SxS (error 0x800f081f)',
      '  Reset-WuAgent                               Limpia SoftwareDistribution, proxy WinHTTP y reinicia WUA',
      '  Resize-WinRE                                Amplía partición de recuperación WinRE (+250 MB)',
      '  Restart-Service Spooler, W3SVC              Reinicia servicios detenidos tras parche',
      '  cls / clear                                 Limpia la salida de la consola',
    ];
  } else if (
    unreachableInc &&
    !lower.startsWith('get-winevent') &&
    !lower.includes('windowsupdate.log')
  ) {
    isError = true;
    output = [
      `[${targetHost}] ERROR WinRM (0x8033811c): Tiempo de espera agotado conectando al puerto TCP 5985.`,
      `Causa: El equipo se encuentra en bucle BSOD / bloqueo crítico (${unreachableInc.errorCode}).`,
      'Acción requerida: WinRM y WSUS no alcanzan este nodo. Usa Vía 3 (Consola de Hipervisor -> Revertir Snapshot).',
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WinRM',
      severity: 'error',
      eventId: '0x8033811c',
      host: targetHost,
      message: `Fallo conexión WinRM contra ${targetHost}: equipo no responde (${unreachableInc.errorCode}).`,
    });
  } else if (lower.startsWith('get-hotfix')) {
    const installed = [
      'KB5032189 (SSU Base)',
      ...sim.installedPatchesByRing['ring-2'],
      ...sim.installedPatchesByRing['ring-3'],
    ];
    const unique = Array.from(new Set(installed));
    output = [
      `Destino: ${targetHost}`,
      'Source        Description      HotFixID      InstalledOn',
      '------        -----------      --------      -----------',
      ...unique.map(
        (kb) =>
          `${targetHost.slice(0, 12).padEnd(13)} Security Update  ${kb.padEnd(13)} ${clock.shortClock}`,
      ),
    ];
  } else if (lower.startsWith('get-winevent')) {
    const recent = sim.eventLogs.slice(0, 6);
    output = [
      `TimeCreated          ProviderName         Id    Message`,
      '-----------          ------------         --    -------',
      ...recent.map(
        (l) =>
          `${l.simClock.padEnd(20)} ${l.source.slice(0, 18).padEnd(20)} ${(l.eventId ?? '1000').padEnd(5)} ${l.message.slice(0, 72)}`,
      ),
    ];
  } else if (lower.includes('wusa') && lower.includes('uninstall')) {
    if (lower.includes('5036893') || lower.includes('5034441')) {
      isError = true;
      output = [
        `[${targetHost}] Ejecutando: ${cmd}`,
        'ERROR 0x80070002 / Windows Update Standalone Installer:',
        'El paquete combinado SSU + LCU (Servicing Stack + Cumulative Update) es permanente para wusa.exe.',
        'Sugerencia técnica: utiliza DISM /Online /Remove-Package /PackageName:Package_for_RollupFix~31bf3856ad364e35~amd64~~22621.3447.1.11 o Snapshot.',
      ];
      logs = appendLog(logs, {
        simClock: clock.shortClock,
        source: 'WinRM',
        severity: 'warning',
        eventId: '0x80070002',
        host: targetHost,
        message: `wusa /uninstall rechazado en ${targetHost} (paquete combinado SSU+LCU). Se requiere DISM /Remove-Package.`,
      });
    } else {
      const match = cmd.match(/kb:(\d+)/i);
      const kbId = match ? `KB${match[1]}` : 'KB5034848';
      incidents = incidents.map((inc) =>
        inc.status === 'active' &&
        inc.winrmReachable &&
        inc.patchId === kbId
          ? {
              ...inc,
              status: 'resolved',
              resolvedAtClock: clock.shortClock,
              resolutionMethod: `Vía 2: WinRM (${cmd})`,
            }
          : inc,
      );
      output = [
        `[${targetHost}] wusa.exe /uninstall /kb:${match ? match[1] : '5034848'} /quiet /norestart`,
        `Desinstalación de ${kbId} completada con código de salida 3010 (reinicio limpio programado).`,
      ];
      logs = appendLog(logs, {
        simClock: clock.shortClock,
        source: 'WinRM',
        severity: 'success',
        eventId: '1014',
        host: targetHost,
        message: `Desinstalado ${kbId} en ${targetHost} mediante wusa.exe.`,
      });
    }
  } else if (lower.includes('dism') && lower.includes('restorehealth')) {
    let resolved = 0;
    let partialUpdated = 0;
    incidents = incidents.map((inc) => {
      const targetMatch =
        targetHost.toLowerCase().includes('ring 3') ||
        inc.targetHostLabel.toLowerCase().includes(targetHost.split('.')[0].toLowerCase());
      if (
        inc.status === 'active' &&
        inc.errorCode?.includes('0x800f081f') &&
        targetMatch
      ) {
        if (inc.errorCode.includes('0x8024402c')) {
          partialUpdated += 1;
          return {
            ...inc,
            errorCode: '0x8024402c',
            title: 'Error WUA 0x8024402c pendiente en EXCH-DAG-01 (WinSxS reparado)',
            recommendedFix: 'winrm_reset_wu',
          };
        }
        resolved += 1;
        return {
          ...inc,
          status: 'resolved',
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 2: WinRM DISM /Online /Cleanup-Image /RestoreHealth',
        };
      }
      return inc;
    });
    output = [
      `Deployment Image Servicing and Management tool (Version: 10.0.20348.2031)`,
      `Image Version: 10.0.20348.2340`,
      `[==========================100.0%==========================]`,
      `La operación de restauración del almacén de componentes (WinSxS) se completó correctamente.`,
      resolved > 0 || partialUpdated > 0
        ? `ÉXITO: Almacén SxS (0x800f081f) reparado (${resolved} servidor(es) resueltos${
            partialUpdated > 0 ? `, ${partialUpdated} pendiente de Reset-WuAgent para 0x8024402c` : ''
          }).`
        : `Almacén de componentes verificado en ${targetHost}. (Si hay errores 0x800f081f en otros nodos, selecciona "Ring 3" o el servidor afectado).`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdate.log',
      severity: 'success',
      eventId: '1022',
      host: targetHost,
      message: `DISM /Online /Cleanup-Image /RestoreHealth completado en ${targetHost}: almacén WinSxS íntegro (0x800f081f corregido).`,
    });
  } else if (lower.includes('dism') && lower.includes('remove-package')) {
    let resolved = 0;
    incidents = incidents.map((inc) => {
      if (
        inc.status === 'active' &&
        inc.winrmReachable &&
        inc.type === 'bsod_loop'
      ) {
        resolved += 1;
        return {
          ...inc,
          status: 'resolved',
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 2: WinRM DISM /Online /Remove-Package',
        };
      }
      return inc;
    });
    output = [
      `Deployment Image Servicing and Management tool (Version: 10.0.22621.2792)`,
      `Processing 1 of 1 - Removing package Package_for_RollupFix~31bf3856ad364e35~amd64~~22621.3447.1.11`,
      `[==========================100.0%==========================]`,
      resolved > 0
        ? `Operación completada con éxito en ${targetHost}. El paquete LCU KB5036893 fue retirado y ${resolved} incidente(s) de estaciones resueltos.`
        : `Operación DISM completada en ${targetHost} (sin incidentes activos pendientes en el destino).`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WinRM',
      severity: 'success',
      eventId: '1015',
      host: targetHost,
      message: `DISM /Online /Remove-Package ejecutado con éxito en ${targetHost}; KB5036893 revertido.`,
    });
  } else if (lower.includes('reset-wuagent') || lower.includes('softwaredistribution')) {
    let resolved = 0;
    let partialUpdated = 0;
    incidents = incidents.map((inc) => {
      const targetMatch =
        targetHost.toLowerCase().includes('ring 3') ||
        targetHost.toLowerCase().includes('ring 2') ||
        inc.targetHostLabel.toLowerCase().includes(targetHost.split('.')[0].toLowerCase());
      if (
        inc.status === 'active' &&
        targetMatch &&
        (inc.errorCode?.includes('0x8024402c') || inc.errorCode?.includes('0x80070005'))
      ) {
        if (inc.errorCode.includes('0x800f081f')) {
          partialUpdated += 1;
          return {
            ...inc,
            errorCode: '0x800f081f',
            title: 'Error CBS 0x800f081f pendiente en EXCH-DAG-01 (SoftwareDistribution limpia)',
            recommendedFix: 'winrm_dism_restore',
          };
        }
        resolved += 1;
        return {
          ...inc,
          status: 'resolved',
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 2: WinRM Reset-WuAgent (SoftwareDistribution + WinHTTP)',
        };
      }
      return inc;
    });
    output = [
      `[${targetHost}] Deteniendo servicios wuauserv, cryptSvc, bits, msiserver...`,
      `[${targetHost}] Renombrando C:\\Windows\\SoftwareDistribution -> SoftwareDistribution.bak`,
      `[${targetHost}] Ejecutando netsh winhttp reset proxy && ipconfig /flushdns`,
      `[${targetHost}] Reiniciando servicios y forzando UsoClient StartScan...`,
      resolved > 0 || partialUpdated > 0
        ? `ÉXITO: Caché SoftwareDistribution reparada (${resolved} resueltos${
            partialUpdated > 0 ? `, ${partialUpdated} pendiente de DISM /RestoreHealth para 0x800f081f` : ''
          }).`
        : `ÉXITO: Caché WUA reiniciada en ${targetHost}.`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdate.log',
      severity: 'success',
      eventId: '1020',
      host: targetHost,
      message: `Reset-WuAgent ejecutado en ${targetHost}: SoftwareDistribution reconstruida y proxy WinHTTP restablecido.`,
    });
  } else if (lower.includes('resize-winre') || lower.includes('reagentc')) {
    let resolved = 0;
    incidents = incidents.map((inc) => {
      if (inc.status === 'active' && inc.errorCode === '0x800f0922') {
        resolved += 1;
        return {
          ...inc,
          status: 'resolved',
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 2: WinRM Resize-WinRE (+250 MB)',
        };
      }
      return inc;
    });
    output = [
      `[${targetHost}] reagentc /disable -> WinRE deshabilitado temporalmente.`,
      `[${targetHost}] diskpart: reduciendo partición OS en 250 MB y recreando partición Recovery (440 MB libres).`,
      `[${targetHost}] reagentc /enable -> REAGENTC.EXE: Operación correcta.`,
      resolved > 0
        ? `ÉXITO: Error 0x800f0922 resuelto. KB5034441 listo para instalación limpia.`
        : `Partición WinRE ampliada correctamente en ${targetHost}.`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WinRM',
      severity: 'success',
      eventId: '1021',
      host: targetHost,
      message: `Resize-WinRE completado en ${targetHost}: partición ampliada a 440 MB; 0x800f0922 resuelto.`,
    });
  } else if (lower.includes('restart-service')) {
    let resolved = 0;
    incidents = incidents.map((inc) => {
      if (inc.status === 'active' && inc.type === 'service_down') {
        resolved += 1;
        return {
          ...inc,
          status: 'resolved',
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Vía 2: WinRM Restart-Service',
        };
      }
      return inc;
    });
    output = [
      `[${targetHost}] Restart-Service -Name Spooler, W3SVC, MSExchangeTransport -Force`,
      `Status   Name                 DisplayName`,
      `------   ----                 -----------`,
      `Running  Spooler              Print Spooler`,
      `Running  W3SVC                World Wide Web Publishing Service`,
      `Running  MSExchangeTransport  Microsoft Exchange Transport`,
      resolved > 0
        ? `ÉXITO: Servicios críticos restaurados en ${targetHost}.`
        : `Servicios reiniciados en ${targetHost}.`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WinRM',
      severity: 'success',
      eventId: '7036',
      host: targetHost,
      message: `Servicios Spooler / W3SVC / MSExchangeTransport reiniciados correctamente en ${targetHost}.`,
    });
  } else if (lower.includes('windowsupdate.log')) {
    const wuaLogs = sim.eventLogs
      .filter(
        (l) =>
          l.source === 'WindowsUpdate.log' ||
          l.source === 'WindowsUpdateClient' ||
          l.source === 'WSUS',
      )
      .slice(0, 8);
    output = [
      `[${targetHost}] C:\\Windows\\WindowsUpdate.log (últimas trazas):`,
      ...(wuaLogs.length > 0
        ? wuaLogs.map(
            (l) =>
              `${l.simClock}  [PID:1844]  ${l.source.padEnd(19)}  ${(l.eventId ?? '0x0').padEnd(10)}  ${l.host}: ${l.message}`,
          )
        : [
            `${clock.shortClock}  [PID:1844]  WindowsUpdateClient  16          Sync completed with http://SRV-WSUS-01.corp.local:8530`,
          ]),
    ];
  } else if (lower.includes('netsh') && lower.includes('proxy')) {
    const hasProxyIssue = incidents.some(
      (i) => i.status === 'active' && i.errorCode?.includes('0x8024402c'),
    );
    output = [
      `Configuración de proxy WinHTTP actual en ${targetHost}:`,
      hasProxyIssue
        ? '    Servidor(es) proxy:  proxy-legacy.corp.local:8080  [ALERTA: provoca 0x8024402c hacia SRV-WSUS-01]'
        : '    Acceso directo (sin servidor proxy).',
    ];
  } else if (lower.includes('sc query') || lower.includes('get-service')) {
    const hasSvcDown = incidents.some(
      (i) => i.status === 'active' && i.type === 'service_down',
    );
    output = [
      `Estado de servicios clave en ${targetHost}:`,
      'Status   Name                 DisplayName',
      '------   ----                 -----------',
      'Running  wuauserv             Windows Update',
      'Running  bits                 Background Intelligent Transfer Service',
      `${hasSvcDown ? 'Stopped' : 'Running'}  Spooler              Print Spooler`,
      `${hasSvcDown ? 'Stopped' : 'Running'}  W3SVC                World Wide Web Publishing Service`,
    ];
  } else if (lower.includes('usoclient') || lower.includes('wuauclt')) {
    output = [
      `[${targetHost}] Ejecutando escaneo e informe de cumplimiento hacia http://SRV-WSUS-01.corp.local:8530...`,
      `[${targetHost}] UsoClient StartScan && wuauclt /reportnow completado (HTTP 200 OK).`,
    ];
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdateClient',
      severity: 'info',
      eventId: '16',
      host: targetHost,
      message: `Escaneo manual UsoClient StartScan ejecutado desde WinRM en ${targetHost}.`,
    });
  } else {
    isError = true;
    output = [
      `El término '${cmd.split(' ')[0]}' no se reconoce en la sesión restringida SecOps WinRM.`,
      'Escribe "help" o utiliza los botones rápidos de comandos de remediación.',
    ];
  }

  const entry: TerminalHistoryEntry = {
    id: uid('term'),
    target: targetHost,
    command: cmd,
    output,
    isError,
    timestamp: clock.shortClock,
  };

  return {
    ...state,
    simulation: {
      ...sim,
      incidents,
      eventLogs: logs,
      terminalHistory: [...sim.terminalHistory, entry].slice(-25),
    },
  };
}

/**
 * Vía 3: Hypervisor Snapshot Revert (VMware vCenter / Proxmox VE)
 */
export function revertHypervisorSnapshot(
  state: LabState,
  assetId: string,
): LabState {
  const sim = state.simulation;
  const clock = formatSimClock(sim.simHoursElapsed);
  let resolvedCount = 0;

  const nextIncidents = sim.incidents.map((inc) => {
    if (
      inc.status === 'active' &&
      (inc.targetHostLabel.includes(assetId) ||
        (assetId === 'DC-CORE-02' && inc.id === 'inc-kerberos-dc02') ||
        (assetId === 'PRT-SRV-01' && inc.id === 'inc-bsod-prt-srv-01') ||
        (assetId === 'EXCH-DAG-01' && inc.id === 'inc-service-exch') ||
        (assetId === 'FILE-PROD-02' && inc.id === 'inc-wua-0x80070005'))
    ) {
      resolvedCount += 1;
      return {
        ...inc,
        status: 'resolved' as const,
        resolvedAtClock: clock.shortClock,
        resolutionMethod: `Vía 3: Snapshot Hipervisor (${assetId} -> pre_patch_snap_2026)`,
      };
    }
    return inc;
  });

  const logs = appendLog(sim.eventLogs, {
    simClock: clock.shortClock,
    source: 'Hypervisor',
    severity: 'success',
    eventId: 'VM-REV-99',
    host: assetId,
    message: `VM ${assetId} restaurada instantáneamente al snapshot pre_patch_snap_2026 (${resolvedCount} incidente(s) críticos recuperados, servicio 100% operativo).`,
  });

  return {
    ...state,
    simulation: {
      ...sim,
      incidents: nextIncidents,
      eventLogs: logs,
    },
  };
}

/**
 * Resolves business-hour deadline complaint once the admin acknowledges and restores normal window
 */
export function resolveDeadlineComplaint(
  state: LabState,
  incidentId: string,
): LabState {
  const sim = state.simulation;
  const clock = formatSimClock(sim.simHoursElapsed);
  const targetInc = sim.incidents.find((i) => i.id === incidentId);
  if (!targetInc) return state;

  const nextApprovals = { ...state.wsusApprovals };
  const app = nextApprovals[targetInc.patchId];
  if (app) {
    nextApprovals[targetInc.patchId] = {
      ...app,
      rings: {
        ...app.rings,
        [targetInc.ringId]: {
          ...app.rings[targetInc.ringId],
          deadline: 'Sin fecha límite (Ventana estándar)',
          updatedAt: new Date().toISOString(),
        },
      },
    };
  }

  const nextIncidents = sim.incidents.map((inc) =>
    inc.id === incidentId
      ? {
          ...inc,
          status: 'resolved' as const,
          resolvedAtClock: clock.shortClock,
          resolutionMethod: 'Deadline reajustado a ventana nocturna estándar',
        }
      : inc,
  );

  const logs = appendLog(sim.eventLogs, {
    simClock: clock.shortClock,
    source: 'WSUS',
    severity: 'success',
    eventId: '10048',
    host: targetInc.targetHostLabel,
    message: `Corregido Deadline de ${targetInc.patchId} en ${targetInc.ringId} a ventana de mantenimiento estándar sin reinicio laboral.`,
  });

  return {
    ...state,
    wsusApprovals: nextApprovals,
    simulation: {
      ...sim,
      incidents: nextIncidents,
      eventLogs: logs,
    },
  };
}

/**
 * Prepares the simulator for any of the 4 Phase 5 Guided CTF Missions
 */
export function activateMissionScenario(
  state: LabState,
  missionId: GuidedMissionId,
): LabState {
  const sim = state.simulation;
  const clock = formatSimClock(sim.simHoursElapsed);
  let logs = [...sim.eventLogs];
  let incidents = [...sim.incidents];
  let nextApprovals = { ...state.wsusApprovals };
  let targetModule = state.activeModule;

  if (missionId === 'mission-1') {
    targetModule = 'triage';
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WSUS',
      severity: 'info',
      eventId: 'M1-START',
      host: 'SRV-WSUS-01',
      message:
        'Misión 1 activa ("El Espejismo del CVSS 9.8"): selecciona 2 parches KEV/EPSS>85% como P1 en cola RFC, ignora APACHE-2.4.62 (EPSS 2%) y declina 2 parches Superseded en WSUS.',
    });
  } else if (missionId === 'mission-2') {
    targetModule = 'rfc';
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WSUS',
      severity: 'info',
      eventId: 'M2-START',
      host: 'EXCH-DAG-01',
      message:
        'Misión 2 activa ("Gobernanza CAB y Ventana Nocturna"): tramita RFC para KB5035857 en Anillo 3 fuera de horario laboral, aprueba en WSUS y ejecuta Ventana Nocturna.',
    });
  } else if (missionId === 'mission-3') {
    targetModule = 'maintenance';
    nextApprovals = {
      ...nextApprovals,
      KB5035432: {
        ...(nextApprovals['KB5035432'] ?? {
          declinedGlobally: false,
          rings: {
            'ring-0': { action: 'Not Approved' },
            'ring-1': { action: 'Not Approved' },
            'ring-2': { action: 'Not Approved' },
            'ring-3': { action: 'Not Approved' },
          },
        }),
        declinedGlobally: false,
        rings: {
          ...(nextApprovals['KB5035432']?.rings ?? {
            'ring-0': { action: 'Not Approved' },
            'ring-2': { action: 'Not Approved' },
            'ring-3': { action: 'Not Approved' },
          }),
          'ring-1': {
            action: 'Approved for Install',
            deadline: 'En 24 horas (Piloto)',
            updatedAt: new Date().toISOString(),
          },
        },
      },
    };
    const alreadyResolved = incidents.some(
      (i) => i.id === 'inc-pilot-sql-ring1' && i.status === 'resolved',
    );
    if (!alreadyResolved) {
      incidents = upsertIncident(incidents, {
        id: 'inc-pilot-sql-ring1',
        patchId: 'KB5035432',
        ringId: 'ring-1',
        targetHostLabel: 'DEV-SQL-01.corp.local',
        affectedCount: 1,
        type: 'service_down',
        errorCode: 'MSSQLSERVER_DOWN (7031)',
        title: 'Caída de servicio MSSQLSERVER en DEV-SQL-01 (Anillo 1 Piloto)',
        detail:
          'Al probar KB5035432 en Anillo 1, la base de datos DEV-SQL-01 dejó de responder. Bloquea la promoción a Ring 2/3 y ejecuta rollback (wusa /uninstall /kb:5035432 /quiet o Approved for Removal en Ring 1).',
        recommendedFix: 'winrm_wusa',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      });
    }
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'System',
      severity: 'error',
      eventId: '7031',
      host: 'DEV-SQL-01 (Ring 1)',
      message:
        'Misión 3 ("Pánico en Anillo Piloto"): KB5035432 provocó caída de MSSQLSERVER en DEV-SQL-01. Impide promoción a Producción y revierte en Ring 1.',
    });
  } else if (missionId === 'mission-4') {
    targetModule = 'maintenance';
    const ring3WuaIncidents: SimulationIncident[] = [
      {
        id: 'inc-m4-dc01',
        patchId: 'KB5034763',
        ringId: 'ring-3',
        targetHostLabel: 'DC-CORE-01.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x8024402c',
        title: 'Error WUA 0x8024402c en DC-CORE-01 (Caché / Proxy SoftwareDistribution)',
        detail:
          'WindowsUpdate.log: WU_E_PT_WINHTTP_NAME_NOT_RESOLVED (0x8024402c) al contactar SRV-WSUS-01. Limpia SoftwareDistribution con Reset-WuAgent vía WinRM.',
        recommendedFix: 'winrm_reset_wu',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      },
      {
        id: 'inc-m4-dc02',
        patchId: 'KB5034763',
        ringId: 'ring-3',
        targetHostLabel: 'DC-CORE-02.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x800f081f',
        title: 'Error CBS 0x800f081f en DC-CORE-02 (Almacén SxS dañado)',
        detail:
          'WindowsUpdate.log: CBS_E_SOURCE_MISSING (0x800f081f) durante instalación mensual. Repara la imagen con DISM /Online /Cleanup-Image /RestoreHealth.',
        recommendedFix: 'winrm_dism_restore',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      },
      {
        id: 'inc-m4-exch01',
        patchId: 'KB5035857',
        ringId: 'ring-3',
        targetHostLabel: 'EXCH-DAG-01.corp.local',
        affectedCount: 1,
        type: 'wua_error',
        errorCode: '0x8024402c / 0x800f081f',
        title: 'Doble fallo WUA 0x8024402c + 0x800f081f en EXCH-DAG-01',
        detail:
          'WindowsUpdate.log: caché SoftwareDistribution corrupta (0x8024402c) y componentes WinSxS dañados (0x800f081f). Ejecuta Reset-WuAgent y DISM /RestoreHealth.',
        recommendedFix: 'winrm_dism_restore',
        winrmReachable: true,
        status: 'active',
        detectedAtClock: clock.shortClock,
      },
    ];

    for (const inc of ring3WuaIncidents) {
      const alreadyResolved = incidents.some(
        (existing) => existing.id === inc.id && existing.status === 'resolved',
      );
      if (!alreadyResolved) {
        incidents = upsertIncident(incidents, inc);
      }
    }

    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdate.log',
      severity: 'error',
      eventId: '0x8024402c',
      host: 'DC-CORE-01',
      message:
        'WUAgent: *FAILED* [8024402C] WinHttpSendRequest failed; SoftwareDistribution download queue stalled.',
    });
    logs = appendLog(logs, {
      simClock: clock.shortClock,
      source: 'WindowsUpdate.log',
      severity: 'error',
      eventId: '0x800f081f',
      host: 'DC-CORE-02 / EXCH-DAG-01',
      message:
        'CBS: Failed to resolve package source [HRESULT = 0x800f081f - CBS_E_SOURCE_MISSING]. Ejecutar DISM /Online /Cleanup-Image /RestoreHealth y Reset-WuAgent.',
    });
  }

  return {
    ...state,
    activeModule: targetModule,
    activeMissionId: missionId,
    wsusApprovals: nextApprovals,
    simulation: {
      ...sim,
      incidents,
      eventLogs: logs,
    },
  };
}

