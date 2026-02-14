const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const logger = require('./logger');

async function migrateDatabase() {
    try {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.sqlite');
        
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        logger.info('Running database migrations...');

        // Add device_id column to sms table if not exists
        await db.exec(`
            ALTER TABLE sms ADD COLUMN device_id TEXT;
        `).catch(() => logger.info('device_id column already exists in sms'));

        // Add group_name column to contacts if not exists
        await db.exec(`
            ALTER TABLE contacts ADD COLUMN group_name TEXT DEFAULT 'general';
        `).catch(() => logger.info('group_name column already exists in contacts'));

        // Create index for device_id
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sms_device ON sms(device_id);
        `);

        // Add device_id to calls table
        await db.exec(`
            ALTER TABLE calls ADD COLUMN device_id TEXT;
        `).catch(() => logger.info('device_id column already exists in calls'));

        // Create MQTT messages table for debugging
        await db.exec(`
            CREATE TABLE IF NOT EXISTS mqtt_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                message TEXT,
                direction TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        logger.info('Database migrations completed');
        await db.close();
    } catch (error) {
        logger.error('Migration failed:', error);
    }
}

if (require.main === module) {
    migrateDatabase();
}

module.exports = migrateDatabase;