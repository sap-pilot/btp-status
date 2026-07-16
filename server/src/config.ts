const CONFIG_FILE = process.env.CONFIG_FILE ?? './config.json';
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const RESPONSE_DIR = process.env.RESPONSE_DIR ?? './response';
const SYNC_REMOTE = process.env.SYNC_REMOTE ?? '';
const SYNC_INTERVAL = Math.max(60, parseInt(process.env.SYNC_INTERVAL ?? '300', 10));
const SYNC_REMOTE_BATCH_SIZE = Math.max(1, parseInt(process.env.SYNC_REMOTE_BATCH_SIZE ?? '100', 10));
const MAX_RESPONSE_STORAGE_DAYS = Math.max(0, parseInt(process.env.MAX_RESPONSE_STORAGE_DAYS ?? '3', 10));
const REQUEST_TIMEOUT_MS = Math.max(1000, parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10));

export const config = { CONFIG_FILE, PORT, RESPONSE_DIR, SYNC_REMOTE, SYNC_INTERVAL, SYNC_REMOTE_BATCH_SIZE, MAX_RESPONSE_STORAGE_DAYS, REQUEST_TIMEOUT_MS };
