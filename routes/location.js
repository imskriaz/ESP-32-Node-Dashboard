const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// In-memory location cache (in production, use database)
let locationCache = new Map(); // deviceId -> { locations array }
let lastLocations = new Map(); // deviceId -> latest location

// ==================== LOCATION API ENDPOINTS ====================

/**
 * Get current GPS location
 * GET /api/location/current?deviceId=esp32-s3-1
 */
router.get('/current', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected',
                data: getLastKnownLocation(deviceId)
            });
        }

        // Request current location from device via MQTT
        const response = await global.mqttService.publishCommand(
            deviceId,
            'gps-location',
            {},
            true,
            15000 // 15 second timeout for GPS fix
        );

        if (response && response.success) {
            const locationData = parseLocationData(response);
            
            // Cache the location
            cacheLocation(deviceId, locationData);
            
            res.json({
                success: true,
                data: locationData
            });
        } else {
            // Return last known location if available
            const lastKnown = getLastKnownLocation(deviceId);
            res.json({
                success: lastKnown ? true : false,
                message: response?.message || 'Failed to get GPS fix',
                data: lastKnown || null
            });
        }
    } catch (error) {
        logger.error('Location current error:', error);
        
        // Return last known location on error
        const lastKnown = getLastKnownLocation(req.query.deviceId || 'esp32-s3-1');
        res.json({
            success: lastKnown ? true : false,
            message: error.message,
            data: lastKnown || null
        });
    }
});

/**
 * Get location history
 * GET /api/location/history?deviceId=esp32-s3-1&limit=50&start=2026-02-01&end=2026-02-15
 */
