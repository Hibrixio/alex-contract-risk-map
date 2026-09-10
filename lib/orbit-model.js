(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OrbitModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CURRENT_SCHEMA_VERSION = 1;

  function now() { return new Date().toISOString(); }
  function id(prefix) {
    const value = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${value}`;
  }

  function provenance(fields) {
    return {
      source_document_id: fields.source_document_id || null,
      source_reference: fields.source_reference || null,
      evidence_ids: Array.isArray(fields.evidence_ids) ? fields.evidence_ids : [],
      content_origin: fields.content_origin || 'user',
      created_by: fields.created_by || null,
      generated_by: fields.generated_by || null,
      created_at: fields.created_at || now(),
      updated_at: fields.updated_at || now()
    };
  }

  function envelope(type, fields) {
    const value = fields || {};
    return { schema_version: CURRENT_SCHEMA_VERSION, type, id: value.id || id(type.toLowerCase()), ...value, ...provenance(value) };
  }

  function document(fields) { return envelope('Document', fields); }
  function evidence(fields) { return envelope('Evidence', fields); }
  function insight(fields) { return envelope('Insight', fields); }
  function recommendation(fields) { return envelope('Recommendation', fields); }
  function action(fields) { return envelope('Action', fields); }
  function canvasNode(fields) { return envelope('CanvasNode', fields); }

  function migrate(value) {
    if (!value || typeof value !== 'object') return value;
    const version = Number(value.schema_version || 0);
    if (version >= CURRENT_SCHEMA_VERSION) return { ...value };
    const migrated = { ...value, schema_version: CURRENT_SCHEMA_VERSION };
    if (value.name && !value.title) migrated.title = value.name;
    if (value.documentKey && !migrated.source_document_id) migrated.source_document_id = value.documentKey;
    return { ...migrated, ...provenance(migrated) };
  }

  function migrateCollection(items) { return (Array.isArray(items) ? items : []).map(migrate); }

  return { CURRENT_SCHEMA_VERSION, document, evidence, insight, recommendation, action, canvasNode, migrate, migrateCollection, provenance };
});
