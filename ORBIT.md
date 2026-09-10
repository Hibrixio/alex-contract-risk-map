# Orbit

Orbit is a document intelligence and visual reasoning workspace. It turns uploaded documents into source-linked clauses, risks, recommendations, actions, and interactive maps. Orbit is designed to make information understandable before it becomes operational work in Vector.

Live application: <https://orbit-contract-mind-map.vercel.app/>

Repository: <https://github.com/Hibrixio/alex-contract-risk-map>

The separate Orbit dashboard at <https://orbit-dashboard.vercel.app/> is outside this repository and must not be modified from this project.

## Product role

Orbit handles the middle of this workflow:

```text
Upload -> Understand -> Visualize -> Explore -> Ask -> Organize
```

Vector is the future command and tracking layer:

```text
Orbit insight/action -> Vector decision and tracking -> Orbit evidence
```

Orbit should remain a complementary document workspace, not a duplicate of Vector and not a generic document chat interface.

## Current user areas

### Mapping

- Upload PDF, DOCX, text, CSV, Markdown, or image files.
- Extract selectable PDF text with page geometry.
- OCR scanned PDFs and receipt images with browser Tesseract; optional Google Vision OCR is supported by `/api/ocr`.
- Send extracted text to the authenticated OpenRouter analysis endpoint.
- Analyze contract clauses, risks, timing, payment, fees, termination, liability, confidentiality, data, IP, force majeure, acts of God, and other signing concerns.
- Show source-backed cards in a 3D map, risk-card board, and recommendation table.
- Jump from a card or recommendation to exact highlighted source text in the uploaded document.
- Keep source evidence separate from AI interpretation, proposed wording, and user drafts.
- Accept, reject, or reset recommendations.
- Export a highlighted PDF and an HTML review.
- Save recent mappings, source documents, analysis, evidence geometry, positions, and decisions in browser IndexedDB/local storage.

### Tasks

- Tasks are independent from document mappings.
- Add, edit, delete, restore, search, filter, and export tasks.
- Track owner, due date, status, priority, next action, checklist, blockers, and notes.
- Import spreadsheets, public Google Sheets, transcripts, and audio recordings.
- Use the Orbit task assistant for add, edit, complete, and find commands.
- View tasks as a list/table or as an Orbit-centered connected mind map.
- Task actions created from documents should retain document and evidence provenance as the model evolves.

### Finance

- Import CSV, TSV, XLSX, XLS, and ODS receipt registers.
- Detect arbitrary vendor, date, amount, and receipt columns.
- Upload receipt PDFs and images.
- Read receipt totals locally, including deep OCR passes for distant or tilted photographs.
- Keep vendor, paid date, amount, receipt preview, and Drive link in an editable register.
- Connect Google Drive with the configured Google OAuth client and upload receipt files to the signed-in account.
- Export the finance register as CSV.

Finance currently persists records in browser storage. Google Sheets write-back, folder selection, and cross-device finance persistence require further implementation and verification.

### Calendar

- Maintain local meetings and task due dates.
- Import and edit Google Calendar events after OAuth consent.
- Export an ICS calendar.
- Keep automatic meeting attendance and unattended recording out of the product until a separate meeting-bot service is configured.

## Source integrity

Every material insight, recommendation, and action should preserve:

```text
Document -> section/page/clause/passage -> exact evidence
```

Use these content origins:

```text
SOURCE = extracted from the uploaded document
AI     = generated interpretation or recommendation
USER   = manually created or edited content
SYSTEM = application status or metadata
```

Source text is immutable. AI wording must never be presented as if it appeared in the document. Accepting a recommendation must create a traceable proposed or revised artifact; it must not silently overwrite the original upload.

## SPAIN guardrails

### Stable

- Extend the existing static workspace incrementally.
- Preserve old mappings and migrate saved records rather than discarding them.
- Keep document mappings, tasks, finance records, and calendar data in explicit boundaries.
- Avoid a full Orbit/Vector repository merge until the integration contract is stable.

### Performance

