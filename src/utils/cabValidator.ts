import {
  MAINTENANCE_WINDOW_OPTIONS,
  PATCH_BULLETINS,
  ROLLBACK_STRATEGIES,
} from '../data/initialData';
import {
  BlackoutPeriod,
  CabRuleFinding,
  PatchBulletin,
  RfcFormInput,
  RfcSubmission,
} from '../types/patchday';

export function evaluateCabSubmission(
  input: RfcFormInput,
  blackoutPeriods: BlackoutPeriod[],
  existingSubmissions: RfcSubmission[],
): RfcSubmission {
  const findings: CabRuleFinding[] = [];
  const selectedBulletins: PatchBulletin[] = PATCH_BULLETINS.filter((b) =>
    input.selectedPatchIds.includes(b.id),
  );

  const selectedWindow =
    MAINTENANCE_WINDOW_OPTIONS.find((w) => w.id === input.maintenanceWindowId) ??
    MAINTENANCE_WINDOW_OPTIONS[0];

  // 1. Scope completeness
  if (selectedBulletins.length === 0 || input.targetRings.length === 0) {
    findings.push({
      ruleId: 'CAB-SCOPE-01',
      passed: false,
      severity: 'error',
      title: 'Alcance incompleto del RFC',
      detail:
        'Debes seleccionar al menos un boletín/KB y al menos un Anillo de destino antes de enviar el cambio al CAB.',
    });
  } else {
    findings.push({
      ruleId: 'CAB-SCOPE-01',
      passed: true,
      severity: 'pass',
      title: 'Alcance de boletines y anillos definido',
      detail: `${selectedBulletins.length} boletín(es) para ${input.targetRings.length} anillo(s) objetivo.`,
    });
  }

  // 2. Superseded hygiene check
  const supersededList = selectedBulletins.filter((b) => Boolean(b.supersededBy));
  if (supersededList.length > 0) {
    findings.push({
      ruleId: 'CAB-WSUS-02',
      passed: false,
      severity: 'error',
      title: 'Boletín reemplazado (Superseded) en el RFC',
      detail: `${supersededList
        .map((b) => `${b.id} (reemplazado por ${b.supersededBy})`)
        .join(', ')} es obsoleto. El CAB prohíbe aprobar paquetes reemplazados; sustitúyelo por su boletín vigente.`,
    });
  } else if (selectedBulletins.length > 0) {
    findings.push({
      ruleId: 'CAB-WSUS-02',
      passed: true,
      severity: 'pass',
      title: 'Higiene WSUS verificada',
      detail: 'Ninguno de los boletines seleccionados figura como reemplazado (Superseded).',
    });
  }

  // 3. Change Type coherence (Emergencia vs Normal vs Estándar)
  const hasKevOrHighEpss = selectedBulletins.some(
    (b) => b.inCisaKev || b.epssScore >= 0.7,
  );
  const anyRebootAlways = selectedBulletins.some((b) => b.requiresReboot === 'Siempre');
  const anyRebootPossible = selectedBulletins.some(
    (b) => b.requiresReboot === 'Siempre' || b.requiresReboot === 'Posiblemente',
  );
  const targetsProd =
    input.targetRings.includes('ring-2') || input.targetRings.includes('ring-3');
  const targetsRing3 = input.targetRings.includes('ring-3');

  if (input.changeType === 'Emergencia') {
    if (!hasKevOrHighEpss) {
      findings.push({
        ruleId: 'CAB-TYPE-03',
        passed: false,
        severity: 'error',
        title: 'Cambio de Emergencia injustificado',
        detail:
          'Solicitaste "Emergencia (Expedited)", pero ningún boletín seleccionado está en CISA KEV ni supera el umbral EPSS ≥ 70%. Usa un cambio "Normal" para evitar fatiga de emergencias.',
      });
    } else if (input.justification.trim().length < 25) {
      findings.push({
        ruleId: 'CAB-TYPE-03',
        passed: false,
        severity: 'error',
        title: 'Falta justificación técnica rigurosa para Emergencia',
        detail:
          'Los cambios de Emergencia (Expedited) exigen una justificación técnica detallada (mínimo 25 caracteres) citando KEV/EPSS y exposición activa.',
      });
    } else {
      findings.push({
        ruleId: 'CAB-TYPE-03',
        passed: true,
        severity: 'pass',
        title: 'Cambio de Emergencia (Expedited) validado',
        detail:
          'Acreditada amenaza activa (CISA KEV o EPSS ≥ 70%) y justificación técnica suficiente.',
      });
    }
  } else if (input.changeType === 'Estándar') {
    if (targetsProd && anyRebootPossible) {
      findings.push({
        ruleId: 'CAB-TYPE-03',
        passed: false,
        severity: 'error',
        title: 'Uso indebido de Cambio Estándar en Producción',
        detail:
          'Un cambio "Estándar" (preaprobado) solo es válido para Anillos 0/1 o parches sin reinicio de bajo riesgo. Para Anillos 2/3 con reinicio debes tramitar cambio "Normal" o "Emergencia".',
      });
    } else {
      findings.push({
        ruleId: 'CAB-TYPE-03',
        passed: true,
        severity: 'pass',
        title: 'Cambio Estándar dentro de política',
        detail: 'Alcance acotado a entorno no productivo o actualización sin impacto de reinicio.',
      });
    }
  } else {
    findings.push({
      ruleId: 'CAB-TYPE-03',
      passed: true,
      severity: 'pass',
      title: 'Tipo de Cambio Normal válido',
      detail: 'Flujo estándar ITIL sujeto a pruebas en Anillo 0/1 y ventana de mantenimiento.',
    });
  }

  // 4. Reboot declaration accuracy
  if (anyRebootAlways && input.declaredReboot === 'No') {
    findings.push({
      ruleId: 'CAB-IMPACT-04',
      passed: false,
      severity: 'error',
      title: 'Declaración de impacto de reinicio inconsistente',
      detail:
        'Al menos un boletín seleccionado exige reinicio obligatorio ("Siempre"), pero declaraste que NO requiere reinicio en la evaluación de impacto.',
    });
  } else if (selectedBulletins.length > 0) {
    findings.push({
      ruleId: 'CAB-IMPACT-04',
      passed: true,
      severity: 'pass',
      title: 'Evaluación de impacto de reinicio coherente',
      detail: `Reinicio declarado: ${input.declaredReboot} · Downtime estimado: ${input.estimatedDowntimeMin} min.`,
    });
  }

  // 5. Maintenance Window & Blackout Periods check
  const activeBlackoutsForRings = blackoutPeriods.filter(
    (blk) =>
      blk.active &&
      blk.affectedRings.some((r) => input.targetRings.includes(r)),
  );
  const billingBlackoutActive = activeBlackoutsForRings.some(
    (b) => b.id === 'blk-billing',
  );
  const peakHoursBlackoutActive = activeBlackoutsForRings.some(
    (b) => b.id === 'blk-peak-hours',
  );

  if (
    selectedWindow.isBlackoutConflict &&
    (billingBlackoutActive || targetsProd)
  ) {
    findings.push({
      ruleId: 'CAB-WIN-05',
      passed: false,
      severity: 'error',
      title: 'Conflicto con Periodo Blackout activo',
      detail:
        'La ventana seleccionada cae dentro del periodo Blackout de Cierre de Facturación (días 28–31), donde está prohibido reiniciar servidores y estaciones de producción.',
    });
  } else if (
    targetsRing3 &&
    (anyRebootAlways || input.declaredReboot === 'Sí') &&
    selectedWindow.isBusinessHours
  ) {
    findings.push({
      ruleId: 'CAB-WIN-05',
      passed: false,
      severity: 'error',
      title: 'Horario laboral prohibido para Servidores Críticos (Anillo 3)',
      detail:
        'El parche requiere reinicio y apunta al Anillo 3 (DCs / Exchange / SQL / FW), pero seleccionaste una ventana en horario laboral. Debes asignar Domingo 01:00–04:00 (Ventana Estricta).',
    });
  } else if (
    input.targetRings.includes('ring-2') &&
    anyRebootAlways &&
    selectedWindow.id === 'win-business-hours' &&
    peakHoursBlackoutActive
  ) {
    findings.push({
      ruleId: 'CAB-WIN-05',
      passed: false,
      severity: 'error',
      title: 'Ventana en horario comercial para Producción (Anillo 2)',
      detail:
        'El Blackout de Horario Comercial (L–V 08:00–19:00) prohíbe reinicios masivos en Anillo 2. Selecciona la ventana nocturna del Sábado 02:00–06:00.',
    });
  } else {
    findings.push({
      ruleId: 'CAB-WIN-05',
      passed: true,
      severity: 'pass',
      title: 'Ventana de mantenimiento aprobada sin conflictos Blackout',
      detail: `Ventana asignada: ${selectedWindow.label}.`,
    });
  }

  // 6. Testing Plan validation
  if (input.changeType === 'Normal' && targetsProd && !input.ring01Tested) {
    findings.push({
      ruleId: 'CAB-TEST-06',
      passed: false,
      severity: 'error',
      title: 'Falta verificación previa en Anillo 0 / Anillo 1',
      detail:
        'Los cambios Normales dirigidos a Producción (Anillo 2/3) exigen confirmar validación previa en el laboratorio Canary y grupo Piloto (Anillo 0/1).',
    });
  } else {
    findings.push({
      ruleId: 'CAB-TEST-06',
      passed: true,
      severity: 'pass',
      title: 'Plan de pruebas validado',
      detail: input.ring01Tested
        ? 'Validación confirmada en Anillo 0 / Anillo 1.'
        : 'Cambio de emergencia o temprano con seguimiento inmediato en Canary.',
    });
  }

  // 7. Rollback Plan coherence check
  const rollbackDef = ROLLBACK_STRATEGIES.find((r) => r.id === input.rollbackStrategy);
  const incompatibleWithWusa = selectedBulletins.filter(
    (b) => b.supportsWusaUninstall === false,
  );

  if (input.rollbackStrategy === 'none') {
    findings.push({
      ruleId: 'CAB-ROLLBACK-07',
      passed: false,
      severity: 'error',
      title: 'Plan de Vuelta Atrás (Rollback) ausente',
      detail:
        'Ningún cambio puede aprobarse sin un Plan de Rollback técnico seleccionado.',
    });
  } else if (input.rollbackThreshold.trim().length < 8) {
    findings.push({
      ruleId: 'CAB-ROLLBACK-07',
      passed: false,
      severity: 'error',
      title: 'Umbral de activación de Rollback no definido',
      detail:
        'Especifica un umbral medible para disparar la reversión (ej. "Si falla más del 5% de los nodos o cae el servicio IIS").',
    });
  } else if (
    input.rollbackStrategy === 'wusa-uninstall' &&
    incompatibleWithWusa.length > 0
  ) {
    findings.push({
      ruleId: 'CAB-ROLLBACK-07',
      passed: false,
      severity: 'error',
      title: 'Plan de Rollback incoherente con wusa.exe',
      detail: `Elegiste desinstalación con wusa.exe, pero ${incompatibleWithWusa
        .map((b) => b.id)
        .join(', ')} no admite desinstalación por comando (paquete SSU/LCU combinado, Exchange/SQL, Linux o FortiOS). Utiliza Snapshot de hipervisor, Failover o Downgrade de paquete.`,
    });
  } else if (
    targetsRing3 &&
    input.rollbackStrategy !== 'hypervisor-snapshot' &&
    input.rollbackStrategy !== 'cluster-failover'
  ) {
    findings.push({
      ruleId: 'CAB-ROLLBACK-07',
      passed: false,
      severity: 'error',
      title: 'Anillo 3 exige Snapshot previo o Conmutación Failover',
      detail:
        'Para Servidores Críticos (DCs, Exchange, SQL, Firewall HA) el CAB exige Restauración de Snapshot o Conmutación de clúster failover.',
    });
  } else {
    findings.push({
      ruleId: 'CAB-ROLLBACK-07',
      passed: true,
      severity: 'pass',
      title: `Plan de Rollback válido (${rollbackDef?.label ?? input.rollbackStrategy})`,
      detail: `Umbral de activación: "${input.rollbackThreshold}".`,
    });
  }

  // 8. Non-blocking operational advisories
  if (selectedBulletins.some((b) => b.id === 'KB5036893')) {
    findings.push({
      ruleId: 'CAB-ADV-08',
      passed: true,
      severity: 'warning',
      title: 'Nota técnica CAB: Compatibilidad PRT-SRV-01',
      detail:
        'Recuerda monitorizar controladores de impresión Kyocera v3 legacy durante la ventana del Anillo 2 para evitar BSOD.',
    });
  }
  if (selectedBulletins.some((b) => b.id === 'KB5034763')) {
    findings.push({
      ruleId: 'CAB-ADV-09',
      passed: true,
      severity: 'warning',
      title: 'Nota técnica CAB: Prerequisito en DC-CORE-02',
      detail:
        'Asegura la instalación previa de KB5032189 en DC-CORE-02 antes de ejecutar el reinicio en Anillo 3.',
    });
  }

  const hasErrors = findings.some((f) => !f.passed && f.severity === 'error');
  const approvedCount = existingSubmissions.filter(
    (s) => s.status === 'APROBADO',
  ).length;
  const rfcCode = hasErrors
    ? null
    : `RFC-2026-${String(approvedCount + 1).padStart(4, '0')}`;

  return {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rfcCode,
    status: hasErrors ? 'RECHAZADO' : 'APROBADO',
    submittedAt: new Date().toISOString(),
    input: { ...input },
    findings,
    summaryVerdict: hasErrors
      ? 'Dictamen CAB: RECHAZADO. Corrige las observaciones técnicas señaladas y vuelve a presentar la petición.'
      : `Dictamen CAB: APROBADO (${rfcCode}). Los boletines incluidos quedan desbloqueados para despliegue en WSUS.`,
  };
}
