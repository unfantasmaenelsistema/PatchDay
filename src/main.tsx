import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { resetLabStorage } from './utils/labStorage';
import './index.css';

/**
 * Red de seguridad: si un estado guardado o importado hace fallar el render, en lugar de dejar la
 * página en blanco en cada recarga se ofrece restaurar el laboratorio.
 */
class LabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PatchDay: error al pintar el laboratorio', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0B1120] text-slate-100">
        <div className="max-w-md w-full rounded-xl border border-amber-500/40 bg-slate-900 p-6 space-y-4">
          <h1 className="text-lg font-semibold text-amber-300">No se pudo cargar el laboratorio</h1>
          <p className="text-sm text-slate-300">
            El estado guardado en este navegador (o el que acabas de importar) no es válido. Puedes
            restaurar el laboratorio a su estado inicial; se perderá el progreso guardado.
          </p>
          <button
            type="button"
            onClick={() => {
              resetLabStorage();
              window.location.reload();
            }}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Restaurar laboratorio
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <LabErrorBoundary>
    <App />
  </LabErrorBoundary>,
);
