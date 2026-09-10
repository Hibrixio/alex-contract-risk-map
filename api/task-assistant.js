const authorize = require('../lib/auth');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  if (!await authorize(request, response)) return;
  if (!process.env.OPENROUTER_API_KEY) return response.status(503).json({ error: 'OpenRouter is not configured.' });
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 100) : [];
    const result = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://orbit-contract-mind-map.vercel.app', 'X-Title': 'Orbit Task Assistant' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', temperature: .2, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You are Orbit, a friendly task assistant. Understand natural language and return only JSON: {"reply":"short helpful response","operation":"none|add|edit|complete|find|delete","task":{"id":"existing id or null","title":"title or null","due":"YYYY-MM-DD or null","owner":"owner or null","status":"To do|In progress|Done|Blocked or null"}}. Never invent an existing task id. For greetings or questions use operation none and answer naturally. Choose the closest existing task by id only when the user clearly refers to it.' },
        { role: 'user', content: JSON.stringify({ messages, tasks }) }
      ] })
    });
    const payload = await result.json(); if (!result.ok) return response.status(result.status).json({ error: payload?.error?.message || 'Task assistant failed.' });
    const content = payload?.choices?.[0]?.message?.content || '{}';
    let parsed; try { parsed = JSON.parse(content); } catch { parsed = { reply: content }; }
    return response.status(200).json({ reply: String(parsed.reply || 'How can I help with your tasks?').slice(0, 600), operation: ['none','add','edit','complete','find','delete'].includes(parsed.operation) ? parsed.operation : 'none', task: parsed.task && typeof parsed.task === 'object' ? parsed.task : null });
  } catch (error) { return response.status(500).json({ error: error.message || 'Task assistant failed.' }); }
};