- Avoid repeating paid analysis for the same document and request.
- Cache or persist extraction and analysis results by document hash.
- Keep OCR work off the main interaction path where possible.
- Test 100-page documents and large node sets.
- Keep map dragging, filtering, and scrolling responsive.

### Availability

- Show clear processing, success, and failure states.
- Never replace a working mapping with an empty AI response.
- Make saved documents and insights recoverable after refresh and account changes.
- Move important records from browser-only storage to authenticated durable storage before multi-device launch.

### Integrity

- Require exact source evidence for mapped clauses and recommendations.
- Keep evidence, interpretation, user edits, and system metadata visually distinct.
- Preserve provenance when converting an insight into a task or Vector action.
- Record original AI wording when users edit a suggestion.
- Never infer a due date, owner, amount, or commitment without clear evidence.

### Novelty

Orbit should be meaningfully better than “chat with a document” through:

- spatial document understanding;
- movable and connected information;
- exact source navigation;
- recommendations that become structured actions;
- multiple views over the same underlying intelligence;
- a traceable path from document evidence to operational follow-through.

## Architecture

The current application is a static browser workspace with protected Vercel functions:

```text
index.html
  ├─ workspace.js       core upload, mapping, source viewer, map behavior
  ├─ workspace-plus.js  tasks, finance, imports, calendar, saved mappings
  ├─ google-calendar.js Google Calendar OAuth and event operations
  ├─ receipt-reader.js  local receipt OCR and total detection
  └─ source-engine.js   source matching and evidence geometry

api/
  ├─ analyze.js   OpenRouter document analysis
  ├─ ocr.js       optional Google Vision OCR
  ├─ sheet.js     public Google Sheet retrieval
  ├─ tasks.js     task extraction from rows or transcripts
  ├─ transcribe.js audio transcription
  └─ config.js    public runtime configuration
```

The app uses Clerk for sign-in. Provider secrets remain server-side. Browser-side Google OAuth tokens are held in memory and cleared on account changes or disconnect.

## Recommended data model

The next convergence-ready model should define versioned objects for:

- `Document`: id, name, type, status, source metadata, created timestamp.
- `DocumentSection`: document id, hierarchy, content, page range.
- `Evidence`: document id, section id, exact text, page, offsets or geometry.
- `Insight`: type, title, content, confidence, evidence ids, generated by.
- `Recommendation`: title, rationale, proposed wording, evidence ids, decision status.
- `Action`: title, description, owner, due date, priority, status, evidence ids, Vector id.
- `CanvasNode`: workspace id, object type/id, position, dimensions, parent/group.

Objects should include `content_origin`, `created_by`, `generated_by`, and stable source references. Use migrations for existing browser records.

## Development priorities

1. Audit the repository and live application against SPAIN before major rewrites.
2. Add versioned provenance schemas and migration support.
3. Add analysis caching by document hash and request.
4. Produce a real revised-document artifact for accepted recommendations while preserving the original.
5. Define an export/API contract for sending Orbit actions to Vector.
6. Add durable authenticated storage for documents, insights, actions, and finance records.
7. Complete Google Sheets write-back and Drive-folder selection with explicit user authorization.
8. Generalize contract-specific assumptions so other document types can use the same intelligence model.

## Local development

Requirements: Node 22 or later.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4174>. Do not open `index.html` with `file://`; authentication and protected APIs require the served application.

Run checks:

```bash
npm test
npm run build
ORBIT_TEST_URL=http://127.0.0.1:4180 npx playwright test
```

Browser tests mock provider responses to avoid unnecessary AI charges.

## Limits and known boundaries

- Uploads are limited to 25 MB.
- Analysis input is limited to 120,000 extracted characters.
- Analysis returns up to 100 mapped items or tasks.
- Tesseract OCR currently uses English recognition data.
- OCR and AI results require source review; uncertainty must remain visible.
- Non-PDF DOCX uploads display extracted text rather than Word page layout.
- Browser-local persistence is not a cross-device backup.
- Vector integration is not yet connected.

## Product statement

> Orbit turns documents into interactive intelligence. Vector turns that intelligence into coordinated action.

