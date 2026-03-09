const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Intercom state (per device)
let intercomState = new Map(); // deviceId -> state

// WebRTC signaling state
let pendingCalls = new Map(); // callId -> { deviceId, type, timestamp }

// ==================== INTERCOM STATUS ====================

/**
 * Get intercom status
 * GET /api/intercom/status?deviceId=esp32-s3-1
 */
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const db = req.app.locals.db;

        // Get settings from database
        const settings = await db.get('SELECT * FROM intercom_settings WHERE device_id = ?', [deviceId]);
        
        // Get current state
        const state = intercomState.get(deviceId) || {
            videoEnabled: false,
            audioEnabled: false,
            streaming: false,
            inCall: false,
            callType: null,
            peerId: null,
            lastFrame: null
        };

        // Check device online status
        const isOnline = global.mqttService && 
                        global.mqttService.connected && 
                        global.mqttService.isDeviceOnline(deviceId);

        res.json({
            success: true,
            data: {
                settings: settings || {
                    videoEnabled: false,
                    audioEnabled: false,
                    resolution: '640x480',
                    fps: 15,
                    quality: 80,
                    audioBitrate: 64000,
                    stunServer: 'stun.l.google.com:19302',
                    turnServer: '',
                    turnUsername: '',
                    turnPassword: '',
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    micSensitivity: 50,
                    speakerVolume: 80
                },
                state,
                online: isOnline
            }
        });
    } catch (error) {
        logger.error('API intercom status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get intercom status: ' + error.message
        });
    }
});

// ==================== WEBCAM SETTINGS ====================

/**
 * Update video settings
 * POST /api/intercom/video/settings
 */
router.post('/video/settings', [
    body('enabled').optional().isBoolean(),
    body('resolution').optional().isIn(['1600x1200', '1280x1024', '1024x768', '800x600', '640x480', '352x288', '320x240']),
    body('fps').optional().isInt({ min: 1, max: 60 }),
    body('quality').optional().isInt({ min: 10, max: 100 }),
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

        const { enabled, resolution, fps, quality, deviceId = 'esp32-s3-1' } = req.body;
        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Get current settings
        let settings = await db.get('SELECT * FROM intercom_settings WHERE device_id = ?', [deviceId]);
        
        const updateData = {
            videoEnabled: enabled !== undefined ? enabled : (settings?.videoEnabled || false),
            resolution: resolution || settings?.resolution || '640x480',
            fps: fps || settings?.fps || 15,
            quality: quality || settings?.quality || 80
        };

        if (settings) {
            await db.run(`
                UPDATE intercom_settings 
                SET video_enabled = ?, resolution = ?, fps = ?, quality = ?, updated_at = CURRENT_TIMESTAMP
                WHERE device_id = ?
            `, [updateData.videoEnabled ? 1 : 0, updateData.resolution, updateData.fps, updateData.quality, deviceId]);
        } else {
            await db.run(`
                INSERT INTO intercom_settings 
                (device_id, video_enabled, resolution, fps, quality, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [deviceId, updateData.videoEnabled ? 1 : 0, updateData.resolution, updateData.fps, updateData.quality]);
        }

        // Send command to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand(deviceId, 'intercom-video-config', updateData);
            } catch (mqttError) {
                logger.error('MQTT error sending video config:', mqttError);
            }
        }

        logger.info(`Video settings updated for ${deviceId}`);

        res.json({
            success: true,
            message: 'Video settings updated',
            data: updateData
        });
    } catch (error) {
        logger.error('API video settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update video settings: ' + error.message
        });
    }
});

// ==================== AUDIO SETTINGS ====================

/**
 * Update audio settings
 * POST /api/intercom/audio/settings
 */
router.post('/audio/settings', [
    body('enabled').optional().isBoolean(),
    body('bitrate').optional().isInt({ min: 8000, max: 256000 }),
    body('echoCancellation').optional().isBoolean(),
    body('noiseSuppression').optional().isBoolean(),
    body('autoGainControl').optional().isBoolean(),
    body('micSensitivity').optional().isInt({ min: 0, max: 100 }),
    body('speakerVolume').optional().isInt({ min: 0, max: 100 }),
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

        const { 
            enabled, 
            bitrate, 
            echoCancellation, 
            noiseSuppression, 
            autoGainControl,
            micSensitivity,
            speakerVolume,
            deviceId = 'esp32-s3-1' 
        } = req.body;

        const db = req.app.locals.db;

        if (!db) {
            throw new Error('Database not available');
        }

        // Get current settings
        let settings = await db.get('SELECT * FROM intercom_settings WHERE device_id = ?', [deviceId]);
        
        const updateData = {
            audioEnabled: enabled !== undefined ? enabled : (settings?.audioEnabled || false),
            audioBitrate: bitrate || settings?.audioBitrate || 64000,
            echoCancellation: echoCancellation !== undefined ? echoCancellation : (settings?.echoCancellation !== 0),
            noiseSuppression: noiseSuppression !== undefined ? noiseSuppression : (settings?.noiseSuppression !== 0),
            autoGainControl: autoGainControl !== undefined ? autoGainControl : (settings?.autoGainControl !== 0),
            micSensitivity: micSensitivity || settings?.micSensitivity || 50,
            speakerVolume: speakerVolume || settings?.speakerVolume || 80
        };

        if (settings) {
            await db.run(`
                UPDATE intercom_settings 
                SET audio_enabled = ?, audio_bitrate = ?, echo_cancellation = ?, 
                    noise_suppression = ?, auto_gain_control = ?, mic_sensitivity = ?,
                    speaker_volume = ?, updated_at = CURRENT_TIMESTAMP
                WHERE device_id = ?
            `, [
                updateData.audioEnabled ? 1 : 0,
                updateData.audioBitrate,
                updateData.echoCancellation ? 1 : 0,
                updateData.noiseSuppression ? 1 : 0,
                updateData.autoGainControl ? 1 : 0,
                updateData.micSensitivity,
                updateData.speakerVolume,
                deviceId
            ]);
        } else {
            await db.run(`
                INSERT INTO intercom_settings 
                (device_id, audio_enabled, audio_bitrate, echo_cancellation, noise_suppression, 
                 auto_gain_control, mic_sensitivity, speaker_volume, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [
                deviceId,
                updateData.audioEnabled ? 1 : 0,
                updateData.audioBitrate,
                updateData.echoCancellation ? 1 : 0,
                updateData.noiseSuppression ? 1 : 0,
                updateData.autoGainControl ? 1 : 0,
                updateData.micSensitivity,
                updateData.speakerVolume
            ]);
        }

        // Send command to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            try {
                await global.mqttService.publishCommand(deviceId, 'intercom-audio-config', updateData);
            } catch (mqttError) {
                logger.error('MQTT error sending audio config:', mqttError);
            }
        }

        logger.info(`Audio settings updated for ${deviceId}`);

        res.json({
            success: true,
            message: 'Audio settings updated',
            data: updateData
        });
    } catch (error) {
        logger.error('API audio settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update audio settings: ' + error.message
        });
    }
});

