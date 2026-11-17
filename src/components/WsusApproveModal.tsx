import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  GitBranch,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  createEmptyWsusPatchApproval,
  DEPLOYMENT_RINGS,
} from '../data/initialData';
import {
  DeploymentRingId,
  PatchBulletin,
  RfcSubmission,
  WsusApprovalAction,
  WsusPatchApproval,
} from '../types/patchday';

interface WsusApproveModalProps {
  isOpen: boolean;
  bulletin: PatchBulletin | null;
  currentApproval: WsusPatchApproval;
  rfcSubmissions: RfcSubmission[];
  onClose: () => void;
  onSaveApproval: (patchId: string, approval: WsusPatchApproval) => void;
  onOpenRfcModule: () => void;
}

const DEADLINE_OPTIONS = [
  'Sin fecha límite (Ventana estándar)',
  'En 24 horas (Forzado)',
  'En 72 horas',
  'Sábado 02:00 (Ventana Anillo 2)',
  'Domingo 01:00 (Ventana Anillo 3)',
];

export const WsusApproveModal: React.FC<WsusApproveModalProps> = ({
  isOpen,
  bulletin,
  currentApproval,
  rfcSubmissions,
  onClose,
  onSaveApproval,
  onOpenRfcModule,
}) => {
  const [draft, setDraft] = useState<WsusPatchApproval>(
    () => currentApproval ?? createEmptyWsusPatchApproval(),
  );

  useEffect(() => {
    if (isOpen) {
      setDraft(
        currentApproval
          ? {
              declinedGlobally: currentApproval.declinedGlobally,
              rings: {
                'ring-0': { ...currentApproval.rings['ring-0'] },
                'ring-1': { ...currentApproval.rings['ring-1'] },
                'ring-2': { ...currentApproval.rings['ring-2'] },
                'ring-3': { ...currentApproval.rings['ring-3'] },
              },
            }
          : createEmptyWsusPatchApproval(),
      );
    }
  }, [isOpen, currentApproval, bulletin?.id]);

  if (!isOpen || !bulletin) return null;

  // Approved RFCs from Phase 2 that authorize this specific KB
  const getValidRfcsForRing = (ringId: DeploymentRingId) =>
    rfcSubmissions.filter(
      (sub) =>
        sub.status === 'APROBADO' &&
        Boolean(sub.rfcCode) &&
        sub.input.selectedPatchIds.includes(bulletin.id) &&
        sub.input.targetRings.includes(ringId),
    );

  const handleRingActionChange = (
    ringId: DeploymentRingId,
    action: WsusApprovalAction,
  ) => {
    const validRfcs = getValidRfcsForRing(ringId);
    const requiresGov = ringId === 'ring-2' || ringId === 'ring-3';

    if (action === 'Approved for Install' && requiresGov && validRfcs.length === 0) {
      return; // Blocked by governance
    }

    setDraft((prev) => ({
      ...prev,
      declinedGlobally: false,
      rings: {
        ...prev.rings,
        [ringId]: {
          ...prev.rings[ringId],
          action,
          linkedRfcCode:
            action === 'Approved for Install' && requiresGov
              ? prev.rings[ringId]?.linkedRfcCode || validRfcs[0]?.rfcCode || undefined
              : undefined,
          deadline:
            action === 'Approved for Install'
              ? prev.rings[ringId]?.deadline || DEADLINE_OPTIONS[0]
              : undefined,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const handleDeclineUpdate = () => {
    setDraft({
      declinedGlobally: true,
      rings: {
        'ring-0': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-1': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-2': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-3': { action: 'Declined', updatedAt: new Date().toISOString() },
      },
    });
  };

  const handleResetToNotApproved = () => {
    setDraft(createEmptyWsusPatchApproval());
  };

  const handleConfirmSave = () => {
    onSaveApproval(bulletin.id, draft);
    onClose();
  };

  const anyApprovedForInstall = DEPLOYMENT_RINGS.some(
    (r) => draft.rings[r.id]?.action === 'Approved for Install',
  );
  const anyApprovedForRemoval = DEPLOYMENT_RINGS.some(
    (r) => draft.rings[r.id]?.action === 'Approved for Removal',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wsus-approve-title"
    >
      <div className="w-full max-w-3xl rounded-lg border border-slate-700 bg-[#111827] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0F172A] px-5 py-3.5">
          <div>
            <h2
              id="wsus-approve-title"
              className="font-display text-base font-semibold text-slate-100"
            >
              Approve Updates... (SRV-WSUS-01)
            </h2>
            <p className="text-xs font-mono text-sky-400 mt-0.5">
              {bulletin.id} · {bulletin.cve} · {bulletin.classification}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo de aprobación"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Update Summary & Warnings */}
          <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3 text-xs space-y-1.5">
            <div className="font-semibold text-slate-100">{bulletin.title}</div>
            <div className="text-slate-400 font-mono">
              Arquitectura: {bulletin.architecture ?? 'x64'} · Tamaño: {bulletin.sizeMb} MB ·
              Reinicio: {bulletin.requiresReboot}
            </div>
          </div>

          {bulletin.supersededBy && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 flex items-start gap-2.5">
              <GitBranch className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-semibold text-amber-300">
                  Advertencia de Supersedencia WSUS
                </div>
                <p className="mt-0.5 leading-relaxed">
                  Este boletín está reemplazado por{' '}
                  <span className="font-mono font-semibold">{bulletin.supersededBy}</span>.
                  Aprobarlo para instalación consumirá ancho de banda y tiempo de reinicio inútilmente; se recomienda marcarlo como{' '}
                  <span className="font-semibold">Declined</span>.
                </p>
              </div>
            </div>
          )}

          {bulletin.architecture === 'ARM64' && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-semibold text-amber-300">
                  Arquitectura no utilizada (ARM64)
                </div>
                <p className="mt-0.5 leading-relaxed">
                  Ninguno de los 197 equipos gestionados ejecuta ARM64. Declina esta actualización para mantener limpio el almacenamiento de SRV-WSUS-01.
                </p>
              </div>
            </div>
          )}

          {anyApprovedForRemoval && bulletin.supportsWusaUninstall === false && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2.5">
              <AlertOctagon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-semibold text-red-300">
                  Aviso de Rollback WSUS (Approved for Removal)
                </div>
                <p className="mt-0.5">
                  {bulletin.rollbackHint ??
                    'Este paquete no admite desinstalación limpia por wusa.exe; coordina restauración de snapshot o failover.'}
                </p>
              </div>
            </div>
          )}

          {/* Global Decline Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#0D1425] px-3.5 py-2.5">
            <div className="text-xs text-slate-300">
              {draft.declinedGlobally ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Marcado como Declined en todo el servidor WSUS</span>
                </span>
              ) : (
                <span>Configura la aprobación granular por Grupo de Destino (Anillo):</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {draft.declinedGlobally ? (
                <button
                  type="button"
                  onClick={handleResetToNotApproved}
                  className="rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  Restaurar a Not Approved
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeclineUpdate}
                  className="inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20 cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Declinar actualización (Declined)</span>
                </button>
              )}
            </div>
          </div>

          {/* Per-Ring Approval Table */}
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B1120] text-[11px] font-semibold text-slate-400">
                  <th className="px-3.5 py-2.5">Grupo de Destino (Anillo)</th>
                  <th className="px-3 py-2.5">Aprobación WSUS</th>
                  <th className="px-3 py-2.5">Deadline / Código RFC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-[#0F172A]">
                {DEPLOYMENT_RINGS.map((ring) => {
                  const ringState = draft.rings[ring.id] ?? { action: 'Not Approved' };
                  const requiresGov = ring.requiresCab;
                  const validRfcs = getValidRfcsForRing(ring.id);
                  const installLocked = requiresGov && validRfcs.length === 0;

                  return (
                    <tr key={ring.id}>
                      <td className="px-3.5 py-3 align-top">
                        <div className="font-semibold text-slate-100">
                          {ring.wsusGroupName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {ring.fleetCount} equipos · {ring.fleetComposition}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <select
                          aria-label={`Aprobación para ${ring.wsusGroupName}`}
                          value={ringState.action}
                          disabled={draft.declinedGlobally}
                          onChange={(e) =>
                            handleRingActionChange(
                              ring.id,
                              e.target.value as WsusApprovalAction,
                            )
                          }
                          className="h-8 w-full min-w-[180px] rounded border border-slate-700 bg-[#0B1120] px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-50"
                        >
                          <option value="Not Approved">Not Approved</option>
                          <option
                            value="Approved for Install"
                            disabled={installLocked}
                          >
                            Approved for Install
                            {installLocked ? ' (Bloqueado: Sin RFC)' : ''}
                          </option>
                          <option value="Approved for Removal">
                            Approved for Removal (Rollback)
                          </option>
                        </select>

                        {installLocked && !draft.declinedGlobally && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-300">
                            <span className="inline-flex items-center gap-1">
                              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>Exige RFC-2026-XXXX aprobado</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenRfcModule();
                              }}
                              className="text-sky-400 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Tramitar RFC
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top space-y-2">
                        {ringState.action === 'Approved for Install' ? (
                          <>
                            <select
                              aria-label={`Deadline para ${ring.wsusGroupName}`}
                              value={ringState.deadline ?? DEADLINE_OPTIONS[0]}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  rings: {
                                    ...prev.rings,
                                    [ring.id]: {
                                      ...prev.rings[ring.id],
                                      deadline: e.target.value,
                                    },
                                  },
                                }))
                              }
                              className="h-8 w-full rounded border border-slate-700 bg-[#0B1120] px-2 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
                            >
                              {DEADLINE_OPTIONS.map((dl) => (
                                <option key={dl} value={dl}>
                                  {dl}
                                </option>
                              ))}
                            </select>

                            {requiresGov && validRfcs.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck
                                  className="h-3.5 w-3.5 text-emerald-400 shrink-0"
                                  aria-hidden="true"
                                />
                                <select
                                  aria-label={`Vincular RFC para ${ring.wsusGroupName}`}
                                  value={
                                    ringState.linkedRfcCode ?? validRfcs[0]?.rfcCode ?? ''
                                  }
                                  onChange={(e) =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      rings: {
                                        ...prev.rings,
                                        [ring.id]: {
                                          ...prev.rings[ring.id],
                                          linkedRfcCode: e.target.value,
                                        },
                                      },
                                    }))
                                  }
                                  className="h-7 w-full rounded border border-emerald-500/40 bg-emerald-950/40 px-2 font-mono text-[11px] text-emerald-300 focus:outline-none"
                                >
                                  {validRfcs.map((sub) => (
                                    <option
                                      key={sub.id}
                                      value={sub.rfcCode ?? ''}
                                    >
                                      Vinculado: {sub.rfcCode} ({sub.input.changeType})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        ) : ringState.action === 'Approved for Removal' ? (
                          <span className="font-mono text-[11px] text-amber-300">
                            Desinstalación / Rollback programado
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Sin despliegue asignado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {anyApprovedForInstall && bulletin.supersededBy && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Penalización activa: aprobar un parche reemplazado consumirá{' '}
              <span className="font-mono font-semibold">
                {bulletin.sizeMb} MB/equipo
              </span>{' '}
              adicionales y forzará reinicios redundantes.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#0F172A] px-5 py-3.5">
          <span className="text-xs text-slate-400">
            Ring 0 y Ring 1 permiten pruebas libres · Ring 2 y Ring 3 exigen sello RFC-2026-XXXX.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Aplicar Aprobaciones</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
