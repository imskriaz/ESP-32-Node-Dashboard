const express = require('express');
const router = express.Router();
const mqttService = require('../services/mqttService');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');

// Get MQTT connection status
router.get('/status', (req, res) => {
    try {
        res.json({
            success: true,
            connected: mqttService.connected,
            broker: process.env.MQTT_HOST || 'device.atebd.com'
        });
    } catch (error) {
        logger.error('MQTT status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get MQTT status'
        });
    }
});

// Send SMS via MQTT
router.post('/send-sms', [
    body('deviceId').notEmpty().withMessage('Device ID required'),
    body('to').notEmpty().withMessage('Phone number required'),
    body('message').notEmpty().withMessage('Message required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { deviceId, to, message } = req.body;
        
        if (!mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        const result = await mqttService.sendSms(deviceId, to, message);
        
        if (result.success) {
            // Save to database (don't wait for it)
            try {
                const db = req.app.locals.db;
                if (db) {
                    await db.run(`
                        INSERT INTO sms (from_number, to_number, message, type, status, device_id, timestamp) 
                        VALUES (?, ?, ?, 'outgoing', 'sending', ?, CURRENT_TIMESTAMP)
                    `, [to, to, message, deviceId]);
                }
            } catch (dbError) {
                logger.error('Failed to save outgoing SMS to database:', dbError);
                // Don't fail the request because of DB error
            }
            
            res.json({
                success: true,
                message: 'SMS command sent to device',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to send SMS command'
            });
        }
    } catch (error) {
        logger.error('MQTT send SMS error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS command: ' + error.message
        });
    }
});

// Make call via MQTT
router.post('/make-call', [
    body('deviceId').notEmpty(),
    body('number').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { deviceId, number } = req.body;
        
        if (!mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        const result = await mqttService.makeCall(deviceId, number);
        
        if (result.success) {
            // Save to database
            try {
                const db = req.app.locals.db;
                if (db) {
                    await db.run(`
                        INSERT INTO calls (phone_number, type, status, device_id, start_time) 
                        VALUES (?, 'outgoing', 'dialing', ?, CURRENT_TIMESTAMP)
                    `, [number, deviceId]);
                }
            } catch (dbError) {
                logger.error('Failed to save call to database:', dbError);
            }
            
            res.json({
                success: true,
                message: 'Call command sent',
                callId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to send call command'
            });
        }
    } catch (error) {
        logger.error('MQTT make call error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send call command: ' + error.message
        });
    }
});

// Send USSD via MQTT
router.post('/send-ussd', [
    body('deviceId').notEmpty(),
    body('code').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { deviceId, code } = req.body;
        
        if (!mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        const result = await mqttService.sendUssd(deviceId, code);
        
        if (result.success) {
            // Save to database
            try {
                const db = req.app.locals.db;
                if (db) {
                    await db.run(`
                        INSERT INTO ussd (code, status, device_id, timestamp) 
                        VALUES (?, 'pending', ?, CURRENT_TIMESTAMP)
                    `, [code, deviceId]);
                }
            } catch (dbError) {
                logger.error('Failed to save USSD to database:', dbError);
            }
            
            res.json({
                success: true,
                message: 'USSD command sent',
                ussdId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to send USSD command'
            });
        }
    } catch (error) {
        logger.error('MQTT send USSD error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send USSD command: ' + error.message
        });
    }
});

// Request device status
router.post('/request-status/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (!mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        const result = await mqttService.requestStatus(deviceId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Status request sent'
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to request status'
            });
        }
    } catch (error) {
        logger.error('MQTT status request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to request status: ' + error.message
        });
    }
});

// Capture image
router.post('/capture/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (!mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }
        
        const result = await mqttService.captureImage(deviceId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Capture command sent',
                captureId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to send capture command'
            });
        }
    } catch (error) {
        logger.error('MQTT capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send capture command: ' + error.message
        });
    }
});

router.get('/status', (req, res) => {
    try {
        res.json({
            success: true,
            connected: mqttService.connected,
            broker: process.env.MQTT_HOST || 'device.atebd.com'
        });
    } catch (error) {
        logger.error('MQTT status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get MQTT status'
        });
    }
});

router.post('/test', [
    body('host').notEmpty().withMessage('Host is required'),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('Valid port required'),
    body('username').optional(),
    body('password').optional()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { host, port, username, password } = req.body;
        
        logger.info('Testing MQTT connection to:', { host, port, username });
        
        // Create temporary client for testing
        const mqtt = require('mqtt');
        const connectOptions = {
            host: host,
            port: parseInt(port),
            protocol: 'mqtt',
            connectTimeout: 10000,
            reconnectPeriod: -1, // Don't auto reconnect
            clientId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            clean: true,
            rejectUnauthorized: false
        };

        // Only add auth if username is provided
        if (username) {
            connectOptions.username = username;
            if (password) {
                connectOptions.password = password;
            }
        }

        const testClient = mqtt.connect(`mqtt://${host}:${port}`, connectOptions);

        const timeout = setTimeout(() => {
            testClient.end(true);
            res.json({
                success: false,
                message: 'Connection timeout - broker not responding'
            });
        }, 10000);

        testClient.on('connect', () => {
            clearTimeout(timeout);
            logger.info('MQTT test connection successful');
            testClient.end(true);
            res.json({
                success: true,
                message: 'MQTT connection successful'
            });
        });

        testClient.on('error', (error) => {
            clearTimeout(timeout);
            testClient.end(true);
            logger.error('MQTT test connection error:', error.message);
            
            let errorMessage = error.message;
            if (error.message.includes('not authorized')) {
                errorMessage = 'Authentication failed - check username and password';
            } else if (error.message.includes('ECONNREFUSED')) {
                errorMessage = 'Connection refused - broker may be down or port blocked';
            } else if (error.message.includes('ETIMEDOUT')) {
                errorMessage = 'Connection timeout - check network connectivity';
            }
            
            res.json({
                success: false,
                message: errorMessage
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

module.exports = router;