router.get('/history', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const limit = parseInt(req.query.limit) || 50;
        const startDate = req.query.start;
        const endDate = req.query.end;
        
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        let query = `
            SELECT * FROM gps_locations 
            WHERE device_id = ?
        `;
        let params = [deviceId];

        if (startDate && endDate) {
            query += ` AND timestamp BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const locations = await db.all(query, params);

        res.json({
            success: true,
            data: locations.map(l => ({
                id: l.id,
                latitude: l.latitude,
                longitude: l.longitude,
                altitude: l.altitude,
                speed: l.speed,
                heading: l.heading,
                satellites: l.satellites,
                accuracy: l.accuracy,
                fix_quality: l.fix_quality,
                timestamp: l.timestamp,
                address: l.address
            }))
        });
    } catch (error) {
        logger.error('Location history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch location history: ' + error.message
        });
    }
});

/**
 * Get latest location for all devices
 * GET /api/location/devices
 */
router.get('/devices', (req, res) => {
    try {
        const devices = [];
        for (const [deviceId, location] of lastLocations) {
            devices.push({
                deviceId,
                ...location
            });
        }
        
        res.json({
            success: true,
            data: devices
        });
    } catch (error) {
        logger.error('Location devices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch devices: ' + error.message
        });
    }
});

/**
 * Get location stats
 * GET /api/location/stats?deviceId=esp32-s3-1
 */
router.get('/stats', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const stats = await db.get(`
            SELECT 
                COUNT(*) as total_fixes,
                MAX(satellites) as max_satellites,
                AVG(accuracy) as avg_accuracy,
                MIN(timestamp) as first_fix,
                MAX(timestamp) as last_fix
            FROM gps_locations 
            WHERE device_id = ?
        `, [deviceId]);

        res.json({
            success: true,
            data: stats || {
                total_fixes: 0,
                max_satellites: 0,
                avg_accuracy: 0,
                first_fix: null,
                last_fix: null
            }
        });
    } catch (error) {
        logger.error('Location stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stats: ' + error.message
        });
    }
});

/**
 * Toggle GPS power
 * POST /api/location/toggle
 */
router.post('/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required'),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { enabled, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gps-set-enabled',
            { enabled },
            true,
            10000
        );

        if (response && response.success) {
            logger.info(`GPS ${enabled ? 'enabled' : 'disabled'} for ${deviceId}`);
            
            // Update database
            const db = req.app.locals.db;
            if (db) {
                await db.run(`
                    INSERT INTO settings (key, value, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
                `, [`gps_${deviceId}_enabled`, JSON.stringify(enabled), JSON.stringify(enabled)]);
            }

            res.json({
                success: true,
                message: `GPS ${enabled ? 'enabled' : 'disabled'}`,
                data: { enabled }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to toggle GPS'
            });
        }
    } catch (error) {
        logger.error('Location toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle GPS: ' + error.message
        });
    }
});

/**
 * Configure GPS settings
 * POST /api/location/config
 */
router.post('/config', [
    body('update_rate').optional().isInt({ min: 1, max: 3600 }),
    body('minimum_fix_time').optional().isInt({ min: 0, max: 300 }),
    body('power_save_mode').optional().isBoolean(),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { update_rate, minimum_fix_time, power_save_mode, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const config = {
            updateRate: update_rate || 10,
            minFixTime: minimum_fix_time || 30,
            powerSave: power_save_mode || false
        };

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gps-configure',
            config,
            true,
            10000
        );

        if (response && response.success) {
            // Save to database
            const db = req.app.locals.db;
            if (db) {
                await db.run(`
                    INSERT INTO settings (key, value, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
                `, [`gps_${deviceId}_config`, JSON.stringify(config), JSON.stringify(config)]);
            }

            res.json({
                success: true,
                message: 'GPS configuration updated',
                data: config
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to configure GPS'
            });
        }
    } catch (error) {
        logger.error('Location config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure GPS: ' + error.message
        });
    }
});

/**
 * Get GPS status
 * GET /api/location/status?deviceId=esp32-s3-1
 */
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.json({
                success: true,
                data: {
                    enabled: false,
                    fix: false,
                    satellites: 0,
                    lastFix: null,
                    powerSave: false,
                    updateRate: 10
                }
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gps-status',
            {},
            true,
            5000
        );

        if (response && response.success) {
            res.json({
                success: true,
                data: {
                    enabled: response.enabled || false,
                    fix: response.fix || false,
                    satellites: response.satellites || 0,
                    lastFix: response.lastFix || null,
                    powerSave: response.powerSave || false,
                    updateRate: response.updateRate || 10
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    enabled: false,
                    fix: false,
                    satellites: 0,
                    lastFix: null,
                    powerSave: false,
                    updateRate: 10,
                    error: response?.message || 'GPS not responding'
                }
            });
        }
    } catch (error) {
        logger.error('Location status error:', error);
        res.json({
            success: true,
            data: {
                enabled: false,
                fix: false,
                satellites: 0,
                lastFix: null,
                powerSave: false,
                updateRate: 10,
                error: error.message
            }
        });
    }
});

/**
 * Delete location history
 * DELETE /api/location/history/:id
 */
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        await db.run('DELETE FROM gps_locations WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Location deleted'
        });
    } catch (error) {
        logger.error('Location delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete location: ' + error.message
        });
    }
});

/**
 * Clear all history for a device
 * DELETE /api/location/history/device/:deviceId
 */
router.delete('/history/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        await db.run('DELETE FROM gps_locations WHERE device_id = ?', [deviceId]);

        res.json({
            success: true,
            message: 'All locations cleared for device'
        });
    } catch (error) {
        logger.error('Location clear error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear locations: ' + error.message
        });
    }
});

// ==================== HELPER FUNCTIONS ====================

function parseLocationData(data) {
    return {
        latitude: parseFloat(data.lat || data.latitude || 0),
        longitude: parseFloat(data.lng || data.lon || data.longitude || 0),
        altitude: parseFloat(data.alt || data.altitude || 0),
        speed: parseFloat(data.speed || 0),
        heading: parseFloat(data.heading || data.course || 0),
        satellites: parseInt(data.satellites || data.sats || 0),
        accuracy: parseFloat(data.accuracy || data.hdop || 0),
        fix_quality: parseInt(data.fix || data.quality || 0),
        timestamp: data.timestamp || new Date().toISOString()
    };
}

function cacheLocation(deviceId, locationData) {
    // Store in memory cache
    lastLocations.set(deviceId, {
        ...locationData,
        cached: new Date().toISOString()
    });

    // Store in history cache (limit to 100 per device)
    if (!locationCache.has(deviceId)) {
        locationCache.set(deviceId, []);
    }
    
    const deviceLocations = locationCache.get(deviceId);
    deviceLocations.unshift(locationData);
    
    // Keep only last 100 locations in memory
    if (deviceLocations.length > 100) {
        deviceLocations.pop();
    }
}

function getLastKnownLocation(deviceId) {
    return lastLocations.get(deviceId) || null;
}

// ==================== MQTT HANDLER INTEGRATION ====================

// This should be called from mqttHandlers.js when GPS data arrives
function handleGpsLocation(deviceId, data) {
    try {
        const locationData = parseLocationData(data);
        
        // Cache in memory
        cacheLocation(deviceId, locationData);
        
        // Save to database
        const db = global.app?.locals?.db;
        if (db) {
            db.run(`
                INSERT INTO gps_locations 
                (device_id, latitude, longitude, altitude, speed, heading, 
                 satellites, accuracy, fix_quality, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                deviceId,
                locationData.latitude,
                locationData.longitude,
                locationData.altitude,
                locationData.speed,
                locationData.heading,
                locationData.satellites,
                locationData.accuracy,
                locationData.fix_quality,
                locationData.timestamp
            ]).catch(err => logger.error('Error saving GPS location:', err));
        }
        
        // Emit via Socket.IO
        if (global.io) {
            global.io.emit('location:update', {
                deviceId,
                ...locationData
            });
        }
        
        logger.info(`📍 GPS location from ${deviceId}: ${locationData.latitude}, ${locationData.longitude} (${locationData.satellites} sats)`);
        
        return locationData;
    } catch (error) {
        logger.error('Error handling GPS location:', error);
        return null;
    }
}

// Export for use in mqttHandlers.js
module.exports = router;
module.exports.handleGpsLocation = handleGpsLocation;