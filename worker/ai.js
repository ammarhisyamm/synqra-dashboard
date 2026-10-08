import { json, safeText, readBody } from './utils.js';
import { calendarDate } from './validation.js';
import { recordOperationalEvent } from './operations.js';

export function normalizeAiResult(parsed) {
  const raw = Array.isArray(parsed) ? parsed : parsed?.actionItems;
  if (!Array.isArray(raw)) throw new Error('Invalid AI response.');
  const seen = new Set();
  const items = raw.filter(item => item && typeof item==='object' && !Array.isArray(item)).slice(0,100).flatMap(item => {
    const title = safeText(item.title,90);
    const fingerprint = title.toLowerCase().replace(/\s+/g,' ');
    if (!title || seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    let due=''; try { due=calendarDate(item.due,'Due date') || ''; } catch { /* Never offer an invalid date. */ }
    return [{ id:crypto.randomUUID(),keep:true,title,description:safeText(item.description,4000),assignee:safeText(item.assignee,80),due,priority:['Blocker','Major','Minor'].includes(item.priority) ? item.priority : 'Major',area:['Engineering','Design','Marketing'].includes(item.area) ? item.area : 'Engineering' }];
  });
  const points = key => Array.isArray(parsed?.[key]) ? parsed[key].map(item => safeText(item,500)).filter(Boolean).slice(0,8) : [];
  return { items,brief:{ summary:safeText(parsed?.summary,2000),keyPoints:points('keyPoints'),decisions:points('decisions'),risks:points('risks'),openQuestions:points('openQuestions') } };
}

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
    const model = env.AI_MODEL || 'orvix/muse-spark-1.3';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch('https://api.orvix.id/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.ORVIX_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Meeting Notes:\n\n${notes}` }
          ],
          temperature: 0.3
        })
      });
      if (!response.ok) { await recordOperationalEvent(env,'ai',`provider_${response.status}`); return json({ error:'AI provider is unavailable. Retry or continue without AI.' },502); }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content?.trim() || '';
      const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
      const { items,brief } = normalizeAiResult(JSON.parse(cleaned));
      if (!items.length) return json({ error: 'No action items found in these notes.' }, 422);
      const generatedAt = new Date().toISOString();
      return json({
        items,
        brief: { ...brief, generatedAt, sourceExcerpt, model, source: 'ai' }
      });
    } catch {
      await recordOperationalEvent(env,'ai',controller.signal.aborted ? 'timeout' : 'invalid_response');
      return json({ error: 'AI generation failed. Try again or continue without AI.' }, 502);
    } finally { clearTimeout(timeout); }
}
