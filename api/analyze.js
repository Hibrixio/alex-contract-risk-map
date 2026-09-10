const categories = new Set(["framework", "commercial", "people", "data", "ip", "governance"]);
const risks = new Set(["high", "medium", "low"]);

function normalizeEvidence(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceSupportScore(value, documentText) {
  const evidence = normalizeEvidence(value);
  const document = normalizeEvidence(documentText);
  if (!evidence || !document) return 0;
  if (evidence.length > 24 && document.includes(evidence.slice(0, Math.min(160, evidence.length)))) return 100;
  const words = [...new Set(evidence.split(" ").filter(word => word.length > 4))];
  if (!words.length) return 0;
  const matched = words.filter(word => document.includes(word)).length;
  return matched / words.length;
}

function normalizeNode(node, index, documentName, documentText) {
  const title = String(node.title || `Clause ${index + 1}`).slice(0, 90);
  const category = categories.has(node.category) ? node.category : "framework";
  const risk = risks.has(node.risk) ? node.risk : "medium";
  const rawClauses = Array.isArray(node.clauses) && node.clauses.length
    ? node.clauses.map(item => String(item).trim()).filter(Boolean).slice(0, 6)
    : [String(node.summary || title).trim()].filter(Boolean);
  const supportedClauses = rawClauses
    .filter(item => sourceSupportScore(item, documentText) >= 0.45)
    .slice(0, 4);
  const clauses = supportedClauses.length ? supportedClauses.map(item => item.slice(0, 420)) : [];
  if (!clauses.length) return null;
  const tags = Array.isArray(node.tags)
    ? node.tags.map(item => String(item).slice(0, 30)).filter(Boolean).slice(0, 6)
    : [];

  return {
    id: String(node.id || `${title}-${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `clause-${index + 1}`,
    title,
    section: String(node.section || `${title} - ${documentName}`).slice(0, 140),
    category,
    risk,
    summary: String(node.summary || clauses[0]).slice(0, 360),
    why: String(node.why || "This clause may affect obligations, approvals, delivery, or enforcement.").slice(0, 420),
    ask: String(node.ask || "Review this clause and confirm the required decision, owner, and next step.").slice(0, 420),
    clauses,
    tags,
    sourceBacked: true
  };
}

function parseJsonFromText(text) {
  const direct = JSON.parse(text);
  return direct;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return response.status(503).json({
      error: "OpenRouter is not configured. Add OPENROUTER_API_KEY in Vercel environment variables."
    });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const text = String(body.text || "").trim().slice(0, 60000);
    const documentName = String(body.name || "Uploaded document").slice(0, 120);

    if (text.length < 80) {
      return response.status(400).json({ error: "The uploaded document did not contain enough readable text." });
    }

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://orbit-contract-mind-map.vercel.app",
        "X-Title": "Orbit Contract Mind Map"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are Orbit's contract clause mapper.",
              "Map only clauses that are actually present in the uploaded document text.",
              "Do not invent parties, dates, obligations, risks, clauses, sections, or recommendations that are not supported by the text.",
              "Return only strict JSON with a top-level nodes array.",
              "Each node is one clause or one clearly labeled section from the document.",
              "Each node must include: title, section, category, risk, summary, why, ask, clauses, tags.",
              "The clauses array must contain exact short verbatim excerpts copied from the document text; do not paraphrase the clauses field.",
              "If a clause is ambiguous, keep the exact excerpt and say what needs review in ask.",
              "category must be one of: framework, commercial, people, data, ip, governance.",
              "risk must be one of: high, medium, low.",
              "Write concise, executive-friendly summary/why/ask language, but keep clauses verbatim.",
              "Prefer 8 to 30 nodes for long documents, fewer for short documents, and never include generic boilerplate not present in the document."
            ].join(" ")
          },
          {
            role: "user",
            content: `Document name: ${documentName}\n\nDocument text:\n${text}`
          }
        ]
      })
    });

    const openRouterJson = await openRouterResponse.json();
    if (!openRouterResponse.ok) {
      return response.status(openRouterResponse.status).json({
        error: openRouterJson?.error?.message || "OpenRouter request failed."
      });
    }

    const content = openRouterJson?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = parseJsonFromText(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? parseJsonFromText(match[0]) : {};
    }

    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const nodes = rawNodes
      .slice(0, 80)
      .map((node, index) => normalizeNode(node, index, documentName, text))
      .filter(Boolean)
      .slice(0, 60);
    if (!nodes.length) {
      return response.status(502).json({ error: "OpenRouter did not return usable clauses." });
    }

    return response.status(200).json({ nodes, provider: "openrouter" });
  } catch (error) {
    return response.status(500).json({ error: error.message || "Analysis failed." });
  }
}
