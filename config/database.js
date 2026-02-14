const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'database.sqlite');

async function initializeDatabase() {
    let db = null;
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        logger.info('Database connected successfully');

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA journal_mode = WAL'); // Better concurrency

        // Create users table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT,
                email TEXT,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                is_active BOOLEAN DEFAULT 1,
                preferences TEXT
            )
        `);

        // Create sms table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS sms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                from_number TEXT NOT NULL,
                to_number TEXT,
                message TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                read BOOLEAN DEFAULT 0,
                type TEXT DEFAULT 'incoming',
                status TEXT DEFAULT 'received',
                delivered_at DATETIME,
                error TEXT,
                folder TEXT DEFAULT 'inbox',
                tags TEXT,
                UNIQUE(device_id, timestamp, from_number)
            )
        `);

        // Create calls table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                phone_number TEXT NOT NULL,
                contact_name TEXT,
                type TEXT DEFAULT 'outgoing',
                status TEXT DEFAULT 'dialing',
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                duration INTEGER DEFAULT 0,
                recording_url TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                missed BOOLEAN DEFAULT 0,
                tags TEXT
            )
        `);

        // Create indexes for calls table
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
            CREATE INDEX IF NOT EXISTS idx_calls_start_time ON calls(start_time);
            CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(type);
            CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
            CREATE INDEX IF NOT EXISTS idx_calls_device ON calls(device_id);
        `);

        // Create contacts table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                email TEXT,
                company TEXT,
                favorite BOOLEAN DEFAULT 0,
                notes TEXT,
                photo TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_called DATETIME,
                call_count INTEGER DEFAULT 0,
                tags TEXT,
                UNIQUE(phone_number)
            )
        `);

        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
            CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
            CREATE INDEX IF NOT EXISTS idx_contacts_favorite ON contacts(favorite);
        `);

        // Create settings table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                type TEXT DEFAULT 'string',
                category TEXT DEFAULT 'general',
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER,
                FOREIGN KEY (updated_by) REFERENCES users(id)
            )
        `);

        // Create sessions table for persistent sessions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expires DATETIME NOT NULL,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create USSD table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS ussd (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                code TEXT NOT NULL,
                description TEXT,
                response TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'success',
                type TEXT DEFAULT 'balance',
                session_id TEXT,
                menu_level INTEGER DEFAULT 0,
                duration INTEGER,
                error TEXT
            )
        `);

        // Create indexes for USSD table
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_ussd_timestamp ON ussd(timestamp);
            CREATE INDEX IF NOT EXISTS idx_ussd_type ON ussd(type);
            CREATE INDEX IF NOT EXISTS idx_ussd_code ON ussd(code);
            CREATE INDEX IF NOT EXISTS idx_ussd_device ON ussd(device_id);
        `);

        // Create USSD settings table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS ussd_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_key TEXT UNIQUE NOT NULL,
                service_name TEXT NOT NULL,
                ussd_code TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                enabled BOOLEAN DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                requires_pin BOOLEAN DEFAULT 0,
                category TEXT DEFAULT 'general',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create webcam table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS webcam (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT DEFAULT 'ESP32-CAM',
                enabled BOOLEAN DEFAULT 0,
                resolution TEXT DEFAULT '640x480',
                fps INTEGER DEFAULT 15,
                quality INTEGER DEFAULT 80,
                brightness INTEGER DEFAULT 0,
                contrast INTEGER DEFAULT 0,
                saturation INTEGER DEFAULT 0,
                sharpness INTEGER DEFAULT 0,
                flip_horizontal BOOLEAN DEFAULT 0,
                flip_vertical BOOLEAN DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_frame BLOB,
                motion_detection BOOLEAN DEFAULT 0,
                motion_sensitivity INTEGER DEFAULT 50,
                recording BOOLEAN DEFAULT 0,
                stream_url TEXT,
                settings JSON,
                face_detection BOOLEAN DEFAULT 0,
                face_recognition BOOLEAN DEFAULT 0,
                alert_on_motion BOOLEAN DEFAULT 0
            )
        `);

        // Create webcam_captures table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS webcam_captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER,
                width INTEGER,
                height INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                type TEXT DEFAULT 'manual',
                motion_detected BOOLEAN DEFAULT 0,
                tags TEXT,
                UNIQUE(path)
            )
        `);

        // Create storage_files table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS storage_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER,
                type TEXT,
                modified DATETIME,
                created DATETIME,
                is_directory BOOLEAN DEFAULT 0,
                parent_path TEXT,
                storage_type TEXT DEFAULT 'internal',
                tags TEXT,
                UNIQUE(path, storage_type)
            )
        `);

        // Create mqtt_logs table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS mqtt_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                message TEXT,
                direction TEXT DEFAULT 'in',
                device_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                qos INTEGER,
                retained BOOLEAN DEFAULT 0
            )
        `);

        // Create system_logs table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT DEFAULT 'info',
                message TEXT NOT NULL,
                module TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER,
                data TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create backups table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                type TEXT DEFAULT 'manual',
                status TEXT DEFAULT 'completed',
                checksum TEXT,
                UNIQUE(path)
            )
        `);

        // Create notifications table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT DEFAULT 'info',
                title TEXT NOT NULL,
                message TEXT,
                read BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                action_url TEXT,
                action_text TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Check if admin user exists
        const adminUser = await db.get('SELECT * FROM users WHERE username = ?', [process.env.ADMIN_USERNAME || 'admin']);
        if (!adminUser) {
            // Create default admin user
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            const result = await db.run(
                'INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)',
                [
                    process.env.ADMIN_USERNAME || 'admin',
                    hashedPassword,
                    process.env.ADMIN_NAME || 'System Administrator',
                    process.env.ADMIN_EMAIL || 'admin@example.com',
                    'admin'
                ]
            );
            logger.info('Default admin user created');

            // Create notification for new admin
            await db.run(`
                INSERT INTO notifications (user_id, type, title, message) 
                VALUES (?, 'success', 'Welcome to ESP32-S3 Manager', 'Your dashboard is ready. Check the settings to configure your device.')
            `, [result.lastID]);
        }

        // Insert default webcam settings
        const webcamCount = await db.get('SELECT COUNT(*) as count FROM webcam');
        if (webcamCount.count === 0) {
            await db.run(`
                INSERT INTO webcam (name, enabled, resolution, fps, quality, motion_detection, face_detection) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, ['ESP32-CAM', 0, '640x480', 15, 80, 0, 0]);
            logger.info('Default webcam settings inserted');
        }

        // Insert default USSD settings
        const settingsCount = await db.get('SELECT COUNT(*) as count FROM ussd_settings');
        if (settingsCount.count === 0) {
            const defaultSettings = [
                ['balance', 'Check Balance', '*121#', 'View current account balance', 'cash-stack', 1, 1, 'balance'],
                ['data', 'Data Balance', '*121*3#', 'Check remaining data', 'wifi', 1, 2, 'data'],
                ['minutes', 'Minutes Balance', '*121*2#', 'Check call minutes', 'telephone', 1, 3, 'calls'],
                ['sms', 'SMS Balance', '*121*1#', 'Check SMS balance', 'chat-dots', 1, 4, 'sms'],
                ['offers', 'Special Offers', '*500#', 'View promotional offers', 'gift', 1, 5, 'offers'],
                ['packages', 'Internet Packages', '*121*50#', 'Browse data packs', 'box', 1, 6, 'data'],
                ['support', 'Customer Care', '121', 'Contact support', 'headset', 1, 7, 'support'],
                ['fnf', 'FNF Numbers', '*121*4#', 'Manage FNF list', 'star', 1, 8, 'contacts'],
                ['mnp', 'MNP Check', '*121*5#', 'Check number portability', 'arrow-left-right', 1, 9, 'info'],
                ['ownNumber', 'My Number', '*121*5#', 'Check your phone number', 'phone', 1, 10, 'info']
            ];

            for (const setting of defaultSettings) {
                await db.run(`
                    INSERT INTO ussd_settings (service_key, service_name, ussd_code, description, icon, enabled, sort_order, category) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, setting);
            }
            logger.info('Default USSD settings inserted');
        }

        // Insert default system settings
        const systemSettings = [
            ['theme', 'light', 'string', 'appearance', 'UI theme preference'],
            ['language', 'en', 'string', 'general', 'Interface language'],
            ['notifications_enabled', 'true', 'boolean', 'notifications', 'Enable system notifications'],
            ['auto_refresh', '30', 'number', 'performance', 'Auto refresh interval in seconds'],
            ['items_per_page', '20', 'number', 'general', 'Number of items per page'],
            ['date_format', 'YYYY-MM-DD HH:mm:ss', 'string', 'general', 'Date display format'],
            ['timezone', 'Asia/Dhaka', 'string', 'general', 'System timezone'],
            ['log_retention_days', '30', 'number', 'system', 'Days to keep logs'],
            ['backup_retention_count', '10', 'number', 'backup', 'Number of backups to keep'],
            ['mqtt_reconnect_interval', '5', 'number', 'mqtt', 'MQTT reconnect interval in seconds']
        ];

        for (const setting of systemSettings) {
            const exists = await db.get('SELECT key FROM settings WHERE key = ?', [setting[0]]);
            if (!exists) {
                await db.run(`
                    INSERT INTO settings (key, value, type, category, description) 
                    VALUES (?, ?, ?, ?, ?)
                `, setting);
            }
        }

        // Create indexes for better performance
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sms_read ON sms(read);
            CREATE INDEX IF NOT EXISTS idx_sms_type ON sms(type);
            CREATE INDEX IF NOT EXISTS idx_sms_timestamp ON sms(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sms_device ON sms(device_id);
            
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
            
            CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
            
            CREATE INDEX IF NOT EXISTS idx_mqtt_device ON mqtt_logs(device_id);
            CREATE INDEX IF NOT EXISTS idx_mqtt_timestamp ON mqtt_logs(timestamp);
            
            CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at);
            
            CREATE INDEX IF NOT EXISTS idx_webcam_captures_timestamp ON webcam_captures(timestamp);
        `);

        logger.info('Database initialized successfully');
        return db;

    } catch (error) {
        logger.error('Database initialization failed:', error);
        if (db) {
            try {
                await db.close();
            } catch (closeError) {
                logger.error('Error closing database:', closeError);
            }
        }
        throw error;
    }
}

// Helper function to run migrations
async function runMigrations(db) {
    try {
        // Add new columns if they don't exist (example migration)
        const tables = await db.all(`
            SELECT name FROM sqlite_master WHERE type='table'
        `);

        for (const table of tables) {
            logger.debug(`Checking table: ${table.name}`);
        }

        logger.info('Migrations completed successfully');
    } catch (error) {
        logger.error('Migration error:', error);
        throw error;
    }
}

// Helper function to backup database
async function backupDatabase(db, backupPath = null) {
    try {
        if (!backupPath) {
            const backupDir = path.join(__dirname, '../backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupPath = path.join(backupDir, `database-backup-${timestamp}.db`);
        }

        // Close current connection
        await db.close();

        // Copy file
        fs.copyFileSync(dbPath, backupPath);

        // Reopen database
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        logger.info(`Database backed up to: ${backupPath}`);
        return { success: true, path: backupPath };
    } catch (error) {
        logger.error('Backup failed:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to restore database
async function restoreDatabase(backupPath) {
    try {
        if (!fs.existsSync(backupPath)) {
            throw new Error('Backup file not found');
        }

        // Close current connection if open
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        await db.close();

        // Restore file
        fs.copyFileSync(backupPath, dbPath);

        // Reopen database
        const newDb = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        logger.info(`Database restored from: ${backupPath}`);
        return { success: true, db: newDb };
    } catch (error) {
        logger.error('Restore failed:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to get database stats
async function getDatabaseStats(db) {
    try {
        const stats = {};

        // Get table counts
        const tables = await db.all(`
            SELECT name FROM sqlite_master WHERE type='table'
        `);

        for (const table of tables) {
            const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
            stats[table.name] = count.count;
        }

        // Get database file size
        const fileStats = fs.statSync(dbPath);
        stats.database_size = fileStats.size;
        stats.database_path = dbPath;
        stats.last_modified = fileStats.mtime;

        return stats;
    } catch (error) {
        logger.error('Error getting database stats:', error);
        return null;
    }
}

// Helper function to vacuum database
async function vacuumDatabase(db) {
    try {
        await db.exec('VACUUM');
        logger.info('Database vacuum completed');
        return { success: true };
    } catch (error) {
        logger.error('Vacuum failed:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { 
    initializeDatabase,
    backupDatabase,
    restoreDatabase,
    getDatabaseStats,
    vacuumDatabase
};