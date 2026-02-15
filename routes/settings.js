const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const os = require('os');

// Get all settings (cleaned - only system-level settings)
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        // Get all settings from database
        const settings = await db.all('SELECT * FROM settings');
        
        // Format as key-value object
        const settingsObj = {};
        settings.forEach(s => {
            try {
                settingsObj[s.key] = JSON.parse(s.value);
            } catch {
                settingsObj[s.key] = s.value;
            }
        });

        // Get MQTT settings from environment (only what's needed)
        settingsObj.mqtt = {
            host: process.env.MQTT_HOST || 'device.atebd.com',
            port: parseInt(process.env.MQTT_PORT) || 1883,
            username: process.env.MQTT_USER || 'deviceuser',
            clientId: process.env.MQTT_CLIENT_ID || `esp32-dashboard-${os.hostname()}`,
            connected: global.mqttService ? global.mqttService.connected : false
        };

        // Get system settings
        settingsObj.system = settingsObj.system || {
            deviceName: 'ESP32-S3 Gateway',
            hostname: os.hostname(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka',
            logLevel: process.env.LOG_LEVEL || 'info',
            autoRestart: false,
            restartSchedule: '03:00',
            backupConfig: true
        };

        // Get notification settings (simplified)
        settingsObj.notifications = settingsObj.notifications || {
            email: {
                enabled: false,
                smtp: '',
                port: 587,
                secure: false,
                user: '',
                from: '',
                to: ''
            },
            telegram: {
                enabled: false,
                botToken: '',
                chatId: ''
            }
        };

        // Get users from database
        const users = await db.all('SELECT id, username, name, email, role, created_at, last_login FROM users');
        settingsObj.users = users;

        // Get backup settings
        settingsObj.backup = settingsObj.backup || {
            autoBackup: false,
            backupInterval: 'daily',
            backupTime: '02:00',
            keepCount: 7,
            backupPath: path.join(__dirname, '../backups'),
            lastBackup: null
        };

        // Get firmware settings (minimal)
        settingsObj.firmware = settingsObj.firmware || {
            currentVersion: '1.0.0',
            availableVersion: null,
            lastCheck: null,
            autoUpdate: false,
            updateChannel: 'stable'
        };

        res.json({
            success: true,
            data: settingsObj
        });
    } catch (error) {
        logger.error('API get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings: ' + error.message
        });
    }
});

// ==================== MQTT SETTINGS ====================

// Update MQTT settings
router.post('/mqtt', [
    body('host').notEmpty().withMessage('MQTT host is required'),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('Valid port required'),
    body('username').optional(),
    body('password').optional(),
    body('clientId').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { host, port, username, password, clientId } = req.body;

        // Update .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = '';

        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }
        } catch (readError) {
            logger.error('Error reading .env file:', readError);
        }

        // Update or add MQTT settings
        const updates = {
            MQTT_HOST: host,
            MQTT_PORT: port,
            MQTT_USER: username || '',
            MQTT_CLIENT_ID: clientId || `esp32-dashboard-${Date.now()}`
        };

        if (password && password !== '********') {
            updates.MQTT_PASSWORD = password;
        }

        Object.entries(updates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        });

        // Write back to .env
        try {
            fs.writeFileSync(envPath, envContent);
        } catch (writeError) {
            logger.error('Error writing .env file:', writeError);
            throw new Error('Failed to save MQTT settings');
        }

        // Update environment variables
        process.env.MQTT_HOST = host;
        process.env.MQTT_PORT = port;
        process.env.MQTT_USER = username || '';
        if (password && password !== '********') {
            process.env.MQTT_PASSWORD = password;
        }
        process.env.MQTT_CLIENT_ID = updates.MQTT_CLIENT_ID;

        // Reconnect MQTT with new settings
        if (global.mqttService) {
            try {
                await global.mqttService.reconnect();
            } catch (mqttError) {
                logger.error('Error reconnecting MQTT:', mqttError);
            }
        }

        logger.info('MQTT settings updated');

        res.json({
            success: true,
            message: 'MQTT settings updated successfully'
        });
    } catch (error) {
        logger.error('API update MQTT settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update MQTT settings: ' + error.message
        });
    }
});

