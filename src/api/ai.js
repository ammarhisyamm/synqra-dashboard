/**
 * Client-side AI helper — no API keys here.
 * Generation runs server-side via POST /api/ai/generate (worker.js),
 * which holds the ORVIX_API_KEY as a Cloudflare secret.
 * This module keeps only the offline heuristic fallback + cache hashing.
 */

/**
 * Fallback heuristic extractor when offline or if AI endpoint fails
 */
export function extractItemsLocally(notes) {
  return notes
    .split(/[\n.]+/)
    .map(value => value.replace(/^\s*(?:[-•*]\s*)?/, '').trim())
    .filter(value => value.length > 4)
    .slice(0, 8)
    .map((value, index) => {
      const isUrgent = /urgent|asap|blocker|critical/i.test(value);
      const isDesign = /design|ui|ux|color|layout|prototype/i.test(value);
      const isMarketing = /copy|pricing|launch|social|hero|content/i.test(value);
      return {
        id: `ai-${index}-${Date.now()}`,
        keep: true,
        title: value.length > 80 ? `${value.slice(0, 77)}…` : value,
        description: `Action item extracted from meeting notes: "${value}"`,
        assignee: '',
        due: '',
        priority: isUrgent ? 'Blocker' : index === 2 ? 'Minor' : 'Major',
        area: isDesign ? 'Design' : isMarketing ? 'Marketing' : 'Engineering'
      };
    });
}

/**
 * Generate action items from meeting notes via the server-side endpoint.
 * Falls back to the local heuristic extractor on any failure.
 */
export async function generateActionItemsWithOrvix({ notes }) {
  const sourceExcerpt = (notes || '').trim().slice(0, 220);
  if (!notes?.trim()) {
    return { items: extractItemsLocally(notes || ''), brief: { generatedAt: new Date().toISOString(), sourceExcerpt, model: 'local', source: 'local' } };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`AI service responded with ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data?.items) && data.items.length > 0) {
      return data;
    }
    throw new Error('Empty AI result');
  } catch (err) {
    console.warn('AI generation error, falling back to local extractor:', err);
  }

  // Fallback to local heuristic extractor
  return { items: extractItemsLocally(notes), brief: { generatedAt: new Date().toISOString(), sourceExcerpt, model: 'local', source: 'local' } };
}

export function hashNotes(notes) {
  const text = String(notes || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(0) + i) & 0xffffffff;
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}
