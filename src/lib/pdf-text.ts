// Extract plain text from a PDF in the BROWSER, for the meeting-note flow:
// upload the meeting minutes PDF → text lands in the paste box → AI analyze
// as usual. Client-side on purpose — the file never leaves the device, and
// the server stays out of it.
//
// Import this module ONLY via dynamic import() from the click handler:
// pdfjs-dist is ~1MB and must not enter the shared bundle for a button most
// sessions never press.
//
// Scanned/image-only PDFs have no text layer — extraction "succeeds" with an
// empty result. Callers must treat a near-empty result as "this PDF is a
// scan" and say so, not silently produce an empty paste box.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

// The bundler resolves the worker to a hashed asset URL at build time — the
// documented pdf.js bundler setup, no CDN and no file copied into public/.
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export interface PdfTextResult {
  text: string
  pages: number
}

export async function extractPdfText(file: File): Promise<PdfTextResult> {
  const data = await file.arrayBuffer()
  const loadingTask = getDocument({ data })
  const pdf = await loadingTask.promise
  try {
    const parts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // Join items on one page with spaces, but respect pdf.js's own line
      // breaks (hasEOL) so bullet lists survive as separate lines — the AI
      // prompt and the plain line-split path both work per line.
      let line = ''
      const lines: string[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        line += (line && item.str ? ' ' : '') + item.str
        if (item.hasEOL) {
          lines.push(line.trim())
          line = ''
        }
      }
      if (line.trim()) lines.push(line.trim())
      parts.push(lines.filter(Boolean).join('\n'))
    }
    return { text: parts.filter(Boolean).join('\n\n').trim(), pages: pdf.numPages }
  } finally {
    // v6 API: teardown lives on the loading task (kills the worker too).
    await loadingTask.destroy()
  }
}
