const {test}=require('node:test');const assert=require('node:assert/strict');
test('session verification checks signature, expiry, issuer and permitted origin',async()=>{
 const {generateKeyPair,exportJWK,SignJWT}=await import('jose');
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';jwk.use='sig';
 const previous=global.fetch,pk=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_test_'+Buffer.from('auth.example.com$').toString('base64');
 global.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
 try{
  const authorize=require('../lib/auth');
  async function verify(azp,expiry='5m'){
   const token=await new SignJWT({azp}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('user_fixture').setIssuer('https://auth.example.com').setIssuedAt().setExpirationTime(expiry).sign(privateKey);
   let status;const result=await authorize({headers:{authorization:'Bearer '+token}},{status(n){status=n;return this;},json(){}});return {result,status};
  }
  assert.equal((await verify('https://orbit-contract-mind-map.vercel.app')).result,'user_fixture');
  assert.equal((await verify('https://untrusted.example.com')).status,401);
  assert.equal((await verify('https://orbit-contract-mind-map.vercel.app','-5m')).status,401);
 }finally{global.fetch=previous;process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk;}
});
