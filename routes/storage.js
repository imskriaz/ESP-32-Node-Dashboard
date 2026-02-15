const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Get SD card info and directory listing
router.get('/', async (req, res) => {
    try {
        const dirPath = req.query.path || '';
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected',
                online: false
            });
        }

        // Request directory listing from device
        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-list', 
            { path: dirPath },
            true,
            10000 // 10 second timeout
        );

        if (response && response.success) {
            res.json({
                success: true,
                data: {
                    path: dirPath,
                    items: response.files || [],
                    stats: response.stats || {
                        total: 0,
                        used: 0,
                        free: 0,
                        usagePercent: 0
                    },
                    breadcrumbs: getBreadcrumbs(dirPath)
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to get storage info'
            });
        }
    } catch (error) {
        logger.error('Storage API error:', error);
        
        // Check for timeout
        if (error.message.includes('timeout')) {
            res.status(504).json({
                success: false,
                message: 'Device not responding',
                online: false
            });
        } else {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
});

// Get SD card info via MQTT
router.get('/info', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.json({
                success: true,
                data: {
                    sd: {
                        available: false,
                        mounted: false,
                        total: 0,
                        used: 0,
                        free: 0,
                        error: 'MQTT not connected'
                    }
                }
            });
        }

        // Request SD card info from device
        const response = await global.mqttService.publishCommand(
            deviceId,
            'storage-info',
            {},
            true,
            5000
        );

        if (response && response.success) {
            res.json({
                success: true,
                data: {
                    sd: {
                        available: true,
                        mounted: response.mounted || false,
                        total: response.total || 0,
                        used: response.used || 0,
                        free: response.free || 0,
                        type: response.type || 'SD Card',
                        filesystem: response.filesystem || 'FAT32'
                    }
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    sd: {
                        available: false,
                        mounted: false,
                        total: 0,
                        used: 0,
                        free: 0,
                        error: response?.message || 'SD card not available'
                    }
                }
            });
        }
    } catch (error) {
        logger.error('Storage info error:', error);
        res.json({
            success: true,
            data: {
                sd: {
                    available: false,
                    mounted: false,
                    total: 0,
                    used: 0,
                    free: 0,
                    error: error.message
                }
            }
        });
    }
});

