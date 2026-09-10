const stages = new Set(['Planning', 'Review', 'In Progress', 'Final', 'Completed']);
const areas = new Set(['Design', 'Engineering', 'Marketing']);
const priorities = new Set(['Blocker', 'Major', 'Minor']);

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const safeText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const id = () => crypto.randomUUID();

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function normalizeReview(input, partial = false) {
  const review = {};
  if (!partial || 'title' in input) {
    review.title = safeText(input.title);
    if (!review.title) throw new Error('A review title is required.');
  }
  if (!partial || 'area' in input) { if (!areas.has(input.area)) throw new Error('Invalid review area.'); review.area = input.area; }
  if (!partial || 'priority' in input) { if (!priorities.has(input.priority)) throw new Error('Invalid priority.'); review.priority = input.priority; }
  if (!partial || 'stage' in input) { if (!stages.has(input.stage)) throw new Error('Invalid stage.'); review.stage = input.stage; }
  if (!partial || 'assignee' in input) review.assignee = safeText(input.assignee, 80);
  if (!partial || 'due' in input) review.due = /^\d{4}-\d{2}-\d{2}$/.test(input.due || '') ? input.due : null;
  if ('archived' in input) review.archived = input.archived ? 1 : 0;
  return review;
}

async function bootstrap(env) {
  const [reviews, meetings] = await env.DB.batch([
    env.DB.prepare('SELECT id, title, area, priority, stage, assignee, due, created_at AS createdAt, archived FROM reviews ORDER BY created_at DESC'),
    env.DB.prepare('SELECT id, title, date, ai, notes, item_count AS itemCount FROM meetings ORDER BY date DESC')
  ]);
  return { project: { name: 'Acme Redesign', initials: 'A' }, reviews: reviews.results, meetings: meetings.results.map(m => ({ ...m, ai: Boolean(m.ai) })) };
}

async function routeApi(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/bootstrap') return json(await bootstrap(env));

  if (request.method === 'POST' && path === '/api/reviews') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const review = normalizeReview(body);
      const newReview = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), ...review, archived: 0 };
      await env.DB.prepare('INSERT INTO reviews (id, title, area, priority, stage, assignee, due, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(newReview.id, newReview.title, newReview.area, newReview.priority, newReview.stage, newReview.assignee, newReview.due, newReview.archived).run();
      return json(newReview, 201);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  const reviewMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && reviewMatch) {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const patch = normalizeReview(body, true); const keys = Object.keys(patch);
      if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
      const values = keys.map(key => patch[key]);
      const result = await env.DB.prepare(`UPDATE reviews SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, reviewMatch[1]).run();
      if (!result.meta.changes) return json({ error: 'Review not found.' }, 404);
      const saved = await env.DB.prepare('SELECT id, title, area, priority, stage, assignee, due, created_at AS createdAt, archived FROM reviews WHERE id = ?').bind(reviewMatch[1]).first();
      return json(saved);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  if (request.method === 'POST' && path === '/api/meetings') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const title = safeText(body.title); const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
    if (!title || !date) return json({ error: 'Meeting title and date are required.' }, 400);
    const meeting = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), title, date, notes: safeText(body.notes, 5000), ai: body.ai ? 1 : 0, itemCount: 0 };
    await env.DB.prepare('INSERT INTO meetings (id, title, date, ai, notes, item_count) VALUES (?, ?, ?, ?, ?, ?)').bind(meeting.id, meeting.title, meeting.date, meeting.ai, meeting.notes, meeting.itemCount).run();
    return json({ ...meeting, ai: Boolean(meeting.ai) }, 201);
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return routeApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
