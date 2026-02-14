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
        type TEXT DEFAULT 'balance' -- balance, offer, support, etc.
    )
`);

        // Add indexes for USSD table
        await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ussd_timestamp ON ussd(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ussd_type ON ussd(type);
`);

        // Insert mock USSD history
        const ussdCount = await db.get('SELECT COUNT(*) as count FROM ussd');
        if (ussdCount.count === 0) {
            const mockUssd = [
                ['*121#', 'Check Balance', 'Your current balance is BDT 125.50. Valid until 2026-03-15', 'balance'],
                ['*121*3#', 'Data Balance', 'You have 2.3GB data remaining out of 5GB. Valid until 2026-02-28', 'data'],
                ['*121*2#', 'Check Minutes', 'You have 125 minutes remaining', 'minutes'],
                ['*121*1#', 'Check SMS', 'You have 500 SMS remaining', 'sms'],
                ['*500#', 'Special Offers', 'Special offer: 10GB for BDT 299. Dial *121*50# to subscribe', 'offer']
            ];

            for (const ussd of mockUssd) {
                await db.run(`
            INSERT INTO ussd (code, description, response, type, timestamp) 
            VALUES (?, ?, ?, ?, datetime('now', '-' || (abs(random() % 10)) || ' days'))
        `, ussd);
            }
            logger.info('Mock USSD data inserted');
        }
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

        // Insert default webcam settings
        const webcamCount = await db.get('SELECT COUNT(*) as count FROM webcam');
        if (webcamCount.count === 0) {
            await db.run(`
        INSERT INTO webcam (name, enabled, resolution, fps, quality) 
        VALUES (?, ?, ?, ?, ?)
    `, ['ESP32-CAM', 0, '640x480', 15, 80]);
            logger.info('Default webcam settings inserted');
        }

        // Insert mock SMS data if none exists
        const smsCount = await db.get('SELECT COUNT(*) as count FROM sms');
        if (smsCount.count === 0) {
            const mockSms = [
                ['+8801712345678', null, 'Your Robi balance is BDT 125.50. Valid until 2026-03-15', '2026-02-14 10:30:00', 0],
                ['+8801812345678', null, 'Special offer: 10GB for BDT 299. Dial *121*3# to subscribe', '2026-02-14 07:30:00', 1],
                ['+8801912345678', null, 'Your data pack expires in 2 days. Recharge now to continue', '2026-02-13 14:20:00', 1],
                ['+8801712345678', null, 'Welcome to Robi 4G network! Enjoy high-speed internet', '2026-02-12 09:15:00', 1],
                ['+8801812345678', null, 'Internet pack activated: 5GB for 7 days', '2026-02-10 16:45:00', 1]
            ];

            for (const sms of mockSms) {
                await db.run(
                    'INSERT INTO sms (from_number, to_number, message, timestamp, read) VALUES (?, ?, ?, ?, ?)',
                    sms
                );
            }
            logger.info('Mock SMS data inserted');
        }
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
        // Insert mock call data if none exists - FIXED: Using proper date calculations
        const callCount = await db.get('SELECT COUNT(*) as count FROM calls');
        if (callCount.count === 0) {
            // Calculate timestamps manually
            const now = new Date();

            const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString();
            const fiveHoursAgo = new Date(now.getTime() - (5 * 60 * 60 * 1000)).toISOString();
            const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
            const twoDaysAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString();
            const threeDaysAgo = new Date(now.getTime() - (72 * 60 * 60 * 1000)).toISOString();

            const mockCalls = [
                ['+8801712345678', 'John Doe', 'incoming', 'answered', 125, twoHoursAgo],
                ['+8801812345678', 'Jane Smith', 'outgoing', 'answered', 45, fiveHoursAgo],
                ['+8801912345678', null, 'incoming', 'missed', 0, oneDayAgo],
                ['+8801712345678', 'John Doe', 'outgoing', 'answered', 320, twoDaysAgo],
                ['+8801612345678', 'Support', 'incoming', 'answered', 180, threeDaysAgo]
            ];

            for (const call of mockCalls) {
                await db.run(`
                    INSERT INTO calls (phone_number, contact_name, type, status, duration, start_time) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `, call);
            }
            logger.info('Mock call data inserted');
        }

        const contactCount = await db.get('SELECT COUNT(*) as count FROM contacts');
        if (contactCount.count === 0) {
            const mockContacts = [
                ['John Doe', '+8801712345678', 'john@example.com', 'Acme Inc', 1, 'CEO'],
                ['Jane Smith', '+8801812345678', 'jane@example.com', 'Tech Solutions', 1, 'CTO'],
                ['Mike Johnson', '+8801912345678', 'mike@example.com', null, 1, 'Brother'],
                ['Sarah Williams', '+8801612345678', 'sarah@example.com', 'Design Studio', 0, 'Designer'],
                ['Support Center', '121', 'support@robiaxiata.com', 'Robi', 1, 'Customer Support'],
                ['Emergency', '999', null, null, 1, 'Emergency Services'],
                ['Mother', '+8801711122334', null, null, 1, 'Mom'],
                ['Father', '+8801811122334', null, null, 1, 'Dad'],
                ['Office', '+8801966688888', 'office@company.com', 'My Company', 1, 'Main Office'],
                ['Doctor', '+8801777788888', 'dr.smith@clinic.com', 'City Hospital', 0, 'Family Doctor']
            ];

            for (const contact of mockContacts) {
                await db.run(`
            INSERT INTO contacts (name, phone_number, email, company, favorite, notes) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, contact);
            }
            logger.info('Mock contacts data inserted');
        }

        logger.info('Database initialized successfully');
        return db;
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    }
}

module.exports = { initializeDatabase };