// ==================== STUN/TURN SERVERS ====================

/**
 * Update STUN/TURN servers
 * POST /api/intercom/servers
 */
router.post('/servers', [
    body('stunServer').optional(),
    body('turnServer').optional(),
    body('turnUsername').optional(),
    body('turnPassword').optional(),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const { stunServer, turnServer, turnUsername, turnPassword, deviceId = 'esp32-s3-1' } = req.body;
        const db = req.app.locals.db;

        const updateData = {
            stunServer: stunServer || 'stun.l.google.com:19302',
            turnServer: turnServer || '',
            turnUsername: turnUsername || '',
            turnPassword: turnPassword || ''
        };

        await db.run(`
            UPDATE intercom_settings 
            SET stun_server = ?, turn_server = ?, turn_username = ?, turn_password = ?, updated_at = CURRENT_TIMESTAMP
            WHERE device_id = ?
        `, [updateData.stunServer, updateData.turnServer, updateData.turnUsername, updateData.turnPassword, deviceId]);

        res.json({
            success: true,
            message: 'STUN/TURN servers updated',
            data: updateData
        });
    } catch (error) {
        logger.error('API servers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update servers: ' + error.message
        });
    }
});

// ==================== WEBRTC SIGNALING ====================

/**
 * Initiate call
 * POST /api/intercom/call/start
 */
router.post('/call/start', [
    body('type').isIn(['video', 'audio']),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const { type, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'Device not connected'
            });
        }

        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        // Store pending call
        pendingCalls.set(callId, {
            deviceId,
            type,
            timestamp: Date.now(),
            status: 'initiating'
        });

        // Send signal to device via MQTT
        await global.mqttService.publishCommand(deviceId, 'intercom-call-start', {
            callId,
            type
        });

        // Clean up old pending calls
        setTimeout(() => {
            if (pendingCalls.has(callId)) {
                pendingCalls.delete(callId);
            }
        }, 30000);

        res.json({
            success: true,
            message: `${type} call initiated`,
            data: { callId, type }
        });
    } catch (error) {
        logger.error('API call start error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start call: ' + error.message
        });
    }
});

/**
 * End call
 * POST /api/intercom/call/end
 */
router.post('/call/end', [
    body('deviceId').optional()
], async (req, res) => {
    try {
        const { deviceId = 'esp32-s3-1' } = req.body;

        // Update state
        const state = intercomState.get(deviceId) || {};
        state.inCall = false;
        state.callType = null;
        state.peerId = null;
        intercomState.set(deviceId, state);

        // Send signal to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            await global.mqttService.publishCommand(deviceId, 'intercom-call-end', {});
        }

        res.json({
            success: true,
            message: 'Call ended'
        });
    } catch (error) {
        logger.error('API call end error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end call: ' + error.message
        });
    }
});

