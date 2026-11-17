import React from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PATCH_BULLETINS } from '../data/initialData';
import {
  GuidedMissionEvaluation,
  LabState,
  SecOpsRubric,
} from '../types/patchday';
import { CtfFlagStatus } from '../utils/labStorage';
import { buildEvidenceHash } from '../utils/rubricScoring';

interface AuditReportModalProps {
  isOpen: boolean;
  state: LabState;
  rubric: SecOpsRubric;
  missions: GuidedMissionEvaluation[];
  ctfFlags: CtfFlagStatus[];
  onChangeAlias: (alias: string) => void;
  onChangeGroup: (group: string) => void;
  onClose: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  state,
  rubric,
  missions,
  ctfFlags,
  onChangeAlias,
  onChangeGroup,
  onClose,
}) => {
  if (!isOpen) return null;

  const aliasDisplay = state.studentAlias.trim() || 'Alumno / Operador SecOps';
  const groupDisplay = state.studentGroup.trim() || 'Laboratorio PatchDay';
  const generatedAt = new Date().toLocaleString('es-ES');
  const evidenceHash = buildEvidenceHash(state);

  const triagedList = PATCH_BULLETINS.filter(
    (b) => Boolean(state.triageDecisions[b.id]?.priority),
  );
  const resolvedIncidents = state.simulation.incidents.filter(
    (i) => i.status === 'resolved',
  );
  const capturedMissionFlags = missions.filter((m) => m.completed);
  const capturedMicroFlags = ctfFlags.filter((f) => f.completed);

  const handleDownloadJson = () => {
    const payload = {
      schema: 'patchday-audit-evidence-v1',
      evidenceSignature: evidenceHash,
      generatedAt: new Date().toISOString(),
      student: {
        alias: aliasDisplay,
        group: groupDisplay,
      },
      rubric,
      guidedMissions: missions.map((m) => ({
        id: m.id,
        title: m.title,
        completed: m.completed,
        flag: m.completed ? m.flagToken : null,
        objectives: m.objectives,
      })),
      technicalFlags: ctfFlags.map((f) => ({
        code: f.code,
        title: f.title,
        completed: f.completed,
      })),
      triageDecisions: triagedList.map((b) => ({
        id: b.id,
        cve: b.cve,
        cvss: b.cvssScore,
        epss: b.epssScore,
        kev: b.inCisaKev,
        assignedPriority: state.triageDecisions[b.id]?.priority,
        queuedForRfc: state.triageDecisions[b.id]?.queuedForRfc,
        note: state.triageDecisions[b.id]?.analystNote,
      })),
      rfcSubmissions: state.rfcSubmissions.map((r) => ({
        rfcCode: r.rfcCode,
        status: r.status,
        submittedAt: r.submittedAt,
        changeType: r.input.changeType,
        patches: r.input.selectedPatchIds,
        targetRings: r.input.targetRings,
        window: r.input.maintenanceWindowId,
        rollbackStrategy: r.input.rollbackStrategy,
      })),
      rollbackAndTerminalHistory: {
        terminalCommands: state.simulation.terminalHistory,
        resolvedIncidents,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = aliasDisplay.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `patchday-informe-${safeName || 'alumno'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Auditoría PatchDay — ${escapeHtml(aliasDisplay)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 32px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
  .score { font-size: 28px; font-weight: 700; color: #0369a1; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; }
  code { font-family: ui-monospace, monospace; font-size: 11px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
  <h1>Informe de Auditoría SecOps — PatchDay</h1>
  <div class="meta">
    Alumno/Alias: <strong>${escapeHtml(aliasDisplay)}</strong> · Grupo: <strong>${escapeHtml(groupDisplay)}</strong> · Fecha: ${escapeHtml(generatedAt)} · Firma: <code>${escapeHtml(evidenceHash)}</code>
  </div>
  <div class="score">Calificación Global: ${rubric.totalScore} / 100 (${escapeHtml(rubric.gradeLabel)})</div>
  <h2>Desglose de Rúbrica (4 KPIs)</h2>
  <table>
    <thead><tr><th>KPI</th><th>Puntuación</th><th>Estado</th><th>Resumen</th></tr></thead>
    <tbody>
      ${rubric.kpis
        .map(
          (k) =>
            `<tr><td>${escapeHtml(k.title)}</td><td><strong>${k.score}/${k.maxScore}</strong></td><td>${escapeHtml(k.status)}</td><td>${escapeHtml(k.findings.join(' '))}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <h2>Misiones CTF y Flags Capturadas (${capturedMissionFlags.length}/${missions.length})</h2>
  <table>
    <thead><tr><th>Misión</th><th>Estado</th><th>Flag Verificable</th></tr></thead>
    <tbody>
      ${missions
        .map(
          (m) =>
            `<tr><td>${escapeHtml(m.number)}: ${escapeHtml(m.title)}</td><td>${m.completed ? 'COMPLETADA' : 'Pendiente'}</td><td><code>${m.completed ? escapeHtml(m.flagToken) : '—'}</code></td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <h2>RFCs Presentados al Comité CAB (${state.rfcSubmissions.length})</h2>
  <table>
    <thead><tr><th>Código</th><th>Estado</th><th>Tipo</th><th>Anillos</th><th>Rollback</th></tr></thead>
    <tbody>
      ${
        state.rfcSubmissions.length === 0
          ? '<tr><td colspan="5">Sin RFCs registrados.</td></tr>'
          : state.rfcSubmissions
              .map(
                (r) =>
                  `<tr><td><code>${escapeHtml(r.rfcCode ?? 'N/A')}</code></td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.input.changeType)}</td><td>${escapeHtml(r.input.targetRings.join(', '))}</td><td>${escapeHtml(r.input.rollbackStrategy)}</td></tr>`,
              )
              .join('')
      }
    </tbody>
  </table>
  <h2>Comandos WinRM y Rollbacks Ejecutados</h2>
  <table>
    <thead><tr><th>Reloj</th><th>Destino</th><th>Comando</th><th>Resultado</th></tr></thead>
    <tbody>
      ${
        state.simulation.terminalHistory.length === 0
          ? '<tr><td colspan="4">Sin comandos ejecutados en consola WinRM.</td></tr>'
          : state.simulation.terminalHistory
              .map(
                (h) =>
                  `<tr><td>${escapeHtml(h.timestamp)}</td><td>${escapeHtml(h.target)}</td><td><code>${escapeHtml(h.command)}</code></td><td>${h.isError ? 'Error' : 'OK'}</td></tr>`,
              )
              .join('')
      }
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = aliasDisplay.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `patchday-informe-${safeName || 'alumno'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto print-only-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-report-title"
    >
      <div className="w-full max-w-4xl rounded-lg border border-slate-700 bg-[#0F172A] shadow-2xl overflow-hidden print-only-container">
        {/* Modal Controls Bar (hidden on print) */}
        <div className="no-print border-b border-slate-800 bg-[#0B1120] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2
                id="audit-report-title"
                className="font-display text-sm font-bold text-slate-100"
              >
                Generador de Informe de Auditoría PatchDay (Evidencias para el Profesor)
              </h2>
              <p className="text-[11px] text-slate-400">
                Introduce tu Nombre/Alias y exporta en PDF (Imprimir), JSON verificable o HTML.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Imprimir / Guardar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Exportar JSON</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <FileCode2 className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>HTML Offline</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar informe"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Student Alias Form (hidden on print) */}
        <div className="no-print border-b border-slate-800 bg-[#111827] px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="student-alias-input"
              className="block text-[11px] font-medium text-slate-300 mb-1"
            >
              Nombre completo o Alias del Alumno
            </label>
            <input
              id="student-alias-input"
              type="text"
              value={state.studentAlias}
              onChange={(e) => onChangeAlias(e.target.value)}
              placeholder="Ej: Laura Martínez (SysAdmin-04)"
              className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="student-group-input"
              className="block text-[11px] font-medium text-slate-300 mb-1"
            >
              Grupo / Asignatura / Convocatoria (opcional)
            </label>
            <input
              id="student-group-input"
              type="text"
              value={state.studentGroup}
              onChange={(e) => onChangeGroup(e.target.value)}
              placeholder="Ej: ASIR 2º · Seguridad y Alta Disponibilidad"
              className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div
          id="patchday-print-report"
          className="bg-white text-slate-900 p-6 sm:p-8 max-h-[70vh] overflow-y-auto print-only-container space-y-5"
        >
          {/* Report Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-sky-700">
                PatchDay · Informe Técnico de Auditoría SecOps &amp; WSUS
              </div>
              <h3 className="text-xl font-bold text-slate-950 mt-0.5">
                {aliasDisplay}
              </h3>
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <div>Grupo / Curso: {groupDisplay}</div>
                <div>
                  Generado: <span className="font-mono">{generatedAt}</span> · Firma
                  de Integridad:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {evidenceHash}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right border border-slate-300 rounded-md px-4 py-2.5 bg-slate-50">
              <div className="text-[11px] font-medium text-slate-600">
                Calificación Global Rúbrica
              </div>
              <div className="font-mono text-2xl font-bold text-sky-700 tabular-nums">
                {rubric.totalScore} / 100
              </div>
              <div className="text-xs font-semibold text-slate-800">
                {rubric.gradeLabel}
              </div>
            </div>
          </div>

          {/* 4 KPI Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              1. Evaluación Desglosada por KPIs SecOps
            </h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border border-slate-300 text-slate-700">
                  <th className="p-2 text-left">KPI Evaluado</th>
                  <th className="p-2 text-center w-24">Nota</th>
                  <th className="p-2 text-left">Evidencias y Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {rubric.kpis.map((kpi) => (
                  <tr key={kpi.id} className="border border-slate-300 align-top">
                    <td className="p-2 font-semibold text-slate-900">
                      {kpi.title}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-slate-900">
                      {kpi.score}/{kpi.maxScore}
                    </td>
                    <td className="p-2 text-slate-700 space-y-0.5">
                      {kpi.findings.map((f, idx) => (
                        <div key={idx}>• {f}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Captured Flags */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              2. Misiones Guiadas CTF ({capturedMissionFlags.length}/{missions.length}) y Flags Técnicas ({capturedMicroFlags.length}/{ctfFlags.length})
            </h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border border-slate-300 text-slate-700">
                  <th className="p-2 text-left">Misión</th>
                  <th className="p-2 text-left w-28">Estado</th>
                  <th className="p-2 text-left">Token FLAG</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.id} className="border border-slate-300">
                    <td className="p-2 font-medium text-slate-900">
                      {m.number}: {m.title}
                    </td>
                    <td className="p-2 font-mono text-[11px]">
                      {m.completed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          CAPTURADA
                        </span>
                      ) : (
                        <span className="text-slate-500">Pendiente</span>
                      )}
                    </td>
                    <td className="p-2 font-mono text-[11px] text-slate-800">
                      {m.completed ? m.flagToken : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Triage Decisions */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              3. Decisiones de Triage Registradas ({triagedList.length}/{PATCH_BULLETINS.length})
            </h4>
            {triagedList.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                No se registraron decisiones de clasificación en Triage.
              </div>
            ) : (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border border-slate-300 text-slate-700">
                    <th className="p-1.5 text-left">Boletín</th>
                    <th className="p-1.5 text-left">CVE</th>
                    <th className="p-1.5 text-center">CVSS / EPSS</th>
                    <th className="p-1.5 text-center">KEV</th>
                    <th className="p-1.5 text-center">Prioridad</th>
                    <th className="p-1.5 text-center">Cola RFC</th>
                  </tr>
                </thead>
                <tbody>
                  {triagedList.map((b) => {
                    const dec = state.triageDecisions[b.id];
                    return (
                      <tr key={b.id} className="border border-slate-300 font-mono">
                        <td className="p-1.5 font-semibold">{b.id}</td>
                        <td className="p-1.5">{b.cve}</td>
                        <td className="p-1.5 text-center">
                          {b.cvssScore.toFixed(1)} / {Math.round(b.epssScore * 100)}%
                        </td>
                        <td className="p-1.5 text-center">
                          {b.inCisaKev ? 'Sí' : 'No'}
                        </td>
                        <td className="p-1.5 text-center font-bold">
                          {dec?.priority}
                        </td>
                        <td className="p-1.5 text-center">
                          {dec?.queuedForRfc ? 'Encolado' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* RFC & Rollback History */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                4. RFCs Presentados al CAB ({state.rfcSubmissions.length})
              </h4>
              {state.rfcSubmissions.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  Sin solicitudes RFC enviadas al CAB.
                </div>
              ) : (
                <ul className="space-y-1.5 text-[11px] font-mono">
                  {state.rfcSubmissions.map((r) => (
                    <li
                      key={r.id}
                      className="border border-slate-300 rounded p-2 bg-slate-50"
                    >
                      <div className="font-bold">
                        {r.rfcCode ?? 'RECHAZADO'} · {r.status} ({r.input.changeType})
                      </div>
                      <div className="text-slate-600">
                        KBs: {r.input.selectedPatchIds.join(', ')} · Rings:{' '}
                        {r.input.targetRings.join(', ')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                5. Comandos WinRM y Rollbacks ({state.simulation.terminalHistory.length} cmds ·{' '}
                {resolvedIncidents.length} resueltos)
              </h4>
              {state.simulation.terminalHistory.length === 0 &&
              resolvedIncidents.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  Sin comandos WinRM ni rollbacks ejecutados todavía.
                </div>
              ) : (
                <ul className="space-y-1.5 text-[11px] font-mono">
                  {state.simulation.terminalHistory.slice(-6).map((h) => (
                    <li
                      key={h.id}
                      className="border border-slate-300 rounded p-2 bg-slate-50"
                    >
                      <div className="font-semibold">
                        [{h.timestamp}] {h.target}
                      </div>
                      <div className="text-slate-800 break-all">
                        $ {h.command} ({h.isError ? 'Error' : 'OK'})
                      </div>
                    </li>
                  ))}
                  {resolvedIncidents.map((inc) => (
                    <li
                      key={inc.id}
                      className="border border-emerald-300 rounded p-2 bg-emerald-50 text-emerald-900"
                    >
                      ✓ {inc.patchId}: {inc.resolutionMethod}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
