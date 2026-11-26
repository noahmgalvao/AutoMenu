export type Resource = 'database' | 'disk' | 'storage' | 'egressCached' | 'egressUncached' | 'cpu' | 'memory';
export interface ResourceMetric {
    used: number | null;
    limit: number | null;
    observedAt: string | null;
    source: string;
}
export type CapacityMetrics = Record<Resource, ResourceMetric>;
export interface CapacityDecision {
    level: 0 | 50 | 70 | 85 | 95;
    pause: boolean;
    concurrency: number;
    unknown: Resource[];
}
export function capacityDecision(metrics: CapacityMetrics, reservations: Partial<Record<Resource, number>> = {}, previous: 0 | 50 | 70 | 85 | 95 = 0, recovery = .8, healthy = true): CapacityDecision {
    let ratio = 0;
    const unknown: Resource[] = [];
    for (const key of Object.keys(metrics) as Resource[]) {
        const m = metrics[key];
        if (m.used === null || m.limit === null || m.limit <= 0 || !m.observedAt) {
            unknown.push(key);
            continue;
        }
        ratio = Math.max(ratio, (m.used + (reservations[key] || 0)) / m.limit);
    }
    let level: CapacityDecision['level'] = ratio >= .95 ? 95 : ratio >= .85 ? 85 : ratio >= .70 ? 70 : ratio >= .50 ? 50 : 0;
    if (previous === 95 && (ratio >= recovery || !healthy))
        level = 95;
    return { level, pause: level === 95, concurrency: level >= 85 ? 1 : 3, unknown };
}
