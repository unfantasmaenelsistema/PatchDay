/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { AuditReportModal } from './components/AuditReportModal';
import { MaintenanceModule } from './components/MaintenanceModule';
import { CtfMissionsModule } from './components/PreparedModules';
import { RfcCabModule } from './components/RfcCabModule';
import { SecOpsFieldGuideModal } from './components/SecOpsFieldGuideModal';
import { Sidebar } from './components/Sidebar';
import {
  ResetConfirmModal,
  StateTransferModal,
} from './components/StateTransferModal';
import { TopBar } from './components/TopBar';
import { TriageModule } from './components/TriageModule';
import { WsusConsoleModule } from './components/WsusConsoleModule';
import {
  createEmptyWsusPatchApproval,
  ENTERPRISE_ASSETS,
  PATCH_BULLETINS,
} from './data/initialData';
import {
  DeploymentRingId,
  GuidedMissionId,
  LabState,
  MaintenanceWindowId,
  ModuleId,
  OperationalPriority,
  RfcSubmission,
  ScenarioId,
  WsusAutoApprovalRule,
  WsusPatchApproval,
} from './types/patchday';
import {
  computeGlobalMetrics,
  computeWsusHygieneMetrics,
  evaluateCtfFlags,
  getUnlockedPatchesMap,
  loadLabState,
  resetLabStorage,
  saveLabState,
} from './utils/labStorage';
import {
  computeSecOpsRubric,
  evaluateGuidedMissions,
} from './utils/rubricScoring';
import {
  activateMissionScenario,
  advanceSimulationTime,
  applyWsusRemovalFix,
  executeWinRmCommand,
  resolveDeadlineComplaint,
  revertHypervisorSnapshot,
  triggerRegressionDrill,
} from './utils/simulationEngine';

