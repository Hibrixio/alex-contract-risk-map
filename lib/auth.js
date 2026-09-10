// Clerk session tokens are verified with the instance's public signing keys.
// This avoids copying a dashboard's secret key into this standalone application.
let verifier;
module.exports = async function authorize(req, res) {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  const domain = Buffer.from(pk.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
  if (!/^[a-zA-Z0-9.-]+\.[a-z]+$/.test(domain)) {
    res.status(503).json({ error: 'Sign-in is not configured for this workspace.' }); return false;
  }
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) { res.status(401).json({error:'Please sign in to map a document.'}); return false; }
  try {
    const {createRemoteJWKSet,jwtVerify} = await import('jose');
    verifier ||= createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    const {payload} = await jwtVerify(token, verifier, {issuer:`https://${domain}`,algorithms:['RS256']});
    const allowed=['https://orbit-contract-mind-map.vercel.app'];
    if(process.env.VERCEL_URL)allowed.push(`https://${process.env.VERCEL_URL}`);
    if(!process.env.VERCEL)allowed.push('http://127.0.0.1:4174','http://127.0.0.1:4180','http://localhost:4174');
    if (!payload.sub || !payload.exp || !allowed.includes(payload.azp)) throw new Error('Invalid session');
    return payload.sub;
  } catch {
    res.status(401).json({ error: 'Please sign in again to analyze a document.' }); return false;
  }
};
