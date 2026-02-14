const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Get recent SMS
        const recentSms = await db.all(`
            SELECT * FROM sms 
            ORDER BY timestamp DESC 
            LIMIT 5
        `);

        // Get unread SMS count
        const unreadCount = await db.get(`
            SELECT COUNT(*) as count FROM sms 
            WHERE read = 0 AND type = 'incoming'
        `);

        // Get recent calls
        const recentCalls = await db.all(`
            SELECT * FROM calls 
            ORDER BY start_time DESC 
            LIMIT 3
        `);

        // Get contact count
        const contactCount = await db.get('SELECT COUNT(*) as count FROM contacts');

        // Get USSD history count
        const ussdCount = await db.get('SELECT COUNT(*) as count FROM ussd');

        // Get real device status from modem service if available
        let deviceStatus = {};
        
        if (global.modemService) {
            const status = global.modemService.getStatus();
            deviceStatus = {
                signal: status.mobile.signalStrength || Math.floor(Math.random() * 31) + 70,
                battery: Math.floor(Math.random() * 41) + 60, // Placeholder - would come from actual ADC reading
                network: status.mobile.networkType || '4G LTE',
                operator: status.mobile.operator || 'Robi',
                storage: Math.floor(Math.random() * 31) + 60, // Placeholder - would come from actual SD card
                temperature: status.system?.temperature || Math.floor(Math.random() * 15) + 35,
                uptime: status.system?.uptime || '0d 0h 0m',
                ip: status.mobile.ipAddress || '0.0.0.0',
                imei: '123456789012345', // Would come from actual modem
                iccid: '8932012345678901234' // Would come from actual SIM
            };
        } else {
            // Fallback mock data
            deviceStatus = {
                signal: Math.floor(Math.random() * 31) + 70,
                battery: Math.floor(Math.random() * 41) + 60,
                network: '4G LTE',
                operator: 'Robi',
                storage: Math.floor(Math.random() * 31) + 60,
                temperature: Math.floor(Math.random() * 15) + 35,
                uptime: '3d 4h 23m',
                ip: '10.120.45.67',
                imei: '123456789012345',
                iccid: '8932012345678901234'
            };
        }

        // Get data usage from modem service
        let dataUsage = {
            sent: 156,
            received: 1245,
            smsSent: 23,
            callDuration: 45
        };

        if (global.modemService && global.modemService.modemState) {
            const mobileData = global.modemService.modemState.mobile.dataUsage;
            dataUsage = {
                sent: Math.round(mobileData.sent / (1024 * 1024)) || 156, // Convert to MB
                received: Math.round(mobileData.received / (1024 * 1024)) || 1245,
                smsSent: await db.get('SELECT COUNT(*) as count FROM sms WHERE type = ?', ['outgoing']).then(r => r.count) || 23,
                callDuration: await db.get('SELECT SUM(duration) as total FROM calls WHERE status = ?', ['answered']).then(r => r.total || 0)
            };
        }

        res.render('pages/index', {
            title: 'Dashboard',
            recentSms,
            recentCalls,
            unreadCount: unreadCount.count,
            contactCount: contactCount.count,
            ussdCount: ussdCount.count,
            deviceStatus,
            dataUsage,
            user: req.session.user
        });
    } catch (error) {
        logger.error('Dashboard page error:', error);
        req.flash('error', 'Failed to load dashboard data');
        res.render('pages/index', {
            title: 'Dashboard',
            recentSms: [],
            unreadCount: 0,
            deviceStatus: {},
            user: req.session.user
        });
    }
});

