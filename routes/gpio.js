const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// GPIO Pin Configuration Store (in production, use database)
let pinConfigs = new Map(); // deviceId -> { pin: config }
let pinStates = new Map(); // deviceId -> { pin: value }
let pinHistory = new Map(); // deviceId -> { pin: [{timestamp, value}] }
let pinGroups = new Map(); // deviceId -> { groupName: [pins] }
let pinRules = new Map(); // deviceId -> [{id, condition, action, enabled}]

// ESP32-S3 Pin Mapping
const ESP32_S3_PINS = {
    // Digital pins
    digital: Array.from({ length: 40 }, (_, i) => ({
        pin: i,
        name: `GPIO${i}`,
        capabilities: {
            digital: true,
            analog: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(i), // ADC1 pins
            pwm: ![28, 29, 30, 31].includes(i), // Most pins support PWM
            touch: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(i), // Touch sensors
            dac: [17, 18].includes(i) // DAC pins
        },
        defaultMode: 'input',
        pullup: i !== 0, // Most pins have internal pullup
        pulldown: i !== 0,
        voltage: 3.3,
        maxCurrent: 40 // mA
    })),

    // Special pins
    special: [
        { pin: 0, name: 'GPIO0', note: 'Boot mode (strap pin)' },
        { pin: 1, name: 'UART0_TXD', note: 'Console output' },
        { pin: 2, name: 'GPIO2', note: 'Built-in LED on some boards' },
        { pin: 3, name: 'UART0_RXD', note: 'Console input' },
        { pin: 4, name: 'GPIO4', note: 'Camera (SIOD)' },
        { pin: 5, name: 'GPIO5', note: 'Camera (VSYNC)' },
        { pin: 6, name: 'GPIO6', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 7, name: 'GPIO7', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 8, name: 'GPIO8', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 9, name: 'GPIO9', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 10, name: 'GPIO10', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 11, name: 'GPIO11', note: 'Flash (SPI) - DO NOT USE' },
        { pin: 14, name: 'GPIO14', note: 'Camera (XCLK)' },
        { pin: 15, name: 'GPIO15', note: 'Camera (Y9)' },
        { pin: 16, name: 'GPIO16', note: 'Camera (Y8)' },
        { pin: 17, name: 'GPIO17', note: 'Camera (Y7), DAC1' },
        { pin: 18, name: 'GPIO18', note: 'Camera (Y6), DAC2' },
        { pin: 19, name: 'GPIO19', note: 'Camera (Y5)' },
        { pin: 20, name: 'GPIO20', note: 'Camera (Y4)' },
        { pin: 21, name: 'GPIO21', note: 'Camera (Y3)' },
        { pin: 35, name: 'GPIO35', note: 'Camera (Y2)' },
        { pin: 36, name: 'GPIO36', note: 'Camera (Y1), ADC1_CH0' },
        { pin: 37, name: 'GPIO37', note: 'Camera (Y0), ADC1_CH1' },
        { pin: 38, name: 'GPIO38', note: 'Camera (PCLK), ADC1_CH2' },
        { pin: 39, name: 'GPIO39', note: 'Camera (HREF), ADC1_CH3' }
    ]
};

// ==================== GPIO CONFIGURATION ====================

/**
 * Get all pins status
 * GET /api/gpio/status?deviceId=esp32-s3-1
 */
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        if (!global.mqttService || !global.mqttService.connected) {
            return res.json({
                success: true,
                data: {
                    pins: getLocalPinStates(deviceId),
                    groups: Array.from(pinGroups.get(deviceId) || []),
                    rules: Array.from(pinRules.get(deviceId) || []),
                    online: false
                }
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-status',
            {},
            true,
            5000
        );

        if (response && response.success) {
            // Update local cache
            updatePinStates(deviceId, response.pins);
            
            res.json({
                success: true,
                data: {
                    pins: response.pins || [],
                    groups: Array.from(pinGroups.get(deviceId) || []),
                    rules: Array.from(pinRules.get(deviceId) || []),
                    online: true
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    pins: getLocalPinStates(deviceId),
                    groups: Array.from(pinGroups.get(deviceId) || []),
                    rules: Array.from(pinRules.get(deviceId) || []),
                    online: false
                }
            });
        }
    } catch (error) {
        logger.error('GPIO status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get GPIO status: ' + error.message
        });
    }
});

