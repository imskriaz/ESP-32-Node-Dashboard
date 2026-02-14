const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// USSD Service State
let ussdState = {
    sessionActive: false,
    currentCode: null,
    currentResponse: null,
    lastRequest: null,
    menuLevel: 0,
    sessionId: null,
    menuStack: [] // For multi-level menus
};

// Mock database for menu responses (in production, this would be in SQLite)
const menuResponses = {
    'main': `Welcome to USSD Menu
1. Check Balance
2. Data Balance
3. Special Offers
4. Customer Care
0. Exit`,

    'balance': `Your current balance is $25.50
1. Check again
2. Main Menu
0. Exit`,

    'data': `Data balance: 2.3GB remaining
1. Buy more data
2. Main Menu
0. Exit`,

    'offers': `Special Offers:
1. 5GB for $10
2. Unlimited calls for $20
3. 1000 SMS for $5
4. Main Menu
0. Exit`,

    'offers_1': `You have subscribed to 5GB for $10.
Valid for 30 days.
1. Main Menu
0. Exit`,

    'offers_2': `You have subscribed to Unlimited calls for $20.
Valid for 30 days.
1. Main Menu
0. Exit`,

    'offers_3': `You have subscribed to 1000 SMS for $5.
Valid for 30 days.
1. Main Menu
0. Exit`,

    'customer': `Customer Care: Please hold for an operator.
1. Call now
2. Main Menu
0. Exit`
};

// ==================== USSD HISTORY ====================