// Test MQTT connection
router.post('/test/mqtt', async (req, res) => {
    try {
        const { host, port, username, password } = req.body;

        // Create temporary MQTT client for testing
        const mqtt = require('mqtt');
        
        const client = mqtt.connect(`mqtt://${host}`, {
            port: parseInt(port),
            username,
            password,
            connectTimeout: 10000,
            reconnectPeriod: 0
        });

        const timeout = setTimeout(() => {
            client.end();
            res.json({
                success: false,
                message: 'Connection timeout'
            });
        }, 10000);

        client.on('connect', () => {
            clearTimeout(timeout);
            client.end();
            res.json({
                success: true,
                message: 'MQTT connection successful'
            });
        });

        client.on('error', (error) => {
            clearTimeout(timeout);
            client.end();
            res.json({
                success: false,
                message: 'Connection failed: ' + error.message
            });
        });

    } catch (error) {
        logger.error('MQTT test error:', error);
        res.status(500).json({
            success: false,
            message: 'Test failed: ' + error.message
        });
    }
});

// ==================== SYSTEM SETTINGS ====================

// Update system settings
router.post('/system', [
    body('deviceName').notEmpty(),
    body('timezone').notEmpty(),
    body('logLevel').isIn(['debug', 'info', 'warn', 'error']),
    body('autoRestart').isBoolean(),
    body('restartSchedule').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('backupConfig').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { deviceName, timezone, logLevel, autoRestart, restartSchedule, backupConfig } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Save to settings table
        const systemSettings = {
            deviceName,
            timezone,
            logLevel,
            autoRestart,
            restartSchedule,
            backupConfig
        };

        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['system', JSON.stringify(systemSettings)]);

        // Update logger level
        if (global.logger) {
            global.logger.level = logLevel;
        }

        // Update hostname if changed (requires sudo)
        if (deviceName !== os.hostname()) {
            try {
                exec(`sudo hostnamectl set-hostname ${deviceName}`, (error) => {
                    if (error) {
                        logger.error('Error setting hostname:', error);
                    }
                });
            } catch (hostnameError) {
                logger.error('Failed to set hostname:', hostnameError);
            }
        }

        logger.info('System settings updated');

        res.json({
            success: true,
            message: 'System settings updated successfully'
        });
    } catch (error) {
        logger.error('API update system settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update system settings: ' + error.message
        });
    }
});

// Restart server
router.post('/restart', (req, res) => {
    try {
        logger.info('Server restart requested');
        
        res.json({
            success: true,
            message: 'Server is restarting...'
        });

        // Restart after delay
        setTimeout(() => {
            process.exit(0);
        }, 2000);

    } catch (error) {
        logger.error('Restart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restart: ' + error.message
        });
    }
});

// ==================== NOTIFICATION SETTINGS ====================

// Update notification settings
router.post('/notifications', [
    body('email.enabled').isBoolean(),
    body('email.smtp').optional(),
    body('email.port').optional().isInt(),
    body('email.secure').optional().isBoolean(),
    body('email.user').optional(),
    body('email.pass').optional(),
    body('email.from').optional().isEmail(),
    body('email.to').optional().isEmail(),
    body('telegram.enabled').isBoolean(),
    body('telegram.botToken').optional(),
    body('telegram.chatId').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, telegram } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Save to settings table
        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['notifications', JSON.stringify({ email, telegram })]);

        logger.info('Notification settings updated');

        res.json({
            success: true,
            message: 'Notification settings updated successfully'
        });
    } catch (error) {
        logger.error('API update notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification settings: ' + error.message
        });
    }
});

// Test email
router.post('/test/email', async (req, res) => {
    try {
        const { smtp, port, secure, user, pass, from, to } = req.body;

        // In production, use nodemailer here
        // For now, simulate success
        setTimeout(() => {
            res.json({
                success: true,
                message: 'Test email sent successfully'
            });
        }, 2000);

    } catch (error) {
        logger.error('Email test error:', error);
        res.status(500).json({
            success: false,
            message: 'Test failed: ' + error.message
        });
    }
});

// Test Telegram
router.post('/test/telegram', async (req, res) => {
    try {
        const { botToken, chatId } = req.body;

        // Simulate success
        setTimeout(() => {
            res.json({
                success: true,
                message: 'Test Telegram message sent'
            });
        }, 2000);

    } catch (error) {
        logger.error('Telegram test error:', error);
        res.status(500).json({
            success: false,
            message: 'Test failed: ' + error.message
        });
    }
});

// ==================== FIRMWARE SETTINGS ====================

