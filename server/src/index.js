import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { syncAllRent } from './services/rent.js';
import { releaseOrphanBookings } from './services/stays.js';
import { todayIn } from './lib/dates.js';

await connectDb(config.mongoUri);
const orphans = await releaseOrphanBookings();
if (orphans) console.log(`Released ${orphans} orphaned booking(s) left by an interrupted check-in.`);

const sync = () => syncAllRent(todayIn(config.timezone)).catch((e) => console.error('Rent sync failed:', e));
await sync();
setInterval(sync, 60 * 60 * 1000).unref(); // roll rent forward when a new month starts

createApp({ config }).listen(config.port, () => console.log(`API running at http://localhost:${config.port}`));