// Get all USSD history
router.get('/history', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const history = await db.all(`
            SELECT * FROM ussd 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const total = await db.get('SELECT COUNT(*) as count FROM ussd');

        res.json({
            success: true,
            data: history,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        logger.error('API USSD history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch USSD history'
        });
    }
});

// Send USSD request
router.post('/send', [
    body('code').notEmpty().withMessage('USSD code is required')
        .matches(/^[*#0-9]+$/).withMessage('Invalid USSD code format'),
    body('description').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { code, description } = req.body;
        const db = req.app.locals.db;

        // Determine response based on code
        let response = '';
        let menuLevel = 0;
        let menuState = 'main';

        // Main menu codes
        if (code === '*123#' || code === '*456#' || code === '*789#') {
            response = menuResponses.main;
            menuLevel = 1;
            menuState = 'main';
        }
        // Balance check
        else if (code === '*123*1#' || code === '*124#') {
            response = menuResponses.balance;
            menuLevel = 1;
            menuState = 'balance';
        }
        // Data balance
        else if (code === '*123*2#' || code === '*125#') {
            response = menuResponses.data;
            menuLevel = 1;
            menuState = 'data';
        }
        // Special offers
        else if (code === '*123*3#' || code === '*500#') {
            response = menuResponses.offers;
            menuLevel = 1;
            menuState = 'offers';
        }
        // Customer care
        else if (code === '*123*4#' || code === '611' || code === '121') {
            response = menuResponses.customer;
            menuLevel = 1;
            menuState = 'customer';
        }
        // Generic response
        else {
            response = `USSD Response for ${code}:
Your request has been processed successfully.
Thank you for using our service.`;
            menuLevel = 0;
        }

        // Update session state
        ussdState = {
            sessionActive: menuLevel > 0,
            currentCode: code,
            currentResponse: response,
            lastRequest: new Date(),
            menuLevel: menuLevel,
            sessionId: Date.now().toString(),
            menuState: menuState,
            menuStack: menuLevel > 0 ? [menuState] : []
        };

        // Save to database
        const result = await db.run(`
            INSERT INTO ussd (code, description, response, status, timestamp) 
            VALUES (?, ?, ?, 'success', CURRENT_TIMESTAMP)
        `, [code, description || 'USSD Request', response]);

        logger.info(`USSD request sent: ${code}`);

        // Emit socket event
        if (req.io) {
            req.io.emit('ussd:response', {
                id: result.lastID,
                code,
                response,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'USSD request processed',
            data: {
                id: result.lastID,
                code,
                response,
                sessionId: ussdState.sessionId,
                menuLevel: ussdState.menuLevel,
                menuState: ussdState.menuState
            }
        });
    } catch (error) {
        logger.error('API USSD send error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send USSD request'
        });
    }
});

// Send USSD response (for menu navigation)
router.post('/respond', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('choice').notEmpty().withMessage('Choice is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, choice } = req.body;

        // Validate session
        if (!ussdState.sessionActive || ussdState.sessionId !== sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        let response = '';
        let sessionEnded = false;
        let newMenuState = ussdState.menuState;

        // Handle menu navigation based on current state
        if (choice === '0') {
            response = 'Thank you for using our service. Goodbye.';
            sessionEnded = true;
        }
        else if (ussdState.menuState === 'main') {
            switch(choice) {
                case '1':
                    response = menuResponses.balance;
                    newMenuState = 'balance';
                    ussdState.menuStack.push('balance');
                    break;
                case '2':
                    response = menuResponses.data;
                    newMenuState = 'data';
                    ussdState.menuStack.push('data');
                    break;
                case '3':
                    response = menuResponses.offers;
                    newMenuState = 'offers';
                    ussdState.menuStack.push('offers');
                    break;
                case '4':
                    response = menuResponses.customer;
                    newMenuState = 'customer';
                    ussdState.menuStack.push('customer');
                    break;
                default:
                    response = 'Invalid choice. Please try again.\n' + menuResponses.main;
            }
        }
        else if (ussdState.menuState === 'offers') {
            if (choice === '1') {
                response = menuResponses.offers_1;
                newMenuState = 'offers_1';
            } else if (choice === '2') {
                response = menuResponses.offers_2;
                newMenuState = 'offers_2';
            } else if (choice === '3') {
                response = menuResponses.offers_3;
                newMenuState = 'offers_3';
            } else if (choice === '4') {
                response = menuResponses.main;
                newMenuState = 'main';
                ussdState.menuStack.pop();
            } else {
                response = 'Invalid choice. Please try again.\n' + menuResponses.offers;
            }
        }
        else if (ussdState.menuState === 'balance' || ussdState.menuState === 'data' || ussdState.menuState === 'customer') {
            if (choice === '1') {
                // Go back to same screen (refresh)
                response = ussdState.menuState === 'balance' ? menuResponses.balance :
                          ussdState.menuState === 'data' ? menuResponses.data :
                          menuResponses.customer;
            } else if (choice === '2') {
                response = menuResponses.main;
                newMenuState = 'main';
                ussdState.menuStack.pop();
            } else {
                response = 'Invalid choice. Please try again.\n' + 
                          (ussdState.menuState === 'balance' ? menuResponses.balance :
                           ussdState.menuState === 'data' ? menuResponses.data :
                           menuResponses.customer);
            }
        }
        else if (ussdState.menuState.startsWith('offers_')) {
            if (choice === '1') {
                response = menuResponses.main;
                newMenuState = 'main';
                ussdState.menuStack = ['main'];
            } else {
                response = 'Invalid choice. Please try again.\n' + 
                          (ussdState.menuState === 'offers_1' ? menuResponses.offers_1 :
                           ussdState.menuState === 'offers_2' ? menuResponses.offers_2 :
                           menuResponses.offers_3);
            }
        }

        // Update session state
        ussdState.currentResponse = response;
        ussdState.menuState = newMenuState;
        
        if (sessionEnded) {
            ussdState.sessionActive = false;
            ussdState.currentCode = null;
            ussdState.menuLevel = 0;
            ussdState.menuStack = [];
        }

        res.json({
            success: true,
            data: {
                response,
                sessionEnded
            }
        });
    } catch (error) {
        logger.error('API USSD respond error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process USSD response'
        });
    }
});

// Get USSD session status
router.get('/session', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                active: ussdState.sessionActive,
                currentCode: ussdState.currentCode,
                lastRequest: ussdState.lastRequest,
                menuLevel: ussdState.menuLevel,
                sessionId: ussdState.sessionId,
                menuState: ussdState.menuState
            }
        });
    } catch (error) {
        logger.error('API USSD session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session status'
        });
    }
});

// End USSD session
router.post('/session/end', (req, res) => {
    try {
        ussdState.sessionActive = false;
        ussdState.currentCode = null;
        ussdState.currentResponse = null;
        ussdState.menuLevel = 0;
        ussdState.sessionId = null;
        ussdState.menuState = null;
        ussdState.menuStack = [];

        res.json({
            success: true,
            message: 'USSD session ended'
        });
    } catch (error) {
        logger.error('API USSD end session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end USSD session'
        });
    }
});

// Delete USSD history entry
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;

        const result = await db.run('DELETE FROM ussd WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'USSD entry not found'
            });
        }

        res.json({
            success: true,
            message: 'USSD history deleted'
        });
    } catch (error) {
        logger.error('API USSD delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete USSD history'
        });
    }
});

// Clear all USSD history
router.delete('/history', async (req, res) => {
    try {
        const db = req.app.locals.db;
        await db.run('DELETE FROM ussd');

        res.json({
            success: true,
            message: 'All USSD history cleared'
        });
    } catch (error) {
        logger.error('API USSD clear error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear USSD history'
        });
    }
});

// ==================== USSD SETTINGS MANAGEMENT ====================

// Get all USSD settings
router.get('/settings', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        const settings = await db.all(`
            SELECT * FROM ussd_settings 
            ORDER BY sort_order ASC
        `);

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('API USSD settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch USSD settings'
        });
    }
});

// Get enabled USSD settings
router.get('/settings/enabled', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        const settings = await db.all(`
            SELECT * FROM ussd_settings 
            WHERE enabled = 1 
            ORDER BY sort_order ASC
        `);

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('API USSD enabled settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch enabled USSD settings'
        });
    }
});

// Update USSD setting
router.put('/settings/:key', [
    body('service_name').optional().notEmpty(),
    body('ussd_code').optional().notEmpty().matches(/^[*#0-9]+$/),
    body('description').optional(),
    body('icon').optional(),
    body('enabled').optional().isBoolean(),
    body('sort_order').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { key } = req.params;
        const { service_name, ussd_code, description, icon, enabled, sort_order } = req.body;
        const db = req.app.locals.db;

        // Build update query
        let updates = [];
        let params = [];

        if (service_name !== undefined) {
            updates.push('service_name = ?');
            params.push(service_name);
        }
        if (ussd_code !== undefined) {
            updates.push('ussd_code = ?');
            params.push(ussd_code);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (icon !== undefined) {
            updates.push('icon = ?');
            params.push(icon);
        }
        if (enabled !== undefined) {
            updates.push('enabled = ?');
            params.push(enabled ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(key);
        await db.run(`
            UPDATE ussd_settings 
            SET ${updates.join(', ')}
            WHERE service_key = ?
        `, params);

        logger.info(`USSD setting updated: ${key}`);

        const updated = await db.get('SELECT * FROM ussd_settings WHERE service_key = ?', [key]);

        // Emit socket event
        if (req.io) {
            req.io.emit('ussd:settings-updated', updated);
        }

        res.json({
            success: true,
            message: 'USSD setting updated successfully',
            data: updated
        });
    } catch (error) {
        logger.error('API USSD settings update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update USSD setting'
        });
    }
});

// Create new USSD setting
router.post('/settings', [
    body('service_key').notEmpty().withMessage('Service key is required')
        .matches(/^[a-z0-9-]+$/).withMessage('Service key must be lowercase letters, numbers, and hyphens only'),
    body('service_name').notEmpty().withMessage('Service name is required'),
    body('ussd_code').notEmpty().withMessage('USSD code is required')
        .matches(/^[*#0-9]+$/).withMessage('Invalid USSD code format'),
    body('description').optional(),
    body('icon').optional(),
    body('enabled').optional().isBoolean(),
    body('sort_order').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { service_key, service_name, ussd_code, description, icon, enabled, sort_order } = req.body;
        const db = req.app.locals.db;

        // Check if key already exists
        const existing = await db.get('SELECT id FROM ussd_settings WHERE service_key = ?', [service_key]);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Service key already exists'
            });
        }

        // Get max sort order
        const maxOrder = await db.get('SELECT MAX(sort_order) as max FROM ussd_settings');
        const newSortOrder = sort_order !== undefined ? sort_order : ((maxOrder.max || 0) + 1);

        await db.run(`
            INSERT INTO ussd_settings (service_key, service_name, ussd_code, description, icon, enabled, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [service_key, service_name, ussd_code, description || null, icon || 'question', enabled ? 1 : 0, newSortOrder]);

        logger.info(`New USSD setting created: ${service_key}`);

        const newSetting = await db.get('SELECT * FROM ussd_settings WHERE service_key = ?', [service_key]);

        // Emit socket event
        if (req.io) {
            req.io.emit('ussd:settings-created', newSetting);
        }

        res.json({
            success: true,
            message: 'USSD setting created successfully',
            data: newSetting
        });
    } catch (error) {
        logger.error('API USSD settings create error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create USSD setting'
        });
    }
});