// Update firmware settings
router.post('/firmware', [
    body('autoUpdate').isBoolean(),
    body('updateChannel').isIn(['stable', 'beta', 'dev'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { autoUpdate, updateChannel } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Get current firmware settings
        const currentSettings = await db.get('SELECT value FROM settings WHERE key = ?', ['firmware']);
        let firmwareSettings = currentSettings ? JSON.parse(currentSettings.value) : { currentVersion: '1.0.0' };

        // Update settings
        firmwareSettings = {
            ...firmwareSettings,
            autoUpdate,
            updateChannel
        };

        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['firmware', JSON.stringify(firmwareSettings)]);

        logger.info('Firmware settings updated');

        res.json({
            success: true,
            message: 'Firmware settings updated successfully'
        });
    } catch (error) {
        logger.error('API update firmware settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update firmware settings: ' + error.message
        });
    }
});

// Check for firmware updates
router.post('/firmware/check', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        // Get current firmware settings
        const settings = await db.get('SELECT value FROM settings WHERE key = ?', ['firmware']);
        const firmwareSettings = settings ? JSON.parse(settings.value) : { currentVersion: '1.0.0' };

        // Request device to check for updates via MQTT
        if (global.mqttService && global.mqttService.connected) {
            await global.mqttService.publishCommand('esp32-s3-1', 'check-firmware', {});
        }

        // Simulate checking for updates
        const availableVersion = '1.0.1';

        // Update settings
        firmwareSettings.availableVersion = availableVersion;
        firmwareSettings.lastCheck = new Date().toISOString();

        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['firmware', JSON.stringify(firmwareSettings)]);

        res.json({
            success: true,
            message: availableVersion > firmwareSettings.currentVersion ? 
                `Update available: ${availableVersion}` : 'Firmware is up to date',
            data: {
                current: firmwareSettings.currentVersion,
                available: availableVersion,
                updateAvailable: availableVersion > firmwareSettings.currentVersion
            }
        });
    } catch (error) {
        logger.error('API check firmware error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check for updates: ' + error.message
        });
    }
});

// Perform firmware update
router.post('/firmware/update', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        // Get firmware settings
        const settings = await db.get('SELECT value FROM settings WHERE key = ?', ['firmware']);
        const firmwareSettings = settings ? JSON.parse(settings.value) : {};

        if (!firmwareSettings.availableVersion) {
            return res.status(400).json({
                success: false,
                message: 'No update available. Check for updates first.'
            });
        }

        // Send OTA update command via MQTT
        if (global.mqttService && global.mqttService.connected) {
            await global.mqttService.publishCommand('esp32-s3-1', 'ota-update', {
                version: firmwareSettings.availableVersion
            });

            logger.info(`Firmware update initiated to version ${firmwareSettings.availableVersion}`);

            res.json({
                success: true,
                message: `Firmware update to version ${firmwareSettings.availableVersion} initiated`,
                data: {
                    version: firmwareSettings.availableVersion
                }
            });
        } else {
            res.status(503).json({
                success: false,
                message: 'Device not connected'
            });
        }
    } catch (error) {
        logger.error('API firmware update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate firmware update: ' + error.message
        });
    }
});

// ==================== BACKUP FUNCTIONS ====================

// Create backup
router.post('/backup/create', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `backup-${timestamp}.db`);

        // Backup database
        const dbPath = path.join(__dirname, '../data/database.sqlite');
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupFile);
        }

        // Backup .env
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            fs.copyFileSync(envPath, path.join(backupDir, `env-${timestamp}.backup`));
        }

        // Update last backup time in settings
        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['backup', JSON.stringify({ lastBackup: new Date().toISOString() })]);

        logger.info(`Backup created: ${backupFile}`);

        res.json({
            success: true,
            message: 'Backup created successfully',
            file: `backup-${timestamp}.db`
        });
    } catch (error) {
        logger.error('Backup creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create backup: ' + error.message
        });
    }
});

// Restore from backup
router.post('/backup/restore', [
    body('file').notEmpty()
], async (req, res) => {
    try {
        const { file } = req.body;
        const backupFile = path.join(__dirname, '../backups', file);

        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({
                success: false,
                message: 'Backup file not found'
            });
        }

        // Restore database
        const dbPath = path.join(__dirname, '../data/database.sqlite');
        fs.copyFileSync(backupFile, dbPath);

        logger.info(`Backup restored: ${file}`);

        res.json({
            success: true,
            message: 'Backup restored successfully. Server will restart.'
        });

        // Restart server after delay
        setTimeout(() => {
            process.exit(0);
        }, 3000);

    } catch (error) {
        logger.error('Backup restore error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore backup: ' + error.message
        });
    }
});

