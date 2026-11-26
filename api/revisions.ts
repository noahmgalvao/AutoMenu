import { revisionHandler } from '../src/infrastructure/revisions/http';
export default revisionHandler;
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };
