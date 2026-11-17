import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  HardDrive,
  Lock,
  Play,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  createEmptyWsusPatchApproval,
  DEPLOYMENT_RINGS,
  ENTERPRISE_ASSETS,
  MAINTENANCE_WINDOW_OPTIONS,
  PATCH_BULLETINS,
} from '../data/initialData';
import {
  DeploymentRingId,
  EnterpriseAsset,
  MaintenanceWindowId,
  PatchBulletin,
  PatchClassification,
  RfcSubmission,
  WsusAutoApprovalRule,
  WsusPatchApproval,
} from '../types/patchday';
import {
  UnlockedPatchApproval,
  WsusHygieneMetrics,
} from '../utils/labStorage';
import { WsusApproveModal } from './WsusApproveModal';

interface WsusConsoleModuleProps {
  selectedRingFilter: DeploymentRingId | 'all';
  selectedAssetId: string | null;
  ringMaintenanceWindows: Record<DeploymentRingId, MaintenanceWindowId>;
  unlockedMap: Map<string, UnlockedPatchApproval>;
  wsusApprovals: Record<string, WsusPatchApproval>;
  wsusAutoApproval: WsusAutoApprovalRule;
  hygieneMetrics: WsusHygieneMetrics;
  rfcSubmissions: RfcSubmission[];
  onSelectRingFilter: (ring: DeploymentRingId | 'all') => void;
  onSelectAsset: (assetId: string) => void;
  onSaveWsusApproval: (patchId: string, approval: WsusPatchApproval) => void;
  onUpdateAutoApproval: (rule: WsusAutoApprovalRule) => void;
  onRunAutoApproval: () => void;
  onDeclineSupersededBatch: () => void;
  onJumpToPatchInTriage: (patchId: string) => void;
  onOpenRfcModule: () => void;
}

type WsusTreeNode =
  | { type: 'updates'; scope: 'all' | 'critical' | 'security' | 'wsus' }
  | { type: 'computers'; ring: DeploymentRingId | 'all' }
  | { type: 'auto-rules' };

type ApprovalFilter =
  | 'Any except Declined'
  | 'Unapproved'
  | 'Approved'
  | 'Declined'
  | 'Any';

type StatusFilter =
  | 'Any'
  | 'Needed'
  | 'Failed'
  | 'Installed/Not Applicable';

const SupersedenceIcon: React.FC<{ bulletin: PatchBulletin }> = ({
  bulletin,
}) => {
  const hasSupersedes = bulletin.supersedes.length > 0;
  const isSuperseded = Boolean(bulletin.supersededBy);

  if (!hasSupersedes && !isSuperseded) {
    return (
      <span
        title="Sin cadena de reemplazo"
        className="inline-block h-3.5 w-3.5 rounded-[2px] border border-slate-700 bg-slate-800/60"
      />
    );
  }

  if (hasSupersedes && !isSuperseded) {
    // Top of chain (supersedes older patches)
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="shrink-0"
        aria-label="Reemplaza actualizaciones anteriores"
      >
        <title>Reemplaza a: {bulletin.supersedes.join(', ')}</title>
        <rect x="2" y="2" width="8" height="8" rx="1" fill="#0EA5E9" />
        <rect x="6" y="6" width="8" height="8" rx="1" fill="#334155" stroke="#0F172A" />
      </svg>
    );
  }

  if (hasSupersedes && isSuperseded) {
    // Middle of chain
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="shrink-0"
        aria-label="En medio de cadena de supersedencia"
      >
        <title>
          En cadena: reemplaza a {bulletin.supersedes.join(', ')} y es reemplazado por{' '}
          {bulletin.supersededBy}
        </title>
        <rect x="1" y="1" width="7" height="7" rx="1" fill="#475569" />
        <rect x="4" y="4" width="8" height="8" rx="1" fill="#F59E0B" stroke="#0F172A" />
        <rect x="8" y="8" width="7" height="7" rx="1" fill="#334155" stroke="#0F172A" />
      </svg>
    );
  }

  // Superseded at end/base of chain
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="shrink-0"
      aria-label="Actualización reemplazada (Superseded)"
    >
      <title>Reemplazado por {bulletin.supersededBy}</title>
      <rect x="2" y="2" width="8" height="8" rx="1" fill="#475569" />
      <rect x="6" y="6" width="8" height="8" rx="1" fill="#F59E0B" stroke="#0F172A" />
    </svg>
  );
};

