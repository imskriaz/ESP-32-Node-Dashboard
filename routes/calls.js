const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Mock call state
let currentCall = {
    active: false,
    number: null,
    startTime: null,
    duration: 0,
    status: 'idle' // idle, dialing, ringing, connected, ended
};

// Get call logs
router.get('/logs', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const calls = await db.all(`
            SELECT * FROM calls 
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
            message: 'Failed to fetch call logs'
        });
    }
});

// Get recent calls
router.get('/recent', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const limit = parseInt(req.query.limit) || 10;

        const calls = await db.all(`
            SELECT * FROM calls 
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
            message: 'Failed to fetch recent calls'
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
        
        // Check if already in call
        if (currentCall.active) {
            return res.status(400).json({
                success: false,
                message: 'Device is already in a call'
            });
        }

        // Format number
        const formattedNumber = number.startsWith('+') ? number : '+88' + number.replace(/\D/g, '');

        // Start call (mock)
        currentCall = {
            active: true,
            number: formattedNumber,
            startTime: new Date(),
            duration: 0,
            status: 'dialing'
        };

        logger.info(`Initiating call to ${formattedNumber}`);

        // Simulate call progress
        setTimeout(() => {
            if (currentCall.active && currentCall.status === 'dialing') {
                currentCall.status = 'ringing';
                req.io.emit('call:status', { status: 'ringing', number: formattedNumber });
                
                // Simulate answer after 3 seconds
                setTimeout(() => {
                    if (currentCall.active && currentCall.status === 'ringing') {
                        currentCall.status = 'connected';
                        currentCall.startTime = new Date(); // Reset start time for actual conversation
                        req.io.emit('call:status', { status: 'connected', number: formattedNumber });
                        
                        // Start duration counter
                        startDurationCounter(req.io);
                    }
                }, 3000);
            }
        }, 2000);

        // Save to database
        const db = req.app.locals.db;
        const result = await db.run(`
            INSERT INTO calls (phone_number, type, status, start_time) 
            VALUES (?, 'outgoing', 'dialing', CURRENT_TIMESTAMP)
        `, [formattedNumber]);

        req.io.emit('call:started', {
            id: result.lastID,
            number: formattedNumber,
            status: 'dialing'
        });

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
            message: 'Failed to initiate call'
        });
    }
});

// End current call - FIXED SQL SYNTAX
router.post('/end', async (req, res) => {
    try {
        if (!currentCall.active) {
            return res.status(400).json({
                success: false,
                message: 'No active call'
            });
        }

        const duration = Math.floor((new Date() - currentCall.startTime) / 1000);
        
        // FIXED: Removed ORDER BY from UPDATE statement
        const db = req.app.locals.db;
        await db.run(`
            UPDATE calls 
            SET status = ?, duration = ?, end_time = CURRENT_TIMESTAMP 
            WHERE phone_number = ? AND status IN ('dialing', 'ringing', 'connected')
        `, ['ended', duration, currentCall.number]);

        logger.info(`Call ended to ${currentCall.number}, duration: ${duration}s`);

        // Emit end event
        req.io.emit('call:ended', {
            number: currentCall.number,
            duration,
            status: 'ended'
        });

        // Reset current call
        currentCall = {
            active: false,
            number: null,
            startTime: null,
            duration: 0,
            status: 'idle'
        };

        res.json({
            success: true,
            message: 'Call ended',
            duration
        });
    } catch (error) {
        logger.error('API end call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end call',
            error: error.message
        });
    }
});

// Answer incoming call (mock)
router.post('/answer', async (req, res) => {
    try {
        if (!currentCall.active || currentCall.status !== 'ringing') {
            return res.status(400).json({
                success: false,
                message: 'No incoming call to answer'
            });
        }

        currentCall.status = 'connected';
        currentCall.startTime = new Date();

        // Update database - FIXED: Removed ORDER BY
        const db = req.app.locals.db;
        await db.run(`
            UPDATE calls 
            SET status = 'answered', start_time = CURRENT_TIMESTAMP 
            WHERE phone_number = ? AND status = 'ringing'
        `, [currentCall.number]);

        req.io.emit('call:status', { 
            status: 'connected', 
            number: currentCall.number 
        });

        // Start duration counter
        startDurationCounter(req.io);

        res.json({
            success: true,
            message: 'Call answered'
        });
    } catch (error) {
        logger.error('API answer call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to answer call'
        });
    }
});

// Reject incoming call
router.post('/reject', async (req, res) => {
    try {
        if (!currentCall.active || currentCall.status !== 'ringing') {
            return res.status(400).json({
                success: false,
                message: 'No incoming call to reject'
            });
        }

        // Update database - FIXED: Removed ORDER BY
        const db = req.app.locals.db;
        await db.run(`
            UPDATE calls 
            SET status = 'rejected', end_time = CURRENT_TIMESTAMP 
            WHERE phone_number = ? AND status = 'ringing'
        `, [currentCall.number]);

        req.io.emit('call:ended', {
            number: currentCall.number,
            status: 'rejected'
        });

        // Reset current call
        currentCall = {
            active: false,
            number: null,
            startTime: null,
            duration: 0,
            status: 'idle'
        };

        res.json({
            success: true,
            message: 'Call rejected'
        });
    } catch (error) {
        logger.error('API reject call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject call'
        });
    }
});

// Get current call status
router.get('/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                ...currentCall,
                duration: currentCall.active ? 
                    Math.floor((new Date() - currentCall.startTime) / 1000) : 0
            }
        });
    } catch (error) {
        logger.error('API call status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get call status'
        });
    }
});

// Delete call log
router.delete('/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;

        const result = await db.run('DELETE FROM calls WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Call log not found'
            });
        }

        logger.info(`Call log deleted: ${id}`);
        
        req.io.emit('call:log-deleted', { id });

        res.json({
            success: true,
            message: 'Call log deleted successfully'
        });
    } catch (error) {
        logger.error('API delete call log error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete call log'
        });
    }
});

// Helper function to start duration counter
function startDurationCounter(io) {
    const interval = setInterval(() => {
        if (currentCall.active && currentCall.status === 'connected') {
            const duration = Math.floor((new Date() - currentCall.startTime) / 1000);
            io.emit('call:duration', { duration });
            
            // Update database every 10 seconds
            if (duration % 10 === 0) {
                // Update duration in database
                const db = require('../config/database'); // You might need to import this properly
                // db.run('UPDATE calls SET duration = ? WHERE phone_number = ? AND status = ?', 
                //        [duration, currentCall.number, 'connected']);
            }
        } else {
            clearInterval(interval);
        }
    }, 1000);
}

module.exports = router;