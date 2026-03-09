const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Get call logs
router.get('/logs', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM calls');

        // Get calls with contact information
        const calls = await db.all(`
            SELECT 
                c.*,
                COALESCE(
                    (SELECT name FROM contacts WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                            SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                        OR REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '') LIKE '%' || REPLACE(REPLACE(phone_number, '+', ''), ' ', '') || '%'
                        OR REPLACE(REPLACE(phone_number, '+', ''), ' ', '') LIKE '%' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '') || '%'
                    LIMIT 1
                ), 
                CASE 
                    WHEN c.type = 'incoming' THEN 'Incoming Call'
                    WHEN c.type = 'outgoing' THEN 'Outgoing Call'
                    ELSE 'Unknown'
                END
                ) as contact_name,
                COALESCE(
                    (SELECT company FROM contacts WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                            SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                    LIMIT 1
                ), ''
                ) as contact_company
            FROM calls c
            ORDER BY start_time DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        res.json({
            success: true,
            data: calls,
            pagination: {
                page,
                limit,
                total: totalCount.count,
                pages: Math.ceil(totalCount.count / limit)
            }
        });
    } catch (error) {
        logger.error('API call logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch call logs: ' + error.message
        });
    }
});

// Get call stats
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const total = await db.get('SELECT COUNT(*) as count FROM calls');
        const answered = await db.get("SELECT COUNT(*) as count FROM calls WHERE status = 'answered'");
        const missed = await db.get("SELECT COUNT(*) as count FROM calls WHERE status = 'missed'");
        const outgoing = await db.get("SELECT COUNT(*) as count FROM calls WHERE type = 'outgoing'");
        const incoming = await db.get("SELECT COUNT(*) as count FROM calls WHERE type = 'incoming'");

        res.json({
            success: true,
            data: {
                total: total.count,
                answered: answered.count,
                missed: missed.count,
                outgoing: outgoing.count,
                incoming: incoming.count
            }
        });
    } catch (error) {
        logger.error('API call stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch call stats: ' + error.message
        });
    }
});

// Get recent calls for dashboard
router.get('/recent', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const limit = parseInt(req.query.limit) || 5;

        const calls = await db.all(`
            SELECT 
                c.*,
                COALESCE(
                    (SELECT name FROM contacts WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                    LIMIT 1
                ), 
                SUBSTR(c.phone_number, -10)
                ) as contact_name
            FROM calls c
            ORDER BY start_time DESC 
            LIMIT ?
        `, [limit]);

        res.json({
            success: true,
            data: calls
        });
    } catch (error) {
        logger.error('API recent calls error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent calls: ' + error.message
        });
    }
});

// Get single call
router.get('/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const call = await db.get(`
            SELECT 
                c.*,
                (SELECT name FROM contacts WHERE 
                    REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                LIMIT 1) as contact_name,
                (SELECT company FROM contacts WHERE 
                    REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                LIMIT 1) as contact_company
            FROM calls c
            WHERE c.id = ?
        `, [id]);

        if (!call) {
            return res.status(404).json({
                success: false,
                message: 'Call not found'
            });
        }

        res.json({
            success: true,
            data: call
        });
    } catch (error) {
        logger.error('API get call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch call: ' + error.message
        });
    }
});

// Make a call
router.post('/dial', [
    body('number').notEmpty().withMessage('Phone number is required')
        .matches(/^\+?[\d\s-]{10,}$/).withMessage('Invalid phone number format')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { number } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }
        
        // Format number
        let formattedNumber = number;
        try {
            const digits = number.replace(/\D/g, '');
            if (digits.length === 10) {
                formattedNumber = '+88' + digits;
            } else if (digits.length === 11 && digits.startsWith('0')) {
                formattedNumber = '+88' + digits.substring(1);
            } else if (digits.length === 13 && digits.startsWith('88')) {
                formattedNumber = '+' + digits;
            } else {
                formattedNumber = '+' + digits;
            }
        } catch (formatError) {
            logger.error('Number formatting error:', formatError);
            formattedNumber = number;
        }

        // Save initial call record
        const result = await db.run(`
            INSERT INTO calls (phone_number, type, status, start_time) 
            VALUES (?, 'outgoing', 'dialing', CURRENT_TIMESTAMP)
        `, [formattedNumber]);

        // Send via MQTT if connected
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.makeCall('esp32-s3-1', formattedNumber);
            } catch (mqttError) {
                logger.error('MQTT error making call:', mqttError);
            }
        }

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('call:started', {
                    id: result.lastID,
                    number: formattedNumber,
                    status: 'dialing'
                });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'Call initiated',
            callId: result.lastID,
            number: formattedNumber
        });
    } catch (error) {
        logger.error('API dial call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate call: ' + error.message
        });
    }
});

// End current call
router.post('/end', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }
        
        // Send command via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'end-call', {});
            } catch (mqttError) {
                logger.error('MQTT error ending call:', mqttError);
            }
        }
        
        // Update the most recent active call
        const result = await db.run(`
            UPDATE calls 
            SET status = 'ended', 
                end_time = CURRENT_TIMESTAMP,
                duration = CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER)
            WHERE status IN ('dialing', 'ringing', 'connected', 'answered')
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (result.changes > 0) {
            logger.info('Call ended');
            
            try {
                if (req.io) {
                    req.io.emit('call:ended', { status: 'ended' });
                }
            } catch (socketError) {
                logger.error('Error emitting socket event:', socketError);
            }
        }

        res.json({
            success: true,
            message: 'Call ended'
        });
    } catch (error) {
        logger.error('API end call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end call: ' + error.message
        });
    }
});

