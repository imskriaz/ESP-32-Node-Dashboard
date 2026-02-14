const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Get all settings
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

        // Get MQTT settings from environment
        settingsObj.mqtt = {
            host: process.env.MQTT_HOST || 'device.atebd.com',
            port: parseInt(process.env.MQTT_PORT) || 1883,
            username: process.env.MQTT_USER || 'deviceuser',
            password: process.env.MQTT_PASSWORD ? '********' : '',
            clientId: process.env.MQTT_CLIENT_ID || 'esp32-dashboard',
            topics: {
                command: 'device/+/command/#',
                status: 'device/+/status',
                sms: 'device/+/sms/#',
                call: 'device/+/call/#',
                ussd: 'device/+/ussd/#',
                webcam: 'device/+/webcam/#'
            }
        };

        // Get modem default settings
        settingsObj.modem = settingsObj.modem || {
            apn: 'internet',
            apnUser: '',
            apnPass: '',
            auth: 'none',
            networkMode: 'auto',
            preferredNetwork: 'LTE',
            autoConnect: true,
            pinCode: ''
        };

        // Get webcam settings from database
        const webcam = await db.get('SELECT * FROM webcam WHERE id = 1');
        settingsObj.webcam = webcam ? {
            enabled: webcam.enabled === 1,
            resolution: webcam.resolution,
            fps: webcam.fps,
            quality: webcam.quality,
            brightness: webcam.brightness,
            contrast: webcam.contrast,
            saturation: webcam.saturation,
            sharpness: webcam.sharpness,
            flip_h: webcam.flip_horizontal === 1,
            flip_v: webcam.flip_vertical === 1,
            motion_detection: webcam.motion_detection === 1,
            motion_sensitivity: webcam.motion_sensitivity
        } : {
            enabled: false,
            resolution: '640x480',
            fps: 15,
            quality: 80,
            brightness: 0,
            contrast: 0,
            saturation: 0,
            sharpness: 0,
            flip_h: false,
            flip_v: false,
            motion_detection: false,
            motion_sensitivity: 50
        };

        // Get system settings
        settingsObj.system = settingsObj.system || {
            deviceName: 'ESP32-S3 Gateway',
            timezone: 'Asia/Dhaka',
            logLevel: 'info',
            autoRestart: false,
            restartSchedule: '03:00',
            backupConfig: true
        };

        // Get notification settings
        settingsObj.notifications = settingsObj.notifications || {
            email: {
                enabled: false,
                smtp: '',
                port: 587,
                secure: false,
                user: '',
                pass: '',
                from: '',
                to: ''
            },
            telegram: {
                enabled: false,
                botToken: '',
                chatId: ''
            },
            pushover: {
                enabled: false,
                appToken: '',
                userKey: ''
            }
        };

        // Get user settings
        const users = await db.all('SELECT id, username, name, email, role, created_at, last_login FROM users');
        settingsObj.users = users;

        // Get backup settings
        settingsObj.backup = settingsObj.backup || {
            autoBackup: false,
            backupInterval: 'daily',
            backupTime: '02:00',
            keepCount: 7,
            backupPath: '/backups'
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
                global.mqttService.connect();
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

// Update modem settings
router.post('/modem', [
    body('apn').notEmpty().withMessage('APN is required'),
    body('apnUser').optional(),
    body('apnPass').optional(),
    body('auth').isIn(['none', 'pap', 'chap']).withMessage('Invalid auth type'),
    body('networkMode').isIn(['auto', '2g', '3g', '4g', 'lte']).withMessage('Invalid network mode'),
    body('preferredNetwork').optional(),
    body('autoConnect').isBoolean(),
    body('pinCode').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { apn, apnUser, apnPass, auth, networkMode, preferredNetwork, autoConnect, pinCode } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Save to settings table
        const modemSettings = {
            apn,
            apnUser,
            apnPass,
            auth,
            networkMode,
            preferredNetwork,
            autoConnect,
            pinCode
        };

        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['modem', JSON.stringify(modemSettings)]);

        // Send to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'configure-modem', modemSettings);
            } catch (mqttError) {
                logger.error('Error sending modem config to device:', mqttError);
            }
        }

        logger.info('Modem settings updated');

        res.json({
            success: true,
            message: 'Modem settings updated successfully'
        });
    } catch (error) {
        logger.error('API update modem settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update modem settings: ' + error.message
        });
    }
});

// Update webcam settings
router.post('/webcam', [
    body('enabled').isBoolean(),
    body('resolution').isIn(['1600x1200', '1280x1024', '1024x768', '800x600', '640x480', '352x288', '320x240', '176x144']),
    body('fps').isInt({ min: 1, max: 60 }),
    body('quality').isInt({ min: 10, max: 100 }),
    body('brightness').isInt({ min: -2, max: 2 }),
    body('contrast').isInt({ min: -2, max: 2 }),
    body('saturation').isInt({ min: -2, max: 2 }),
    body('sharpness').isInt({ min: -2, max: 2 }),
    body('flip_h').isBoolean(),
    body('flip_v').isBoolean(),
    body('motion_detection').isBoolean(),
    body('motion_sensitivity').isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            enabled, resolution, fps, quality, brightness, contrast,
            saturation, sharpness, flip_h, flip_v, motion_detection, motion_sensitivity
        } = req.body;

        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        // Update webcam settings
        await db.run(`
            UPDATE webcam SET
                enabled = ?,
                resolution = ?,
                fps = ?,
                quality = ?,
                brightness = ?,
                contrast = ?,
                saturation = ?,
                sharpness = ?,
                flip_horizontal = ?,
                flip_vertical = ?,
                motion_detection = ?,
                motion_sensitivity = ?,
                timestamp = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [
            enabled ? 1 : 0,
            resolution,
            fps,
            quality,
            brightness,
            contrast,
            saturation,
            sharpness,
            flip_h ? 1 : 0,
            flip_v ? 1 : 0,
            motion_detection ? 1 : 0,
            motion_sensitivity
        ]);

        // Send to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'configure-webcam', {
                    resolution, fps, quality, brightness, contrast,
                    saturation, sharpness, flip_h, flip_v,
                    motion_detection, motion_sensitivity
                });
            } catch (mqttError) {
                logger.error('Error sending webcam config to device:', mqttError);
            }
        }

        logger.info('Webcam settings updated');

        res.json({
            success: true,
            message: 'Webcam settings updated successfully'
        });
    } catch (error) {
        logger.error('API update webcam settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update webcam settings: ' + error.message
        });
    }
});

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
    body('telegram.chatId').optional(),
    body('pushover.enabled').isBoolean(),
    body('pushover.appToken').optional(),
    body('pushover.userKey').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, telegram, pushover } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Save to settings table
        await db.run(`
            INSERT OR REPLACE INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, ['notifications', JSON.stringify({ email, telegram, pushover })]);

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
        fs.copyFileSync(dbPath, backupFile);

        // Backup .env
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            fs.copyFileSync(envPath, path.join(backupDir, `env-${timestamp}.backup`));
        }

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

// Factory reset
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
            DELETE FROM settings;
            DELETE FROM sessions;
            UPDATE webcam SET enabled = 0, resolution = '640x480', fps = 15, quality = 80,
                            brightness = 0, contrast = 0, saturation = 0, sharpness = 0,
                            flip_horizontal = 0, flip_vertical = 0, motion_detection = 0,
                            motion_sensitivity = 50 WHERE id = 1;
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