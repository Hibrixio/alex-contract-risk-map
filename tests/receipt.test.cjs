const {test}=require('node:test'),assert=require('node:assert/strict');
const {detectTotal}=require('../receipt-reader.js');
test('receipt total ignores subtotal tax and cash change',()=>{assert.equal(detectTotal('Subtotal 1,000.00\nTax total 150.00\nGrand Total J$ 1,150.00\nCash tendered 2,000.00\nChange due 850.00').amount,'1150.00');});
test('receipt total can appear on the next line; conflicting totals require review',()=>{assert.equal(detectTotal('TOTAL\n$42.50').amount,'42.50');assert.equal(detectTotal('Total 42.50\nTotal 55.00').amount,'');assert.equal(detectTotal('Item price 12.00\nTax 2.00').amount,'');});

test('sparse OCR blank lines preserve total and amount association',()=>{assert.equal(detectTotal('Account: Saving\n\nTotal\n\nJMD 12,100.00\n\nCustomer Copy').amount,'12100.00');});
