import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustProxy } from './config.js';

test('TRUST_PROXY unset/empty → no trust (safe default for direct exposure)', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('   '), false);
});

test('hop count string → number for express', () => {
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy(' 2 '), 2);
});

test('hop count 0 / invalid → no trust', () => {
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('no'), false);
  assert.equal(parseTrustProxy('false'), false);
});

test('explicit true/yes → trust everything', () => {
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('YES'), true);
});

test('CIDR/IP list → array; single entry → plain string', () => {
  assert.deepEqual(parseTrustProxy('10.0.0.1,10.0.0.2'), ['10.0.0.1', '10.0.0.2']);
  assert.deepEqual(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12'), ['10.0.0.0/8', '172.16.0.0/12']);
  assert.equal(parseTrustProxy('10.0.0.1'), '10.0.0.1');
  // Empty entries are dropped.
  assert.deepEqual(parseTrustProxy('10.0.0.1, ,10.0.0.2,'), ['10.0.0.1', '10.0.0.2']);
});

test('express subnet shorthands pass through', () => {
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('LinkLocal'), 'linklocal');
  assert.equal(parseTrustProxy('uniquelocal'), 'uniquelocal');
});
