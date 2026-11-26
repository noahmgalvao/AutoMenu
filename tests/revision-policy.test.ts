import assert from 'node:assert/strict';
import test from 'node:test';
import { retain, fairOrder, calendarKeys, DEFAULT_RETENTION, type RetentionCandidate } from '../src/domain/revisions/retention';
import { capacityDecision, type CapacityMetrics } from '../src/domain/revisions/capacity';
import { AuthorizedLru } from '../src/application/revisions/authorizedLru';
const make = (n: number, start = '2025-08-01T00:00:00Z', offset = 0): RetentionCandidate[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + offset}`, sequence: i + offset, createdAt: new Date(Date.parse(start) + i * 600000).toISOString(), priority: i % 7 === 0 ? 3 : 0 }));
test('age alone, gaps, exact quota and protected original never expire revisions', () => {
    const old = make(85);
    assert.deepEqual(retain(old), old);
    const separated = [...old, ...make(40, '2026-11-01T00:00:00Z', 85)];
    assert.deepEqual(retain(separated), separated);
    const exact = make(1000);
    assert.deepEqual(retain(exact), exact);
    const original = { ...make(1)[0], id: 'original', protection: 'original' as const };
    const protectedRows = make(50).map(r => ({ ...r, id: `protected:${r.id}`, protection: 'user' as const }));
    const kept = retain([...exact, ...make(1, '2026-01-01T00:00:00Z', 1000), original, ...protectedRows]);
    assert.equal(kept.length, 1051);
    assert.ok(kept.some(r => r.id === 'original'));
    assert.equal(kept.filter(r => r.protection === 'user').length, 50);
});
test('fair breadth-first order is normative, including scarcity', () => {
    assert.deepEqual(fairOrder([0, 1, 2, 3, 4, 5, 6, 7]), [0, 7, 3, 1, 5, 2, 4, 6]);
    assert.deepEqual(fairOrder([]), []);
    assert.deepEqual(fairOrder([0]), [0]);
    for (let max = 1; max < 20; max++) {
        const rows = Array.from({ length: 100 }, (_, i) => ({ ...make(1)[0], id: String(i), sequence: i, createdAt: `${2000 + i}-01-01T00:00:00Z` }));
        const config = { ...DEFAULT_RETENTION, maxAutomatic: max, recentReserve: 1 };
        assert.equal(retain(rows, config).length, max);
        assert.deepEqual(retain(rows, config), retain(rows.slice().reverse(), config));
    }
});
test('busy months retain fine coverage, old months remain represented, incremental compaction is idempotent', () => {
    const rows = [...make(20, '2024-01-01T00:00:00Z'), ...make(2400, '2026-11-01T00:00:00Z', 20)];
    const kept = retain(rows);
    assert.equal(kept.length, 1000);
    assert.ok(kept.some(r => r.sequence < 20));
    assert.ok(new Set(kept.map(r => calendarKeys(r.createdAt, 'UTC').day)).size > 10);
    assert.deepEqual(retain(kept), kept);
    let incremental: RetentionCandidate[] = [];
    for (const row of rows.slice(0, 350)) {
        incremental = retain([...incremental, row], { ...DEFAULT_RETENTION, maxAutomatic: 100, recentReserve: 10, milestoneReserve: 15 });
        assert.ok(incremental.length <= 100);
    }
    assert.equal(incremental.length, 100);
    assert.ok(incremental.some(r => r.sequence < 20));
    assert.deepEqual(retain(incremental), incremental);
});
test('calendar uses fixed timezone, splits cross-month weeks, supports DST and year boundaries', () => {
    assert.equal(calendarKeys('2026-01-01T01:00:00Z', 'America/Sao_Paulo').year, '2025');
    assert.equal(calendarKeys('2026-06-01T00:00:00Z', 'UTC').week, '2026-06/2026-06-01');
    assert.notEqual(calendarKeys('2026-07-31T12:00:00Z', 'UTC').week, calendarKeys('2026-08-01T12:00:00Z', 'UTC').week);
    assert.equal(calendarKeys('2026-03-08T07:01:00Z', 'America/New_York').day, '2026-03-08');
    assert.equal(calendarKeys('2026-01-01T00:00:00Z', 'invalid').year, '2026');
});
test('temporary transaction pins precede reserve, excess defers compaction', () => { const rows = make(101); const config = { ...DEFAULT_RETENTION, maxAutomatic: 3, recentReserve: 100 }; const pins = new Set(['r0', 'r1', 'r2']); assert.deepEqual(retain(rows, config, pins).map(r => r.id), ['r0', 'r1', 'r2']); pins.add('r3'); assert.equal(retain(rows, config, pins).length, 101); });
test('capacity thresholds, unknown metrics, concurrent reservations and emergency hysteresis', () => {
    const metrics = Object.fromEntries(['database', 'disk', 'storage', 'egressCached', 'egressUncached', 'cpu', 'memory'].map(k => [k, { used: null, limit: null, observedAt: null, source: 'unavailable' }])) as CapacityMetrics;
    for (const [usage, level] of [[49, 0], [50, 50], [70, 70], [85, 85], [95, 95]] as const) {
        metrics.storage = { used: usage, limit: 100, observedAt: new Date().toISOString(), source: 'fixture' };
        assert.equal(capacityDecision(metrics).level, level);
    }
    metrics.storage.used = 84;
    assert.equal(capacityDecision(metrics, { storage: 12 }).pause, true);
    assert.equal(capacityDecision(metrics, {}, 95).pause, true);
    metrics.storage.used = 79;
    assert.equal(capacityDecision(metrics, {}, 95).pause, false);
    assert.equal(capacityDecision(metrics, {}, 95, .8, false).pause, true);
    assert.equal(capacityDecision(metrics).unknown.length, 6);
});
test('LRU is scoped and bounded by bytes/entries, clearing does not persist content', () => { const cache = new AuthorizedLru<number>('u', 20, 2); cache.set('u', 'a', 1, 10); cache.set('u', 'b', 2, 10); cache.get('u', 'a'); cache.set('u', 'c', 3, 10); assert.equal(cache.get('u', 'b'), undefined); assert.throws(() => cache.get('other', 'a')); cache.set('u', 'huge', 4, 99); assert.equal(cache.size, 20); cache.clear(); assert.equal(cache.size, 0); });
