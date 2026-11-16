import { useEffect, useRef, useState } from "react";
import { getEditorKeywordHistory } from "./api";
import type { KeywordHistory } from "./keywordHighlights";

type HistoryState = { key: string; data: KeywordHistory | null; loading: boolean; error: boolean };

// History belongs to the mounted Job Match session, independently of its active tab.
// Owner/document changes abort old reads and hide their results immediately.
export function useKeywordHistory(ownerId: string | undefined, id: string | undefined) {
  const key = JSON.stringify([ownerId, id]);
  const [state, setState] = useState<HistoryState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!ownerId || !id) return;
    const controller = new AbortController();
    inFlight.current = true;
    setState(previous => ({ key, data: previous?.key === key ? previous.data : null, loading: true, error: false }));
    void getEditorKeywordHistory(ownerId, id, controller.signal).then(data => {
      if (!controller.signal.aborted) {
        inFlight.current = false;
        setState({ key, data, loading: false, error: false });
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        inFlight.current = false;
        setState(previous => ({ key, data: previous?.key === key ? previous.data : null, loading: false, error: true }));
      }
    });
    return () => { controller.abort(); inFlight.current = false; };
  }, [ownerId, id, key, attempt]);
  return {
    history: state?.key === key ? state.data : null,
    historyLoading: !!ownerId && !!id && (state?.key !== key || !!state?.loading),
    historyError: state?.key === key && state.error,
    retryHistory: () => {
      if (!ownerId || !id || state?.key !== key || !state.error || inFlight.current) return;
      inFlight.current = true;
      setAttempt(value => value + 1);
    },
  };
}