/**
 * Get pin configuration
 * GET /api/gpio/pin/:pin?deviceId=esp32-s3-1
 */
router.get('/pin/:pin', (req, res) => {
    try {
        const pin = parseInt(req.params.pin);
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        const config = pinConfigs.get(deviceId)?.[pin] || {
            mode: 'input',
            pull: 'none',
            value: 0,
            analog: 0,
            pwm: 0,
            frequency: 1000,
            lastChange: null
        };

        const capabilities = ESP32_S3_PINS.digital.find(p => p.pin === pin)?.capabilities || {
            digital: true,
            analog: false,
            pwm: false,
            touch: false,
            dac: false
        };

        res.json({
            success: true,
            data: {
                pin,
                config,
                capabilities,
                currentValue: pinStates.get(deviceId)?.[pin] || 0,
                history: pinHistory.get(deviceId)?.[pin]?.slice(-10) || []
            }
        });
    } catch (error) {
        logger.error('GPIO pin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get pin info: ' + error.message
        });
    }
});

/**
 * Configure pin mode
 * POST /api/gpio/mode
 */
router.post('/mode', [
    body('pin').isInt({ min: 0, max: 39 }),
    body('mode').isIn(['input', 'output', 'input_pullup', 'input_pulldown', 'open_drain']),
    body('pull').optional().isIn(['none', 'up', 'down']),
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

        const { pin, mode, pull, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        // Save to local config
        if (!pinConfigs.has(deviceId)) {
            pinConfigs.set(deviceId, {});
        }
        const deviceConfig = pinConfigs.get(deviceId);
        deviceConfig[pin] = { ...deviceConfig[pin], mode, pull, updatedAt: new Date().toISOString() };
        pinConfigs.set(deviceId, deviceConfig);

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-mode',
            { pin, mode, pull },
            true,
            5000
        );

        if (response && response.success) {
            logger.info(`GPIO pin ${pin} mode set to ${mode}`);
            res.json({
                success: true,
                message: `Pin ${pin} configured as ${mode}`,
                data: { pin, mode, pull }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to configure pin'
            });
        }
    } catch (error) {
        logger.error('GPIO mode error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set pin mode: ' + error.message
        });
    }
});

/**
 * Write to pin
 * POST /api/gpio/write
 */
router.post('/write', [
    body('pin').isInt({ min: 0, max: 39 }),
    body('value').custom(value => {
        if (typeof value === 'boolean') return true;
        if (typeof value === 'number') return value >= 0 && value <= 255;
        return false;
    }),
    body('type').optional().isIn(['digital', 'pwm', 'dac']),
    body('duration').optional().isInt({ min: 0, max: 3600000 }), // ms
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

        const { pin, value, type = 'digital', duration, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const command = {
            pin,
            value: type === 'digital' ? (value ? 1 : 0) : value,
            type
        };

        if (duration) {
            command.duration = duration;
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            command,
            true,
            5000
        );

        if (response && response.success) {
            // Update local state
            if (!pinStates.has(deviceId)) {
                pinStates.set(deviceId, {});
            }
            pinStates.get(deviceId)[pin] = command.value;

            // Add to history
            if (!pinHistory.has(deviceId)) {
                pinHistory.set(deviceId, {});
            }
            if (!pinHistory.get(deviceId)[pin]) {
                pinHistory.get(deviceId)[pin] = [];
            }
            pinHistory.get(deviceId)[pin].push({
                timestamp: new Date().toISOString(),
                value: command.value,
                type
            });
            // Keep last 100 values
            if (pinHistory.get(deviceId)[pin].length > 100) {
                pinHistory.get(deviceId)[pin].shift();
            }

            logger.info(`GPIO pin ${pin} written with value ${value} (${type})`);
            
            // If duration set, schedule auto-reset
            if (duration) {
                setTimeout(async () => {
                    try {
                        await global.mqttService.publishCommand(
                            deviceId,
                            'gpio-write',
                            { pin, value: 0, type: 'digital' }
                        );
                        pinStates.get(deviceId)[pin] = 0;
                        logger.info(`GPIO pin ${pin} auto-reset after ${duration}ms`);
                    } catch (err) {
                        logger.error('Auto-reset failed:', err);
                    }
                }, duration);
            }

            res.json({
                success: true,
                message: `Pin ${pin} set to ${value}`,
                data: { pin, value, type, duration }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to write to pin'
            });
        }
    } catch (error) {
        logger.error('GPIO write error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to write to pin: ' + error.message
        });
    }
});

