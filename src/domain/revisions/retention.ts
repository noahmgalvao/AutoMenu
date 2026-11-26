/** v1.2 normative policy. Time only partitions candidates; it never expires them. */
export interface RetentionCandidate {
    id: string;
    sequence: number;
    createdAt: string;
    priority: number;
    protection?: 'original' | 'user' | null;
}
export interface RetentionConfig {
    maxAutomatic: number;
    recentReserve: number;
    milestoneReserve: number;
    timeZone: string;
}
export const DEFAULT_RETENTION: RetentionConfig = { maxAutomatic: 1000, recentReserve: 100, milestoneReserve: 150, timeZone: 'UTC' };
const order = (a: RetentionCandidate, b: RetentionCandidate) => a.sequence - b.sequence || a.id.localeCompare(b.id);
export function fairOrder<T>(items: T[]): T[] {
    if (items.length < 2)
        return items.slice();
    const indices = [0, items.length - 1], queue = [[1, items.length - 2]];
    for (let i = 0; i < queue.length; i++) {
        const [lo, hi] = queue[i];
        if (lo > hi)
            continue;
        const mid = Math.floor((lo + hi) / 2);
        indices.push(mid);
        queue.push([lo, mid - 1], [mid + 1, hi]);
    }
    return indices.map(i => items[i]);
}
export function calendarKeys(instant: string, timeZone: string) {
    let formatter: Intl.DateTimeFormat;
    try {
        formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    catch {
        formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    const parts = formatter.formatToParts(new Date(instant));
    const get = (key: string) => parts.find(p => p.type === key)!.value;
    const day = `${get('year')}-${get('month')}-${get('day')}`, month = day.slice(0, 7);
    const monday = new Date(`${day}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return { year: day.slice(0, 4), month, week: `${month}/${monday.toISOString().slice(0, 10)}`, day };
}
export function retain<T extends RetentionCandidate>(all: T[], config = DEFAULT_RETENTION, temporarilyPinned: ReadonlySet<string> = new Set()): T[] {
    if (!Number.isInteger(config.maxAutomatic) || config.maxAutomatic < 1)
        throw new Error('Invalid automatic quota');
    const protectedItems = all.filter(r => r.protection), candidates = all.filter(r => !r.protection).sort(order);
    if (candidates.length <= config.maxAutomatic)
        return all.slice().sort(order);
    const selected = new Set(candidates.filter(r => temporarilyPinned.has(r.id)).map(r => r.id));
    // Transactional excess is deferred, never silently discard required safety checkpoints.
    if (selected.size > config.maxAutomatic)
        return all.slice().sort(order);
    const capacity = config.maxAutomatic, keys = new Map(candidates.map(r => [r.id, calendarKeys(r.createdAt, config.timeZone)]));
    const add = (r: T) => {
        if (selected.size < capacity)
            selected.add(r.id);
    };
    candidates.slice(-Math.min(config.recentReserve, capacity - selected.size)).forEach(add);
    const groups = (level: keyof ReturnType<typeof calendarKeys>) => {
        const map = new Map<string, T[]>();
        for (const r of candidates) {
            const key = keys.get(r.id)![level];
            map.set(key, [...(map.get(key) || []), r]);
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    };
    const cover = (level: keyof ReturnType<typeof calendarKeys>) => {
        const ordered = fairOrder(groups(level));
        for (const [, items] of ordered)
            if (!items.some(r => selected.has(r.id)))
                add(items.slice().sort((a, b) => b.priority - a.priority || order(a, b))[0]);
        for (const [, items] of ordered)
            add(items[0]);
        for (const [, items] of ordered)
            add(items[items.length - 1]);
    };
    cover('year');
    cover('month');
    const months = groups('month');
    const milestones = fairOrder(months).map(([, rows]) => rows.filter(r => r.priority >= 2 && !selected.has(r.id)).sort((a, b) => b.priority - a.priority || order(a, b)));
    let added = 0;
    while (selected.size < capacity && added < config.milestoneReserve) {
        let progress = false;
        for (const rows of milestones) {
            const r = rows.shift();
            if (!r)
                continue;
            if (selected.size >= capacity || added >= config.milestoneReserve)
                break;
            add(r);
            added++;
            progress = true;
        }
        if (!progress)
            break;
    }
    cover('week');
    cover('day');
    const fillMonths = months.map(([key, rows]) => {
        const chosen = rows.flatMap((r, i) => selected.has(r.id) ? [i] : []);
        return { key, rows, count: chosen.length, distances: rows.map((_, i) => chosen.length ? Math.min(...chosen.map(n => Math.abs(n - i))) : rows.length) };
    });
    while (selected.size < capacity) {
        const month = fillMonths.filter(m => m.count < m.rows.length).sort((a, b) => a.count / Math.sqrt(a.rows.length) - b.count / Math.sqrt(b.rows.length) || a.key.localeCompare(b.key))[0];
        if (!month)
            break;
        let best = -1;
        for (let i = 0; i < month.rows.length; i++) {
            const row = month.rows[i];
            if (selected.has(row.id))
                continue;
            if (best < 0 || row.priority > month.rows[best].priority || (row.priority === month.rows[best].priority &&
                (month.distances[i] > month.distances[best] || (month.distances[i] === month.distances[best] && order(row, month.rows[best]) < 0))))
                best = i;
        }
        add(month.rows[best]);
        month.count++;
        month.distances = month.distances.map((distance, i) => Math.min(distance, Math.abs(i - best)));
    }
    return [...protectedItems, ...candidates.filter(r => selected.has(r.id))].sort(order);
}