// Read file content
router.get('/read', async (req, res) => {
    try {
        const filePath = req.query.path || '';
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        // Request file content from device
        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-read', 
            { path: filePath },
            true,
            30000 // 30 second timeout for file reads
        );

        if (response && response.success) {
            if (response.isText) {
                res.json({
                    success: true,
                    data: {
                        type: 'text',
                        content: response.content,
                        size: response.size,
                        modified: response.modified
                    }
                });
            } else {
                // Binary file - return as base64
                res.json({
                    success: true,
                    data: {
                        type: 'binary',
                        content: response.content, // base64 encoded
                        size: response.size,
                        modified: response.modified,
                        mime: response.mime || 'application/octet-stream'
                    }
                });
            }
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to read file'
            });
        }
    } catch (error) {
        logger.error('Storage read error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Download file
router.get('/download', async (req, res) => {
    try {
        const filePath = req.query.path || '';
        const fileName = req.query.filename || filePath.split('/').pop();
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        // Request file from device
        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-read', 
            { path: filePath },
            true,
            60000 // 60 second timeout for downloads
        );

        if (response && response.success) {
            // Convert base64 to buffer
            const fileBuffer = Buffer.from(response.content, 'base64');
            
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', response.mime || 'application/octet-stream');
            res.setHeader('Content-Length', fileBuffer.length);
            res.send(fileBuffer);
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to download file'
            });
        }
    } catch (error) {
        logger.error('Storage download error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Upload file
router.post('/upload', async (req, res) => {
    try {
        const { path: destPath, filename, content, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!destPath || !filename || !content) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        // Send file to device
        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-write', 
            { 
                path: destPath, 
                filename, 
                content: content, // base64 encoded
                append: false 
            },
            true,
            60000 // 60 second timeout for uploads
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: 'File uploaded successfully',
                path: response.path
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to upload file'
            });
        }
    } catch (error) {
        logger.error('Storage upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create directory
router.post('/mkdir', async (req, res) => {
    try {
        const { path: dirPath, name, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!dirPath || !name) {
            return res.status(400).json({
                success: false,
                message: 'Path and name are required'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-mkdir', 
            { path: dirPath, name },
            true,
            10000
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: 'Directory created successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to create directory'
            });
        }
    } catch (error) {
        logger.error('Storage mkdir error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete file/directory
router.post('/delete', async (req, res) => {
    try {
        const { items, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!items || !items.length) {
            return res.status(400).json({
                success: false,
                message: 'No items selected'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-delete', 
            { items },
            true,
            30000
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: response.message || 'Items deleted successfully',
                data: response.results
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to delete items'
            });
        }
    } catch (error) {
        logger.error('Storage delete error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Rename file/directory
router.post('/rename', async (req, res) => {
    try {
        const { path: oldPath, newName, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!oldPath || !newName) {
            return res.status(400).json({
                success: false,
                message: 'Path and new name are required'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-rename', 
            { oldPath, newName },
            true,
            10000
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: 'Renamed successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to rename'
            });
        }
    } catch (error) {
        logger.error('Storage rename error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Move files
router.post('/move', async (req, res) => {
    try {
        const { items, destination, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!items || !items.length || !destination) {
            return res.status(400).json({
                success: false,
                message: 'Items and destination required'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-move', 
            { items, destination },
            true,
            30000
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: response.message || 'Items moved successfully',
                data: response.results
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to move items'
            });
        }
    } catch (error) {
        logger.error('Storage move error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Copy files
router.post('/copy', async (req, res) => {
    try {
        const { items, destination, deviceId = 'esp32-s3-1' } = req.body;
        
        if (!items || !items.length || !destination) {
            return res.status(400).json({
                success: false,
                message: 'Items and destination required'
            });
        }

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId, 
            'storage-copy', 
            { items, destination },
            true,
            60000 // Copy might take time
        );

        if (response && response.success) {
            res.json({
                success: true,
                message: response.message || 'Items copied successfully',
                data: response.results
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to copy items'
            });
        }
    } catch (error) {
        logger.error('Storage copy error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get SD card status (for dashboard)
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.json({
                success: true,
                data: {
                    mounted: false,
                    total: 0,
                    used: 0,
                    free: 0,
                    usagePercent: 0,
                    online: false
                }
            });
        }

        try {
            const response = await global.mqttService.publishCommand(
                deviceId, 
                'storage-info', 
                {},
                true,
                5000 // Short timeout for status check
            );

            if (response && response.success) {
                const usagePercent = response.total > 0 ? 
                    Math.round((response.used / response.total) * 100) : 0;
                
                res.json({
                    success: true,
                    data: {
                        mounted: true,
                        total: response.total,
                        used: response.used,
                        free: response.free,
                        usagePercent: usagePercent,
                        online: true
                    }
                });
            } else {
                res.json({
                    success: true,
                    data: {
                        mounted: false,
                        total: 0,
                        used: 0,
                        free: 0,
                        usagePercent: 0,
                        online: true,
                        error: 'SD card not available'
                    }
                });
            }
        } catch (error) {
            // Timeout or other error - device might be offline
            res.json({
                success: true,
                data: {
                    mounted: false,
                    total: 0,
                    used: 0,
                    free: 0,
                    usagePercent: 0,
                    online: false,
                    error: 'Device not responding'
                }
            });
        }
    } catch (error) {
        logger.error('Storage status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Helper function for breadcrumbs
function getBreadcrumbs(path) {
    if (!path) return [];
    const parts = path.split('/').filter(p => p);
    const breadcrumbs = [];
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        breadcrumbs.push({
            name: part,
            path: currentPath
        });
    }

    return breadcrumbs;
}

module.exports = router;