/**
 * Read from pin
 * GET /api/gpio/read/:pin?deviceId=esp32-s3-1
 */
router.get('/read/:pin', async (req, res) => {
    try {
        const pin = parseInt(req.params.pin);
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const type = req.query.type || 'digital'; // digital, analog

        if (!global.mqttService || !global.mqttService.connected) {
            const cached = pinStates.get(deviceId)?.[pin] || 0;
            return res.json({
                success: true,
                data: {
                    pin,
                    value: cached,
                    type,
                    cached: true,
                    timestamp: new Date().toISOString()
                }
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-read',
            { pin, type },
            true,
            5000
        );

        if (response && response.success) {
            // Update cache
            if (!pinStates.has(deviceId)) {
                pinStates.set(deviceId, {});
            }
            pinStates.get(deviceId)[pin] = response.value;

            res.json({
                success: true,
                data: {
                    pin,
                    value: response.value,
                    type,
                    raw: response.raw,
                    voltage: response.voltage,
                    timestamp: response.timestamp
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to read pin'
            });
        }
    } catch (error) {
        logger.error('GPIO read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to read pin: ' + error.message
        });
    }
});

// ==================== PIN GROUPS ====================

/**
 * Create pin group
 * POST /api/gpio/groups
 */
router.post('/groups', [
    body('name').notEmpty(),
    body('pins').isArray(),
    body('deviceId').optional()
], (req, res) => {
    try {
        const { name, pins, deviceId = 'esp32-s3-1' } = req.body;

        if (!pinGroups.has(deviceId)) {
            pinGroups.set(deviceId, new Map());
        }
        
        pinGroups.get(deviceId).set(name, {
            pins,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        logger.info(`GPIO group created: ${name} with pins ${pins.join(',')}`);

        res.json({
            success: true,
            message: `Group "${name}" created`,
            data: { name, pins }
        });
    } catch (error) {
        logger.error('GPIO group error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create group: ' + error.message
        });
    }
});

/**
 * Write to group
 * POST /api/gpio/groups/:name/write
 */
router.post('/groups/:name/write', [
    body('values').isObject(),
    body('deviceId').optional()
], async (req, res) => {
    try {
        const { name } = req.params;
        const { values, deviceId = 'esp32-s3-1' } = req.body;

        const group = pinGroups.get(deviceId)?.get(name);
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        const results = [];
        for (const pin of group.pins) {
            if (values[pin] !== undefined) {
                try {
                    await global.mqttService.publishCommand(
                        deviceId,
                        'gpio-write',
                        { pin, value: values[pin] }
                    );
                    results.push({ pin, success: true, value: values[pin] });
                } catch (err) {
                    results.push({ pin, success: false, error: err.message });
                }
            }
        }

        res.json({
            success: true,
            message: `Group "${name}" updated`,
            data: results
        });
    } catch (error) {
        logger.error('GPIO group write error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to write to group: ' + error.message
        });
    }
});

// ==================== AUTOMATION RULES ====================

/**
 * Create automation rule
 * POST /api/gpio/rules
 */
router.post('/rules', [
    body('name').notEmpty(),
    body('condition').notEmpty(),
    body('action').notEmpty(),
    body('enabled').optional().isBoolean(),
    body('deviceId').optional()
], (req, res) => {
    try {
        const { name, condition, action, enabled = true, deviceId = 'esp32-s3-1' } = req.body;

        if (!pinRules.has(deviceId)) {
            pinRules.set(deviceId, []);
        }

        const rule = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            name,
            condition,
            action,
            enabled,
            createdAt: new Date().toISOString(),
            lastTriggered: null,
            triggerCount: 0
        };

        pinRules.get(deviceId).push(rule);

        logger.info(`GPIO rule created: ${name}`);

        res.json({
            success: true,
            message: `Rule "${name}" created`,
            data: rule
        });
    } catch (error) {
        logger.error('GPIO rule error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create rule: ' + error.message
        });
    }
});

/**
 * Update rule
 * PUT /api/gpio/rules/:id
 */
