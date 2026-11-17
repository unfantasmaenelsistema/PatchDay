import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  ArrowUpDown,
  Filter,
  GitBranch,
  Search,
  Sparkles,
} from 'lucide-react';
import { PRIORITY_LABELS, SCENARIOS } from '../data/initialData';
import {
  OperationalPriority,
  PatchBulletin,
  PatchClassification,
  ScenarioId,
  TriageDecision,
  VendorCategory,
} from '../types/patchday';
import { DecisionMatrixChart } from './DecisionMatrixChart';
import { TriageInspector } from './TriageInspector';

interface TriageModuleProps {
  bulletins: PatchBulletin[];
  selectedPatchId: string;
  activeScenario: ScenarioId;
  decisions: Record<string, TriageDecision>;
  onSelectPatch: (id: string) => void;
  onAssignPriority: (patchId: string, priority: OperationalPriority) => void;
  onToggleRfcQueue: (patchId: string) => void;
  onUpdateNote: (patchId: string, note: string) => void;
  onOpenAssetInWsus: (assetId: string) => void;
}

type SortKey = 'cvss' | 'epss' | 'kev' | 'id';
type QuickTab = 'all' | 'kev' | 'unassigned' | 'queued';

export const TriageModule: React.FC<TriageModuleProps> = ({
  bulletins,
  selectedPatchId,
  activeScenario,
  decisions,
  onSelectPatch,
  onAssignPriority,
  onToggleRfcQueue,
  onUpdateNote,
  onOpenAssetInWsus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<VendorCategory | 'all'>('all');
  const [classificationFilter, setClassificationFilter] = useState<
    PatchClassification | 'all'
  >('all');
  const [quickTab, setQuickTab] = useState<QuickTab>('all');
  const [hideSuperseded, setHideSuperseded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('epss');
  const [sortAsc, setSortAsc] = useState(false);

  const scenario =
    SCENARIOS.find((s) => s.id === activeScenario) ?? SCENARIOS[0];

  const filteredBulletins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = bulletins.filter((b) => {
      if (hideSuperseded && b.supersededBy) return false;
      if (vendorFilter !== 'all' && b.vendorCategory !== vendorFilter) return false;
      if (classificationFilter !== 'all' && b.classification !== classificationFilter)
        return false;

      if (quickTab === 'kev' && !b.inCisaKev) return false;
      if (quickTab === 'unassigned' && decisions[b.id]?.priority) return false;
      if (quickTab === 'queued' && !decisions[b.id]?.queuedForRfc) return false;

      if (q) {
        const haystack = `${b.id} ${b.cve} ${b.title} ${b.vendor} ${b.affectedProduct}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'cvss') {
        cmp = a.cvssScore - b.cvssScore;
      } else if (sortKey === 'epss') {
        cmp = a.epssScore - b.epssScore;
      } else if (sortKey === 'kev') {
        cmp = Number(a.inCisaKev) - Number(b.inCisaKev);
      } else {
        cmp = a.id.localeCompare(b.id);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    bulletins,
    searchQuery,
    vendorFilter,
    classificationFilter,
    quickTab,
    hideSuperseded,
    decisions,
    sortKey,
    sortAsc,
  ]);

  const selectedBulletin = useMemo(
    () => bulletins.find((b) => b.id === selectedPatchId) ?? bulletins[0],
    [bulletins, selectedPatchId],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const priorityCounts = useMemo(() => {
    const counts: Record<OperationalPriority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const b of bulletins) {
      const p = decisions[b.id]?.priority;
      if (p) counts[p] += 1;
    }
    return counts;
  }, [bulletins, decisions]);

  return (
    <div className="space-y-5">
      {/* Scenario Briefing Header */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium">
            <span>Módulo 1 · Centro de Priorización de Amenazas</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-400">
              Objetivo SLA Escenario: {scenario.targetSlaPct}%
            </span>
          </div>
          <h2 className="mt-0.5 font-display text-lg font-bold text-slate-50">
            {scenario.name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-300 max-w-4xl leading-relaxed">
            {scenario.briefing}
          </p>
        </div>

        {/* Priority Distribution Counters */}
        <div className="flex items-center gap-4 border-t border-slate-800 pt-2.5 md:border-t-0 md:pt-0 shrink-0 font-mono text-xs tabular-nums">
          <div>
            <span className="text-red-400 font-semibold">P1:</span>{' '}
            <span className="text-slate-200">{priorityCounts.P1}</span>
          </div>
          <div>
            <span className="text-amber-400 font-semibold">P2:</span>{' '}
            <span className="text-slate-200">{priorityCounts.P2}</span>
          </div>
          <div>
            <span className="text-sky-400 font-semibold">P3:</span>{' '}
            <span className="text-slate-200">{priorityCounts.P3}</span>
          </div>
          <div>
            <span className="text-slate-400 font-semibold">P4:</span>{' '}
            <span className="text-slate-200">{priorityCounts.P4}</span>
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section
        aria-label="Filtros de vulnerabilidades"
        className="rounded-lg border border-slate-800 bg-[#111827] p-3 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[210px] max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar KB, CVE, producto..."
              className="h-9 w-full rounded-md border border-slate-700 bg-[#0B1120] pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#0B1120] p-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'kev', label: 'Solo CISA KEV' },
                { id: 'unassigned', label: 'Sin asignar' },
                { id: 'queued', label: 'Cola RFC' },
              ] as Array<{ id: QuickTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQuickTab(tab.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  quickTab === tab.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar por fabricante"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value as VendorCategory | 'all')}
            className="h-9 rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="all">Fabricante: Todos</option>
            <option value="Microsoft">Microsoft</option>
            <option value="Linux / Infraestructura">Linux / Infraestructura</option>
            <option value="Terceros">Terceros</option>
          </select>

          <select
            aria-label="Filtrar por clasificación"
            value={classificationFilter}
            onChange={(e) =>
              setClassificationFilter(e.target.value as PatchClassification | 'all')
            }
            className="h-9 rounded-md border border-slate-700 bg-[#0B1120] px-2.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="all">Clasificación: Todas</option>
            <option value="Security Update">Security Update</option>
            <option value="Critical Update">Critical Update</option>
            <option value="Update Rollup">Update Rollup</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideSuperseded}
            onChange={(e) => setHideSuperseded(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
          />
          <span>Ocultar reemplazados (Superseded)</span>
        </label>
      </section>

      {/* Main Split: Matrix + Quick Cases (Left) | Pedagogical Inspector (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-6 space-y-4">
          <DecisionMatrixChart
            bulletins={filteredBulletins}
            selectedPatchId={selectedBulletin.id}
            decisions={decisions}
            onSelectPatch={onSelectPatch}
          />

          {/* Pedagogical Study Cases Shortcut Box */}
          <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
              <Sparkles className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Casos de Análisis Rápido (Triage Basado en Riesgo)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSelectPatch('KB5036893')}
                className="rounded-md border border-slate-800 bg-[#0B1120] p-2.5 text-left hover:border-red-500/50 transition-colors cursor-pointer"
              >
                <div className="font-mono text-xs font-semibold text-red-400">
                  KB5036893 · KEV
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300">
                  CVSS 7.8 pero EPSS 92% (Explotado)
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSelectPatch('APACHE-2.4.62')}
                className="rounded-md border border-slate-800 bg-[#0B1120] p-2.5 text-left hover:border-sky-500/50 transition-colors cursor-pointer"
              >
                <div className="font-mono text-xs font-semibold text-sky-400">
                  APACHE-2.4.62
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300">
                  CVSS 9.8 pero EPSS 2% (Teórico)
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSelectPatch('KB5029377')}
                className="rounded-md border border-slate-800 bg-[#0B1120] p-2.5 text-left hover:border-amber-500/50 transition-colors cursor-pointer"
              >
                <div className="font-mono text-xs font-semibold text-amber-400">
                  KB5029377
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300">
                  Reemplazado en WSUS (Superseded)
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-6">
          <TriageInspector
            bulletin={selectedBulletin}
            decision={decisions[selectedBulletin.id]}
            onAssignPriority={onAssignPriority}
            onToggleRfcQueue={onToggleRfcQueue}
            onUpdateNote={onUpdateNote}
            onSelectPatch={onSelectPatch}
            onOpenAssetInWsus={onOpenAssetInWsus}
          />
        </div>
      </div>

      {/* Full-width Dense SecOps Bulletin Table */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Catálogo de Boletines y Parches ({filteredBulletins.length} visibles)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Haz clic en una fila para inspeccionar detalles técnicos y asignar prioridad.
          </span>
        </div>

        {filteredBulletins.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            <p>Ningún boletín coincide con los filtros actuales.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setVendorFilter('all');
                setClassificationFilter('all');
                setQuickTab('all');
                setHideSuperseded(false);
              }}
              className="mt-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B1120] text-[11px] font-semibold text-slate-400">
                  <th className="px-3.5 py-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('id')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
                    >
                      <span>Boletín / KB</span>
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 whitespace-nowrap">CVE</th>
                  <th className="px-3 py-2.5">Título &amp; Producto</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Fabricante</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('cvss')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
                    >
                      <span>CVSS</span>
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('epss')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
                    >
                      <span>EPSS (30d)</span>
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('kev')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
                    >
                      <span>CISA KEV</span>
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Reinicio</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Prioridad &amp; RFC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredBulletins.map((b) => {
                  const isSelected = b.id === selectedBulletin.id;
                  const decision = decisions[b.id];
                  const epssPct = Math.round(b.epssScore * 100);
                  const priority = decision?.priority;

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelectPatch(b.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-500/10'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{b.id}</span>
                          {b.supersededBy && (
                            <span
                              title={`Reemplazado por ${b.supersededBy}`}
                              className="inline-flex items-center gap-0.5 text-[10px] font-normal text-amber-400"
                            >
                              <GitBranch className="h-3 w-3" aria-hidden="true" />
                              <span>Reemplazado</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                        {b.cve}
                      </td>
                      <td className="px-3 py-2.5 max-w-xs">
                        <div className="font-medium text-slate-100 truncate">
                          {b.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {b.affectedProduct} · {b.classification}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                        {b.vendor}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        <span
                          className={
                            b.cvssScore >= 9.0
                              ? 'text-red-400'
                              : b.cvssScore >= 7.0
                                ? 'text-amber-400'
                                : 'text-slate-300'
                          }
                        >
                          {b.cvssScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:block h-1.5 w-14 overflow-hidden rounded-sm bg-slate-800">
                            <div
                              className={`h-full ${
                                epssPct >= 70
                                  ? 'bg-red-500'
                                  : epssPct >= 25
                                    ? 'bg-amber-500'
                                    : 'bg-sky-500'
                              }`}
                              style={{ width: `${epssPct}%` }}
                            />
                          </div>
                          <span
                            className={`font-semibold ${
                              epssPct >= 70
                                ? 'text-red-400'
                                : epssPct >= 25
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                            }`}
                          >
                            {epssPct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {b.inCisaKev ? (
                          <span className="inline-flex items-center gap-1 font-mono font-semibold text-red-400">
                            <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>KEV ACTIVO</span>
                          </span>
                        ) : (
                          <span className="font-mono text-slate-500">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                        {b.requiresReboot}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {priority ? (
                          <div className="font-mono text-xs">
                            <span
                              className={
                                priority === 'P1'
                                  ? 'text-red-400 font-semibold'
                                  : priority === 'P2'
                                    ? 'text-amber-400 font-semibold'
                                    : priority === 'P3'
                                      ? 'text-sky-400 font-semibold'
                                      : 'text-slate-400 font-semibold'
                              }
                            >
                              {PRIORITY_LABELS[priority].code}
                            </span>
                            {decision?.queuedForRfc ? (
                              <span className="ml-1.5 text-emerald-400">· Cola RFC</span>
                            ) : (
                              <span className="ml-1.5 text-slate-500">· Sin RFC</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">Sin asignar</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
