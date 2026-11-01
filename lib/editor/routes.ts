type RouteValue = string | string[] | undefined;
type EditorParams = { id?: RouteValue; revision?: RouteValue };

const singleValue = (value: RouteValue) =>
  Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The URL identifies the saved tailoring record, never the uploaded resume or
// engine document. An omitted PDF revision means load the latest saved version.
export function readEditorRoute(params: EditorParams): {
  id: string | null;
  revision: number | undefined;
  error: string | null;
} {
  const id = singleValue(params.id)?.toLowerCase();
  if (!id || !uuid.test(id)) return {
    id: null,
    revision: undefined,
    error: params.id === undefined || params.id === ""
      ? "Choose a saved CV from Tailored CVs to open it."
      : "This CV link is invalid. Open a saved CV from Tailored CVs.",
  };
  if (params.revision === undefined) return { id, revision: undefined, error: null };
  const raw = singleValue(params.revision);
  const revision = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(revision) || revision < 1) return {
    id,
    revision: undefined,
    error: "This PDF link has an invalid saved version. Return to the editor and preview again.",
  };
  return { id, revision, error: null };
}
