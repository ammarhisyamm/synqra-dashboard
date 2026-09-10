const ORVIX_API_URL = 'https://api.orvix.id/v1/chat/completions';
const DEFAULT_ORVIX_KEY = 'orv-sk_live_ZXlKaGJHY2lPaUpGWkVSVFFTSXNJblI1Y0NJNklrcFhWQ0o5LmV5SndjbTlxWldOMFgybGtJam9pTURGTFdrVkJTRFpIU3pGSE1raEdOVFZXUWxGUk1Wb3pTRVVpTENKclpYbGZhV1FpT2lJd01VMHlOVUZYTkVWRVFVVTJTemxDUXpWYVJGZzBVVFEwU3lJc0ltcDBhU0k2SW1WaFlUYzBPRE0wTFRZd05UY3RORGN5TkMxaE5USm1MVE5sWTJRMlptVTRaVFE0TVNJc0luTjFZaUk2SWpBeFMxcEZRVWRJTWpnNFdVSldWamRVUWt0RVEwSkhVRmRPSWl3aWFYTnpJam9pYjNKMmFYZ3RaMkYwWlhkaGVTSXNJbUYxWkNJNkltOXlkbWw0TFdGd2FTSXNJbWxoZENJNk1UYzRPVEF6TXpBMU9IMC52TmdqYjR3VlFWaTEtay1td2dzLUJ6dXVDN1J4VFk4M3hPYmFPdnNISWs1RDNLcFVGMWJSaE1qMG5ZRENraFdCeFFZN0p5ZWZEM3JlWm9LUzZrbElDUQ';
const ORVIX_STORAGE_KEY = 'synqra-orvix-api-key';

export function getOrvixApiKey() {
  try {
    return localStorage.getItem(ORVIX_STORAGE_KEY) || DEFAULT_ORVIX_KEY;
  } catch {
    return DEFAULT_ORVIX_KEY;
  }
}

export function setOrvixApiKey(key) {
  try {
    if (key) localStorage.setItem(ORVIX_STORAGE_KEY, key.trim());
    else localStorage.removeItem(ORVIX_STORAGE_KEY);
  } catch {}
}

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
 * Generate action items from meeting notes using Orvix AI API
 */
export async function generateActionItemsWithOrvix({ notes, user }) {
  const apiKey = getOrvixApiKey();
  if (!apiKey || !notes?.trim()) {
    return extractItemsLocally(notes || '');
  }

  const systemPrompt = `You are Synqra AI, an intelligent project manager assistant.
Analyze the following meeting notes and extract actionable tasks (action items).
Output MUST be a strictly valid JSON array of objects with no markdown code fences and no surrounding text.
Each object must have these fields:
- "title": concise task title (max 80 chars)
- "description": clear explanation or acceptance criteria
- "area": one of ["Engineering", "Design", "Marketing"]
- "priority": one of ["Blocker", "Major", "Minor"]
- "assignee": person name mentioned or empty string ""
- "due": date in YYYY-MM-DD format if mentioned, or empty string ""

Example:
[
  {
    "title": "Tighten checkout mobile layout",
    "description": "Fix alignment and padding in step 2 checkout screen.",
    "area": "Design",
    "priority": "Major",
    "assignee": "Mia",
    "due": ""
  }
]`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(ORVIX_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
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

    if (!response.ok) {
      throw new Error(`Orvix API responded with ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    
    // Clean potential markdown fences ```json ... ```
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, index) => ({
        id: `orvix-ai-${index}-${Date.now()}`,
        keep: true,
        title: String(item.title || `Action item ${index + 1}`).slice(0, 90),
        description: String(item.description || ''),
        assignee: String(item.assignee || ''),
        due: typeof item.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? item.due : '',
        priority: ['Blocker', 'Major', 'Minor'].includes(item.priority) ? item.priority : 'Major',
        area: ['Engineering', 'Design', 'Marketing'].includes(item.area) ? item.area : 'Engineering'
      }));
    }
  } catch (err) {
    console.warn('Orvix AI generation error, falling back to local extractor:', err);
  }

  // Fallback to local heuristic extractor
  return extractItemsLocally(notes);
}
