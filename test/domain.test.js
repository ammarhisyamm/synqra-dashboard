import test from 'node:test';
import assert from 'node:assert/strict';
import { statusFor } from '../src/lib/status.js';
import { isOverdue, portfolioProjects, sprintStats, statusCounts, taskOverview, teamWorkload } from '../src/lib/reports.js';
import { dateLabel, slashDate } from '../src/lib/dates.js';

const today = '2026-09-10';
const reviews = [
  { id: '1', projectId: 'p1', stage: 'Completed', status: 'Resolved', priority: 'Minor', assignee: 'Hisyam', due: '2026-09-08', estimateHours: 3, archived: false },
  { id: '2', projectId: 'p1', stage: 'Review', status: 'Review', priority: 'Major', assignee: 'Erlangga', due: '2026-09-09', estimateHours: 5, sprintId: 's1', archived: false },
  { id: '3', projectId: 'p1', stage: 'In Progress', priority: 'Blocker', assignee: 'Hisyam', due: '2026-09-12', estimateHours: 8, sprintId: 's1', archived: false },
  { id: '4', projectId: 'p1', stage: 'Planning', priority: 'Minor', assignee: '', due: '2026-09-01', archived: true }
];

test('status fallback follows the shared workflow definition', () => {
  assert.equal(statusFor({ status: 'Review', stage: 'Planning' }), 'Review');
  assert.equal(statusFor({ stage: 'Completed' }), 'Resolved');
  assert.equal(statusFor({ stage: 'Final' }), 'Review');
  assert.equal(statusFor({ stage: 'Planning' }), 'Open');
});

test('overview calculations exclude archived reviews and resolved overdue work', () => {
  assert.equal(isOverdue(reviews[0], today), false);
  assert.equal(isOverdue(reviews[1], today), true);
  assert.deepEqual(taskOverview(reviews, today), { total: 3, done: 1, inProgress: 2, overdue: 1, progress: 1 / 3 });
});

test('portfolio and status reports use the same active task source', () => {
  const projects = portfolioProjects(reviews, [{ id: 'p1', name: 'Synqra' }], 'Synqra', today);
  assert.deepEqual(projects.map(({ tasks, done, overdue }) => ({ tasks, done, overdue })), [{ tasks: 3, done: 1, overdue: 1 }]);
  assert.deepEqual(statusCounts(reviews), [
    { stage: 'Completed', count: 1 },
    { stage: 'Review', count: 1 },
    { stage: 'In Progress', count: 1 }
  ]);
});

test('sprint and workload calculations stay traceable to active reviews', () => {
  assert.deepEqual(sprintStats(reviews, { id: 's1' }, today), { total: 2, done: 0, overdue: 1, est: 13, doneEst: 0 });
  assert.deepEqual(teamWorkload(reviews), [
    { name: 'Hisyam', tasks: 2, est: 11 },
    { name: 'Erlangga', tasks: 1, est: 5 }
  ]);
});

test('date formatting handles valid and empty values', () => {
  assert.equal(slashDate('2026-09-10'), '09/10/2026');
  assert.equal(slashDate(''), '—');
  assert.equal(dateLabel('2026-09-10'), 'Sep 10');
});
