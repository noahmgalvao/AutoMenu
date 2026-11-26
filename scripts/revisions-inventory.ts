import { configuredRevisionService } from '../src/infrastructure/revisions/http';
// Authorized read-only inspection; never prints documents, object names or credentials.
const { repo } = configuredRevisionService();
console.log(JSON.stringify(await repo.rpc('revision_measure_database'), null, 2));
const config = await repo.config();
console.log(JSON.stringify({ configuredMetrics: config.metrics, unavailable: ['physicalDiskIncludingWal', 'billing', 'organizationEgressCached', 'organizationEgressUncached', 'cpu', 'memory'].filter(k => !config.metrics[k]), note: 'Database relation sizes do not measure physical disk or billing quotas.' }, null, 2));
