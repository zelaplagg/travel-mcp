import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ToolError, UpstreamError, toUserMessage } from '../src/lib/errors.ts';

test('ToolError messages are passed through', () => {
  assert.equal(toUserMessage(new ToolError('Bad input')), 'Bad input');
});

test('upstream details are not leaked to the client', () => {
  const message = toUserMessage(new UpstreamError('secret.host responded with HTTP 500', { retryable: true }));
  assert.ok(!message.includes('secret.host'));
});

test('unknown errors become a generic message', () => {
  assert.equal(toUserMessage(new Error('boom')), 'Unexpected internal error.');
});
