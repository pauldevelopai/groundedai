/**
 * Shared in-memory scan state for the AI Lawsuit Tracker.
 * Imported by both background-jobs.js (writes) and routes/lawsuits.js (reads).
 */

export const scanState = {
  running: false,
  startedAt: null,
  phase: 'idle',          // idle | courtlistener | news | analysing | saving | done | error
  step: 'Not running',    // human-readable current action
  sourcesDone: 0,
  sourcesTotal: 0,
  articlesDone: 0,
  articlesTotal: 0,
  newCases: 0,
  updatedCases: 0,
  lastCompletedAt: null,
  lastResult: null,
  error: null,
};

export function updateScan(patch) {
  Object.assign(scanState, patch);
}

export function startScan() {
  Object.assign(scanState, {
    running: true,
    startedAt: Date.now(),
    phase: 'starting',
    step: 'Initialising scan…',
    sourcesDone: 0,
    sourcesTotal: 0,
    articlesDone: 0,
    articlesTotal: 0,
    newCases: 0,
    updatedCases: 0,
    error: null,
    lastResult: null,
  });
}

export function finishScan(result, error = null) {
  Object.assign(scanState, {
    running: false,
    phase: error ? 'error' : 'done',
    step: error ? `Error: ${error}` : result || 'Scan complete',
    lastCompletedAt: Date.now(),
    lastResult: result || null,
    error: error || null,
  });
}
