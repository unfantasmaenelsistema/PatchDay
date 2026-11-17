import React, { useState } from 'react';
import { BookOpen, Layers, ShieldAlert, Terminal, Wrench, X } from 'lucide-react';

interface SecOpsFieldGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'triage' | 'itil' | 'wsus' | 'troubleshooting';

export const SecOpsFieldGuideModal: React.FC<SecOpsFieldGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [tab, setTab] = useState<GuideTab>('triage');

  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-guide-title"
    >
      <div className="w-full max-w-4xl rounded-lg border border-slate-700 bg-[#0F172A] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="border-b border-slate-800 bg-[#0B1120] px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2
                id="field-guide-title"
                className="font-display text-sm font-bold text-slate-100"
              >
                Manual Técnico de Referencia SecOps · ITIL · WSUS
              </h2>
              <p className="text-[11px] text-slate-400">
                Guía operativa para priorización basada en riesgo, anillos de despliegue y resolución de códigos WUA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar manual"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-slate-800 bg-[#111827] px-5 py-2 flex flex-wrap gap-2">
          {(
            [
              { id: 'triage', label: '1. CVSS vs EPSS vs KEV', icon: ShieldAlert },
              { id: 'itil', label: '2. ITIL RFC, CAB & Anillos', icon: Layers },
              { id: 'wsus', label: '3. Higiene WSUS & Supersedencia', icon: Wrench },
              { id: 'troubleshooting', label: '4. Códigos WUA & WinRM', icon: Terminal },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border whitespace-nowrap cursor-pointer ${
                  tab === item.id
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-slate-800 bg-[#0B1120] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
          {tab === 'triage' && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  ¿Por qué CVSS por sí solo engaña?
                </h3>
                <p>
                  El estándar <strong>CVSS v3.1</strong> mide la gravedad técnica teórica de una vulnerabilidad (0.0–10.0), pero no indica si existe un exploit público ni si los atacantes la están usando.
                </p>
                <ul className="space-y-1.5 text-slate-300 pt-1">
                  <li>
                    • <strong className="text-sky-400">EPSS (Exploit Prediction Scoring System):</strong> estima la probabilidad (0%–100%) de que una CVE sea explotada en los próximos 30 días. Un EPSS &gt; 70% indica amenaza inminente.
                  </li>
                  <li>
                    • <strong className="text-red-400">CISA KEV (Known Exploited Vulnerabilities):</strong> catálogo oficial de vulnerabilidades con explotación activa confirmada. Tiene prioridad P1 obligatoria frente a cualquier CVSS 9.8 teórico con EPSS 2%.
                  </li>
                  <li>
                    • <strong className="text-emerald-400">Contexto de Inventario:</strong> una CVE 10.0 que solo afecta a una VM de laboratorio aislada (como xz-utils en <span className="font-mono">LAB-LIN-01</span>) no requiere ventana de emergencia en servidores de producción.
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3">
                  <div className="font-mono font-semibold text-red-400">P1 · Emergencia (&lt; 24h)</div>
                  <div className="text-slate-400 mt-1">Exposición directa CISA KEV o EPSS muy alto en activos críticos o perimetrales.</div>
                </div>
                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3">
                  <div className="font-mono font-semibold text-amber-300">P2 · Crítico (&lt; 7 días)</div>
                  <div className="text-slate-400 mt-1">Riesgo relevante mitigado parcialmente por ACL o acotado a laboratorio/preproducción.</div>
                </div>
                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3">
                  <div className="font-mono font-semibold text-sky-400">P3 · Planificado (30 días)</div>
                  <div className="text-slate-400 mt-1">CVSS alto pero EPSS bajo (&lt; 20%), sin KEV o con alto riesgo de reinicio/regresión.</div>
                </div>
                <div className="rounded-md border border-slate-800 bg-[#0B1120] p-3">
                  <div className="font-mono font-semibold text-slate-400">P4 · Diferir / Omitir</div>
                  <div className="text-slate-400 mt-1">Parches reemplazados (Superseded) o arquitecturas inexistentes (ARM64 en parque x64).</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'itil' && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Despliegue por Anillos (Ring Deployment) y Soak Time
                </h3>
                <ul className="space-y-1.5">
                  <li>
                    • <strong className="text-slate-100">Ring 0 (Lab &amp; Sandbox · 5 VMs):</strong> abierto 24/7. Valida arranque, hooks EDR y drivers sin riesgo de negocio.
                  </li>
                  <li>
                    • <strong className="text-slate-100">Ring 1 (Pilot Group · 22 eq):</strong> Mar/Jue 14:00–16:00. Detecta fallos en aplicaciones corporativas reales (ej. SQL Staging o WinRE).
                  </li>
                  <li>
                    • <strong className="text-slate-100">Ring 2 (Broad Production · 165 eq):</strong> Sábado 02:00–06:00. Exige RFC aprobado por CAB y mínimo 24h de soak previo en Ring 0/1.
                  </li>
                  <li>
                    • <strong className="text-slate-100">Ring 3 (Mission Critical · 5 nodos):</strong> Domingo 01:00–04:00. Exige RFC, Snapshot de hipervisor/Failover y validación de prerequisitos.
                  </li>
                </ul>
              </div>

              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Tipos de Cambio ITIL y Rollback Coherente
                </h3>
                <p>• <strong>Estándar:</strong> preaprobado solo para Ring 0/1 o parches sin reinicio.</p>
                <p>• <strong>Normal:</strong> obligatorio en Ring 2/3; requiere pruebas previas, ventana fuera de Blackout y rollback técnico válido.</p>
                <p>• <strong>Emergencia:</strong> exclusivo para CISA KEV o EPSS ≥ 70% con justificación técnica detallada.</p>
                <p className="text-amber-300 pt-1">Nota: <code>wusa.exe /uninstall</code> falla en actualizaciones combinadas SSU+LCU, Exchange, SQL, Linux o appliances FortiOS; usa Snapshot o Failover en Ring 3.</p>
              </div>
            </div>
          )}

          {tab === 'wsus' && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-800 bg-[#0B1120] p-4 space-y-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Higiene de Catálogo en Windows Server Update Services
                </h3>
                <p>
                  En WSUS los iconos de supersedencia indican si una actualización reemplaza a otra o ha quedado obsoleta. Aprobar un boletín con <span className="font-mono text-amber-300">SupersededBy</span> consume ancho de banda inútil y fuerza reinicios redundantes.
                </p>
                <p>
                  De igual forma, paquetes de arquitecturas no presentes en el parque (ej. <span className="font-mono">ARM64</span> en una flota 100% x64) deben marcarse como <span className="font-mono text-red-400">Declined</span> para mantener limpio el almacenamiento de <code>WSUSContent</code>.
                </p>
                <p>
                  <strong>Cuidado con los Deadlines:</strong> fijar un <code>Deadline</code> vencido o de 24h forzado en Ring 2/3 provoca reinicios automáticos en plena jornada laboral y penaliza el SLA.
                </p>
              </div>
            </div>
          )}

          {tab === 'troubleshooting' && (
            <div className="space-y-3">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 bg-[#0B1120] text-slate-300">
                    <th className="p-2.5 text-left w-36">Código / Síntoma</th>
                    <th className="p-2.5 text-left">Causa Raíz Real</th>
                    <th className="p-2.5 text-left">Solución en PatchDay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-red-400">0x800f0922</td>
                    <td className="p-2.5">Partición de recuperación WinRE con menos de 250 MB libres (KB5034441).</td>
                    <td className="p-2.5 font-mono text-sky-300">Resize-WinRE (WinRM)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-amber-300">0x8024402c</td>
                    <td className="p-2.5">Error WinHTTP / proxy residual / DNS al contactar con SRV-WSUS-01.</td>
                    <td className="p-2.5 font-mono text-sky-300">Reset-WuAgent (WinRM)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-amber-300">0x80070005</td>
                    <td className="p-2.5">Acceso denegado (ACL corrupta) en carpeta SoftwareDistribution.</td>
                    <td className="p-2.5 font-mono text-sky-300">Reset-WuAgent (WinRM)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-red-400">0x800f081f</td>
                    <td className="p-2.5">CBS_E_SOURCE_MISSING: almacén de componentes WinSxS dañado.</td>
                    <td className="p-2.5 font-mono text-sky-300">DISM /Online /Cleanup-Image /RestoreHealth</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-red-400">BSOD SSU+LCU</td>
                    <td className="p-2.5">wusa.exe falla en paquetes combinados (0x80070002).</td>
                    <td className="p-2.5 font-mono text-sky-300">DISM /Online /Remove-Package o Snapshot</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-semibold text-red-400">0x8033811c</td>
                    <td className="p-2.5">Host en BSOD total / Kerberos bloqueado: puerto WinRM 5985 caído.</td>
                    <td className="p-2.5 font-mono text-emerald-400">Vía 3 · Revertir Snapshot Hipervisor</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
