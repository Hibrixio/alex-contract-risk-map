# Orbit document workspace

Live: https://orbit-contract-mind-map.vercel.app/

Upload a PDF, DOCX, text file or image; optionally describe the clauses or tasks to find. Orbit maps the source, shows exact evidence on the original PDF/image, and lets you jump between clauses and yellow highlights. Export the highlighted PDF or a review containing evidence, recommendations and notes.

The collapsible navigation contains Mapping, Tasks and Settings. The reference task map's search, priorities, owners, due dates, status, next actions, checklists, blockers, notes, connected map and selection are supported. Task data, card positions and recommendation decisions are saved per account and document in this browser. This does not sync with Notion or between devices.

## Services

- Clerk Google sign-in (the existing development instance is reused; configure a production Clerk instance before a public launch).
- OpenRouter analysis through the authenticated `/api/analyze` endpoint.
- PDF.js extraction and original-page rendering with text-coordinate highlights.
- Tesseract OCR for scanned pages/images in the browser (English; downloads its recognition engine and language data on first use). No per-page AI credits. Optional Google Vision OCR through `/api/ocr` when `GOOGLE_VISION_API_KEY` is configured.

Uploads stay in browser memory. Extracted text is sent to OpenRouter for analysis. With Google OCR enabled, scanned page images are also sent to Google. Re-upload after reload to restore a document. Export before clearing browser storage to retain task edits.

## Local development

Node 22 or later. Run `npm install`, create `.env.local` with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `OPENROUTER_API_KEY`, then `npm run dev`. Open http://127.0.0.1:4174. Opening `index.html` through `file://` cannot run authentication or the API.

Optional variables: `OPENROUTER_MODEL`, `GOOGLE_VISION_API_KEY`.

`npm test` checks evidence matching; `npm run test:browser` verifies upload, PDF jumps, source replacement, task persistence, errors, auth and real browser OCR. Browser tests use mocked sign-in and analysis responses to avoid model charges. Run the dev server on port 4180 for these tests. They require Chrome; the PDF fixture is generated automatically.

## Limits

25 MB per upload, 120,000 extracted characters per analysis, up to 100 mapped items. Oversized text is rejected rather than silently truncated. AI coverage and OCR are not guaranteed; inspect source evidence and unmatched requests. Unsupported or encrypted files produce a visible error. For non-PDF Word uploads, the viewer shows extracted text with highlights, not Word page layout. The yellow PDF highlights identify matching text runs, rather than arbitrary bands.

`npm run build` creates the static frontend in `dist`; Vercel also bundles the protected API functions. The separate Orbit dashboard is not part of this project.
