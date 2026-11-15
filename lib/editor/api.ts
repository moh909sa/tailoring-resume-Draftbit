import { isJsonObject, stringList } from "@/lib/tailoring/types";
import type { KeywordHistory } from "./keywordHighlights";
import { apiErrorMessage, CvApiError, mobileAccessToken, mobileEndpoint } from "@/lib/cv/api";
import { parseEditorAnalysis, parseEditorDocument, parseTailoredCvs, parsePdfCheck, type EditorDocument, type EditorSave } from "./types";

async function request<T>(ownerId: string, path: string, signal: AbortSignal, parse: (value: unknown) => T, method = "GET", body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await mobileAccessToken(ownerId, attempt === 1);
    if (signal.aborted) throw new Error("Request canceled.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 45000);
    try {
      const response = await fetch(mobileEndpoint(path), {method, signal: controller.signal, headers: {Authorization: "Bearer " + token, Accept: "application/json", ...(body === undefined ? {} : {"Content-Type":"application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) {
        const message = response.status === 404
          ? "This saved CV could not be found. It may have been removed. Return to Tailored CVs."
          : apiErrorMessage(response.status, payload, method === "PATCH"
            ? "Your CV could not be saved. Your edits are kept on this device."
            : "This CV request could not be completed. Please try again.");
        throw new CvApiError(message, response.status);
      }
      return parse(payload);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new CvApiError("Please sign in again to open your CV.", 401);
}
const pathFor = (id: string) => "/tailored-cvs/" + encodeURIComponent(id);
function sameDocument(id: string, value: unknown): EditorDocument {
  const doc = parseEditorDocument(value);
  if (doc.tailoring_id !== id) throw new Error("The service returned a different CV. Reload before editing.");
  return doc;
}
export const getEditorDocument = (ownerId: string, id: string, signal: AbortSignal) => request(ownerId, pathFor(id) + "/editor", signal, v => sameDocument(id, v));
export const saveEditorDocument = (ownerId: string, id: string, body: EditorSave, signal: AbortSignal) => request(ownerId, pathFor(id) + "/editor", signal, v => sameDocument(id, v), "PATCH", body);
export const getEditorAnalysis = (ownerId: string, id: string, signal: AbortSignal) => request(ownerId, pathFor(id) + "/ats-score", signal, parseEditorAnalysis);
export const recalculateEditorAnalysis = (ownerId: string, id: string, revision: number, signal: AbortSignal) => request(ownerId, pathFor(id) + "/ats-score", signal, parseEditorAnalysis, "POST", {expected_revision: revision});
export const listTailoredCvs = (ownerId: string, signal: AbortSignal, offset = 0, limit = 30) => request(ownerId, "/tailored-cvs?status=ready&limit=" + limit + "&offset=" + offset, signal, parseTailoredCvs);
export const checkEditorPdf = (ownerId: string, id: string, revision: number, signal: AbortSignal) => request(ownerId, pathFor(id) + "/parse-check", signal, value => {
  const check = parsePdfCheck(value);
  if (check.revision !== revision) throw new Error("This check belongs to another saved version. Check the PDF again.");
  return check;
}, "POST", {expected_revision: revision});

// Existing owned saved-CV and original-CV endpoints retain the source and tracked
// comparisons. No mutation or scoring request is needed to locate phrases.
export async function getEditorKeywordHistory(ownerId: string, id: string, signal: AbortSignal): Promise<KeywordHistory> {
  const record = await request(ownerId, pathFor(id), signal, value => {
    if (!isJsonObject(value) || value.id !== id || value.status !== "ready") throw new Error("Keyword history belongs to another CV.");
    return value;
  });
  const preview = isJsonObject(record.preview_json) ? record.preview_json : {};
  const changes: KeywordHistory["changes"] = [];
  for (const change of Array.isArray(preview.detailed_changes) ? preview.detailed_changes : []) {
    if (isJsonObject(change) && typeof change.field_path === "string" && typeof change.new_value === "string" && (typeof change.original_value === "string" || change.change_type === "added")) changes.push({path:change.field_path,before:typeof change.original_value === "string" ? change.original_value : "",after:change.new_value});
  }
  const keywords = (Array.isArray(preview.keyword_placements) ? preview.keyword_placements : []).flatMap(item => isJsonObject(item) && typeof item.keyword === "string" ? [item.keyword] : []);
  keywords.push(...stringList(isJsonObject(preview._mobile) ? preview._mobile.applied_keywords : null));
  let original: KeywordHistory["original"] = null;
  if (typeof record.source_resume_id === "string" && record.source_resume_id) {
    const sourceId = record.source_resume_id;
    try {
      original = await request(ownerId, "/resumes/" + encodeURIComponent(sourceId), signal, value => {
        if (!isJsonObject(value) || value.id !== sourceId || value.processing_status !== "ready" || !isJsonObject(value.processed_resume) || !Object.keys(value.processed_resume).length) return null;
        return value.processed_resume;
      });
    } catch (error) {
      if (signal.aborted) throw error;
      // Missing/deleted originals must not hide the saved CV or verified changes.
    }
  }
  return { original, changes, keywords };
}