// Delete USSD setting
router.delete('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const db = req.app.locals.db;

        const result = await db.run('DELETE FROM ussd_settings WHERE service_key = ?', [key]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'USSD setting not found'
            });
        }

        logger.info(`USSD setting deleted: ${key}`);

        // Emit socket event
        if (req.io) {
            req.io.emit('ussd:settings-deleted', { key });
        }

        res.json({
            success: true,
            message: 'USSD setting deleted successfully'
        });
    } catch (error) {
        logger.error('API USSD settings delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete USSD setting'
        });
    }
});

// Reorder settings
router.post('/settings/reorder', [
    body('order').isArray().withMessage('Order must be an array')
], async (req, res) => {
    try {
        const { order } = req.body;
        const db = req.app.locals.db;

        // Update sort order for each item
        for (let i = 0; i < order.length; i++) {
            await db.run(
                'UPDATE ussd_settings SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE service_key = ?',
                [i, order[i]]
            );
        }

        logger.info('USSD settings reordered');

        // Get updated settings
        const settings = await db.all('SELECT * FROM ussd_settings ORDER BY sort_order ASC');

        // Emit socket event
        if (req.io) {
            req.io.emit('ussd:settings-reordered', settings);
        }

        res.json({
            success: true,
            message: 'Settings reordered successfully',
            data: settings
        });
    } catch (error) {
        logger.error('API USSD reorder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder settings'
        });
    }
});

module.exports = router;