// Get current call status
router.get('/status', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }
        
        // Check if there's an active call
        const activeCall = await db.get(`
            SELECT * FROM calls 
            WHERE status IN ('dialing', 'ringing', 'connected', 'answered')
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (activeCall) {
            const duration = activeCall.status === 'connected' || activeCall.status === 'answered' ? 
                Math.floor((new Date() - new Date(activeCall.start_time)) / 1000) : 0;
            
            res.json({
                success: true,
                data: {
                    active: true,
                    id: activeCall.id,
                    number: activeCall.phone_number,
                    status: activeCall.status,
                    startTime: activeCall.start_time,
                    duration
                }
            });
        } else {
            res.json({
                success: true,
                data: { active: false }
            });
        }
    } catch (error) {
        logger.error('API call status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get call status: ' + error.message
        });
    }
});

// Delete call log
router.delete('/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.run('DELETE FROM calls WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Call log not found'
            });
        }

        logger.info(`Call log deleted: ${id}`);
        
        try {
            if (req.io) {
                req.io.emit('call:log-deleted', { id });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'Call log deleted successfully'
        });
    } catch (error) {
        logger.error('API delete call log error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete call log: ' + error.message
        });
    }
});

// Update call notes
router.patch('/logs/:id/notes', [
    body('notes').optional()
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
        const { notes } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        await db.run(
            'UPDATE calls SET notes = ? WHERE id = ?',
            [notes || null, id]
        );

        res.json({
            success: true,
            message: 'Call notes updated'
        });
    } catch (error) {
        logger.error('API update call notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update call notes: ' + error.message
        });
    }
});

// Toggle call hold
router.post('/hold', [
    body('hold').isBoolean()
], async (req, res) => {
    try {
        const { hold } = req.body;
        
        // Send command via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'hold-call', { hold });
            } catch (mqttError) {
                logger.error('MQTT error toggling hold:', mqttError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send hold command: ' + mqttError.message
                });
            }
        } else {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        logger.info(`Call ${hold ? 'held' : 'resumed'}`);
        
        try {
            if (req.io) {
                req.io.emit('call:hold', { onHold: hold });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }
        
        res.json({
            success: true,
            message: hold ? 'Call on hold' : 'Call resumed'
        });
    } catch (error) {
        logger.error('API hold call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle hold: ' + error.message
        });
    }
});

// Mute call
router.post('/mute', [
    body('mute').isBoolean()
], async (req, res) => {
    try {
        const { mute } = req.body;
        
        // Send command via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'mute-call', { mute });
            } catch (mqttError) {
                logger.error('MQTT error toggling mute:', mqttError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send mute command: ' + mqttError.message
                });
            }
        } else {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        res.json({
            success: true,
            message: mute ? 'Call muted' : 'Call unmuted'
        });
    } catch (error) {
        logger.error('API mute call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle mute: ' + error.message
        });
    }
});

module.exports = router;