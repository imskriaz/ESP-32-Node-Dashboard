const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Run specific test
router.post('/run', async (req, res) => {
    try {
        const { testId, params, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            `test-${testId}`,
            params || {},
            true,
            30000
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: 'Test completed',
                data: response.data
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Test failed'
            });
        }
    } catch (error) {
        logger.error('Test error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get test history
router.get('/history', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const history = await db.all(`
            SELECT * FROM test_history 
            ORDER BY timestamp DESC 
            LIMIT 100
        `);
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error('Test history error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;