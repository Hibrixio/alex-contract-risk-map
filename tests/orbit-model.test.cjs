const { test } = require('node:test');
const assert = require('node:assert/strict');
const OrbitModel = require('../lib/orbit-model.js');

test('Orbit records carry a version and explicit provenance', () => {
  const record = OrbitModel.recommendation({ id: 'r1', source_document_id: 'doc1', source_reference: { page: 3, quote: 'Payment is due.' }, content_origin: 'ai', generated_by: 'openrouter' });
  assert.equal(record.schema_version, 1);
  assert.equal(record.type, 'Recommendation');
  assert.deepEqual(record.evidence_ids, []);
  assert.equal(record.source_reference.page, 3);
  assert.equal(record.content_origin, 'ai');
});

test('legacy saved mapping records migrate without losing fields', () => {
  const migrated = OrbitModel.migrate({ name: 'Agreement.pdf', documentKey: 'hash-1', nodes: [{ id: 'n1' }] });
  assert.equal(migrated.schema_version, 1);
  assert.equal(migrated.title, 'Agreement.pdf');
  assert.equal(migrated.source_document_id, 'hash-1');
  assert.deepEqual(migrated.nodes, [{ id: 'n1' }]);
  assert.equal(migrated.content_origin, 'user');
});
