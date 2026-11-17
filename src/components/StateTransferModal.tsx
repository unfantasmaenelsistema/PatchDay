import React, { useState } from 'react';
import { Check, Copy, Download, RotateCcw, Upload, X } from 'lucide-react';
import { LabState } from '../types/patchday';
import {
  exportStateToBase64,
  exportStateToJson,
  importStateFromInput,
} from '../utils/labStorage';

interface StateTransferModalProps {
  isOpen: boolean;
  state: LabState;
  onClose: () => void;
  onImportState: (nextState: LabState) => void;
}

export const StateTransferModal: React.FC<StateTransferModalProps> = ({
  isOpen,
  state,
  onClose,
  onImportState,
}) => {
  const [format, setFormat] = useState<'json' | 'base64'>('json');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const exportedText =
    format === 'json' ? exportStateToJson(state) : exportStateToBase64(state);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([exportStateToJson(state)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `patchday-lab-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const result = importStateFromInput(importText);
    if (result.ok) {
      setImportError(null);
      onImportState(result.state);
      setImportText('');
      onClose();
    } else {
      setImportError(result.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-[#111827] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <h2
            id="transfer-modal-title"
            className="font-display text-base font-semibold text-slate-100"
          >
            Exportar / Importar Estado del Laboratorio
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Export section */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Exportar estado actual (localStorage)
              </span>
              <div className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#0B1120] p-0.5">
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    format === 'json'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-slate-100'
                  }`}
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('base64')}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    format === 'base64'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-slate-100'
                  }`}
                >
                  Base64
                </button>
              </div>
            </div>

            <textarea
              readOnly
              rows={5}
              value={exportedText}
              className="w-full rounded-md border border-slate-800 bg-[#0B1120] p-3 font-mono text-[11px] text-slate-300 focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 cursor-pointer"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copied ? 'Copiado' : `Copiar ${format.toUpperCase()}`}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Descargar .json</span>
              </button>
            </div>
          </div>

          {/* Import section */}
          <div className="border-t border-slate-800 pt-4 space-y-2">
            <label
              htmlFor="import-state-textarea"
              className="block text-xs font-semibold text-slate-200"
            >
              Importar snapshot (pega JSON o cadena Base64)
            </label>
            <textarea
              id="import-state-textarea"
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Pega aquí el JSON exportado o la cadena Base64..."
              className="w-full rounded-md border border-slate-700 bg-[#0B1120] p-3 font-mono text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            {importError && (
              <p className="text-xs text-red-400">{importError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restaurar Estado</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResetConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#111827] p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <RotateCcw className="h-5 w-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2
              id="reset-modal-title"
              className="font-display text-base font-semibold text-slate-100"
            >
              ¿Reiniciar laboratorio PatchDay?
            </h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Se borrarán todas tus asignaciones de prioridad P1–P4, notas de análisis y boletines en cola RFC guardados en este navegador.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
          >
            Confirmar Reset Lab
          </button>
        </div>
      </div>
    </div>
  );
};
