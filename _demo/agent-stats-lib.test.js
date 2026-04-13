import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionUsageTracker,
  summarizeUsageForRequest,
} from './agent-stats-lib.js';

test('summarizeUsageForRequest uses exact metadata and estimated prompt splits', () => {
  const requestMessages = [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Hello there' },
    { role: 'assistant', content: 'Hi!' },
  ];

  const summary = summarizeUsageForRequest({
    requestMessages,
    usage: {
      prompt_tokens: 20,
      completion_tokens: 6,
      total_tokens: 26,
    },
    modelContextTokens: 256_000,
  });

  assert.equal(summary.promptTokens, 20);
  assert.equal(summary.outputTokens, 6);
  assert.equal(summary.totalTokens, 26);
  assert.equal(summary.contextWindowTokens, 256_000);
  assert.equal(summary.contextPercent, '0.01');
  assert.equal(summary.inputMessages.length, 3);
  assert.equal(
    summary.inputMessages.reduce(
      (sum, message) => sum + message.estimatedInputTokens,
      0,
    ),
    20,
  );
  assert.deepEqual(
    summary.inputMessages.map((message) => message.role),
    ['system', 'user', 'assistant'],
  );
  assert.deepEqual(
    summary.inputMessages.map((message) => message.summary),
    ['You are concise.', 'Hello there', 'Hi!'],
  );
});

test('createSessionUsageTracker accumulates totals across requests', () => {
  const tracker = createSessionUsageTracker({ modelContextTokens: 256_000 });

  const first = tracker.recordCall({
    requestMessages: [{ role: 'user', content: 'one' }],
    usage: {
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    },
  });

  const second = tracker.recordCall({
    requestMessages: [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ],
    usage: {
      prompt_tokens: 8,
      completion_tokens: 4,
      total_tokens: 12,
    },
  });

  assert.equal(first.sessionTotals.promptTokens, 3);
  assert.equal(first.sessionTotals.outputTokens, 2);
  assert.equal(first.sessionTotals.totalTokens, 5);
  assert.equal(second.sessionTotals.promptTokens, 11);
  assert.equal(second.sessionTotals.outputTokens, 6);
  assert.equal(second.sessionTotals.totalTokens, 17);
});

test('createSessionUsageTracker returns unavailable summary when metadata is missing', () => {
  const tracker = createSessionUsageTracker({ modelContextTokens: 256_000 });

  const summary = tracker.recordCall({
    requestMessages: [{ role: 'user', content: 'hello' }],
    usage: undefined,
  });

  assert.equal(summary.usageAvailable, false);
  assert.equal(summary.promptTokens, null);
  assert.equal(summary.outputTokens, null);
  assert.equal(summary.totalTokens, null);
  assert.equal(summary.inputMessages[0].estimatedInputTokens, null);
});
