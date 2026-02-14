const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Get all SMS with pagination
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const messages = await db.all(`
            SELECT * FROM sms 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const total = await db.get('SELECT COUNT(*) as count FROM sms');

        res.json({
            success: true,
            data: messages,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        logger.error('API SMS list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch SMS messages: ' + error.message
        });
    }
});

// Get unread SMS count
router.get('/unread', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.get(`
            SELECT COUNT(*) as count FROM sms 
            WHERE read = 0 AND type = 'incoming'
        `);

        res.json({
            success: true,
            count: result.count
        });
    } catch (error) {
        logger.error('API unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch unread count: ' + error.message
        });
    }
});

// Send SMS
router.post('/send', [
    body('to').notEmpty().withMessage('Phone number is required')
        .matches(/^\+?[\d\s-]{10,}$/).withMessage('Invalid phone number format'),
    body('message').notEmpty().withMessage('Message is required')
        .isLength({ max: 160 }).withMessage('Message must be less than 160 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { to, message } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        // Format phone number
        let formattedNumber = to;
        if (!to.startsWith('+')) {
            try {
                const digits = to.replace(/\D/g, '');
                if (digits.length === 10) {
                    formattedNumber = '+88' + digits;
                } else if (digits.length === 11 && digits.startsWith('0')) {
                    formattedNumber = '+88' + digits.substring(1);
                } else {
                    formattedNumber = '+' + digits;
                }
            } catch (formatError) {
                logger.error('Phone number formatting error:', formatError);
                formattedNumber = to;
            }
        }

        logger.info(`Sending SMS to ${formattedNumber}`);

        // Save to database
        const result = await db.run(`
            INSERT INTO sms (from_number, to_number, message, type, status, timestamp) 
            VALUES (?, ?, ?, 'outgoing', 'sending', CURRENT_TIMESTAMP)
        `, [formattedNumber, formattedNumber, message]);

        // Send via MQTT if connected
        if (global.mqttService && global.mqttService.connected) {
            try {
                const mqttResult = await global.mqttService.sendSms('esp32-s3-1', formattedNumber, message);
                
                if (mqttResult.success) {
                    await db.run(
                        'UPDATE sms SET status = ? WHERE id = ?',
                        ['sent', result.lastID]
                    );
                } else {
                    await db.run(
                        'UPDATE sms SET status = ?, error = ? WHERE id = ?',
                        ['failed', mqttResult.error || 'MQTT error', result.lastID]
                    );
                }
            } catch (mqttError) {
                logger.error('MQTT error sending SMS:', mqttError);
                await db.run(
                    'UPDATE sms SET status = ?, error = ? WHERE id = ?',
                    ['failed', mqttError.message, result.lastID]
                );
            }
        }

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('sms:sent', {
                    id: result.lastID,
                    to: formattedNumber,
                    message,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'SMS sent',
            id: result.lastID,
            to: formattedNumber
        });
    } catch (error) {
        logger.error('API send SMS error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS: ' + error.message
        });
    }
});

// Delete SMS
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.run('DELETE FROM sms WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'SMS not found'
            });
        }

        logger.info(`SMS deleted: ${id}`);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('sms:deleted', { id });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'SMS deleted successfully'
        });
    } catch (error) {
        logger.error('API delete SMS error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete SMS: ' + error.message
        });
    }
});

// Mark SMS as read
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.run(
            'UPDATE sms SET read = 1 WHERE id = ? AND read = 0',
            [id]
        );

        if (result.changes > 0) {
            logger.info(`SMS marked as read: ${id}`);
            
            // Get updated unread count
            try {
                const unreadCount = await db.get(`
                    SELECT COUNT(*) as count FROM sms 
                    WHERE read = 0 AND type = 'incoming'
                `);

                // Emit socket event
                if (req.io) {
                    req.io.emit('sms:read', { 
                        id,
                        unreadCount: unreadCount.count
                    });
                }
            } catch (countError) {
                logger.error('Error getting unread count:', countError);
            }
        }

        res.json({
            success: true,
            message: 'SMS marked as read'
        });
    } catch (error) {
        logger.error('API mark read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark SMS as read: ' + error.message
        });
    }
});

// Get single SMS
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const sms = await db.get('SELECT * FROM sms WHERE id = ?', [id]);

        if (!sms) {
            return res.status(404).json({
                success: false,
                message: 'SMS not found'
            });
        }

        res.json({
            success: true,
            data: sms
        });
    } catch (error) {
        logger.error('API get SMS error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch SMS: ' + error.message
        });
    }
});

// Bulk delete SMS
router.post('/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No SMS IDs provided'
            });
        }

        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const placeholders = ids.map(() => '?').join(',');
        
        const result = await db.run(
            `DELETE FROM sms WHERE id IN (${placeholders})`,
            ids
        );

        logger.info(`Bulk deleted ${result.changes} SMS messages`);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('sms:bulk-deleted', { count: result.changes });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: `Successfully deleted ${result.changes} messages`,
            deleted: result.changes
        });
    } catch (error) {
        logger.error('API bulk delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete messages: ' + error.message
        });
    }
});

// Mark multiple SMS as read
router.post('/bulk-read', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No SMS IDs provided'
            });
        }

        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const placeholders = ids.map(() => '?').join(',');
        
        const result = await db.run(
            `UPDATE sms SET read = 1 WHERE id IN (${placeholders}) AND read = 0`,
            ids
        );

        // Get updated unread count
        let unreadCount = { count: 0 };
        try {
            unreadCount = await db.get(`
                SELECT COUNT(*) as count FROM sms 
                WHERE read = 0 AND type = 'incoming'
            `);
        } catch (countError) {
            logger.error('Error getting unread count:', countError);
        }

        logger.info(`Marked ${result.changes} SMS as read`);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('sms:bulk-read', { 
                    count: result.changes,
                    unreadCount: unreadCount.count
                });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: `Marked ${result.changes} messages as read`,
            marked: result.changes,
            unreadCount: unreadCount.count
        });
    } catch (error) {
        logger.error('API bulk read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read: ' + error.message
        });
    }
});

module.exports = router;