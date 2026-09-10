const {test}=require('node:test');const assert=require('node:assert/strict');
test('contract review asks for force majeure and keeps missing protections separate from evidence',async()=>{
 const auth=require.resolve('../lib/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:async()=> 'user_test'};
 const previous=global.fetch;process.env.OPENROUTER_API_KEY='fixture';let prompt;
 global.fetch=async(url,options)=>{prompt=JSON.parse(options.body).messages[0].content;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:[{title:'Payment',clauses:['Client pays within 15 days.']},{title:'Invented',clauses:['Floods excuse nonpayment.']}],concerns:[{topic:'Force majeure',status:'not_identified',explanation:'Review whether delays need protection.',proposedWording:'Draft for review.'}],unmatchedRequests:[]})}}]}),{status:200});};
 try{let result;await require('../api/analyze')({method:'POST',headers:{},body:{text:'Client pays within 15 days. This is the payment clause.'}},{setHeader(){},status(n){assert.equal(n,200);return this;},json(v){result=v;}});assert.match(prompt,/acts of God/);assert.match(prompt,/strict arrival times/);assert.equal(result.nodes.length,1);assert.equal(result.concerns[0].status,'not_identified');}finally{global.fetch=previous;}
});
test('provider field variation retains cards and truly empty analysis fails',async()=>{
 const auth=require.resolve('../lib/auth');require.cache[auth]={id:auth,filename:auth,loaded:true,exports:async()=> 'user_test'};
 const previous=global.fetch;process.env.OPENROUTER_API_KEY='fixture';
 try {for(const [payload,expected] of [[{'top-level nodes':[{title:'Payment',sourceId:'S1',clauses:['Client pays within 15 days.']}]},200],[{nodes:[]},502]]) {
  global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
  let result,status;await require('../api/analyze')({method:'POST',headers:{},body:{text:'Client pays within 15 days. This is the payment clause.'}},{setHeader(){},status(n){status=n;return this;},json(v){result=v;}});
  assert.equal(status,expected);if(expected===200)assert.equal(result.nodes.length,1);else assert.equal(result.code,'EMPTY_ANALYSIS');
 }}finally{global.fetch=previous;}
});
