import '../src/config/environment';
import { getDatabase, initializeDatabase } from '../src/database/init';
import { ensureAdminUser } from '../src/database/ensure-admin';

try {
  initializeDatabase();
  ensureAdminUser();
  console.log('Database initialization completed');
} finally {
  getDatabase().close();
}
