import { sanitizeResumeText } from "./sanitize-resume";

/**
 * Extract readable text from an uploaded file entirely in the browser — the
 * file is never sent anywhere until the workflow runs. PDFs are parsed with
 * pdf.js (loaded lazily so the ~1 MB library only downloads when a PDF is
 * actually attached); plain-text formats are read directly.
 *
 * Extracted text is passed through {@link sanitizeResumeText} to strip hidden
 * keyword-stuffing and neutralize prompt-injection content before it reaches
 * an AI screening agent.
 */

export interface ExtractedFile {
  name: string;
  text: string;
  removed: string[];
}

const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|log|html?|xml|yaml|yml|rtf)$/i;

async function extractPdf(file: File): Promise<string> {
  // Dynamic import keeps pdf.js (~1 MB) out of the main bundle — it only loads
  // when a PDF is actually attached.
  const pdfjs = await import("pdfjs-dist");
  // Point pdf.js at its bundled worker. `new URL(..., import.meta.url)` is
  // statically analyzable, so the bundler emits the worker as an asset.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(line);
  }
  await loadingTask.destroy();
  return pages.join("\n\n");
}

/** Read one file to sanitized text. Throws with a clear message on failure. */
export async function extractFileText(file: File): Promise<ExtractedFile> {
  let raw: string;
  if (PDF_EXT.test(file.name) || file.type === "application/pdf") {
    raw = await extractPdf(file);
    if (raw.trim().length === 0) {
      throw new Error(
        `"${file.name}" has no extractable text (it may be a scanned image). Paste the text instead.`,
      );
    }
  } else if (TEXT_EXT.test(file.name) || file.type.startsWith("text/")) {
    raw = await file.text();
  } else {
    throw new Error(`"${file.name}" is not a supported type. Use PDF or a text file.`);
  }

  const { text, removed } = sanitizeResumeText(raw);
  return { name: file.name, removed, text };
}
