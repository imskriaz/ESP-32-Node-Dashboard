const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Get all USSD history
router.get('/history', async (req, res) => {
    try {
        const db = req.app.locals.db;
        if (!db) {
            throw new Error('Database not available');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const history = await db.all(`
            SELECT * FROM ussd 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const total = await db.get('SELECT COUNT(*) as count FROM ussd');

        res.json({
            success: true,
            data: history,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        logger.error('API USSD history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch USSD history: ' + error.message
        });
    }
});

// Send USSD request
router.post('/send', [
    body('code').notEmpty().withMessage('USSD code is required')
        .matches(/^[*#0-9]+$/).withMessage('Invalid USSD code format'),
    body('description').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { code, description } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        // Save initial request
        const result = await db.run(`
            INSERT INTO ussd (code, description, status, timestamp) 
            VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
        `, [code, description || 'USSD Request']);

        // Send via MQTT if connected
        if (global.mqttService && global.mqttService.connected) {
            try {
                const mqttResult = await global.mqttService.sendUssd('esp32-s3-1', code);
                
                if (mqttResult.success) {
                    logger.info(`USSD request sent: ${code}`);
                    
                    res.json({
                        success: true,
                        message: 'USSD request sent',
                        data: {
                            id: result.lastID,
                            code,
                            status: 'pending',
                            messageId: mqttResult.messageId
                        }
                    });
                } else {
                    // Update database to failed
                    await db.run(`
                        UPDATE ussd SET status = 'failed', response = ? WHERE id = ?
                    `, [mqttResult.error || 'Failed to send', result.lastID]);
                    
                    res.status(500).json({
                        success: false,
                        message: mqttResult.error || 'Failed to send USSD request'
                    });
                }
            } catch (mqttError) {
                logger.error('MQTT error sending USSD:', mqttError);
                
                // Update database to failed
                await db.run(`
                    UPDATE ussd SET status = 'failed', response = ? WHERE id = ?
                `, [mqttError.message, result.lastID]);
                
                res.status(500).json({
                    success: false,
                    message: 'MQTT error: ' + mqttError.message
                });
            }
        } else {
            // Fallback for testing
            logger.warn('MQTT not connected, using simulation');
            
            // Simulate response after delay
            setTimeout(async () => {
                try {
                    const mockResponse = `USSD Response for ${code}:\nYour request has been processed successfully.\nThank you for using our service.`;
                    
                    await db.run(`
                        UPDATE ussd 
                        SET response = ?, status = 'success' 
                        WHERE id = ?
                    `, [mockResponse, result.lastID]);
                    
                    if (req.io) {
                        req.io.emit('ussd:response', {
                            id: result.lastID,
                            code,
                            response: mockResponse
                        });
                    }
                } catch (dbError) {
                    logger.error('Error updating USSD response:', dbError);
                }
            }, 2000);
            
            res.json({
                success: true,
                message: 'USSD request sent (simulated)',
                data: {
                    id: result.lastID,
                    code,
                    status: 'pending'
                }
            });
        }
    } catch (error) {
        logger.error('API USSD send error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send USSD request: ' + error.message
        });
    }
});

// Get USSD session status
router.get('/session', (req, res) => {
    try {
        // In production, this would track actual USSD sessions
        res.json({
            success: true,
            data: {
                active: false,
                currentCode: null,
                lastRequest: null,
                menuLevel: 0,
                sessionId: null
            }
        });
    } catch (error) {
        logger.error('API USSD session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session status: ' + error.message
        });
    }
});

// End USSD session
router.post('/session/end', (req, res) => {
    try {
        // In production, this would end the actual USSD session
        res.json({
            success: true,
            message: 'USSD session ended'
        });
    } catch (error) {
        logger.error('API USSD end session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end USSD session: ' + error.message
        });
    }
});

// Delete USSD history entry
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.run('DELETE FROM ussd WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'USSD entry not found'
            });
        }

        res.json({
            success: true,
            message: 'USSD history deleted'
        });
    } catch (error) {
        logger.error('API USSD delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete USSD history: ' + error.message
        });
    }
});

// Clear all USSD history
router.delete('/history', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }
        
        await db.run('DELETE FROM ussd');

        res.json({
            success: true,
            message: 'All USSD history cleared'
        });
    } catch (error) {
        logger.error('API USSD clear error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear USSD history: ' + error.message
        });
    }
});

// ==================== USSD SETTINGS MANAGEMENT ====================

// Get all USSD settings
router.get('/settings', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }
        
        const settings = await db.all(`
            SELECT * FROM ussd_settings 
            ORDER BY sort_order ASC
        `);

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('API USSD settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch USSD settings: ' + error.message
        });
    }
});

// Get enabled USSD settings
router.get('/settings/enabled', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }
        
        const settings = await db.all(`
            SELECT * FROM ussd_settings 
            WHERE enabled = 1 
            ORDER BY sort_order ASC
        `);

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('API USSD enabled settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch enabled USSD settings: ' + error.message
        });
    }
});

// Update USSD setting
router.put('/settings/:key', [
    body('service_name').optional().notEmpty(),
    body('ussd_code').optional().notEmpty().matches(/^[*#0-9]+$/),
    body('description').optional(),
    body('icon').optional(),
    body('enabled').optional().isBoolean(),
    body('sort_order').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { key } = req.params;
        const { service_name, ussd_code, description, icon, enabled, sort_order } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        // Build update query
        let updates = [];
        let params = [];

        if (service_name !== undefined) {
            updates.push('service_name = ?');
            params.push(service_name);
        }
        if (ussd_code !== undefined) {
            updates.push('ussd_code = ?');
            params.push(ussd_code);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (icon !== undefined) {
            updates.push('icon = ?');
            params.push(icon);
        }
        if (enabled !== undefined) {
            updates.push('enabled = ?');
            params.push(enabled ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(key);
        const result = await db.run(`
            UPDATE ussd_settings 
            SET ${updates.join(', ')}
            WHERE service_key = ?
        `, params);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'USSD setting not found'
            });
        }

        logger.info(`USSD setting updated: ${key}`);

        const updated = await db.get('SELECT * FROM ussd_settings WHERE service_key = ?', [key]);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('ussd:settings-updated', updated);
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'USSD setting updated successfully',
            data: updated
        });
    } catch (error) {
        logger.error('API USSD settings update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update USSD setting: ' + error.message
        });
    }
});

// Create new USSD setting
router.post('/settings', [
    body('service_key').notEmpty().withMessage('Service key is required')
        .matches(/^[a-z0-9-]+$/).withMessage('Service key must be lowercase letters, numbers, and hyphens only'),
    body('service_name').notEmpty().withMessage('Service name is required'),
    body('ussd_code').notEmpty().withMessage('USSD code is required')
        .matches(/^[*#0-9]+$/).withMessage('Invalid USSD code format'),
    body('description').optional(),
    body('icon').optional(),
    body('enabled').optional().isBoolean(),
    body('sort_order').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { service_key, service_name, ussd_code, description, icon, enabled, sort_order } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        // Check if key already exists
        const existing = await db.get('SELECT id FROM ussd_settings WHERE service_key = ?', [service_key]);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Service key already exists'
            });
        }

        // Get max sort order
        const maxOrder = await db.get('SELECT MAX(sort_order) as max FROM ussd_settings');
        const newSortOrder = sort_order !== undefined ? sort_order : ((maxOrder.max || 0) + 1);

        await db.run(`
            INSERT INTO ussd_settings (service_key, service_name, ussd_code, description, icon, enabled, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [service_key, service_name, ussd_code, description || null, icon || 'question', enabled ? 1 : 0, newSortOrder]);

        logger.info(`New USSD setting created: ${service_key}`);

        const newSetting = await db.get('SELECT * FROM ussd_settings WHERE service_key = ?', [service_key]);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('ussd:settings-created', newSetting);
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'USSD setting created successfully',
            data: newSetting
        });
    } catch (error) {
        logger.error('API USSD settings create error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create USSD setting: ' + error.message
        });
    }
});