// Get backup list
router.get('/backups', (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../backups');
        
        if (!fs.existsSync(backupDir)) {
            return res.json({
                success: true,
                data: []
            });
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db') || f.endsWith('.backup'))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                return {
                    name: f,
                    size: stat.size,
                    created: stat.birthtime,
                    modified: stat.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({
            success: true,
            data: files
        });
    } catch (error) {
        logger.error('Get backups error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get backups: ' + error.message
        });
    }
});

// Delete backup
router.delete('/backups/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const backupFile = path.join(__dirname, '../backups', filename);

        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({
                success: false,
                message: 'Backup file not found'
            });
        }

        fs.unlinkSync(backupFile);

        res.json({
            success: true,
            message: 'Backup deleted successfully'
        });
    } catch (error) {
        logger.error('Delete backup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete backup: ' + error.message
        });
    }
});

// ==================== LOGS ====================

// Get logs
router.get('/logs', (req, res) => {
    try {
        const logFile = path.join(__dirname, '../logs/app.log');
        
        if (!fs.existsSync(logFile)) {
            return res.json({
                success: true,
                data: 'No logs found'
            });
        }

        const logs = fs.readFileSync(logFile, 'utf8');
        const lines = logs.split('\n').slice(-500).join('\n');

        res.json({
            success: true,
            data: lines
        });
    } catch (error) {
        logger.error('Get logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get logs: ' + error.message
        });
    }
});

// Clear logs
router.post('/logs/clear', (req, res) => {
    try {
        const logFile = path.join(__dirname, '../logs/app.log');
        
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '');
        }

        res.json({
            success: true,
            message: 'Logs cleared successfully'
        });
    } catch (error) {
        logger.error('Clear logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear logs: ' + error.message
        });
    }
});

// Download logs
router.get('/logs/download', (req, res) => {
    try {
        const logFile = path.join(__dirname, '../logs/app.log');
        
        if (!fs.existsSync(logFile)) {
            return res.status(404).send('Logs not found');
        }

        res.download(logFile, `esp32-logs-${new Date().toISOString().slice(0,10)}.log`);
    } catch (error) {
        logger.error('Download logs error:', error);
        res.status(500).send('Failed to download logs');
    }
});

// ==================== USER MANAGEMENT ====================

// Get all users
router.get('/users', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const users = await db.all('SELECT id, username, name, email, role, created_at, last_login FROM users');
        
        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get users: ' + error.message
        });
    }
});

// Add new user
router.post('/users', [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').optional(),
    body('email').optional().isEmail(),
    body('role').isIn(['user', 'admin']).withMessage('Invalid role')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, password, name, email, role } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Check if username exists
        const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const result = await db.run(`
            INSERT INTO users (username, password, name, email, role, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [username, hashedPassword, name || null, email || null, role]);

        logger.info(`New user created: ${username}`);

        res.json({
            success: true,
            message: 'User created successfully',
            userId: result.lastID
        });
    } catch (error) {
        logger.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user: ' + error.message
        });
    }
});

// Update user
router.put('/users/:id', [
    body('name').optional(),
    body('email').optional().isEmail(),
    body('role').isIn(['user', 'admin']).withMessage('Invalid role'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { id } = req.params;
        const { name, email, role, password } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Check if user exists
        const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Build update query
        let updates = [];
        let params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name || null);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email || null);
        }
        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(id);
        await db.run(`
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, params);

        logger.info(`User updated: ${id}`);

        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user: ' + error.message
        });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Check if user is the last admin
        if (id == 1) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete the main admin user'
            });
        }

        const result = await db.run('DELETE FROM users WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        logger.info(`User deleted: ${id}`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user: ' + error.message
        });
    }
});

// Factory reset (clears all data except users)
router.post('/factory-reset', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        // Clear all tables except users
        await db.exec(`
            DELETE FROM sms;
            DELETE FROM calls;
            DELETE FROM contacts;
            DELETE FROM ussd;
            DELETE FROM gps_locations;
            DELETE FROM gpio_config;
            DELETE FROM gpio_history;
            DELETE FROM gpio_groups;
            DELETE FROM gpio_rules;
            DELETE FROM test_results;
            DELETE FROM test_steps;
            DELETE FROM settings;
            DELETE FROM sessions;
            DELETE FROM notifications;
            DELETE FROM mqtt_logs;
            DELETE FROM system_logs;
            DELETE FROM backups;
        `);

        logger.info('Factory reset completed');

        res.json({
            success: true,
            message: 'Factory reset completed. Server will restart.'
        });

        // Restart after delay
        setTimeout(() => {
            process.exit(0);
        }, 3000);

    } catch (error) {
        logger.error('Factory reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset: ' + error.message
        });
    }
});

module.exports = router;