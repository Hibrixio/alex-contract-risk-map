const authorize = require('../lib/auth');
module.exports = async function(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!await authorize(req, res)) return;
  if (!process.env.GOOGLE_VISION_API_KEY) return res.status(503).json({ error: 'Google OCR is not configured. Use browser OCR.' });
  try {
    const { image } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (typeof image !== 'string' || image.length > 3500000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return res.status(400).json({error:'Invalid page image.'});
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_VISION_API_KEY},
      body:JSON.stringify({requests:[{image:{content:image},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]}), signal:AbortSignal.timeout(45000)
    });
    const result = await response.json();
    const page = result.responses?.[0];
    if (!response.ok || page?.error) throw new Error('Google OCR could not read this page. Try browser OCR.');
    res.status(200).json({text:page.fullTextAnnotation?.text || '', words:(page.textAnnotations || []).slice(1).map(w=>({text:w.description,vertices:w.boundingPoly.vertices}))});
  } catch(error) { res.status(502).json({error:error.message}); }
};
