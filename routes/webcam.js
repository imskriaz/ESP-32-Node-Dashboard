const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = './public/uploads/webcam';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, 'capture-' + Date.now() + '.jpg');
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// Webcam state
let webcamState = {
    enabled: false,
    streaming: false,
    currentFrame: null,
    motionDetected: false,
    lastMotion: null,
    recording: false,
    recordingStart: null,
    recordings: [],
    settings: {
        resolution: '640x480',
        fps: 15,
        quality: 80,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        sharpness: 0,
        flip_h: false,
        flip_v: false,
        awb: true,
        exposure: 0
    },
    supportedResolutions: [
        '1600x1200',
        '1280x1024',
        '1024x768',
        '800x600',
        '640x480',
        '352x288',
        '320x240',
        '176x144'
    ]
};

// ==================== WEBCAM STATUS ====================

// Get webcam status
router.get('/status', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const settings = await db.get('SELECT * FROM webcam WHERE id = 1');
        
        if (settings) {
            webcamState.enabled = settings.enabled === 1;
            webcamState.settings = {
                resolution: settings.resolution,
                fps: settings.fps,
                quality: settings.quality,
                brightness: settings.brightness,
                contrast: settings.contrast,
                saturation: settings.saturation,
                sharpness: settings.sharpness,
                flip_h: settings.flip_horizontal === 1,
                flip_v: settings.flip_vertical === 1,
                motion_detection: settings.motion_detection === 1,
                motion_sensitivity: settings.motion_sensitivity
            };
        }

        res.json({
            success: true,
            data: {
                ...webcamState,
                settings: webcamState.settings
            }
        });
    } catch (error) {
        logger.error('API webcam status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get webcam status'
        });
    }
});

// Toggle webcam
router.post('/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { enabled } = req.body;
        const db = req.app.locals.db;

        // In production, this would initialize/deinitialize the camera
        webcamState.enabled = enabled;
        webcamState.streaming = enabled;

        await db.run(
            'UPDATE webcam SET enabled = ?, timestamp = CURRENT_TIMESTAMP WHERE id = 1',
            [enabled ? 1 : 0]
        );

        logger.info(`Webcam ${enabled ? 'enabled' : 'disabled'}`);

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:status', { enabled });
        }

        res.json({
            success: true,
            message: `Webcam ${enabled ? 'enabled' : 'disabled'}`,
            data: { enabled }
        });
    } catch (error) {
        logger.error('API webcam toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle webcam'
        });
    }
});

// ==================== CAMERA SETTINGS ====================