/**
 * WebRTC signaling (offer/answer/candidate)
 * POST /api/intercom/signal
 */
router.post('/signal', [
    body('callId').notEmpty(),
    body('type').isIn(['offer', 'answer', 'candidate']),
    body('data').notEmpty(),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const { callId, type, data, deviceId = 'esp32-s3-1' } = req.body;

        const pendingCall = pendingCalls.get(callId);
        if (!pendingCall) {
            return res.status(404).json({
                success: false,
                message: 'Call not found or expired'
            });
        }

        // Forward signal to device via MQTT
        if (global.mqttService && global.mqttService.connected) {
            await global.mqttService.publishCommand(deviceId, 'intercom-signal', {
                callId,
                type,
                data
            });
        }

        res.json({
            success: true,
            message: `Signal ${type} sent`
        });
    } catch (error) {
        logger.error('API signal error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send signal: ' + error.message
        });
    }
});

/**
 * Get ICE servers for WebRTC
 * GET /api/intercom/ice-servers
 */
router.get('/ice-servers', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const db = req.app.locals.db;

        const settings = await db.get('SELECT stun_server, turn_server, turn_username, turn_password FROM intercom_settings WHERE device_id = ?', [deviceId]);

        const iceServers = [];

        // Add STUN server
        if (settings?.stun_server) {
            iceServers.push({
                urls: `stun:${settings.stun_server}`
            });
        } else {
            iceServers.push({
                urls: 'stun:stun.l.google.com:19302'
            });
        }

        // Add TURN server if configured
        if (settings?.turn_server) {
            const turnConfig = {
                urls: `turn:${settings.turn_server}`,
                username: settings.turn_username || '',
                credential: settings.turn_password || ''
            };
            iceServers.push(turnConfig);
        }

        res.json({
            success: true,
            data: iceServers
        });
    } catch (error) {
        logger.error('API ICE servers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get ICE servers: ' + error.message
        });
    }
});

// ==================== SNAPSHOT (for video calls) ====================

/**
 * Capture snapshot during video call
 * POST /api/intercom/snapshot
 */
router.post('/snapshot', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        // Request snapshot from device
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'Device not connected'
            });
        }

        const response = await global.mqttService.publishCommand(deviceId, 'intercom-snapshot', {}, true, 10000);

        if (response && response.success) {
            // Save snapshot
            const snapshotDir = path.join(__dirname, '../public/uploads/intercom');
            if (!fs.existsSync(snapshotDir)) {
                fs.mkdirSync(snapshotDir, { recursive: true });
            }

            const filename = `snapshot_${Date.now()}.jpg`;
            const filepath = path.join(snapshotDir, filename);
            
            const imageBuffer = Buffer.from(response.image, 'base64');
            fs.writeFileSync(filepath, imageBuffer);

            const imageUrl = `/uploads/intercom/${filename}`;

            res.json({
                success: true,
                message: 'Snapshot captured',
                data: {
                    url: imageUrl,
                    size: imageBuffer.length,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to capture snapshot'
            });
        }
    } catch (error) {
        logger.error('API snapshot error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to capture snapshot: ' + error.message
        });
    }
});

// ==================== CALL HISTORY ====================

/**
 * Get call history
 * GET /api/intercom/history?deviceId=esp32-s3-1&limit=50
 */
router.get('/history', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const limit = parseInt(req.query.limit) || 50;
        const db = req.app.locals.db;

        const history = await db.all(`
            SELECT * FROM intercom_calls 
            WHERE device_id = ? 
            ORDER BY start_time DESC 
            LIMIT ?
        `, [deviceId, limit]);

        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error('API history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get call history: ' + error.message
        });
    }
});

// ==================== MQTT HANDLER ====================

// Handle incoming MQTT messages for intercom
function handleMqttMessage(deviceId, topic, data) {
    try {
        if (topic.includes('intercom-signal')) {
            // Forward WebRTC signal to browser
            if (global.io) {
                global.io.emit('intercom:signal', {
                    deviceId,
                    callId: data.callId,
                    type: data.type,
                    data: data.data
                });
            }
        } else if (topic.includes('intercom-call-status')) {
            // Update call state
            const state = intercomState.get(deviceId) || {};
            state.inCall = data.inCall || false;
            state.callType = data.type || null;
            state.peerId = data.peerId || null;
            intercomState.set(deviceId, state);

            // Save to history
            const db = global.app?.locals?.db;
            if (db && data.inCall === false && data.duration) {
                db.run(`
                    INSERT INTO intercom_calls (device_id, type, duration, start_time, end_time)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [deviceId, data.type || 'video', data.duration, data.startTime]);
            }

            // Emit status
            if (global.io) {
                global.io.emit('intercom:status', {
                    deviceId,
                    inCall: data.inCall,
                    type: data.type
                });
            }
        }
    } catch (error) {
        logger.error('Error handling MQTT message:', error);
    }
}

// Export handler for mqttHandlers.js
module.exports = router;
module.exports.handleMqttMessage = handleMqttMessage;