# Orbit document workspace

Live: https://orbit-contract-mind-map.vercel.app/

Upload a PDF, DOCX, text file or image; optionally describe the clauses or tasks to find. Orbit maps the source, shows exact evidence on the original PDF/image, and lets you jump between clauses and yellow highlights. Export the highlighted PDF or a review containing evidence, recommendations and notes.

The collapsible navigation contains Mapping, Tasks and Settings. The reference task map's search, priorities, owners, due dates, status, next actions, checklists, blockers, notes, connected map and selection are supported. Tasks are saved independently per account. Card positions and recommendation decisions are saved per document in this browser. This does not sync with Notion or between devices.

## Services

- Clerk Google sign-in (the existing development instance is reused; configure a production Clerk instance before a public launch).
- OpenRouter analysis through the authenticated `/api/analyze` endpoint.
- PDF.js extraction and original-page rendering with text-coordinate highlights.
- Tesseract OCR for scanned pages/images in the browser (English; downloads its recognition engine and language data on first use). No per-page AI credits. Optional Google Vision OCR through `/api/ocr` when `GOOGLE_VISION_API_KEY` is configured.

Uploaded source and analysis are saved in this browser using IndexedDB. Extracted text is sent to OpenRouter for analysis. With Google OCR enabled, scanned page images are also sent to Google. Use Recent mappings after reload to restore a document. Export before clearing browser storage to retain task edits.

## Local development

Node 22 or later. Run `npm install`, create `.env.local` with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `OPENROUTER_API_KEY`, then `npm run dev`. Open http://127.0.0.1:4174. Opening `index.html` through `file://` cannot run authentication or the API.

Optional variables: `OPENROUTER_MODEL`, `GOOGLE_VISION_API_KEY`.

`npm test` checks evidence matching; `npm run test:browser` verifies upload, PDF jumps, source replacement, task persistence, errors, auth and real browser OCR. Browser tests use mocked sign-in and analysis responses to avoid model charges. Run the dev server on port 4180 for these tests. They require Chrome; the PDF fixture is generated automatically.

## Limits

25 MB per upload, 120,000 extracted characters per analysis, up to 100 mapped items. Oversized text is rejected rather than silently truncated. AI coverage and OCR are not guaranteed; inspect source evidence and unmatched requests. Unsupported or encrypted files produce a visible error. For non-PDF Word uploads, the viewer shows extracted text with highlights, not Word page layout. The yellow PDF highlights identify matching text runs, rather than arbitrary bands.

`npm run build` creates the static frontend in `dist`; Vercel also bundles the protected API functions. The separate Orbit dashboard is not part of this project.

## Independent Tasks and recent mappings

Mapping uploads never create, replace or delete tasks. The task workspace uses its own account-scoped browser storage. The Add task action creates a manual task; tasks can be edited, deleted with Undo, imported and exported. Prior manually created or edited tasks are migrated from the old storage once.

Mapping now stores the original document, page geometry and analysis in IndexedDB. After refresh, use Recent mappings to reopen it without a model call. This is browser-local storage, not a cross-device backup. Saved documents can be deleted from Recent mappings.

Contract reviews always request force majeure / acts-of-God checks along with timing, penalties, liability, termination and other signing concerns. Missing or unclear protections and proposed wording are separate from source-backed clauses. The recommendation view is a table with Accept, Reject and Reset decisions; handwritten draft clauses do not alter the uploaded source.

## Task imports, voice and calendar

- Spreadsheet parsing uses vendored SheetJS 0.20.3 for XLSX/XLS/ODS/CSV/TSV. All nonempty rows and tabs are presented to the task extractor; arbitrary column names are supported. Imported tasks are previewed before adding. Source row information is retained in notes. There is a 10 MB file limit and 120,000-character analysis limit; split larger workbooks. Extraction returns up to 100 tasks per import.
- Public Google Sheets links can be imported. Private sheets need an XLSX export uploaded by the user; Google Drive/Sheets OAuth is not connected.
- Microphone recording uses MediaRecorder, stops at five minutes and releases its tracks. Uploaded audio and voice use OpenRouter `/audio/transcriptions` with `openai/whisper-1` (override with `TRANSCRIPTION_MODEL`). Audio is limited to 2.5 MB per request. Users review the transcript, then extract tasks. Provider calls use credits only on explicit user actions. Browser tests mock those provider responses; real microphone hardware and a live transcription provider were not exercised.
- Calendar entries, local meeting times, task due dates and ICS export are available. Meetings can be opened through their HTTPS links. Automatic bot attendance and unattended meeting recording are **not connected**; they require a separate meeting-bot service and account. Calendar entries do not claim a bot has been scheduled.

New protected endpoints: `/api/tasks`, `/api/transcribe`, `/api/sheet`.
