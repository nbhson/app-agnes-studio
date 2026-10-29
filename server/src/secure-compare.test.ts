import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokensMatch } from './secure-compare.js';

test('matching tokens compare equal', () => {
  assert.equal(tokensMatch('secret', 'secret'), true);
});

test('different tokens do not match', () => {
  assert.equal(tokensMatch('wrong', 'secret'), false);
});

test('different lengths do not throw', () => {
  assert.equal(tokensMatch('a', 'a-very-much-longer-token'), false);
});

test('empty vs non-empty does not match', () => {
  assert.equal(tokensMatch('', 'x'), false);
});