export default function App() {
  const [labState, setLabState] = useState<LabState>(() => loadLabState());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  useEffect(() => {
    saveLabState(labState);
  }, [labState]);

  const metrics = useMemo(
    () => computeGlobalMetrics(labState, PATCH_BULLETINS, ENTERPRISE_ASSETS),
    [labState],
  );

  const unlockedMap = useMemo(
    () => getUnlockedPatchesMap(labState),
    [labState],
  );

  const hygieneMetrics = useMemo(
    () => computeWsusHygieneMetrics(labState, PATCH_BULLETINS),
    [labState],
  );

  const ctfFlags = useMemo(() => evaluateCtfFlags(labState), [labState]);
  const guidedMissions = useMemo(
    () => evaluateGuidedMissions(labState),
    [labState],
  );
  const completedMissionsCount = useMemo(
    () => guidedMissions.filter((m) => m.completed).length,
    [guidedMissions],
  );
  const secOpsRubric = useMemo(() => computeSecOpsRubric(labState), [labState]);

  const updateState = (updater: (prev: LabState) => LabState) => {
    setLabState((prev) => ({
      ...updater(prev),
      lastModified: new Date().toISOString(),
    }));
  };

  const handleSelectModule = (moduleId: ModuleId) => {
    updateState((prev) => ({ ...prev, activeModule: moduleId }));
  };

  const handleSelectScenario = (scenarioId: ScenarioId) => {
    updateState((prev) => ({ ...prev, activeScenario: scenarioId }));
  };

  const handleSelectPatch = (patchId: string) => {
    updateState((prev) => ({ ...prev, selectedPatchId: patchId }));
  };

  const handleAssignPriority = (
    patchId: string,
    priority: OperationalPriority,
  ) => {
    updateState((prev) => {
      const existing = prev.triageDecisions[patchId];
      return {
        ...prev,
        triageDecisions: {
          ...prev.triageDecisions,
          [patchId]: {
            priority,
            queuedForRfc: existing?.queuedForRfc ?? false,
            analystNote: existing?.analystNote ?? '',
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleToggleRfcQueue = (patchId: string) => {
    updateState((prev) => {
      const existing = prev.triageDecisions[patchId];
      if (!existing?.priority) return prev;
      return {
        ...prev,
        triageDecisions: {
          ...prev.triageDecisions,
          [patchId]: {
            ...existing,
            queuedForRfc: !existing.queuedForRfc,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleUpdateNote = (patchId: string, note: string) => {
    updateState((prev) => {
      const existing = prev.triageDecisions[patchId];
      return {
        ...prev,
        triageDecisions: {
          ...prev.triageDecisions,
          [patchId]: {
            priority: existing?.priority,
            queuedForRfc: existing?.queuedForRfc ?? false,
            analystNote: note,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleOpenAssetInWsus = (assetId: string) => {
    const asset = ENTERPRISE_ASSETS.find((a) => a.id === assetId);
    setSelectedAssetId(assetId);
    updateState((prev) => ({
      ...prev,
      activeModule: 'wsus',
      selectedRingFilter: asset ? asset.ringId : 'all',
      inspectedAssetIds: prev.inspectedAssetIds.includes(assetId)
        ? prev.inspectedAssetIds
        : [...prev.inspectedAssetIds, assetId],
    }));
  };

  const handleSelectAssetInWsus = (assetId: string) => {
    setSelectedAssetId(assetId);
    updateState((prev) => ({
      ...prev,
      inspectedAssetIds: prev.inspectedAssetIds.includes(assetId)
        ? prev.inspectedAssetIds
        : [...prev.inspectedAssetIds, assetId],
    }));
  };

  const handleSelectRingFilter = (ring: DeploymentRingId | 'all') => {
    updateState((prev) => ({ ...prev, selectedRingFilter: ring }));
  };

  const handleJumpToPatchInTriage = (patchId: string) => {
    updateState((prev) => ({
      ...prev,
      activeModule: 'triage',
      selectedPatchId: patchId,
    }));
  };

  const handleChangeRingWindow = (
    ringId: DeploymentRingId,
    windowId: MaintenanceWindowId,
  ) => {
    updateState((prev) => ({
      ...prev,
      ringMaintenanceWindows: {
        ...prev.ringMaintenanceWindows,
        [ringId]: windowId,
      },
    }));
  };

  const handleToggleBlackout = (blackoutId: string) => {
    updateState((prev) => ({
      ...prev,
      blackoutPeriods: prev.blackoutPeriods.map((blk) =>
        blk.id === blackoutId ? { ...blk, active: !blk.active } : blk,
      ),
    }));
  };

  const handleSubmitRfc = (submission: RfcSubmission) => {
    updateState((prev) => ({
      ...prev,
      rfcSubmissions: [submission, ...prev.rfcSubmissions],
    }));
  };

  const handleSaveWsusApproval = (
    patchId: string,
    approval: WsusPatchApproval,
  ) => {
    updateState((prev) => ({
      ...prev,
      wsusApprovals: {
        ...prev.wsusApprovals,
        [patchId]: approval,
      },
    }));
  };

  const handleUpdateAutoApproval = (rule: WsusAutoApprovalRule) => {
    updateState((prev) => ({
      ...prev,
      wsusAutoApproval: rule,
    }));
  };

  const handleRunAutoApproval = () => {
    updateState((prev) => {
      const rule = prev.wsusAutoApproval;
      const nextApprovals = { ...prev.wsusApprovals };
      let approvedCount = 0;

      for (const b of PATCH_BULLETINS) {
        if (b.supersededBy || b.architecture === 'ARM64') continue;
        if (!rule.classifications.includes(b.classification)) continue;

        const existing = nextApprovals[b.id] ?? createEmptyWsusPatchApproval();
        if (existing.declinedGlobally) continue;

        const nextRings = { ...existing.rings };
        let touched = false;
        for (const ringId of rule.targetRings) {
          if (ringId === 'ring-2' || ringId === 'ring-3') continue; // Enforce governance
          if (nextRings[ringId]?.action === 'Not Approved') {
            nextRings[ringId] = {
              action: 'Approved for Install',
              deadline: 'En 24 horas (Auto-Aprobación)',
              updatedAt: new Date().toISOString(),
            };
            touched = true;
          }
        }
        if (touched) {
          approvedCount += 1;
          nextApprovals[b.id] = {
            ...existing,
            rings: nextRings,
          };
        }
      }

      return {
        ...prev,
        wsusApprovals: nextApprovals,
        wsusAutoApproval: {
          ...rule,
          enabled: true,
          lastRunAt: new Date().toISOString(),
          lastApprovedCount: approvedCount,
        },
      };
    });
  };

  const handleDeclineSupersededBatch = () => {
    updateState((prev) => {
      const nextApprovals = { ...prev.wsusApprovals };
      const now = new Date().toISOString();
      for (const b of PATCH_BULLETINS) {
        if (b.supersededBy || b.architecture === 'ARM64') {
          nextApprovals[b.id] = {
            declinedGlobally: true,
            rings: {
              'ring-0': { action: 'Declined', updatedAt: now },
              'ring-1': { action: 'Declined', updatedAt: now },
              'ring-2': { action: 'Declined', updatedAt: now },
              'ring-3': { action: 'Declined', updatedAt: now },
            },
          };
        }
      }
      return {
        ...prev,
        wsusApprovals: nextApprovals,
      };
    });
  };

  const handleAdvanceTime = (mode: '4h' | 'night_window' | 'reportnow') => {
    updateState((prev) => advanceSimulationTime(prev, mode));
  };

  const handleTriggerDrill = () => {
    updateState((prev) => triggerRegressionDrill(prev));
  };

  const handleWsusRemovalFix = (patchId: string, ringId: DeploymentRingId) => {
    updateState((prev) => applyWsusRemovalFix(prev, patchId, ringId));
  };

  const handleExecuteWinRm = (targetHost: string, command: string) => {
    updateState((prev) => executeWinRmCommand(prev, targetHost, command));
  };

  const handleRevertSnapshot = (assetId: string) => {
    updateState((prev) => revertHypervisorSnapshot(prev, assetId));
  };

  const handleResolveDeadline = (incidentId: string) => {
    updateState((prev) => resolveDeadlineComplaint(prev, incidentId));
  };

  const handleActivateMission = (missionId: GuidedMissionId) => {
    updateState((prev) => activateMissionScenario(prev, missionId));
  };

  const handleChangeAlias = (studentAlias: string) => {
    updateState((prev) => ({ ...prev, studentAlias }));
  };

  const handleChangeGroup = (studentGroup: string) => {
    updateState((prev) => ({ ...prev, studentGroup }));
  };

  const handleConfirmReset = () => {
    const fresh = resetLabStorage();
    setLabState(fresh);
    setSelectedAssetId(null);
    setResetModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      <TopBar
        metrics={metrics}
        rubricScore={secOpsRubric.totalScore}
        activeScenario={labState.activeScenario}
        onSelectScenario={handleSelectScenario}
        onOpenTransferModal={() => setTransferModalOpen(true)}
        onOpenAuditReport={() => setAuditModalOpen(true)}
        onOpenFieldGuide={() => setGuideModalOpen(true)}
        onRequestReset={() => setResetModalOpen(true)}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <Sidebar
          activeModule={labState.activeModule}
          onSelectModule={handleSelectModule}
          metrics={metrics}
          completedMissions={completedMissionsCount}
          totalMissions={guidedMissions.length}
          rubricScore={secOpsRubric.totalScore}
        />

        <main className="no-print flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">
          {labState.activeModule === 'triage' && (
            <TriageModule
              bulletins={PATCH_BULLETINS}
              selectedPatchId={labState.selectedPatchId}
              activeScenario={labState.activeScenario}
              decisions={labState.triageDecisions}
              onSelectPatch={handleSelectPatch}
              onAssignPriority={handleAssignPriority}
              onToggleRfcQueue={handleToggleRfcQueue}
              onUpdateNote={handleUpdateNote}
              onOpenAssetInWsus={handleOpenAssetInWsus}
            />
          )}

          {labState.activeModule === 'rfc' && (
            <RfcCabModule
              decisions={labState.triageDecisions}
              blackoutPeriods={labState.blackoutPeriods}
              rfcSubmissions={labState.rfcSubmissions}
              ringSoakHours={labState.simulation.ringSoakHours}
              unlockedMap={unlockedMap}
              onSubmitRfc={handleSubmitRfc}
              onJumpToTriage={handleJumpToPatchInTriage}
              onOpenWsusConsole={() => handleSelectModule('wsus')}
              onOpenMaintenance={() => handleSelectModule('maintenance')}
            />
          )}

          {labState.activeModule === 'wsus' && (
            <WsusConsoleModule
              selectedRingFilter={labState.selectedRingFilter}
              selectedAssetId={selectedAssetId}
              ringMaintenanceWindows={labState.ringMaintenanceWindows}
              unlockedMap={unlockedMap}
              wsusApprovals={labState.wsusApprovals}
              wsusAutoApproval={labState.wsusAutoApproval}
              hygieneMetrics={hygieneMetrics}
              rfcSubmissions={labState.rfcSubmissions}
              onSelectRingFilter={handleSelectRingFilter}
              onSelectAsset={handleSelectAssetInWsus}
              onSaveWsusApproval={handleSaveWsusApproval}
              onUpdateAutoApproval={handleUpdateAutoApproval}
              onRunAutoApproval={handleRunAutoApproval}
              onDeclineSupersededBatch={handleDeclineSupersededBatch}
              onJumpToPatchInTriage={handleJumpToPatchInTriage}
              onOpenRfcModule={() => handleSelectModule('rfc')}
            />
          )}

          {labState.activeModule === 'maintenance' && (
            <MaintenanceModule
              state={labState}
              ringMaintenanceWindows={labState.ringMaintenanceWindows}
              blackoutPeriods={labState.blackoutPeriods}
              onChangeRingWindow={handleChangeRingWindow}
              onToggleBlackout={handleToggleBlackout}
              onOpenRfcModule={() => handleSelectModule('rfc')}
              onOpenWsusConsole={() => handleSelectModule('wsus')}
              onAdvanceTime={handleAdvanceTime}
              onTriggerDrill={handleTriggerDrill}
              onWsusRemovalFix={handleWsusRemovalFix}
              onExecuteWinRm={handleExecuteWinRm}
              onRevertSnapshot={handleRevertSnapshot}
              onResolveDeadline={handleResolveDeadline}
            />
          )}

          {labState.activeModule === 'ctf' && (
            <CtfMissionsModule
              flags={ctfFlags}
              missions={guidedMissions}
              rubric={secOpsRubric}
              state={labState}
              onActivateMission={handleActivateMission}
              onOpenAuditReport={() => setAuditModalOpen(true)}
              onJumpToTriagePatch={handleJumpToPatchInTriage}
              onOpenWsus={() => handleSelectModule('wsus')}
              onOpenRfc={() => handleSelectModule('rfc')}
              onOpenMaintenance={() => handleSelectModule('maintenance')}
            />
          )}
        </main>
      </div>

      <SecOpsFieldGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />

      <AuditReportModal
        isOpen={auditModalOpen}
        state={labState}
        rubric={secOpsRubric}
        missions={guidedMissions}
        ctfFlags={ctfFlags}
        onChangeAlias={handleChangeAlias}
        onChangeGroup={handleChangeGroup}
        onClose={() => setAuditModalOpen(false)}
      />

      <StateTransferModal
        isOpen={transferModalOpen}
        state={labState}
        onClose={() => setTransferModalOpen(false)}
        onImportState={(nextState) => setLabState(nextState)}
      />

      <ResetConfirmModal
        isOpen={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
}
