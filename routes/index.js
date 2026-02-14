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

        // Mock device status data
        const deviceStatus = {
            signal: Math.floor(Math.random() * 31) + 70, // 70-100%
            battery: Math.floor(Math.random() * 41) + 60, // 60-100%
            network: '4G LTE',
            storage: Math.floor(Math.random() * 31) + 60, // 60-90%
            temperature: Math.floor(Math.random() * 15) + 35, // 35-50°C
            uptime: '3d 4h 23m',
            lastUpdate: new Date().toISOString()
        };

        res.render('pages/index', {
            title: 'Dashboard',
            recentSms,
            unreadCount: unreadCount.count,
            deviceStatus,
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
        res.render('pages/calls', {
            title: 'Call Management',
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
        res.render('pages/webcam', {
            title: 'Webcam',
            user: req.session.user
        });
    } catch (error) {
        logger.error('Webcam page error:', error);
        req.flash('error', 'Failed to load webcam page');
        res.redirect('/');
    }
});
module.exports = router;