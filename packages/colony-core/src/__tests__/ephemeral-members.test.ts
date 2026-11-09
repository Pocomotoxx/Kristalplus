import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EPHEMERAL_MEMBER_KEY, ephemeralRecord, isEphemeralExpired, markEphemeralSwept } from '../coordination/ephemeral-members.js';
import { ClaimLedger } from '../coordination/claim-ledger.js';
import type { ColonyMember } from '../types.js';
const member = (expiresAt: number): ColonyMember => ({ id: 'temporary', name: 'Temporary member', role: 'custom', status: 'idle', capabilities: { tools: [], maxConcurrentTasks: 1 }, currentTaskIds: [], metadata: { [EPHEMERAL_MEMBER_KEY]: { expiresAt, createdBy: 'host' } }, createdAt: 10, lastActiveAt: 10 });
test('ephemeral member expires at its deadline and retains its sweep marker', () => {
 const temporary = member(100); assert.equal(isEphemeralExpired(temporary, 99), false); assert.equal(isEphemeralExpired(temporary, 100), true);
 assert.deepEqual(ephemeralRecord(temporary), { expiresAt: 100, createdBy: 'host' }); markEphemeralSwept(temporary, 120);
 assert.deepEqual(ephemeralRecord(temporary), { expiresAt: 100, createdBy: 'host', sweptAt: 120 });
});
test('malformed ephemeral metadata is ignored safely', () => { const temporary = member(Number.NaN); assert.equal(ephemeralRecord(temporary), undefined); assert.equal(isEphemeralExpired(temporary, 1000), false); });
test('expiring a member makes all its open claims immediately stealable', () => {
 const ledger = new ClaimLedger(); ledger.claim('active', 'temporary', 10); ledger.claim('handoff', 'temporary', 10);
 ledger.requestHandoff('handoff', 'temporary', 'other', 'pending', 10, { targetOpenClaims: 0, maxClaims: 1 });
 const expired = ledger.expireHolder('temporary', 20); assert.deepEqual(expired.map(c => c.taskId), ['active', 'handoff']);
 assert.ok(expired.every(c => c.status === 'stealable' && c.graceEndsAt === 20)); assert.equal(ledger.get('handoff')?.handoff, undefined);
});
