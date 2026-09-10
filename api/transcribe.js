const authorize=require('../lib/auth');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});if(!await authorize(req,res))return;
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body || {};
  if(typeof body.audio!=='string'||body.audio.length>3500000||!['mp3','wav','webm','ogg','m4a','aac','flac'].includes(body.format))return res.status(400).json({error:'Use an audio recording under 2.5 MB. Split longer recordings before uploading.'});
  if(!process.env.OPENROUTER_API_KEY)return res.status(503).json({error:'Transcription is not configured.'});
  const r=await fetch('https://openrouter.ai/api/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.TRANSCRIPTION_MODEL || 'openai/whisper-1',input_audio:{data:body.audio,format:body.format}}),signal:AbortSignal.timeout(55000)});
  const data=await r.json();if(!r.ok)throw Error(data.error?.message || 'Transcription failed.');
  res.status(200).json({text:String(data.text || ''),cost:data.usage?.cost ?? null});
 }catch(e){res.status(502).json({error:e.message});}
};
