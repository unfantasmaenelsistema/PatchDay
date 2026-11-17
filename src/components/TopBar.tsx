import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { SCENARIOS } from '../data/initialData';
import { GlobalMetrics, ScenarioId } from '../types/patchday';

interface TopBarProps {
  metrics: GlobalMetrics;
  rubricScore: number;
  activeScenario: ScenarioId;
  onSelectScenario: (scenarioId: ScenarioId) => void;
  onOpenTransferModal: () => void;
  onOpenAuditReport: () => void;
  onOpenFieldGuide: () => void;
  onRequestReset: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  metrics,
  rubricScore,
  activeScenario,
  onSelectScenario,
  onOpenTransferModal,
  onOpenAuditReport,
  onOpenFieldGuide,
  onRequestReset,
}) => {
  const [logoError, setLogoError] = useState(false);

  const riskColorClass =
    metrics.exposureRiskLevel === 'Crítico'
      ? 'text-red-400'
      : metrics.exposureRiskLevel === 'Alto'
        ? 'text-amber-400'
        : metrics.exposureRiskLevel === 'Moderado'
          ? 'text-sky-400'
          : 'text-emerald-400';

  const slaColorClass =
    metrics.slaCompliancePct >= 80
      ? 'text-emerald-400'
      : metrics.slaCompliancePct >= 40
        ? 'text-amber-400'
        : 'text-slate-200';

  return (
    <header className="no-print border-b border-slate-800 bg-[#0F172A] px-4 py-3 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Attribution */}
        <div className="flex items-center gap-3.5 min-w-0">
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Un Fantasma en el Sistema"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-700/80 bg-slate-900 p-1 transition-colors hover:border-sky-500/60"
          >
            {!logoError ? (
              <img
                src="./assets/logo.png"
                alt="Logo Un Fantasma en el Sistema"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-full w-full object-contain"
              />
            ) : (
              <ShieldAlert className="h-6 w-6 text-sky-400" aria-hidden="true" />
            )}
          </a>

          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
                PatchDay
              </h1>
              <span className="hidden sm:inline text-xs text-slate-400 truncate">
                Enterprise Patch &amp; Vulnerability Simulator
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              <a
                href="https://www.unfantasmaenelsistema.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap"
              >
                <span>unfantasmaenelsistema.com</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">Modo SecOps &amp; WSUS</span>
            </div>
          </div>
        </div>

        {/* Global Telemetry Indicators */}
        <div className="flex flex-wrap items-center gap-5 border-y border-slate-800/80 py-2 xl:border-y-0 xl:py-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-[11px] text-slate-400 whitespace-nowrap">SLA de Parcheo</div>
              <div className={`font-mono text-sm font-semibold tabular-nums ${slaColorClass}`}>
                {metrics.slaCompliancePct}%{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({metrics.triagedCount}/{metrics.totalActionableCount})
                </span>
              </div>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <Activity
              className={`h-4 w-4 shrink-0 ${
                metrics.networkHealthPct < 70
                  ? 'text-red-400'
                  : metrics.networkHealthPct < 100
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
              aria-hidden="true"
            />
            <div>
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Salud de la Red</div>
              <div
                className={`font-mono text-sm font-semibold tabular-nums ${
                  metrics.networkHealthPct < 70
                    ? 'text-red-400'
                    : metrics.networkHealthPct < 100
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {metrics.networkHealthPct}%{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({metrics.operationalAssets}/{metrics.totalAssets} op · {metrics.downAssets} caídos)
                </span>
              </div>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${riskColorClass}`} aria-hidden="true" />
            <div>
              <div className="text-[11px] text-slate-400 whitespace-nowrap">
                Riesgo de Exposición
              </div>
              <div className={`font-mono text-sm font-semibold tabular-nums ${riskColorClass}`}>
                {metrics.exposureRiskLevel}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({metrics.exposureScore}/100 · KEV {metrics.kevMitigatedCount}/{metrics.kevTotalCount})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scenario Selector & Lab Controls */}
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="flex flex-col">
            <label htmlFor="scenario-selector" className="sr-only">
              Selector de Misión o Escenario
            </label>
            <select
              id="scenario-selector"
              value={activeScenario}
              onChange={(e) => onSelectScenario(e.target.value as ScenarioId)}
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenFieldGuide}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Guía SecOps</span>
          </button>

          <button
            type="button"
            onClick={onOpenAuditReport}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/20 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Award className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span className="font-mono tabular-nums">Nota {rubricScore}/100 · Informe</span>
          </button>

          <button
            type="button"
            onClick={onOpenTransferModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Exportar / Importar</span>
          </button>

          <button
            type="button"
            onClick={onRequestReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-red-500/60 hover:text-red-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Lab</span>
          </button>
        </div>
      </div>
    </header>
  );
};
