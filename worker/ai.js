import { json, safeText, readBody } from './utils.js';

export async function handleAiGenerate(request, env) {
    if (!env.ORVIX_API_KEY) return json({ error: 'AI service is not configured.' }, 503);
    const body = await readBody(request);
    const notes = safeText(body?.notes, 8000);
    if (!notes) return json({ error: 'Meeting notes are required.' }, 400);
    const sourceExcerpt = notes.slice(0, 220);
    const systemPrompt = `You are Synqra AI, an intelligent project manager assistant.
Analyze the following meeting notes and return a strictly valid JSON object with no markdown code fences and no surrounding text.
Schema:
{
  "summary": "2-3 sentence meeting summary",
  "keyPoints": ["key discussion point"],
  "decisions": ["decision made"],
  "risks": ["risk or blocker"],
  "openQuestions": ["unresolved question"],
  "actionItems": [
    {
      "title": "concise task title (max 80 chars)",
      "description": "clear explanation or acceptance criteria",
      "area": "Engineering | Design | Marketing",
      "priority": "Blocker | Major | Minor",
      "assignee": "person name mentioned or empty string",
      "due": "date in YYYY-MM-DD format if mentioned, or empty string"
    }
  ]
}
Rules: never invent an owner (use "" when unknown); never invent a due date (use "" when unknown); keep titles short. If nothing actionable is found, return an empty actionItems array.`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch('https://api.orvix.id/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.ORVIX_API_KEY}` },
        body: JSON.stringify({
          model: 'orvix/muse-spark-1.3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Meeting Notes:\n\n${notes}` }
          ],
          temperature: 0.3
        })
      });
      clearTimeout(timeout);
      if (!response.ok) return json({ error: `AI provider responded with ${response.status}.` }, 502);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content?.trim() || '';
      const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const rawItems = Array.isArray(parsed) ? parsed : parsed.actionItems;
      const brief = Array.isArray(parsed) ? null : {
        summary: String(parsed.summary || ''),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).filter(Boolean).slice(0, 8) : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String).filter(Boolean).slice(0, 8) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).filter(Boolean).slice(0, 8) : [],
        openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.map(String).filter(Boolean).slice(0, 8) : []
      };
      if (!Array.isArray(rawItems) || !rawItems.length) return json({ error: 'No action items found in these notes.' }, 422);
      const generatedAt = new Date().toISOString();
      return json({
        items: rawItems.map((item, index) => ({
          id: `orvix-ai-${index}-${Date.now()}`,
          keep: true,
          title: String(item.title || `Action item ${index + 1}`).slice(0, 90),
          description: String(item.description || ''),
          assignee: String(item.assignee || ''),
          due: typeof item.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? item.due : '',
          priority: ['Blocker', 'Major', 'Minor'].includes(item.priority) ? item.priority : 'Major',
          area: ['Engineering', 'Design', 'Marketing'].includes(item.area) ? item.area : 'Engineering'
        })),
        brief: { ...(brief || {}), generatedAt, sourceExcerpt, model: 'orvix/muse-spark-1.3', source: 'ai' }
      });
    } catch {
      return json({ error: 'AI generation failed. Try again or continue without AI.' }, 502);
    }
}