// Update camera settings
router.post('/settings', [
    body('resolution').optional().isIn(['1600x1200', '1280x1024', '1024x768', '800x600', '640x480', '352x288', '320x240', '176x144']),
    body('fps').optional().isInt({ min: 1, max: 60 }),
    body('quality').optional().isInt({ min: 10, max: 100 }),
    body('brightness').optional().isInt({ min: -2, max: 2 }),
    body('contrast').optional().isInt({ min: -2, max: 2 }),
    body('saturation').optional().isInt({ min: -2, max: 2 }),
    body('sharpness').optional().isInt({ min: -2, max: 2 }),
    body('flip_h').optional().isBoolean(),
    body('flip_v').optional().isBoolean(),
    body('awb').optional().isBoolean(),
    body('exposure').optional().isInt({ min: -2, max: 2 })
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
            resolution, fps, quality, brightness, contrast,
            saturation, sharpness, flip_h, flip_v, awb, exposure
        } = req.body;

        const db = req.app.locals.db;

        // Build update query
        let updates = [];
        let params = [];

        if (resolution) {
            updates.push('resolution = ?');
            params.push(resolution);
            webcamState.settings.resolution = resolution;
        }
        if (fps) {
            updates.push('fps = ?');
            params.push(fps);
            webcamState.settings.fps = fps;
        }
        if (quality) {
            updates.push('quality = ?');
            params.push(quality);
            webcamState.settings.quality = quality;
        }
        if (brightness !== undefined) {
            updates.push('brightness = ?');
            params.push(brightness);
            webcamState.settings.brightness = brightness;
        }
        if (contrast !== undefined) {
            updates.push('contrast = ?');
            params.push(contrast);
            webcamState.settings.contrast = contrast;
        }
        if (saturation !== undefined) {
            updates.push('saturation = ?');
            params.push(saturation);
            webcamState.settings.saturation = saturation;
        }
        if (sharpness !== undefined) {
            updates.push('sharpness = ?');
            params.push(sharpness);
            webcamState.settings.sharpness = sharpness;
        }
        if (flip_h !== undefined) {
            updates.push('flip_horizontal = ?');
            params.push(flip_h ? 1 : 0);
            webcamState.settings.flip_h = flip_h;
        }
        if (flip_v !== undefined) {
            updates.push('flip_vertical = ?');
            params.push(flip_v ? 1 : 0);
            webcamState.settings.flip_v = flip_v;
        }

        if (updates.length > 0) {
            params.push(1); // for WHERE id = 1
            await db.run(`
                UPDATE webcam 
                SET ${updates.join(', ')}, timestamp = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, params);
        }

        logger.info('Webcam settings updated');

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:settings', webcamState.settings);
        }

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: webcamState.settings
        });
    } catch (error) {
        logger.error('API webcam settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update settings'
        });
    }
});

// ==================== CAPTURE IMAGE ====================

// Capture image
router.post('/capture', async (req, res) => {
    try {
        if (!webcamState.enabled) {
            return res.status(400).json({
                success: false,
                message: 'Webcam is not enabled'
            });
        }

        // In production, this would capture from the actual camera
        // For now, generate a placeholder or return a sample image
        
        const captureId = Date.now();
        const imagePath = `/uploads/webcam/capture-${captureId}.jpg`;
        
        // Create a simple colored rectangle as placeholder (in production, this would be real camera data)
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(640, 480);
        const ctx = canvas.getContext('2d');
        
        // Draw gradient background
        const gradient = ctx.createLinearGradient(0, 0, 640, 480);
        gradient.addColorStop(0, '#0066cc');
        gradient.addColorStop(1, '#0099ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 640, 480);
        
        // Draw timestamp
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(new Date().toLocaleString(), 50, 50);
        
        // Draw "ESP32-CAM" text
        ctx.font = 'bold 48px Arial';
        ctx.fillText('ESP32-CAM', 150, 250);
        
        // Draw resolution info
        ctx.font = '20px Arial';
        ctx.fillText(`${webcamState.settings.resolution} @ ${webcamState.settings.fps}fps`, 200, 350);
        
        // Save image
        const buffer = canvas.toBuffer('image/jpeg', { quality: webcamState.settings.quality / 100 });
        const filePath = path.join(__dirname, '../public', imagePath);
        fs.writeFileSync(filePath, buffer);

        logger.info(`Image captured: ${imagePath}`);

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:capture', {
                id: captureId,
                path: imagePath,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Image captured',
            data: {
                id: captureId,
                path: imagePath,
                url: imagePath,
                timestamp: new Date().toISOString(),
                resolution: webcamState.settings.resolution,
                size: buffer.length
            }
        });
    } catch (error) {
        logger.error('API webcam capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to capture image'
        });
    }
});

// Get latest capture
router.get('/latest', (req, res) => {
    try {
        const uploadDir = path.join(__dirname, '../public/uploads/webcam');
        
        if (!fs.existsSync(uploadDir)) {
            return res.json({
                success: true,
                data: null
            });
        }

        const files = fs.readdirSync(uploadDir)
            .filter(f => f.endsWith('.jpg'))
            .map(f => ({
                name: f,
                path: `/uploads/webcam/${f}`,
                time: fs.statSync(path.join(uploadDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        res.json({
            success: true,
            data: files.length > 0 ? files[0] : null
        });
    } catch (error) {
        logger.error('API webcam latest error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get latest capture'
        });
    }
});

// ==================== MOTION DETECTION ====================

// Toggle motion detection
router.post('/motion/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required'),
    body('sensitivity').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { enabled, sensitivity } = req.body;
        const db = req.app.locals.db;

        await db.run(
            'UPDATE webcam SET motion_detection = ?, motion_sensitivity = ? WHERE id = 1',
            [enabled ? 1 : 0, sensitivity || 50]
        );

        webcamState.motionDetected = false;
        webcamState.settings.motion_detection = enabled;
        if (sensitivity) webcamState.settings.motion_sensitivity = sensitivity;

        logger.info(`Motion detection ${enabled ? 'enabled' : 'disabled'}`);

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:motion', { enabled });
        }

        res.json({
            success: true,
            message: `Motion detection ${enabled ? 'enabled' : 'disabled'}`,
            data: { enabled, sensitivity }
        });
    } catch (error) {
        logger.error('API motion toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle motion detection'
        });
    }
});

// ==================== RECORDING ====================

// Start recording
router.post('/record/start', async (req, res) => {
    try {
        if (!webcamState.enabled) {
            return res.status(400).json({
                success: false,
                message: 'Webcam is not enabled'
            });
        }

        if (webcamState.recording) {
            return res.status(400).json({
                success: false,
                message: 'Already recording'
            });
        }

        webcamState.recording = true;
        webcamState.recordingStart = new Date();

        logger.info('Recording started');

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:recording', { started: true });
        }

        res.json({
            success: true,
            message: 'Recording started',
            data: {
                startTime: webcamState.recordingStart
            }
        });
    } catch (error) {
        logger.error('API record start error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start recording'
        });
    }
});

// Stop recording
router.post('/record/stop', async (req, res) => {
    try {
        if (!webcamState.recording) {
            return res.status(400).json({
                success: false,
                message: 'Not recording'
            });
        }

        const duration = Math.floor((new Date() - webcamState.recordingStart) / 1000);
        const recordingId = Date.now();
        const videoPath = `/uploads/webcam/recording-${recordingId}.mp4`;

        webcamState.recording = false;
        webcamState.recordings.push({
            id: recordingId,
            path: videoPath,
            duration,
            startTime: webcamState.recordingStart,
            endTime: new Date()
        });

        logger.info(`Recording stopped, duration: ${duration}s`);

        // Emit socket event
        if (req.io) {
            req.io.emit('webcam:recording', { started: false, duration });
        }

        res.json({
            success: true,
            message: 'Recording stopped',
            data: {
                id: recordingId,
                path: videoPath,
                duration
            }
        });
    } catch (error) {
        logger.error('API record stop error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop recording'
        });
    }
});

// Get recordings list
router.get('/recordings', (req, res) => {
    try {
        res.json({
            success: true,
            data: webcamState.recordings
        });
    } catch (error) {
        logger.error('API recordings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get recordings'
        });
    }
});

// ==================== FACE DETECTION (Optional) ====================

// Toggle face detection
router.post('/face/toggle', [
    body('enabled').isBoolean()
], (req, res) => {
    try {
        const { enabled } = req.body;
        
        // In production, this would enable face detection on the ESP32
        
        res.json({
            success: true,
            message: `Face detection ${enabled ? 'enabled' : 'disabled'}`
        });
    } catch (error) {
        logger.error('API face toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle face detection'
        });
    }
});

// Get supported resolutions
router.get('/resolutions', (req, res) => {
    try {
        res.json({
            success: true,
            data: webcamState.supportedResolutions
        });
    } catch (error) {
        logger.error('API resolutions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get resolutions'
        });
    }
});

router.get('/stream', (req, res) => {
    try {
        if (!webcamState.enabled) {
            return res.status(404).send('Camera disabled');
        }
        
        // In production, this would stream from the actual camera
        // For now, generate a simple MJPEG stream
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        const interval = setInterval(() => {
            if (!webcamState.enabled) {
                clearInterval(interval);
                res.end();
                return;
            }
            
            // Generate a simple frame (in production, get from camera)
            const { createCanvas } = require('canvas');
            const canvas = createCanvas(
                parseInt(webcamState.settings.resolution.split('x')[0]),
                parseInt(webcamState.settings.resolution.split('x')[1])
            );
            const ctx = canvas.getContext('2d');
            
            // Draw timestamp and info
            ctx.fillStyle = '#0066cc';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(new Date().toLocaleTimeString(), 50, 50);
            ctx.font = 'bold 36px Arial';
            ctx.fillText('ESP32-CAM', 50, 150);
            ctx.font = '20px Arial';
            ctx.fillText(`Resolution: ${webcamState.settings.resolution}`, 50, 250);
            ctx.fillText(`FPS: ${webcamState.settings.fps}`, 50, 300);
            
            const buffer = canvas.toBuffer('image/jpeg');
            
            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
            res.write(buffer);
            res.write(`\r\n`);
        }, 1000 / webcamState.settings.fps);
        
        req.on('close', () => {
            clearInterval(interval);
        });
        
    } catch (error) {
        logger.error('Stream error:', error);
        res.status(500).send('Stream error');
    }
});

// Get capture history
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const uploadDir = path.join(__dirname, '../public/uploads/webcam');
        
        if (!fs.existsSync(uploadDir)) {
            return res.json({
                success: true,
                data: []
            });
        }

        const files = fs.readdirSync(uploadDir)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .map(f => {
                const stat = fs.statSync(path.join(uploadDir, f));
                return {
                    path: `/uploads/webcam/${f}`,
                    filename: f,
                    timestamp: stat.mtime,
                    size: stat.size,
                    created: stat.birthtime
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

        res.json({
            success: true,
            data: files
        });
    } catch (error) {
        logger.error('API webcam history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get capture history'
        });
    }
});

// Delete capture
router.delete('/capture/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../public/uploads/webcam', filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`Deleted capture: ${filename}`);
            
            res.json({
                success: true,
                message: 'Capture deleted'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Capture not found'
            });
        }
    } catch (error) {
        logger.error('API delete capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete capture'
        });
    }
});

// Get motion detection zones
router.get('/motion/zones', (req, res) => {
    try {
        // In production, load from database
        const zones = [
            // Default full-frame zone
            { x: 0, y: 0, width: 640, height: 480 }
        ];
        
        res.json({
            success: true,
            data: zones
        });
    } catch (error) {
        logger.error('API motion zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get motion zones'
        });
    }
});

// Save motion zones
router.post('/motion/zones', [
    body('zones').isArray()
], (req, res) => {
    try {
        const { zones } = req.body;
        
        // In production, save to database
        logger.info(`Saved ${zones.length} motion zones`);
        
        res.json({
            success: true,
            message: 'Motion zones saved'
        });
    } catch (error) {
        logger.error('API save motion zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save motion zones'
        });
    }
});

module.exports = router;