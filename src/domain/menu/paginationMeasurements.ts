/** A category may render a fraction taller after moving between flow contexts.
 * Keep the safe upper bound until the source or its loaded resources change;
 * replacing it with the shorter measurement would send it straight back again.
 */
export function mergePaginationMeasurements(current: ReadonlyMap<string, number>, measured: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const changes = [...measured].filter(([key, height]) => Number.isFinite(height) && height >= 0
    && (!current.has(key) || height - current.get(key)! >= .25));
  return changes.length ? new Map([...current, ...changes]) : current;
}
