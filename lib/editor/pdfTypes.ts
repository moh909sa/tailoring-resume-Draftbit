export type PdfPageSize = "A4" | "LETTER";

export type EditorPdf = {
  uri: string;
  filename: string;
  revision: number;
  pageCount?: number;
  dispose: () => Promise<void>;
};

export function pdfPageCount(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}

export function pdfPath(id: string, revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Save your CV before generating a PDF.");
  }
  return `/tailored-cvs/${encodeURIComponent(id)}/pdf?revision=${revision}`;
}

export function validatePdfResponse(status: number, mime: string | null, revision: string | null, expected: number) {
  if (status === 409) throw new Error("Your CV has a newer saved version. Return to the editor and preview it again.");
  if (status === 401 || status === 403) throw new Error("Please sign in again to preview this CV.");
  if (status < 200 || status >= 300) throw new Error("Your PDF could not be generated. Please try again.");
  if (!mime?.toLowerCase().includes("application/pdf")) throw new Error("The service did not return a PDF. Please try again.");
  if (revision === null || !/^\d+$/.test(revision)) throw new Error("The PDF version could not be verified. Please try again or contact support.");
  if (Number(revision) !== expected) throw new Error("This PDF belongs to a different saved version. Preview your CV again.");
}
