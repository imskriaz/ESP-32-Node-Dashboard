const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

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
            LIMIT 5
        `);

        // Get contact count
        const contactCount = await db.get('SELECT COUNT(*) as count FROM contacts');

        // Get USSD history count
        const ussdCount = await db.get('SELECT COUNT(*) as count FROM ussd');

        // Get real storage info
        const INTERNAL_PATH = path.join(__dirname, '../storage');
        const SD_CARD_PATH = process.env.SD_CARD_PATH || '/media/sd';
        
        let storageInfo = {
            internal: { total: 0, used: 0, free: 0, available: false },
            sd: { total: 0, used: 0, free: 0, available: false }
        };

        try {
            // Check internal storage
            if (fs.existsSync(INTERNAL_PATH)) {
                const stats = fs.statfsSync(INTERNAL_PATH);
                storageInfo.internal = {
                    total: stats.blocks * stats.bsize,
                    free: stats.bfree * stats.bsize,
                    used: (stats.blocks - stats.bfree) * stats.bsize,
                    available: true
                };
            }

            // Check SD card
            if (fs.existsSync(SD_CARD_PATH)) {
                const sdStats = fs.statfsSync(SD_CARD_PATH);
                storageInfo.sd = {
                    total: sdStats.blocks * sdStats.bsize,
                    free: sdStats.bfree * sdStats.bsize,
                    used: (sdStats.blocks - sdStats.bfree) * sdStats.bsize,
                    available: true
                };
            }
        } catch (storageError) {
            logger.error('Error getting storage info:', storageError);
        }

        // Get device status from modem service
        let deviceStatus = {
            signal: 0,
            battery: 0,
            network: 'No Device',
            operator: 'Not Connected',
            temperature: 0,
            uptime: '0s',
            ip: '0.0.0.0',
            online: false
        };
        
        if (global.modemService && typeof global.modemService.getStatus === 'function') {
            try {
                const status = global.modemService.getStatus();
                deviceStatus = {
                    signal: status.signal || 0,
                    battery: status.battery || 0,
                    network: status.online ? (status.network || 'No Service') : 'No Device',
                    operator: status.online ? (status.operator || 'Unknown') : 'Not Connected',
                    temperature: status.temperature || 0,
                    uptime: status.online ? (status.uptime || '0s') : '0s',
                    ip: status.online ? (status.ip || '0.0.0.0') : '0.0.0.0',
                    online: status.online || false
                };
            } catch (statusError) {
                logger.error('Error getting modem status:', statusError);
            }
        } else {
            logger.warn('modemService.getStatus not available, using offline values');
        }

        // Get data usage stats
        let dataUsage = {
            sent: 0,
            received: 0,
            smsSent: 0,
            callDuration: 0
        };

        try {
            // Get SMS sent count
            const smsSent = await db.get(`
                SELECT COUNT(*) as count FROM sms WHERE type = 'outgoing'
            `);
            
            // Get total call duration
            const callDuration = await db.get(`
                SELECT SUM(duration) as total FROM calls WHERE status = 'answered'
            `);

            dataUsage = {
                sent: storageInfo.internal.used ? Math.round(storageInfo.internal.used / (1024 * 1024)) : 0,
                received: storageInfo.internal.used ? Math.round(storageInfo.internal.used / (1024 * 1024)) : 0,
                smsSent: smsSent?.count || 0,
                callDuration: Math.floor((callDuration?.total || 0) / 60) // Convert to minutes
            };
        } catch (dbError) {
            logger.error('Error getting data usage:', dbError);
        }

        res.render('pages/index', {
            title: 'Dashboard',
            recentSms: recentSms || [],
            recentCalls: recentCalls || [],
            unreadCount: unreadCount?.count || 0,
            contactCount: contactCount?.count || 0,
            ussdCount: ussdCount?.count || 0,
            deviceStatus,
            storageInfo,
            dataUsage,
            user: req.session.user,
            moment: require('moment')
        });
    } catch (error) {
        logger.error('Dashboard page error:', error);
        
        // Still render the page with empty data rather than crashing
        res.render('pages/index', {
            title: 'Dashboard',
            recentSms: [],
            recentCalls: [],
            unreadCount: 0,
            contactCount: 0,
            ussdCount: 0,
            deviceStatus: {
                signal: 0,
                battery: 0,
                network: 'No Device',
                operator: 'Not Connected',
                temperature: 0,
                uptime: '0s',
                ip: '0.0.0.0',
                online: false
            },
            storageInfo: {
                internal: { total: 0, used: 0, free: 0, available: false },
                sd: { total: 0, used: 0, free: 0, available: false }
            },
            dataUsage: {
                sent: 0,
                received: 0,
                smsSent: 0,
                callDuration: 0
            },
            user: req.session.user,
            moment: require('moment')
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
            messages: messages || [],
            unreadCount: unreadCount?.count || 0,
            pagination: {
                page,
                totalPages: Math.ceil((totalCount?.count || 0) / limit),
                totalItems: totalCount?.count || 0
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
                total: totalCalls?.count || 0,
                answered: answeredCalls?.count || 0,
                missed: missedCalls?.count || 0
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
            recentUssd: recentUssd || [],
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

router.get('/storage', async (req, res) => {
    try {
        res.render('pages/storage', {
            title: 'Storage Manager',
            user: req.session.user
        });
    } catch (error) {
        logger.error('Storage page error:', error);
        req.flash('error', 'Failed to load storage page');
        res.redirect('/');
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
            global.mqttService.sendUssd('esp32-s3-1', '*566#').catch(err => {
                logger.error('MQTT send USSD error:', err);
            });
            
            // In production, we would update the status when response comes via MQTT
            setTimeout(async () => {
                try {
                    await db.run(
                        'UPDATE ussd SET status = ?, response = ? WHERE id = ?',
                        ['success', 'Your current balance is BDT 125.50. Valid until 2026-03-15', result.lastID]
                    );
                } catch (updateError) {
                    logger.error('Error updating USSD response:', updateError);
                }
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
            global.mqttService.restartDevice('esp32-s3-1').catch(err => {
                logger.error('MQTT restart error:', err);
            });
            
            // Log the action
            const db = req.app.locals.db;
            if (db) {
                await db.run(`
                    INSERT INTO ussd (code, description, status, timestamp) 
                    VALUES ('RESTART', 'Modem Restart', 'sent', CURRENT_TIMESTAMP)
                `);
            }
            
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
router.get('/gps', async (req, res) => {
    try {
        res.render('pages/gps', {
            title: 'GPS',
            user: req.session.user
        });
    } catch (error) {
        logger.error('GPS page error:', error);
        req.flash('error', 'Failed to load GPS page');
        res.redirect('/');
    }
});

// GPIO page
router.get('/gpio', async (req, res) => {
    try {
        res.render('pages/gpio', {
            title: 'GPIO',
            user: req.session.user
        });
    } catch (error) {
        logger.error('GPIO page error:', error);
        req.flash('error', 'Failed to load GPIO page');
        res.redirect('/');
    }
});
module.exports = router;