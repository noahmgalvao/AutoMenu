import { configuredRevisionService } from '../src/infrastructure/revisions/http';
// One bounded execution. Schedule centrally every 30–60 seconds (never one cron per menu).
if (process.env.HISTORY_V12_ENABLED !== 'true')
    throw new Error('Worker desabilitado; configure e valide antes de ativar.');
const service = configuredRevisionService();
console.log(JSON.stringify(await service.runJobs(10)));
if (process.argv.includes('--gc')) {
    console.log(JSON.stringify(await service.optimizeBases(3)));
    console.log(JSON.stringify(await service.gc(10)));
}
