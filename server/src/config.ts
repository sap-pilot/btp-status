const CONFIG_FILE = process.env.CONFIG_FILE ?? './config.json';
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const RESPONSE_DIR = process.env.RESPONSE_DIR ?? './response';
const SYNC_REMOTE = process.env.SYNC_REMOTE ?? '';
const SYNC_INTERVAL = Math.max(60, parseInt(process.env.SYNC_INTERVAL ?? '900', 10));
const SYNC_REMOTE_BATCH_SIZE = Math.max(1, parseInt(process.env.SYNC_REMOTE_BATCH_SIZE ?? '50', 10));
const MAX_RESPONSE_STORAGE_DAYS = Math.max(0, parseInt(process.env.MAX_RESPONSE_STORAGE_DAYS ?? '3', 10));

export const config = { CONFIG_FILE, PORT, RESPONSE_DIR, SYNC_REMOTE, SYNC_INTERVAL, SYNC_REMOTE_BATCH_SIZE, MAX_RESPONSE_STORAGE_DAYS };
