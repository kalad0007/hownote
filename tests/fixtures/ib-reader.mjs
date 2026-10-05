// Public synthetic test values ONLY. Never configure the normal local preview or production with these.
import { pbkdf2Sync } from 'node:crypto';
export const TEST_PIN='0427';
const salt='f7b13ac4756940ba9d222863b7ece001';
export const TEST_READER_CREDENTIAL={schemaVersion:1,salt,hash:pbkdf2Sync(TEST_PIN,salt,100000,32,'sha256').toString('hex')};
export const TEST_PUBLISH_TOKEN='synthetic-ib-publish-only-for-isolated-tests';
export const TEST_READ_TOKEN='synthetic-ib-read-only-for-isolated-tests';