export const WsusConsoleModule: React.FC<WsusConsoleModuleProps> = ({
  selectedRingFilter,
  selectedAssetId,
  ringMaintenanceWindows,
  unlockedMap,
  wsusApprovals,
  wsusAutoApproval,
  hygieneMetrics,
  rfcSubmissions,
  onSelectRingFilter,
  onSelectAsset,
  onSaveWsusApproval,
  onUpdateAutoApproval,
  onRunAutoApproval,
  onDeclineSupersededBatch,
  onJumpToPatchInTriage,
  onOpenRfcModule,
}) => {
  const [treeNode, setTreeNode] = useState<WsusTreeNode>({
    type: 'updates',
    scope: 'all',
  });
  const [updatesExpanded, setUpdatesExpanded] = useState(true);
  const [computersExpanded, setComputersExpanded] = useState(true);

  // WSUS Central Filters
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>(
    'Any except Declined',
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Any');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUpdateId, setSelectedUpdateId] = useState<string>('KB5034848');
  const [approveModalOpen, setApproveModalOpen] = useState(false);

  const getUpdateApprovalSummary = (b: PatchBulletin) => {
    const app = wsusApprovals[b.id] ?? createEmptyWsusPatchApproval();
    if (app.declinedGlobally) {
      return {
        category: 'Declined' as const,
        label: 'Declined',
        installPct: b.wsusStatusDefault === 'Installed' ? 100 : 0,
        status: b.wsusStatusDefault ?? 'Not Applicable',
      };
    }

    const approvedRings = DEPLOYMENT_RINGS.filter(
      (r) => app.rings[r.id]?.action === 'Approved for Install',
    );
    const removalRings = DEPLOYMENT_RINGS.filter(
      (r) => app.rings[r.id]?.action === 'Approved for Removal',
    );

    if (removalRings.length > 0) {
      return {
        category: 'Approved' as const,
        label: `Removal (${removalRings.map((r) => r.id.replace('ring-', 'R')).join(',')})`,
        installPct: 0,
        status: 'Needed' as const,
      };
    }

    if (approvedRings.length > 0) {
      const totalFleet = DEPLOYMENT_RINGS.reduce((a, r) => a + r.fleetCount, 0);
      const coveredFleet = approvedRings.reduce((a, r) => a + r.fleetCount, 0);
      const pct = Math.min(100, Math.round((coveredFleet / totalFleet) * 100));
      return {
        category: 'Approved' as const,
        label: `Install (${approvedRings.map((r) => r.id.replace('ring-', 'R')).join(',')})`,
        installPct: b.architecture === 'ARM64' ? 0 : pct,
        status:
          b.architecture === 'ARM64'
            ? ('Not Applicable' as const)
            : pct >= 85
              ? ('Installed' as const)
              : ('Needed' as const),
      };
    }

    const baseStatus = b.wsusStatusDefault ?? 'Needed';
    return {
      category: 'Unapproved' as const,
      label: 'Unapproved',
      installPct: baseStatus === 'Installed' ? 100 : 0,
      status: baseStatus,
    };
  };

  const filteredUpdates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const scope = treeNode.type === 'updates' ? treeNode.scope : 'all';

    return PATCH_BULLETINS.filter((b) => {
      if (scope === 'critical' && b.classification !== 'Critical Update')
        return false;
      if (scope === 'security' && b.classification !== 'Security Update')
        return false;
      if (scope === 'wsus' && b.classification !== 'WSUS Update') return false;

      const summary = getUpdateApprovalSummary(b);

      if (
        approvalFilter === 'Any except Declined' &&
        summary.category === 'Declined'
      ) {
        return false;
      }
      if (approvalFilter === 'Unapproved' && summary.category !== 'Unapproved') {
        return false;
      }
      if (approvalFilter === 'Approved' && summary.category !== 'Approved') {
        return false;
      }
      if (approvalFilter === 'Declined' && summary.category !== 'Declined') {
        return false;
      }

      if (statusFilter === 'Needed' && summary.status !== 'Needed') return false;
      if (statusFilter === 'Failed' && summary.status !== 'Failed') return false;
      if (
        statusFilter === 'Installed/Not Applicable' &&
        summary.status !== 'Installed' &&
        summary.status !== 'Not Applicable'
      ) {
        return false;
      }

      if (q) {
        const hay = `${b.id} ${b.cve} ${b.title} ${b.vendor} ${b.classification}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [treeNode, approvalFilter, statusFilter, searchQuery, wsusApprovals]);

  const activeUpdate: PatchBulletin = useMemo(
    () =>
      filteredUpdates.find((b) => b.id === selectedUpdateId) ??
      PATCH_BULLETINS.find((b) => b.id === selectedUpdateId) ??
      PATCH_BULLETINS[0],
    [filteredUpdates, selectedUpdateId],
  );

  const activeUpdateSummary = getUpdateApprovalSummary(activeUpdate);

  // Computers view filtering
  const activeComputerRing =
    treeNode.type === 'computers' ? treeNode.ring : selectedRingFilter;

  const visibleAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ENTERPRISE_ASSETS.filter((asset) => {
      if (activeComputerRing !== 'all' && asset.ringId !== activeComputerRing)
        return false;
      if (q) {
        const hay = `${asset.id} ${asset.hostname} ${asset.os} ${asset.role} ${asset.ip}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeComputerRing, searchQuery]);

  const activeAsset: EnterpriseAsset = useMemo(() => {
    const found = visibleAssets.find((a) => a.id === selectedAssetId);
    return found ?? visibleAssets[0] ?? ENTERPRISE_ASSETS[0];
  }, [visibleAssets, selectedAssetId]);

  const activeAssetRing = useMemo(
    () =>
      DEPLOYMENT_RINGS.find((r) => r.id === activeAsset.ringId) ??
      DEPLOYMENT_RINGS[0],
    [activeAsset],
  );

  const totalFleetCount = DEPLOYMENT_RINGS.reduce(
    (acc, r) => acc + r.fleetCount,
    0,
  );

  const handleQuickDecline = (patchId: string) => {
    onSaveWsusApproval(patchId, {
      declinedGlobally: true,
      rings: {
        'ring-0': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-1': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-2': { action: 'Declined', updatedAt: new Date().toISOString() },
        'ring-3': { action: 'Declined', updatedAt: new Date().toISOString() },
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-sky-400">
            Módulo 3 · Consola WSUS (Windows Server Update Services) &amp; Anillos
          </div>
          <h2 className="mt-0.5 font-display text-lg font-bold text-slate-50">
            Update Services · Servidor SRV-WSUS-01
          </h2>
          <p className="text-xs text-slate-400">
            Gestiona aprobaciones por anillo, cadena de supersedencia, declinación de paquetes obsoletos/ARM64 y bloqueo CAB para Producción.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
          <div>
            <span className="text-slate-400">Flota gestionada: </span>
            <span className="font-semibold text-slate-100">{totalFleetCount} equipos</span>
          </div>
          <div>
            <span className="text-slate-400">Autorizados CAB: </span>
            <span className="font-semibold text-emerald-400">{unlockedMap.size} KBs</span>
          </div>
        </div>
      </div>

      {/* Hygiene Penalty Banner if superseded or ARM64 patches were approved for install */}
      {(hygieneMetrics.supersededApprovedIds.length > 0 ||
        hygieneMetrics.arm64ApprovedIds.length > 0) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-red-100">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold text-red-300">
                Penalización de Higiene WSUS: Parche reemplazado o arquitectura ARM64 aprobada
              </div>
              <p className="mt-0.5 text-red-100/90">
                Aprobaste{' '}
                <span className="font-mono font-semibold">
                  {[
                    ...hygieneMetrics.supersededApprovedIds,
                    ...hygieneMetrics.arm64ApprovedIds,
                  ].join(', ')}
                </span>
                . Consumo innecesario:{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {(hygieneMetrics.wastedBandwidthMb / 1024).toFixed(2)} GB
                </span>{' '}
                de ancho de banda y{' '}
                <span className="font-mono font-semibold tabular-nums">
                  +{hygieneMetrics.wastedRebootMinutes} min
                </span>{' '}
                de ventana de reinicio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDeclineSupersededBatch}
            className="rounded-md border border-red-400/50 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30 whitespace-nowrap cursor-pointer"
          >
            Declinar obsoletos y ARM64
          </button>
        </div>
      )}

      {/* Classic 3-Pane MMC WSUS Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-lg border border-slate-800 bg-[#0B1120] overflow-hidden min-h-[660px]">
        {/* Left Navigation Tree */}
        <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0F172A] p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-slate-200">
            <Server className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Update Services · SRV-WSUS-01</span>
          </div>

          <div className="space-y-1 text-xs">
            {/* Updates Node */}
            <button
              type="button"
              onClick={() => setUpdatesExpanded(!updatesExpanded)}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 font-medium text-slate-200 hover:bg-slate-800/70 cursor-pointer"
            >
              {updatesExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Updates</span>
            </button>

            {updatesExpanded && (
              <div className="ml-4 space-y-0.5 border-l border-slate-800 pl-2">
                {(
                  [
                    {
                      scope: 'all' as const,
                      label: 'All Updates',
                      count: PATCH_BULLETINS.length,
                    },
                    {
                      scope: 'critical' as const,
                      label: 'Critical Updates',
                      count: PATCH_BULLETINS.filter(
                        (b) => b.classification === 'Critical Update',
                      ).length,
                    },
                    {
                      scope: 'security' as const,
                      label: 'Security Updates',
                      count: PATCH_BULLETINS.filter(
                        (b) => b.classification === 'Security Update',
                      ).length,
                    },
                    {
                      scope: 'wsus' as const,
                      label: 'WSUS Updates',
                      count: PATCH_BULLETINS.filter(
                        (b) => b.classification === 'WSUS Update',
                      ).length,
                    },
                  ]
                ).map((item) => {
                  const active =
                    treeNode.type === 'updates' && treeNode.scope === item.scope;
                  return (
                    <button
                      key={item.scope}
                      type="button"
                      onClick={() =>
                        setTreeNode({ type: 'updates', scope: item.scope })
                      }
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-600/20 text-sky-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400">
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Computers Node */}
            <button
              type="button"
              onClick={() => setComputersExpanded(!computersExpanded)}
              className="mt-2 flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 font-medium text-slate-200 hover:bg-slate-800/70 cursor-pointer"
            >
              {computersExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <FolderTree className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Computers</span>
            </button>

            {computersExpanded && (
              <div className="ml-4 space-y-0.5 border-l border-slate-800 pl-2">
                <button
                  type="button"
                  onClick={() => {
                    setTreeNode({ type: 'computers', ring: 'all' });
                    onSelectRingFilter('all');
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors cursor-pointer ${
                    treeNode.type === 'computers' && treeNode.ring === 'all'
                      ? 'bg-sky-600/20 text-sky-300 font-medium'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span>All Computers</span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    {totalFleetCount}
                  </span>
                </button>

                {DEPLOYMENT_RINGS.map((ring) => {
                  const active =
                    treeNode.type === 'computers' && treeNode.ring === ring.id;
                  return (
                    <button
                      key={ring.id}
                      type="button"
                      onClick={() => {
                        setTreeNode({ type: 'computers', ring: ring.id });
                        onSelectRingFilter(ring.id);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-600/20 text-sky-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate pr-2">{ring.wsusGroupName}</span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                        {ring.fleetCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Automatic Approvals Rule Node */}
            <button
              type="button"
              onClick={() => setTreeNode({ type: 'auto-rules' })}
              className={`mt-2 flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors cursor-pointer ${
                treeNode.type === 'auto-rules'
                  ? 'bg-sky-600/20 text-sky-300 font-medium'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>Automatic Approvals</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {wsusAutoApproval.enabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* Center + Bottom Panes */}
        <div className="lg:col-span-9 flex flex-col justify-between bg-[#111827]">
          {treeNode.type === 'updates' && (
            <>
              <div>
                {/* Classic WSUS Filter Bar */}
                <div className="border-b border-slate-800 bg-[#0F172A] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      <span className="text-slate-400">Approval:</span>
                      <select
                        value={approvalFilter}
                        onChange={(e) =>
                          setApprovalFilter(e.target.value as ApprovalFilter)
                        }
                        className="h-8 rounded border border-slate-700 bg-[#0B1120] px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                      >
                        <option value="Any except Declined">Any except Declined</option>
                        <option value="Unapproved">Unapproved</option>
                        <option value="Approved">Approved</option>
                        <option value="Declined">Declined</option>
                        <option value="Any">Any</option>
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      <span className="text-slate-400">Status:</span>
                      <select
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(e.target.value as StatusFilter)
                        }
                        className="h-8 rounded border border-slate-700 bg-[#0B1120] px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                      >
                        <option value="Any">Any</option>
                        <option value="Needed">Needed</option>
                        <option value="Failed">Failed</option>
                        <option value="Installed/Not Applicable">
                          Installed/Not Applicable
                        </option>
                      </select>
                    </label>

                    <div className="relative w-48">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filtrar KB, CVE..."
                        className="h-8 w-full rounded border border-slate-700 bg-[#0B1120] pl-8 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* WSUS Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setApproveModalOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Approve Updates...</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDecline(activeUpdate.id)}
                      className="inline-flex h-8 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:text-red-300 whitespace-nowrap cursor-pointer"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>

                {/* Dense WSUS Updates Grid */}
                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                  {filteredUpdates.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Ninguna actualización coincide con los filtros de Approval y Status seleccionados.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-[#0B1120] border-b border-slate-800 text-[11px] text-slate-400">
                        <tr>
                          <th className="px-3 py-2 w-8" title="Supersedencia">
                            Sup.
                          </th>
                          <th className="px-3 py-2">Title / KB</th>
                          <th className="px-3 py-2">Classification</th>
                          <th className="px-3 py-2">Approval</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Installed %</th>
                          <th className="px-3 py-2 text-right">Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredUpdates.map((b) => {
                          const isSelected = b.id === activeUpdate.id;
                          const summary = getUpdateApprovalSummary(b);
                          const approval = unlockedMap.get(b.id);

                          return (
                            <tr
                              key={b.id}
                              onClick={() => setSelectedUpdateId(b.id)}
                              onDoubleClick={() => setApproveModalOpen(true)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-sky-500/15'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="px-3 py-2 align-middle">
                                <SupersedenceIcon bulletin={b} />
                              </td>
                              <td className="px-3 py-2 max-w-sm">
                                <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-100">
                                  <span>{b.id}</span>
                                  {b.architecture === 'ARM64' && (
                                    <span className="text-[10px] font-normal text-amber-400">
                                      [ARM64]
                                    </span>
                                  )}
                                  {b.inCisaKev && !b.supersededBy && (
                                    <span className="text-[10px] text-red-400">
                                      [KEV]
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-slate-300">
                                  {b.title}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                                {b.classification}
                              </td>
                              <td className="px-3 py-2 font-mono whitespace-nowrap">
                                <span
                                  className={
                                    summary.category === 'Declined'
                                      ? 'text-slate-500'
                                      : summary.category === 'Approved'
                                        ? 'text-emerald-400 font-semibold'
                                        : 'text-slate-300'
                                  }
                                >
                                  {summary.label}
                                </span>
                                {approval && summary.category !== 'Declined' && (
                                  <span className="ml-1.5 text-[10px] text-sky-400">
                                    ({approval.rfcCode})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono">
                                <span
                                  className={
                                    summary.status === 'Failed'
                                      ? 'text-red-400 font-semibold'
                                      : summary.status === 'Needed'
                                        ? 'text-amber-300'
                                        : summary.status === 'Installed'
                                          ? 'text-emerald-400'
                                          : 'text-slate-400'
                                  }
                                >
                                  {summary.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                                {summary.installPct}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                {b.sizeMb} MB
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Lower WSUS Update Details Pane */}
              <div className="border-t border-slate-800 bg-[#0D1425] p-4 grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                <div className="md:col-span-7 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-display text-sm font-semibold text-slate-100">
                      {activeUpdate.id} — {activeUpdate.title}
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToPatchInTriage(activeUpdate.id)}
                      className="text-sky-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Abrir en Triage
                    </button>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    {activeUpdate.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 space-y-1">
                      <div className="font-semibold text-slate-200">
                        CVEs Corregidos y Riesgo
                      </div>
                      <div className="font-mono text-sky-400">
                        {activeUpdate.cve} · CVSS {activeUpdate.cvssScore.toFixed(1)} ·
                        EPSS {Math.round(activeUpdate.epssScore * 100)}%
                      </div>
                      <div className="text-slate-400">
                        Arquitectura: {activeUpdate.architecture ?? 'x64'} · Reinicio:{' '}
                        {activeUpdate.requiresReboot}
                      </div>
                    </div>

                    <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 space-y-1">
                      <div className="font-semibold text-slate-200">
                        Prerrequisitos y Dependencias
                      </div>
                      {activeUpdate.prerequisites &&
                      activeUpdate.prerequisites.length > 0 ? (
                        <ul className="list-disc list-inside text-amber-300 space-y-0.5">
                          {activeUpdate.prerequisites.map((pr, i) => (
                            <li key={i}>{pr}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-slate-400">
                          Sin prerrequisitos previos declarados.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supersedence Chain */}
                  <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 space-y-1">
                    <div className="font-semibold text-slate-200">
                      Cadena de Reemplazo (Supersedence)
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <span className="text-slate-400">Reemplaza a:</span>
                      {activeUpdate.supersedes.length > 0 ? (
                        activeUpdate.supersedes.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedUpdateId(id)}
                            className="text-sky-400 hover:underline cursor-pointer"
                          >
                            {id}
                          </button>
                        ))
                      ) : (
                        <span className="text-slate-500">Ninguno</span>
                      )}
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">Reemplazado por:</span>
                      {activeUpdate.supersededBy ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedUpdateId(activeUpdate.supersededBy!)
                          }
                          className="text-amber-400 font-semibold hover:underline cursor-pointer"
                        >
                          {activeUpdate.supersededBy}
                        </button>
                      ) : (
                        <span className="text-emerald-400">
                          Último en la cadena (Vigente)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Lower Pane: Installation Progress by Ring */}
                <div className="md:col-span-5 rounded border border-slate-800 bg-[#0B1120] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">
                      Estado de Instalación por Anillos
                    </span>
                    <span className="font-mono font-bold tabular-nums text-sky-400">
                      {activeUpdateSummary.installPct}% global
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {DEPLOYMENT_RINGS.map((ring) => {
                      const ringApp =
                        wsusApprovals[activeUpdate.id]?.rings[ring.id];
                      const action = ringApp?.action ?? 'Not Approved';
                      const pct =
                        activeUpdate.architecture === 'ARM64'
                          ? 0
                          : action === 'Approved for Install'
                            ? 100
                            : activeUpdateSummary.status === 'Installed'
                              ? 100
                              : 0;

                      return (
                        <div key={ring.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 truncate pr-2">
                              {ring.wsusGroupName} ({ring.fleetCount})
                            </span>
                            <span className="font-mono text-slate-400 shrink-0">
                              {action === 'Approved for Install' && ringApp?.linkedRfcCode
                                ? `${ringApp.linkedRfcCode} · 100%`
                                : `${action} · ${pct}%`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                            <div
                              className={`h-full transition-all ${
                                action === 'Approved for Removal'
                                  ? 'bg-amber-500'
                                  : pct === 100
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-600'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setApproveModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 cursor-pointer"
                    >
                      <span>Configurar Aprobaciones...</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {treeNode.type === 'computers' && (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 bg-[#0F172A]">
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      {treeNode.ring === 'all'
                        ? `All Computers · Flota Total (${totalFleetCount} equipos gestionados)`
                        : `${
                            DEPLOYMENT_RINGS.find((r) => r.id === treeNode.ring)
                              ?.wsusGroupName
                          } (${
                            DEPLOYMENT_RINGS.find((r) => r.id === treeNode.ring)
                              ?.fleetCount
                          } equipos)`}
                    </div>
                    {treeNode.ring !== 'all' && (
                      <div className="text-[11px] text-slate-400">
                        Composición:{' '}
                        {
                          DEPLOYMENT_RINGS.find((r) => r.id === treeNode.ring)
                            ?.fleetComposition
                        }
                      </div>
                    )}
                  </div>
                  <div className="relative w-56">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrar nodos clave..."
                      className="h-8 w-full rounded border border-slate-700 bg-[#0B1120] pl-8 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-[#0B1120] border-b border-slate-800 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3.5 py-2">Equipo Representativo</th>
                        <th className="px-3 py-2">IP</th>
                        <th className="px-3 py-2">Sistema Operativo</th>
                        <th className="px-3 py-2">Grupo WSUS (Anillo)</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2 text-right">Pendientes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {visibleAssets.map((asset) => {
                        const isSelected = asset.id === activeAsset.id;
                        const pending = PATCH_BULLETINS.filter(
                          (b) =>
                            b.affectedAssetIds.includes(asset.id) &&
                            !b.supersededBy,
                        ).length;
                        const ringGroup =
                          DEPLOYMENT_RINGS.find((r) => r.id === asset.ringId)
                            ?.wsusGroupName ?? asset.ringId;

                        return (
                          <tr
                            key={asset.id}
                            onClick={() => onSelectAsset(asset.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-sky-500/15' : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="px-3.5 py-2 font-mono font-medium text-slate-100 whitespace-nowrap">
                              {asset.id}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                              {asset.ip}
                            </td>
                            <td className="px-3 py-2 text-slate-300 truncate max-w-[230px]">
                              {asset.os}
                            </td>
                            <td className="px-3 py-2 text-sky-400 whitespace-nowrap">
                              {ringGroup}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-emerald-400 font-medium">
                              {asset.status}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-300">
                              {pending}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lower Detail Pane for Computers */}
              <div className="border-t border-slate-800 bg-[#0D1425] p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-100">
                    <HardDrive className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    <span>Detalle del Equipo: {activeAsset.hostname}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300">
                    <div>
                      <span className="text-slate-400">Rol: </span>
                      {activeAsset.role}
                    </div>
                    <div>
                      <span className="text-slate-400">Criticidad: </span>
                      <span className="font-semibold text-slate-100">
                        {activeAsset.criticality}
                      </span>
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 text-slate-300">
                    <span className="font-semibold text-amber-300">Nota operativa: </span>
                    {activeAsset.notes}
                  </div>
                  <div className="rounded border border-slate-800 bg-[#0B1120] p-2.5 text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-200">
                      {activeAssetRing.wsusGroupName} ({activeAssetRing.fleetCount} equipos)
                    </div>
                    <div>
                      Ventana:{' '}
                      <span className="font-mono text-sky-300">
                        {MAINTENANCE_WINDOW_OPTIONS.find(
                          (w) => w.id === ringMaintenanceWindows[activeAssetRing.id],
                        )?.schedule ?? activeAssetRing.maintenanceWindow}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">
                      Parches Aplicables a {activeAsset.id}
                    </span>
                    {activeAssetRing.requiresCab && (
                      <button
                        type="button"
                        onClick={onOpenRfcModule}
                        className="text-sky-400 hover:underline cursor-pointer"
                      >
                        Tramitar RFC CAB
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded border border-slate-800 bg-[#0B1120] divide-y divide-slate-800/80">
                    {PATCH_BULLETINS.filter(
                      (b) =>
                        b.affectedAssetIds.includes(activeAsset.id) &&
                        !b.supersededBy,
                    ).map((patch) => {
                      const ringApp =
                        wsusApprovals[patch.id]?.rings[activeAsset.ringId];
                      const approval = unlockedMap.get(patch.id);
                      const approvedInWsus =
                        ringApp?.action === 'Approved for Install';

                      return (
                        <div
                          key={patch.id}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUpdateId(patch.id);
                              setTreeNode({ type: 'updates', scope: 'all' });
                            }}
                            className="min-w-0 text-left hover:underline cursor-pointer"
                          >
                            <div className="font-mono font-semibold text-sky-400">
                              {patch.id} · {patch.cve}
                            </div>
                            <div className="truncate text-slate-300">
                              {patch.title}
                            </div>
                          </button>
                          <span className="font-mono text-[11px] shrink-0">
                            {approvedInWsus ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <Unlock className="h-3 w-3" aria-hidden="true" />
                                <span>
                                  {ringApp?.linkedRfcCode ?? 'Aprobado WSUS'}
                                </span>
                              </span>
                            ) : approval?.rings.includes(activeAsset.ringId) ? (
                              <span className="text-sky-400">
                                RFC listo ({approval.rfcCode})
                              </span>
                            ) : activeAssetRing.requiresCab ? (
                              <span className="inline-flex items-center gap-1 text-amber-400">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                <span>Requiere RFC</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">Unapproved</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {treeNode.type === 'auto-rules' && (
            <div className="p-5 space-y-5 text-xs">
              <div className="border-b border-slate-800 pb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    Reglas de Auto-Aprobación WSUS (Gobernanza por Anillos)
                  </h3>
                  <p className="mt-0.5 text-slate-400">
                    Automatiza la aprobación de pruebas tempranas en Ring 0 y Ring 1. Por política de seguridad, Ring 2 y Ring 3 están excluidos y requieren RFC-2026-XXXX.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRunAutoApproval}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ejecutar Regla Ahora</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-3">
                  <div className="font-semibold text-slate-200">
                    Clasificaciones incluidas en la regla
                  </div>
                  {(
                    [
                      'Critical Update',
                      'Security Update',
                      'WSUS Update',
                      'Update Rollup',
                    ] as PatchClassification[]
                  ).map((cls) => {
                    const checked = wsusAutoApproval.classifications.includes(cls);
                    return (
                      <label
                        key={cls}
                        className="flex items-center gap-2 text-slate-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? wsusAutoApproval.classifications.filter(
                                  (c) => c !== cls,
                                )
                              : [...wsusAutoApproval.classifications, cls];
                            onUpdateAutoApproval({
                              ...wsusAutoApproval,
                              classifications: next,
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                        />
                        <span>{cls}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-3">
                  <div className="font-semibold text-slate-200">
                    Anillos elegibles para Auto-Aprobación
                  </div>
                  {DEPLOYMENT_RINGS.map((ring) => {
                    const locked = ring.requiresCab;
                    const checked = wsusAutoApproval.targetRings.includes(ring.id);
                    return (
                      <label
                        key={ring.id}
                        className={`flex items-center justify-between gap-2 ${
                          locked
                            ? 'text-slate-500 cursor-not-allowed'
                            : 'text-slate-300 cursor-pointer'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={!locked && checked}
                            onChange={() => {
                              if (locked) return;
                              const next = checked
                                ? wsusAutoApproval.targetRings.filter(
                                    (r) => r !== ring.id,
                                  )
                                : [...wsusAutoApproval.targetRings, ring.id];
                              onUpdateAutoApproval({
                                ...wsusAutoApproval,
                                targetRings: next,
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 disabled:opacity-40"
                          />
                          <span>{ring.wsusGroupName}</span>
                        </span>
                        {locked && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-400">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            <span>Exige CAB</span>
                          </span>
                        )}
                      </label>
                    );
                  })}

                  <div className="border-t border-slate-800 pt-2.5 text-[11px] text-slate-400">
                    La ejecución automática omite boletines reemplazados (Superseded) y paquetes ARM64 no aplicables.
                    {wsusAutoApproval.lastRunAt && (
                      <div className="mt-1 font-mono text-emerald-400">
                        Última ejecución: {wsusAutoApproval.lastApprovedCount ?? 0} KBs aprobados en grupos piloto.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <WsusApproveModal
        isOpen={approveModalOpen}
        bulletin={activeUpdate}
        currentApproval={
          wsusApprovals[activeUpdate.id] ?? createEmptyWsusPatchApproval()
        }
        rfcSubmissions={rfcSubmissions}
        onClose={() => setApproveModalOpen(false)}
        onSaveApproval={onSaveWsusApproval}
        onOpenRfcModule={onOpenRfcModule}
      />
    </div>
  );
};
