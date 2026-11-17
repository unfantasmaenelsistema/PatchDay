import React from 'react';
import {
  Clock,
  ExternalLink,
  FileCheck2,
  Flag,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { DEPLOYMENT_RINGS } from '../data/initialData';
import { GlobalMetrics, ModuleId } from '../types/patchday';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  metrics: GlobalMetrics;
  completedMissions: number;
  totalMissions: number;
  rubricScore: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  metrics,
  completedMissions,
  totalMissions,
  rubricScore,
}) => {
  const navItems: Array<{
    id: ModuleId;
    index: string;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string;
    phaseTag?: string;
  }> = [
    {
      id: 'triage',
      index: '01',
      label: 'Triage de Vulnerabilidades',
      subtitle: 'CVSS / EPSS / CISA KEV',
      icon: ShieldAlert,
      counter: `${metrics.triagedCount}/${metrics.totalActionableCount}`,
    },
    {
      id: 'rfc',
      index: '02',
      label: 'Gestión de Cambios',
      subtitle: 'Formulario RFC & CAB',
      icon: FileCheck2,
      counter: `${metrics.approvedRfcCount} aprob · ${metrics.queuedRfcCount} cola`,
    },
    {
      id: 'wsus',
      index: '03',
      label: 'Consola WSUS & Anillos',
      subtitle: 'Árbol de grupos e inventario',
      icon: Server,
      counter: `${metrics.unlockedPatchCount} desbloq`,
    },
    {
      id: 'maintenance',
      index: '04',
      label: 'Mantenimiento & Rollback',
      subtitle: 'Simulación, telemetría y ventanas',
      icon: Clock,
      counter:
        metrics.activeIncidentsCount > 0
          ? `${metrics.activeIncidentsCount} alertas`
          : `Salud ${metrics.networkHealthPct}%`,
    },
    {
      id: 'ctf',
      index: '05',
      label: 'Misiones CTF & Rúbrica',
      subtitle: `Nota ${rubricScore}/100 · Informe`,
      icon: Flag,
      counter: `${completedMissions}/${totalMissions} FLAG`,
    },
  ];

  return (
    <aside className="no-print w-full lg:w-[272px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0D1425] flex flex-col justify-between">
      <div className="p-4">
        <div className="mb-3 px-2 text-xs font-medium text-slate-400">
          Módulos de Consola
        </div>
        <nav aria-label="Módulos de PatchDay" className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModule(item.id)}
                className={`w-full text-left rounded-md px-3 py-2.5 transition-colors flex items-start gap-3 cursor-pointer border ${
                  isActive
                    ? 'bg-sky-500/10 border-sky-500/40 text-slate-50'
                    : 'bg-transparent border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-sky-400' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {item.index}. {item.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span className="truncate">{item.subtitle}</span>
                    {item.counter && (
                      <span className="font-mono tabular-nums text-[11px] text-slate-300 shrink-0">
                        {item.counter}
                      </span>
                    )}
                    {item.phaseTag && !item.counter && (
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        {item.phaseTag}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Ring Inventory Quick Summary */}
        <div className="mt-6 border-t border-slate-800 pt-4 px-2">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Anillos de Despliegue
            </span>
            <button
              type="button"
              onClick={() => onSelectModule('wsus')}
              className="text-xs text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
            >
              Abrir WSUS
            </button>
          </div>
          <div className="space-y-2">
            {DEPLOYMENT_RINGS.map((ring) => (
              <div
                key={ring.id}
                className="flex items-center justify-between text-xs text-slate-300"
              >
                <span className="truncate pr-2">{ring.wsusGroupName}</span>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  {ring.fleetCount} eq
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Attribution */}
      <div className="border-t border-slate-800 px-5 py-3.5 text-xs text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span>Persistencia local activa</span>
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap"
          >
            <span>Autor</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </aside>
  );
};