router.put('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const rules = pinRules.get(deviceId);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'No rules found'
            });
        }

        const index = rules.findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Rule not found'
            });
        }

        rules[index] = { ...rules[index], ...updates, updatedAt: new Date().toISOString() };

        res.json({
            success: true,
            message: 'Rule updated',
            data: rules[index]
        });
    } catch (error) {
        logger.error('GPIO rule update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rule: ' + error.message
        });
    }
});

/**
 * Delete rule
 * DELETE /api/gpio/rules/:id
 */
router.delete('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const rules = pinRules.get(deviceId);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'No rules found'
            });
        }

        const newRules = rules.filter(r => r.id !== id);
        pinRules.set(deviceId, newRules);

        res.json({
            success: true,
            message: 'Rule deleted'
        });
    } catch (error) {
        logger.error('GPIO rule delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete rule: ' + error.message
        });
    }
});

/**
 * Test rule condition
 * POST /api/gpio/rules/test
 */
router.post('/rules/test', [
    body('condition').notEmpty(),
    body('values').isObject()
], (req, res) => {
    try {
        const { condition, values } = req.body;
        
        // Simple condition evaluator
        const result = evaluateCondition(condition, values);
        
        res.json({
            success: true,
            data: {
                result,
                condition,
                values
            }
        });
    } catch (error) {
        logger.error('GPIO rule test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test condition: ' + error.message
        });
    }
});

// ==================== CALCULATIONS ====================

/**
 * Convert analog reading to meaningful values
 * POST /api/gpio/calculate
 */
router.post('/calculate', [
    body('pin').isInt(),
    body('value').isNumeric(),
    body('formula').optional()
], (req, res) => {
    try {
        const { pin, value, formula } = req.body;
        
        const conversions = {
            voltage: (val) => (val / 4095) * 3.3,
            temperature: (val) => ((val / 4095) * 3.3 - 0.5) * 100, // LM35
            light: (val) => 100 - (val / 4095 * 100), // LDR (inverse)
            distance: (val) => 12343.85 * Math.pow(val, -1.15), // Sharp IR
            battery: (val) => (val / 4095) * 3.3 * 2, // Voltage divider
            percentage: (val) => (val / 4095) * 100
        };

        const results = {};
        for (const [key, fn] of Object.entries(conversions)) {
            results[key] = fn(value);
        }

        if (formula) {
            try {
                // Safe eval with available variables
                const context = { val: value, pin, ...results };
                const func = new Function(...Object.keys(context), `return ${formula}`);
                results.custom = func(...Object.values(context));
            } catch (e) {
                results.custom = 'Invalid formula';
            }
        }

        res.json({
            success: true,
            data: {
                raw: value,
                pin,
                ...results
            }
        });
    } catch (error) {
        logger.error('GPIO calculate error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate: ' + error.message
        });
    }
});

// ==================== HELPER FUNCTIONS ====================

function updatePinStates(deviceId, pins) {
    if (!pinStates.has(deviceId)) {
        pinStates.set(deviceId, {});
    }
    const states = pinStates.get(deviceId);
    
    pins.forEach(pin => {
        states[pin.pin] = pin.value;
        
        // Add to history
        if (!pinHistory.has(deviceId)) {
            pinHistory.set(deviceId, {});
        }
        if (!pinHistory.get(deviceId)[pin.pin]) {
            pinHistory.get(deviceId)[pin.pin] = [];
        }
        pinHistory.get(deviceId)[pin.pin].push({
            timestamp: new Date().toISOString(),
            value: pin.value,
            mode: pin.mode
        });
        // Keep last 100
        if (pinHistory.get(deviceId)[pin.pin].length > 100) {
            pinHistory.get(deviceId)[pin.pin].shift();
        }
    });
}

function getLocalPinStates(deviceId) {
    const states = pinStates.get(deviceId) || {};
    return Object.entries(states).map(([pin, value]) => ({
        pin: parseInt(pin),
        value,
        config: pinConfigs.get(deviceId)?.[pin] || { mode: 'input' }
    }));
}

function evaluateCondition(condition, values) {
    try {
        // Create safe evaluation context
        const context = { ...values };
        const keys = Object.keys(context);
        const values_list = Object.values(context);
        
        // Create function with context variables
        const func = new Function(...keys, `return ${condition}`);
        return func(...values_list);
    } catch (e) {
        logger.error('Condition evaluation error:', e);
        return false;
    }
}

module.exports = router;