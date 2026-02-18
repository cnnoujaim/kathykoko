import { pool } from '../src/config/database';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');

    // Create migrations tracking table if it doesn't exist
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = '_migrations'
      ) as exists
    `);
    const isNew = !tableCheck.rows[0].exists;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        run_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // If tracking table was just created, mark pre-existing migrations as done
    if (isNew) {
      const preMigrations = [
        '001_initial_schema.sql',
        '002_add_pgvector.sql',
        '003_add_oauth_tables.sql',
        '004_add_health_tracking.sql',
        '005_add_deferred_status.sql',
      ];
      for (const name of preMigrations) {
        await pool.query(
          'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
          [name]
        );
      }
      console.log('  ℹ Marked 001–005 as already run (pre-existing)');
    }

    const migrationsDir = path.join(__dirname, '../src/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    // Get already-run migrations
    const result = await pool.query('SELECT name FROM _migrations');
    const completed = new Set(result.rows.map((r: { name: string }) => r.name));

    let ranCount = 0;
    for (const file of files) {
      if (completed.has(file)) {
        console.log(`  ⏭ ${file} (already run)`);
        continue;
      }

      console.log(`  → Running ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`  ✓ ${file} completed`);
      ranCount++;
    }

    if (ranCount === 0) {
      console.log('✅ Database is up to date — no new migrations');
    } else {
      console.log(`✅ Ran ${ranCount} migration(s) successfully`);
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