// Delete USSD setting
router.delete('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        const result = await db.run('DELETE FROM ussd_settings WHERE service_key = ?', [key]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'USSD setting not found'
            });
        }

        logger.info(`USSD setting deleted: ${key}`);

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('ussd:settings-deleted', { key });
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'USSD setting deleted successfully'
        });
    } catch (error) {
        logger.error('API USSD settings delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete USSD setting: ' + error.message
        });
    }
});

// Reorder settings
router.post('/settings/reorder', [
    body('order').isArray().withMessage('Order must be an array')
], async (req, res) => {
    try {
        const { order } = req.body;
        const db = req.app.locals.db;
        
        if (!db) {
            throw new Error('Database not available');
        }

        // Update sort order for each item
        for (let i = 0; i < order.length; i++) {
            await db.run(`
                UPDATE ussd_settings 
                SET sort_order = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE service_key = ?
            `, [i, order[i]]);
        }

        logger.info('USSD settings reordered');

        // Get updated settings
        const settings = await db.all('SELECT * FROM ussd_settings ORDER BY sort_order ASC');

        // Emit socket event
        try {
            if (req.io) {
                req.io.emit('ussd:settings-reordered', settings);
            }
        } catch (socketError) {
            logger.error('Error emitting socket event:', socketError);
        }

        res.json({
            success: true,
            message: 'Settings reordered successfully',
            data: settings
        });
    } catch (error) {
        logger.error('API USSD reorder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder settings: ' + error.message
        });
    }
});

module.exports = router;