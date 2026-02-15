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
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // FIXED: Better query to get contact names
        const calls = await db.all(`
            SELECT 
                c.*,
                (
                    SELECT name FROM contacts 
                    WHERE 
                        -- Try exact match first
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR
                        -- Then try matching last 10 digits
                        SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                        SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                        OR
                        -- Then try contains
                        REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '') LIKE '%' || REPLACE(REPLACE(phone_number, '+', ''), ' ', '') || '%'
                        OR
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') LIKE '%' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '') || '%'
                    LIMIT 1
                ) as contact_name,
                (
                    SELECT company FROM contacts 
                    WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR
                        SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                        SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                    LIMIT 1
                ) as contact_company
            FROM calls c
            ORDER BY start_time DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const total = await db.get('SELECT COUNT(*) as count FROM calls');

        res.json({
            success: true,
            data: calls,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
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

// Get recent calls
router.get('/recent', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const limit = parseInt(req.query.limit) || 10;

        const calls = await db.all(`
            SELECT 
                c.*,
                (
                    SELECT name FROM contacts 
                    WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR
                        SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                        SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                    LIMIT 1
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
                (
                    SELECT name FROM contacts 
                    WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                        OR
                        SUBSTR('0000000000' || REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), -10) = 
                        SUBSTR('0000000000' || REPLACE(REPLACE(c.phone_number, '+', ''), ' ', ''), -10)
                    LIMIT 1
                ) as contact_name,
                (
                    SELECT company FROM contacts 
                    WHERE 
                        REPLACE(REPLACE(phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.phone_number, '+', ''), ' ', '')
                    LIMIT 1
                ) as contact_company
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
            formattedNumber = number.startsWith('+') ? number : '+88' + number.replace(/\D/g, '');
        } catch (formatError) {
            logger.error('Number formatting error:', formatError);
            formattedNumber = number;
        }

        // Save initial call record
        const result = await db.run(`
            INSERT INTO calls (phone_number, type, status, start_time) 
            VALUES (?, 'outgoing', 'dialing', CURRENT_TIMESTAMP)
        `, [formattedNumber]);

        // Send actual AT command via MQTT if connected
        if (global.mqttService && global.mqttService.connected) {
            try {
                const mqttResult = await global.mqttService.makeCall('esp32-s3-1', formattedNumber);
                
                if (mqttResult.success) {
                    logger.info(`Call initiated to ${formattedNumber}`);
                    
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
                } else {
                    // Update database to failed
                    await db.run(`
                        UPDATE calls SET status = 'failed' WHERE id = ?
                    `, [result.lastID]);
                    
                    res.status(500).json({
                        success: false,
                        message: mqttResult.error || 'Failed to initiate call'
                    });
                }
            } catch (mqttError) {
                logger.error('MQTT error making call:', mqttError);
                
                await db.run(`
                    UPDATE calls SET status = 'failed', notes = ? WHERE id = ?
                `, [mqttError.message, result.lastID]);
                
                res.status(500).json({
                    success: false,
                    message: 'MQTT error: ' + mqttError.message
                });
            }
        } else {
            // Fallback for testing
            logger.warn('MQTT not connected, simulating call');
            
            // Simulate call progress
            setTimeout(async () => {
                try {
                    await db.run(`
                        UPDATE calls 
                        SET status = 'connected' 
                        WHERE id = ?
                    `, [result.lastID]);
                    
                    if (req.io) {
                        req.io.emit('call:status', { 
                            id: result.lastID,
                            status: 'connected', 
                            number: formattedNumber 
                        });
                    }
                } catch (dbError) {
                    logger.error('Error updating call status:', dbError);
                }
            }, 3000);
            
            res.json({
                success: true,
                message: 'Call initiated (simulated)',
                callId: result.lastID,
                number: formattedNumber
            });
        }
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
        
        // Send AT command to end call via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'end-call', {});
            } catch (mqttError) {
                logger.error('MQTT error ending call:', mqttError);
                // Continue with database update even if MQTT fails
            }
        }
        
        // Update the most recent active call
        const result = await db.run(`
            UPDATE calls 
            SET status = 'ended', 
                end_time = CURRENT_TIMESTAMP,
                duration = CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER)
            WHERE status IN ('dialing', 'ringing', 'connected')
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (result.changes > 0) {
            logger.info('Call ended');
            
            try {
                if (req.io) {
                    req.io.emit('call:ended', {
                        status: 'ended'
                    });
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

// Answer incoming call
router.post('/answer', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }
        
        // Send AT command to answer call via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'answer-call', {});
            } catch (mqttError) {
                logger.error('MQTT error answering call:', mqttError);
            }
        }
        
        // Update the most recent ringing call
        const result = await db.run(`
            UPDATE calls 
            SET status = 'answered', start_time = CURRENT_TIMESTAMP 
            WHERE status = 'ringing'
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (result.changes > 0) {
            logger.info('Call answered');
            
            try {
                if (req.io) {
                    req.io.emit('call:status', { 
                        status: 'answered' 
                    });
                }
            } catch (socketError) {
                logger.error('Error emitting socket event:', socketError);
            }
        }

        res.json({
            success: true,
            message: 'Call answered'
        });
    } catch (error) {
        logger.error('API answer call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to answer call: ' + error.message
        });
    }
});

// Reject incoming call
router.post('/reject', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }
        
        // Send AT command to reject call via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'reject-call', {});
            } catch (mqttError) {
                logger.error('MQTT error rejecting call:', mqttError);
            }
        }
        
        // Update the most recent ringing call
        const result = await db.run(`
            UPDATE calls 
            SET status = 'rejected', end_time = CURRENT_TIMESTAMP 
            WHERE status = 'ringing'
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (result.changes > 0) {
            logger.info('Call rejected');
            
            try {
                if (req.io) {
                    req.io.emit('call:ended', {
                        status: 'rejected'
                    });
                }
            } catch (socketError) {
                logger.error('Error emitting socket event:', socketError);
            }
        }

        res.json({
            success: true,
            message: 'Call rejected'
        });
    } catch (error) {
        logger.error('API reject call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject call: ' + error.message
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
        
        // Check if there's an active call in database
        const activeCall = await db.get(`
            SELECT * FROM calls 
            WHERE status IN ('dialing', 'ringing', 'connected')
            ORDER BY start_time DESC
            LIMIT 1
        `);

        if (activeCall) {
            const duration = activeCall.status === 'connected' ? 
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
                data: {
                    active: false
                }
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
        
        // Send AT command via MQTT
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
                req.io.emit('call:hold', { 
                    onHold: hold 
                });
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

// Transfer call
router.post('/transfer', [
    body('number').notEmpty()
], async (req, res) => {
    try {
        const { number } = req.body;
        
        // Send AT command via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand('esp32-s3-1', 'transfer-call', { number });
            } catch (mqttError) {
                logger.error('MQTT error transferring call:', mqttError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send transfer command: ' + mqttError.message
                });
            }
        } else {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        logger.info(`Transferring call to ${number}`);
        
        try {
            if (req.io) {
                req.io.emit('call:transfer', { 
                    to: number 
                });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }
        
        res.json({
            success: true,
            message: 'Call transfer initiated'
        });
    } catch (error) {
        logger.error('API transfer call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer call: ' + error.message
        });
    }
});

module.exports = router;