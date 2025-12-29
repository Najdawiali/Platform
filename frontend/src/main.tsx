import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// React dev builds can call `performance.measure()` with a `detail` payload.
// If props/state are large, some browsers can throw `DataCloneError` (OOM) when cloning.
// This shim prevents the whole app from crashing in dev by stripping `detail` or skipping.
if (import.meta.env.DEV && typeof performance !== 'undefined') {
  const originalMeasure = performance.measure?.bind(performance);
  if (typeof originalMeasure === 'function') {
    (performance as any).measure = (
      name: string,
      startOrOptions?: string | PerformanceMeasureOptions,
      endMark?: string,
    ) => {
      try {
        return originalMeasure(name as any, startOrOptions as any, endMark as any);
      } catch (err: any) {
        const message = String(err?.message || err);
        if (err?.name === 'DataCloneError' || message.includes('Data cannot be cloned')) {
          try {
            if (startOrOptions && typeof startOrOptions === 'object' && 'detail' in startOrOptions) {
              const { detail: _detail, ...rest } = startOrOptions as any;
              return originalMeasure(name as any, rest as any);
            }
          } catch {
            // ignore
          }
          return;
        }
        throw err;
      }
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