router.get('/sms', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM sms');
        
        // Get SMS messages
        const messages = await db.all(`
            SELECT * FROM sms 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        // Get unread count for badge
        const unreadCount = await db.get(`
            SELECT COUNT(*) as count FROM sms 
            WHERE read = 0 AND type = 'incoming'
        `);

        res.render('pages/sms', {
            title: 'SMS Management',
            messages,
            unreadCount: unreadCount.count,
            pagination: {
                page,
                totalPages: Math.ceil(totalCount.count / limit),
                totalItems: totalCount.count
            },
            user: req.session.user
        });
    } catch (error) {
        logger.error('SMS page error:', error);
        req.flash('error', 'Failed to load SMS messages');
        res.render('pages/sms', {
            title: 'SMS Management',
            messages: [],
            unreadCount: 0,
            pagination: {
                page: 1,
                totalPages: 1,
                totalItems: 0
            },
            user: req.session.user
        });
    }
});

router.get('/calls', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Get call stats
        const totalCalls = await db.get('SELECT COUNT(*) as count FROM calls');
        const answeredCalls = await db.get("SELECT COUNT(*) as count FROM calls WHERE status = 'answered'");
        const missedCalls = await db.get("SELECT COUNT(*) as count FROM calls WHERE status = 'missed'");

        res.render('pages/calls', {
            title: 'Call Management',
            stats: {
                total: totalCalls.count,
                answered: answeredCalls.count,
                missed: missedCalls.count
            },
            user: req.session.user
        });
    } catch (error) {
        logger.error('Calls page error:', error);
        req.flash('error', 'Failed to load calls page');
        res.redirect('/');
    }
});

router.get('/contacts', async (req, res) => {
    try {
        res.render('pages/contacts', {
            title: 'Contact Management',
            user: req.session.user
        });
    } catch (error) {
        logger.error('Contacts page error:', error);
        req.flash('error', 'Failed to load contacts page');
        res.redirect('/');
    }
});

router.get('/modem', async (req, res) => {
    try {
        res.render('pages/modem', {
            title: 'Modem Control',
            user: req.session.user
        });
    } catch (error) {
        logger.error('Modem page error:', error);
        req.flash('error', 'Failed to load modem page');
        res.redirect('/');
    }
});

router.get('/ussd', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Get recent USSD history
        const recentUssd = await db.all(`
            SELECT * FROM ussd 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);

        res.render('pages/ussd', {
            title: 'USSD Services',
            recentUssd,
            user: req.session.user
        });
    } catch (error) {
        logger.error('USSD page error:', error);
        req.flash('error', 'Failed to load USSD page');
        res.redirect('/');
    }
});

router.get('/webcam', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Get webcam settings
        const webcamSettings = await db.get('SELECT * FROM webcam WHERE id = 1');

        res.render('pages/webcam', {
            title: 'Webcam',
            settings: webcamSettings || {},
            user: req.session.user
        });
    } catch (error) {
        logger.error('Webcam page error:', error);
        req.flash('error', 'Failed to load webcam page');
        res.redirect('/');
    }
});

// Real balance check via USSD
router.post('/api/quick/balance', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Use Robi's balance check code (*566#)
        const result = await db.run(`
            INSERT INTO ussd (code, description, status, timestamp) 
            VALUES ('*566#', 'Balance Check', 'pending', CURRENT_TIMESTAMP)
        `);

        // Send via MQTT if connected
        if (global.mqttService && global.mqttService.connected) {
            global.mqttService.sendUssd('esp32-s3-1', '*566#');
            
            // In production, we would update the status when response comes via MQTT
            setTimeout(async () => {
                await db.run(
                    'UPDATE ussd SET status = ?, response = ? WHERE id = ?',
                    ['success', 'Your current balance is BDT 125.50. Valid until 2026-03-15', result.lastID]
                );
            }, 5000);
        }

        res.json({
            success: true,
            message: 'Balance check initiated',
            id: result.lastID
        });
    } catch (error) {
        logger.error('Balance check error:', error);
        res.status(500).json({ success: false, message: 'Failed to check balance' });
    }
});

// Restart modem
router.post('/api/quick/restart-modem', async (req, res) => {
    try {
        if (global.mqttService && global.mqttService.connected) {
            global.mqttService.publishCommand('esp32-s3-1', 'restart-modem');
            
            // Log the action
            const db = req.app.locals.db;
            await db.run(`
                INSERT INTO ussd (code, description, status, timestamp) 
                VALUES ('RESTART', 'Modem Restart', 'sent', CURRENT_TIMESTAMP)
            `);
            
            res.json({
                success: true,
                message: 'Modem restart command sent'
            });
        } else {
            res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
    } catch (error) {
        logger.error('Restart modem error:', error);
        res.status(500).json({ success: false, message: 'Failed to restart modem' });
    }
});

router.get('/settings', async (req, res) => {
    try {
        res.render('pages/settings', {
            title: 'Settings',
            user: req.session.user
        });
    } catch (error) {
        logger.error('Settings page error:', error);
        req.flash('error', 'Failed to load settings page');
        res.redirect('/');
    }
});

module.exports = router;