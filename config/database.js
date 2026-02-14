const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'database.sqlite');

async function initializeDatabase() {
    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON');

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
                last_login DATETIME
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
                status TEXT DEFAULT 'received'
            )
        `);

        // Create calls table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_number TEXT NOT NULL,
                contact_name TEXT,
                type TEXT DEFAULT 'outgoing',
                status TEXT DEFAULT 'dialing',
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                duration INTEGER DEFAULT 0,
                recording_url TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for calls table
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
            CREATE INDEX IF NOT EXISTS idx_calls_start_time ON calls(start_time);
            CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(type);
            CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
        `);

        // Create contacts table - REMOVED group_name field
        await db.exec(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                email TEXT,
                company TEXT,
                favorite BOOLEAN DEFAULT 0,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create sessions table for persistent sessions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expires DATETIME NOT NULL
            )
        `);

        // Add USSD table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS ussd (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                description TEXT,
                response TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'success',
                type TEXT DEFAULT 'balance'
            )
        `);

        // Add indexes for USSD table
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_ussd_timestamp ON ussd(timestamp);
            CREATE INDEX IF NOT EXISTS idx_ussd_type ON ussd(type);
        `);

        // Add webcam table
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
                settings JSON
            )
        `);

        // Add USSD settings table
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if admin user exists
        const adminUser = await db.get('SELECT * FROM users WHERE username = ?', [process.env.ADMIN_USERNAME || 'admin']);
        if (!adminUser) {
            // Create default admin user
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            await db.run(
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
        }

        // Insert default webcam settings
        const webcamCount = await db.get('SELECT COUNT(*) as count FROM webcam');
        if (webcamCount.count === 0) {
            await db.run(`
                INSERT INTO webcam (name, enabled, resolution, fps, quality) 
                VALUES (?, ?, ?, ?, ?)
            `, ['ESP32-CAM', 0, '640x480', 15, 80]);
            logger.info('Default webcam settings inserted');
        }

        // Insert default USSD settings
        const settingsCount = await db.get('SELECT COUNT(*) as count FROM ussd_settings');
        if (settingsCount.count === 0) {
            const defaultSettings = [
                ['balance', 'Check Balance', '*121#', 'View current account balance', 'cash-stack', 1, 1],
                ['data', 'Data Balance', '*121*3#', 'Check remaining data', 'wifi', 1, 2],
                ['minutes', 'Minutes Balance', '*121*2#', 'Check call minutes', 'telephone', 1, 3],
                ['sms', 'SMS Balance', '*121*1#', 'Check SMS balance', 'chat-dots', 1, 4],
                ['offers', 'Special Offers', '*500#', 'View promotional offers', 'gift', 1, 5],
                ['packages', 'Internet Packages', '*121*50#', 'Browse data packs', 'box', 1, 6],
                ['support', 'Customer Care', '121', 'Contact support', 'headset', 1, 7],
                ['fnf', 'FNF Numbers', '*121*4#', 'Manage FNF list', 'star', 1, 8],
                ['mnp', 'MNP Check', '*121*5#', 'Check number portability', 'arrow-left-right', 1, 9],
                ['ownNumber', 'My Number', '*121*5#', 'Check your phone number', 'phone', 1, 10]
            ];

            for (const setting of defaultSettings) {
                await db.run(`
                    INSERT INTO ussd_settings (service_key, service_name, ussd_code, description, icon, enabled, sort_order) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, setting);
            }
            logger.info('Default USSD settings inserted');
        }

        logger.info('Database initialized successfully');
        return db;
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    }
}

module.exports = { initializeDatabase };