import { useEffect, useState } from "react";
import { getEditorKeywordHistory } from "./api";
import type { KeywordHistory } from "./keywordHighlights";

type HistoryState = { key: string; data: KeywordHistory | null; loading: boolean; error: boolean };

// Read-only, owner/document-scoped history. It does not flush the editor, rescore,
// or block the saved resume while the original/track records are being retrieved.
export function useKeywordHistory(ownerId: string | undefined, id: string | undefined, enabled: boolean) {
  const key = JSON.stringify([ownerId, id]);
  const [state, setState] = useState<HistoryState | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !ownerId || !id) return;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: false });
    void getEditorKeywordHistory(ownerId, id, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, loading: false, error: !data.original && !data.changes.length });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: true });
    });
    return () => controller.abort();
  }, [ownerId, id, enabled, key, attempt]);
  return { history: state?.key === key ? state.data : null, historyLoading: enabled && (state?.key !== key || !!state?.loading), historyError: state?.key === key && state.error, retryHistory: () => setAttempt(value => value + 1) };
}
