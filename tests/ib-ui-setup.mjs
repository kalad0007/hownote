import { seedIb } from '../scripts/ib-local-seed.mjs';
import { TEST_PUBLISH_TOKEN } from './fixtures/ib-reader.mjs';
export default async()=>{await seedIb('http://127.0.0.1:8788',{token:TEST_PUBLISH_TOKEN});};
