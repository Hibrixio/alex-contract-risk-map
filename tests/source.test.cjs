const {test}=require('node:test');const assert=require('node:assert/strict');const source=require('../source-engine.js');
test('matches exact evidence across lines and pages, excludes invented text',()=>{
 const pages=[{pageNumber:1,items:[{text:'General terms',rect:[10,10,40,2]}]},{pageNumber:2,items:[{text:'Client shall pay',rect:[10,31,30,2]},{text:'within 15 days.',rect:[10,34,25,2]}]}];
 const found=source.locate(['Client shall pay within 15 days.'],pages);assert.equal(found.length,1);assert.equal(found[0].page,2);assert.deepEqual(found[0].rects,[[10,31,30,2],[10,34,25,2]]);assert.deepEqual(source.locate(['Client may terminate immediately'],pages),[]);
});
test('text highlights preserve original text offsets and repeated occurrences',()=>{const text='Pay within 15 days.\nPay within 15 days.';assert.deepEqual(source.textRanges(text,['Pay within 15 days.']),[[0,18],[20,38]]);});
