import test from 'node:test';
import assert from 'node:assert/strict';
import { MEETING_ASSISTANT_ENABLED } from '../src/lib/features.js';

test('meeting assistant stays hidden until the self-hosted runtime is verified', () => {
  assert.equal(MEETING_ASSISTANT_ENABLED, false);
});
