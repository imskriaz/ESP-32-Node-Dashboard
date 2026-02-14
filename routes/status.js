const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const modemService = require('../services/modemService');

// Get device status
router.get('/', (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const status = modemService.getDeviceStatus(deviceId);
        
        // Format for frontend
        const deviceStatus = {
            online: status.online,
            signal: status.mobile?.signalStrength || 0,
            battery: status.system?.battery || 0,
            charging: status.system?.charging || false,
            network: status.mobile?.networkType || 'No Service',
            operator: status.mobile?.operator || 'Unknown',
            ip: status.mobile?.ipAddress || '0.0.0.0',
            temperature: status.system?.temperature || 0,
            uptime: status.system?.uptime || '0s',
            lastSeen: status.lastSeen,
            firstSeen: status.firstSeen
        };

        res.json({
            success: true,
            data: deviceStatus
        });
    } catch (error) {
        logger.error('API status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch device status: ' + error.message
        });
    }
});

// Get all devices
router.get('/devices', (req, res) => {
    try {
        const devices = modemService.getAllDevices();
        res.json({
            success: true,
            data: devices
        });
    } catch (error) {
        logger.error('API devices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch devices: ' + error.message
        });
    }
});

// Get device history
router.get('/history/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        // In production, this would query a database
        res.json({
            success: true,
            data: [] // Placeholder for history data
        });
    } catch (error) {
        logger.error('API history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch history: ' + error.message
        });
    }
});

module.exports = router;