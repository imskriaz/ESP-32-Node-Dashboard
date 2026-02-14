const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

router.get('/status', (req, res) => {
    try {
        const status = {
            signal: Math.floor(Math.random() * 31) + 70,
            battery: Math.floor(Math.random() * 41) + 60,
            network: '4G LTE',
            operator: 'Robi',
            storage: Math.floor(Math.random() * 31) + 60,
            temperature: Math.floor(Math.random() * 15) + 35,
            uptime: '3d 4h 23m',
            lastUpdate: new Date().toISOString(),
            ip: '10.120.45.67',
            imei: '123456789012345',
            iccid: '8932012345678901234'
        };

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('API status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch device status'
        });
    }
});

module.exports = router;