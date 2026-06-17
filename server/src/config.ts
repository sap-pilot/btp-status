const CONFIG_FILE = process.env.CONFIG_FILE ?? './config.json';
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const RESPONSE_DIR = process.env.RESPONSE_DIR ?? './response';
const SYNC_REMOTE = process.env.SYNC_REMOTE ?? '';

export const config = { CONFIG_FILE, PORT, RESPONSE_DIR, SYNC_REMOTE };
