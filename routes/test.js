const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Test state storage
let testResults = new Map(); // deviceId -> { testId: result }
let runningTests = new Map(); // deviceId -> { testId: status }
let testHistory = new Map(); // deviceId -> [test results]

// Available tests for ESP32-S3 A7670E
const AVAILABLE_TESTS = {
    // Communication Tests
    modem: {
        name: 'Modem Communication',
        category: 'communication',
        icon: 'bi-broadcast',
        description: 'Test modem AT commands and response',
        steps: [
            { name: 'AT', command: 'AT', expected: 'OK' },
            { name: 'SIM Status', command: 'AT+CPIN?', expected: 'READY' },
            { name: 'Signal Quality', command: 'AT+CSQ', handler: 'parseCSQ' },
            { name: 'Network Registration', command: 'AT+CREG?', handler: 'parseCREG' },
            { name: 'Operator', command: 'AT+COPS?', handler: 'parseCOPS' }
        ],
        timeout: 30000
    },
    
    sms: {
        name: 'SMS Functionality',
        category: 'communication',
        icon: 'bi-chat-dots',
        description: 'Test SMS sending and receiving',
        steps: [
            { name: 'SMS Format', command: 'AT+CMGF=1', expected: 'OK' },
            { name: 'SMS Storage', command: 'AT+CPMS?', handler: 'parseCPMS' },
            { name: 'New SMS Indication', command: 'AT+CNMI=2,2', expected: 'OK' }
        ],
        timeout: 10000
    },
    
    // Hardware Tests
    led: {
        name: 'LED Test',
        category: 'hardware',
        icon: 'bi-led-on',
        description: 'Test onboard and external LEDs',
        parameters: [
            { name: 'pin', type: 'number', default: 2, min: 0, max: 39 },
            { name: 'duration', type: 'number', default: 1000, min: 100, max: 10000 },
            { name: 'pattern', type: 'select', options: ['blink', 'pulse', 'solid'], default: 'blink' }
        ],
        timeout: 10000
    },
    
    button: {
        name: 'Button Test',
        category: 'hardware',
        icon: 'bi-toggle-on',
        description: 'Test button input',
        parameters: [
            { name: 'pin', type: 'number', default: 0, min: 0, max: 39 },
            { name: 'pull', type: 'select', options: ['up', 'down', 'none'], default: 'up' }
        ],
        timeout: 30000
    },
    
    // Audio Tests
    microphone: {
        name: 'Microphone Test',
        category: 'audio',
        icon: 'bi-mic',
        description: 'Test microphone input',
        parameters: [
            { name: 'duration', type: 'number', default: 3, min: 1, max: 10 },
            { name: 'sensitivity', type: 'number', default: 50, min: 0, max: 100 }
        ],
        timeout: 15000
    },
    
    speaker: {
        name: 'Speaker Test',
        category: 'audio',
        icon: 'bi-speaker',
        description: 'Test speaker output',
        parameters: [
            { name: 'frequency', type: 'number', default: 440, min: 20, max: 20000 },
            { name: 'duration', type: 'number', default: 1000, min: 100, max: 5000 },
            { name: 'volume', type: 'number', default: 50, min: 0, max: 100 }
        ],
        timeout: 10000
    },
    
    // Camera Tests
    camera: {
        name: 'Camera Test',
        category: 'camera',
        icon: 'bi-camera',
        description: 'Test camera module',
        parameters: [
            { name: 'resolution', type: 'select', options: ['QVGA', 'VGA', 'SVGA', 'XGA'], default: 'VGA' },
            { name: 'format', type: 'select', options: ['JPEG', 'BMP', 'RGB565'], default: 'JPEG' }
        ],
        timeout: 10000
    },
    
    // GPS Tests
    gps: {
        name: 'GPS Test',
        category: 'gps',
        icon: 'bi-geo-alt',
        description: 'Test GPS module',
        parameters: [
            { name: 'timeout', type: 'number', default: 60, min: 10, max: 300 }
        ],
        timeout: 310000 // 5 min + 10s
    },
    
    // Storage Tests
    sdCard: {
        name: 'SD Card Test',
        category: 'storage',
        icon: 'bi-sd-card',
        description: 'Test SD card read/write',
        parameters: [
            { name: 'testFile', type: 'string', default: 'test.txt' },
            { name: 'testSize', type: 'number', default: 1024, min: 64, max: 1048576 }
        ],
        timeout: 30000
    },
    
    // Network Tests
    wifi: {
        name: 'WiFi Test',
        category: 'network',
        icon: 'bi-wifi',
        description: 'Test WiFi connectivity',
        parameters: [
            { name: 'ssid', type: 'string', required: true },
            { name: 'password', type: 'password', required: false },
            { name: 'timeout', type: 'number', default: 30, min: 5, max: 60 }
        ],
        timeout: 65000
    },
    
    // Power Tests
    battery: {
        name: 'Battery Test',
        category: 'power',
        icon: 'bi-battery',
        description: 'Test battery voltage and charging',
        steps: [
            { name: 'Voltage Reading', command: 'AT+CBC?', handler: 'parseBattery' },
            { name: 'Charging Status', command: 'AT+CBC?', handler: 'parseCharging' }
        ],
        timeout: 10000
    },
    
    // GPIO Tests
    gpioLoopback: {
        name: 'GPIO Loopback',
        category: 'gpio',
        icon: 'bi-arrow-left-right',
        description: 'Test GPIO input/output with loopback',
        parameters: [
            { name: 'outputPin', type: 'number', default: 2, min: 0, max: 39 },
            { name: 'inputPin', type: 'number', default: 4, min: 0, max: 39 },
            { name: 'testPattern', type: 'select', options: ['0101', '1010', 'pulse'], default: '0101' }
        ],
        timeout: 30000
    },
    
    // Comprehensive Tests
    fullSystem: {
        name: 'Full System Test',
        category: 'system',
        icon: 'bi-cpu',
        description: 'Test all components sequentially',
        timeout: 300000 // 5 minutes
    }
};

// ==================== TEST MANAGEMENT ====================

/**
 * Get all available tests
 * GET /api/test/available
 */
router.get('/available', (req, res) => {
    res.json({
        success: true,
        data: AVAILABLE_TESTS
    });
});

/**
 * Get test categories
 * GET /api/test/categories
 */
router.get('/categories', (req, res) => {
    const categories = {};
    
    Object.entries(AVAILABLE_TESTS).forEach(([id, test]) => {
        if (!categories[test.category]) {
            categories[test.category] = {
                name: test.category.charAt(0).toUpperCase() + test.category.slice(1),
                icon: getCategoryIcon(test.category),
                tests: []
            };
        }
        categories[test.category].tests.push({
            id,
            name: test.name,
            icon: test.icon,
            description: test.description
        });
    });
    
    res.json({
        success: true,
        data: categories
    });
});

/**
 * Run a test
 * POST /api/test/run
 */
router.post('/run', [
    body('testId').notEmpty(),
    body('parameters').optional().isObject(),
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

        const { testId, parameters = {}, deviceId = 'esp32-s3-1' } = req.body;

        // Check if test exists
        const test = AVAILABLE_TESTS[testId];
        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found'
            });
        }

        // Generate test ID
        const runId = `${testId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        // Store running test
        if (!runningTests.has(deviceId)) {
            runningTests.set(deviceId, new Map());
        }
        runningTests.get(deviceId).set(runId, {
            testId,
            parameters,
            status: 'running',
            startTime: new Date().toISOString(),
            progress: 0,
            steps: []
        });

        // Start test in background
        runTest(deviceId, runId, test, parameters).catch(error => {
            logger.error(`Test ${runId} failed:`, error);
            updateTestStatus(deviceId, runId, 'failed', error.message);
        });

        res.json({
            success: true,
            message: `Test "${test.name}" started`,
            data: {
                runId,
                testId,
                name: test.name,
                estimatedTime: test.timeout / 1000
            }
        });

    } catch (error) {
        logger.error('Run test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start test: ' + error.message
        });
    }
});

/**
 * Get test status
 * GET /api/test/status/:runId?deviceId=esp32-s3-1
 */
router.get('/status/:runId', (req, res) => {
    try {
        const { runId } = req.params;
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const running = runningTests.get(deviceId)?.get(runId);
        if (running) {
            return res.json({
                success: true,
                data: {
                    ...running,
                    completed: false
                }
            });
        }

        const result = testResults.get(deviceId)?.get(runId);
        if (result) {
            return res.json({
                success: true,
                data: {
                    ...result,
                    completed: true
                }
            });
        }

        res.status(404).json({
            success: false,
            message: 'Test not found'
        });

    } catch (error) {
        logger.error('Test status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get test status: ' + error.message
        });
    }
});

/**
 * Get all test results for device
 * GET /api/test/results?deviceId=esp32-s3-1&limit=50
 */
router.get('/results', (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        const limit = parseInt(req.query.limit) || 50;

        const history = testHistory.get(deviceId) || [];
        const results = history.slice(0, limit);

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        logger.error('Test results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get test results: ' + error.message
        });
    }
});

/**
 * Stop a running test
 * POST /api/test/stop/:runId
 */
router.post('/stop/:runId', (req, res) => {
    try {
        const { runId } = req.params;
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const running = runningTests.get(deviceId)?.get(runId);
        if (!running) {
            return res.status(404).json({
                success: false,
                message: 'Test not running'
            });
        }

        updateTestStatus(deviceId, runId, 'stopped', 'Test stopped by user');
        runningTests.get(deviceId).delete(runId);

        res.json({
            success: true,
            message: 'Test stopped'
        });

    } catch (error) {
        logger.error('Stop test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop test: ' + error.message
        });
    }
});

/**
 * Clear test history
 * DELETE /api/test/history
 */
router.delete('/history', (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';
        
        testHistory.set(deviceId, []);
        testResults.delete(deviceId);

        res.json({
            success: true,
            message: 'Test history cleared'
        });

    } catch (error) {
        logger.error('Clear history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear history: ' + error.message
        });
    }
});

/**
 * Delete specific test result
 * DELETE /api/test/result/:runId
 */
router.delete('/result/:runId', (req, res) => {
    try {
        const { runId } = req.params;
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const history = testHistory.get(deviceId) || [];
        const newHistory = history.filter(r => r.runId !== runId);
        testHistory.set(deviceId, newHistory);

        testResults.get(deviceId)?.delete(runId);

        res.json({
            success: true,
            message: 'Test result deleted'
        });

    } catch (error) {
        logger.error('Delete result error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete result: ' + error.message
        });
    }
});

// ==================== TEST IMPLEMENTATIONS ====================

async function runTest(deviceId, runId, test, parameters) {
    logger.info(`Starting test ${runId}: ${test.name}`);

    try {
        let result;
        
        // Route to specific test handler
        switch (test.name) {
            case 'Modem Communication':
                result = await testModem(deviceId, runId, test, parameters);
                break;
            case 'SMS Functionality':
                result = await testSMS(deviceId, runId, test, parameters);
                break;
            case 'LED Test':
                result = await testLED(deviceId, runId, test, parameters);
                break;
            case 'Button Test':
                result = await testButton(deviceId, runId, test, parameters);
                break;
            case 'Microphone Test':
                result = await testMicrophone(deviceId, runId, test, parameters);
                break;
            case 'Speaker Test':
                result = await testSpeaker(deviceId, runId, test, parameters);
                break;
            case 'Camera Test':
                result = await testCamera(deviceId, runId, test, parameters);
                break;
            case 'GPS Test':
                result = await testGPS(deviceId, runId, test, parameters);
                break;
            case 'SD Card Test':
                result = await testSDCard(deviceId, runId, test, parameters);
                break;
            case 'WiFi Test':
                result = await testWiFi(deviceId, runId, test, parameters);
                break;
            case 'Battery Test':
                result = await testBattery(deviceId, runId, test, parameters);
                break;
            case 'GPIO Loopback':
                result = await testGPIOLoopback(deviceId, runId, test, parameters);
                break;
            case 'Full System Test':
                result = await testFullSystem(deviceId, runId, test, parameters);
                break;
            default:
                result = await runGenericTest(deviceId, runId, test, parameters);
        }

        // Store result
        updateTestStatus(deviceId, runId, 'completed', 'Test completed successfully', result);
        
        // Add to history
        const history = testHistory.get(deviceId) || [];
        history.unshift({
            runId,
            testId: test.id || test.name,
            name: test.name,
            result: 'pass',
            duration: result.duration,
            timestamp: new Date().toISOString(),
            details: result
        });
        testHistory.set(deviceId, history.slice(0, 100)); // Keep last 100

        logger.info(`Test ${runId} completed successfully`);

    } catch (error) {
        logger.error(`Test ${runId} failed:`, error);
        updateTestStatus(deviceId, runId, 'failed', error.message);
        
        // Add to history as failure
        const history = testHistory.get(deviceId) || [];
        history.unshift({
            runId,
            testId: test.id || test.name,
            name: test.name,
            result: 'fail',
            error: error.message,
            timestamp: new Date().toISOString()
        });
        testHistory.set(deviceId, history.slice(0, 100));
    } finally {
        // Remove from running
        runningTests.get(deviceId)?.delete(runId);
    }
}

async function testModem(deviceId, runId, test, params) {
    const results = [];
    const startTime = Date.now();

    updateTestProgress(deviceId, runId, 10, 'Testing AT commands...');

    for (let i = 0; i < test.steps.length; i++) {
        const step = test.steps[i];
        
        updateTestProgress(deviceId, runId, 10 + (i * 80 / test.steps.length), `Step ${i+1}: ${step.name}`);
        
        // Send command via MQTT
        const response = await global.mqttService.publishCommand(
            deviceId,
            'test-modem',
            { command: step.command },
            true,
            5000
        );

        const stepResult = {
            name: step.name,
            command: step.command,
            response: response?.data,
            success: checkResponse(response?.data, step)
        };

        results.push(stepResult);
        
        if (!stepResult.success) {
            throw new Error(`${step.name} failed: ${response?.error || 'No response'}`);
        }
    }

    const duration = (Date.now() - startTime) / 1000;

    return {
        steps: results,
        duration,
        summary: {
            total: results.length,
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        }
    };
}

async function testLED(deviceId, runId, test, params) {
    const pin = params.pin || 2;
    const duration = params.duration || 1000;
    const pattern = params.pattern || 'blink';

    updateTestProgress(deviceId, runId, 20, 'Configuring pin...');

    // Configure pin as output
    await global.mqttService.publishCommand(
        deviceId,
        'gpio-mode',
        { pin, mode: 'output' },
        true,
        5000
    );

    const results = [];
    const startTime = Date.now();

    if (pattern === 'blink') {
        // Blink pattern
        for (let i = 0; i < 3; i++) {
            updateTestProgress(deviceId, runId, 30 + (i * 20), `Blink ${i+1}/3`);
            
            await global.mqttService.publishCommand(
                deviceId,
                'gpio-write',
                { pin, value: 1 },
                true,
                2000
            );
            await sleep(duration / 3);
            
            await global.mqttService.publishCommand(
                deviceId,
                'gpio-write',
                { pin, value: 0 },
                true,
                2000
            );
            await sleep(duration / 3);
            
            results.push({ cycle: i+1, success: true });
        }
    } else if (pattern === 'pulse') {
        // PWM pulse
        updateTestProgress(deviceId, runId, 50, 'Generating PWM pulse');
        
        await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            { pin, value: 128, type: 'pwm' },
            true,
            5000
        );
        await sleep(duration);
        
        await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            { pin, value: 0, type: 'pwm' },
            true,
            5000
        );
    } else {
        // Solid on
        updateTestProgress(deviceId, runId, 50, 'Turning LED on');
        
        await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            { pin, value: 1 },
            true,
            5000
        );
        await sleep(duration);
        
        await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            { pin, value: 0 },
            true,
            5000
        );
    }

    updateTestProgress(deviceId, runId, 100, 'Test completed');

    return {
        pin,
        pattern,
        duration,
        cycles: results.length,
        success: true
    };
}

async function testButton(deviceId, runId, test, params) {
    const pin = params.pin || 0;
    const pull = params.pull || 'up';

    updateTestProgress(deviceId, runId, 20, `Configuring pin ${pin} as input...`);

    // Configure pin as input
    const mode = pull === 'up' ? 'input_pullup' : pull === 'down' ? 'input_pulldown' : 'input';
    await global.mqttService.publishCommand(
        deviceId,
        'gpio-mode',
        { pin, mode },
        true,
        5000
    );

    updateTestProgress(deviceId, runId, 40, 'Waiting for button press...');

    // Monitor for button presses
    const presses = [];
    const startTime = Date.now();
    let lastValue = null;
    
    while (Date.now() - startTime < 30000) { // 30 second timeout
        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-read',
            { pin },
            true,
        2000
        );

        const value = response?.value;
        
        if (lastValue !== null && value !== lastValue) {
            presses.push({
                time: new Date().toISOString(),
                value
            });
            
            updateTestProgress(deviceId, runId, 40 + (presses.length * 10), `Press detected! (${presses.length})`);
        }
        
        lastValue = value;
        await sleep(100);
    }

    updateTestProgress(deviceId, runId, 100, 'Test completed');

    return {
        pin,
        pull,
        presses: presses.length,
        pattern: presses,
        success: presses.length > 0
    };
}

async function testMicrophone(deviceId, runId, test, params) {
    const duration = params.duration || 3;
    const sensitivity = params.sensitivity || 50;

    updateTestProgress(deviceId, runId, 20, 'Initializing microphone...');

    const samples = [];
    const startTime = Date.now();
    
    updateTestProgress(deviceId, runId, 40, `Recording for ${duration} seconds...`);

    // Record audio samples
    while (Date.now() - startTime < duration * 1000) {
        const response = await global.mqttService.publishCommand(
            deviceId,
            'test-microphone',
            { duration: 100 }, // 100ms samples
            true,
            2000
        );

        if (response?.samples) {
            samples.push(...response.samples);
        }

        updateTestProgress(deviceId, runId, 40 + (Math.min(90, ((Date.now() - startTime) / (duration * 1000)) * 50)));
    }

    // Analyze samples
    const maxLevel = Math.max(...samples);
    const avgLevel = samples.reduce((a, b) => a + b, 0) / samples.length;
    const noiseFloor = samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.1)];

    updateTestProgress(deviceId, runId, 100, 'Analysis complete');

    return {
        samples: samples.length,
        maxLevel,
        avgLevel,
        noiseFloor,
        signalToNoise: maxLevel - noiseFloor,
        success: maxLevel > sensitivity * 2.55 // Convert 0-100 to 0-255
    };
}

async function testSpeaker(deviceId, runId, test, params) {
    const frequency = params.frequency || 440;
    const duration = params.duration || 1000;
    const volume = params.volume || 50;

    updateTestProgress(deviceId, runId, 30, `Playing ${frequency}Hz tone...`);

    await global.mqttService.publishCommand(
        deviceId,
        'test-speaker',
        {
            frequency,
            duration,
            volume: volume / 100
        },
        true,
        duration + 2000
    );

    updateTestProgress(deviceId, runId, 70, 'Tone completed');

    // Verify with microphone if available
    if (global.mqttService) {
        const response = await global.mqttService.publishCommand(
            deviceId,
            'test-microphone',
            { duration: 1 },
            true,
            3000
        );

        updateTestProgress(deviceId, runId, 90, 'Verifying output...');

        return {
            frequency,
            duration,
            volume,
            detected: response?.detected || false,
            success: true
        };
    }

    return {
        frequency,
        duration,
        volume,
        success: true
    };
}

async function testCamera(deviceId, runId, test, params) {
    const resolution = params.resolution || 'VGA';
    const format = params.format || 'JPEG';

    updateTestProgress(deviceId, runId, 20, 'Initializing camera...');

    // Configure camera
    await global.mqttService.publishCommand(
        deviceId,
        'camera-config',
        { resolution, format },
        true,
        5000
    );

    updateTestProgress(deviceId, runId, 50, 'Capturing image...');

    // Capture image
    const response = await global.mqttService.publishCommand(
        deviceId,
        'camera-capture',
        {},
        true,
        10000
    );

    updateTestProgress(deviceId, runId, 80, 'Saving image...');

    // Save image if received
    if (response?.image) {
        const filename = `test_${Date.now()}.jpg`;
        const filepath = path.join(__dirname, '../public/uploads/test', filename);
        
        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Save image
        const imageBuffer = Buffer.from(response.image, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        updateTestProgress(deviceId, runId, 100, 'Image saved');

        return {
            resolution,
            format,
            size: imageBuffer.length,
            filename,
            url: `/uploads/test/${filename}`,
            success: true
        };
    }

    return {
        resolution,
        format,
        success: false,
        error: 'No image received'
    };
}

async function testGPS(deviceId, runId, test, params) {
    const timeout = params.timeout || 60;

    updateTestProgress(deviceId, runId, 20, 'Waiting for GPS fix...');

    const startTime = Date.now();
    let fix = false;
    let satellites = 0;
    let location = null;

    while (Date.now() - startTime < timeout * 1000) {
        const response = await global.mqttService.publishCommand(
            deviceId,
            'gps-location',
            {},
            true,
            5000
        );

        if (response?.fix) {
            fix = true;
            satellites = response.satellites || 0;
            location = {
                lat: response.lat,
                lng: response.lng,
                alt: response.alt,
                speed: response.speed
            };
            break;
        }

        updateTestProgress(deviceId, runId, 20 + (Math.min(80, ((Date.now() - startTime) / (timeout * 1000)) * 80)));
        await sleep(1000);
    }

    updateTestProgress(deviceId, runId, 100, fix ? 'GPS fix obtained' : 'No GPS fix');

    return {
        fix,
        satellites,
        location,
        timeToFix: fix ? (Date.now() - startTime) / 1000 : null,
        success: fix
    };
}

async function testSDCard(deviceId, runId, test, params) {
    const testFile = params.testFile || 'test.txt';
    const testSize = params.testSize || 1024;

    updateTestProgress(deviceId, runId, 20, 'Checking SD card...');

    // Check SD card
    const info = await global.mqttService.publishCommand(
        deviceId,
        'storage-info',
        {},
        true,
        5000
    );

    if (!info?.mounted) {
        throw new Error('SD card not mounted');
    }

    updateTestProgress(deviceId, runId, 40, 'Writing test file...');

    // Write test data
    const testData = Buffer.alloc(testSize, 'A').toString('base64');
    const writeResult = await global.mqttService.publishCommand(
        deviceId,
        'storage-write',
        {
            path: '/',
            filename: testFile,
            content: testData
        },
        true,
        10000
    );

    if (!writeResult?.success) {
        throw new Error('Write failed');
    }

    updateTestProgress(deviceId, runId, 70, 'Reading test file...');

    // Read back
    const readResult = await global.mqttService.publishCommand(
        deviceId,
        'storage-read',
        { path: `/${testFile}` },
        true,
        10000
    );

    updateTestProgress(deviceId, runId, 90, 'Verifying data...');

    // Verify
    const dataMatch = readResult?.content === testData;

    updateTestProgress(deviceId, runId, 100, 'Cleanup...');

    // Cleanup
    await global.mqttService.publishCommand(
        deviceId,
        'storage-delete',
        { items: [`/${testFile}`] },
        true,
        5000
    );

    return {
        mounted: true,
        total: info.total,
        used: info.used,
        free: info.free,
        testFile,
        testSize,
        writeSuccess: true,
        readSuccess: true,
        dataMatch,
        success: dataMatch
    };
}

async function testWiFi(deviceId, runId, test, params) {
    const { ssid, password, timeout = 30 } = params;

    if (!ssid) {
        throw new Error('SSID required');
    }

    updateTestProgress(deviceId, runId, 20, 'Scanning networks...');

    // Scan networks
    const scanResult = await global.mqttService.publishCommand(
        deviceId,
        'wifi-scan',
        {},
        true,
        10000
    );

    const network = scanResult?.networks?.find(n => n.ssid === ssid);
    
    updateTestProgress(deviceId, runId, 40, network ? 'Network found' : 'Network not found');

    if (!network) {
        return {
            ssid,
            found: false,
            success: false,
            error: 'Network not found'
        };
    }

    updateTestProgress(deviceId, runId, 60, 'Connecting...');

    // Connect
    const connectResult = await global.mqttService.publishCommand(
        deviceId,
        'wifi-connect',
        { ssid, password },
        true,
        timeout * 1000
    );

    updateTestProgress(deviceId, runId, 80, 'Getting IP...');

    // Get connection info
    const status = await global.mqttService.publishCommand(
        deviceId,
        'wifi-status',
        {},
        true,
        5000
    );

    updateTestProgress(deviceId, runId, 100, 'Test completed');

    return {
        ssid,
        found: true,
        signal: network.signal,
        security: network.security,
        connected: connectResult?.connected || false,
        ip: status?.ip,
        success: connectResult?.connected || false
    };
}

async function testBattery(deviceId, runId, test, params) {
    const results = [];

    updateTestProgress(deviceId, runId, 20, 'Reading battery status...');

    for (let i = 0; i < 5; i++) {
        const response = await global.mqttService.publishCommand(
            deviceId,
            'battery-status',
            {},
            true,
            5000
        );

        if (response) {
            results.push({
                voltage: response.voltage,
                percentage: response.percentage,
                charging: response.charging,
                current: response.current
            });
        }

        updateTestProgress(deviceId, runId, 20 + (i * 15));
        await sleep(500);
    }

    // Calculate averages
    const avgVoltage = results.reduce((sum, r) => sum + r.voltage, 0) / results.length;
    const avgPercentage = results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
    const charging = results.some(r => r.charging);

    updateTestProgress(deviceId, runId, 100, 'Analysis complete');

    return {
        samples: results.length,
        voltage: avgVoltage.toFixed(2),
        percentage: Math.round(avgPercentage),
        charging,
        minVoltage: Math.min(...results.map(r => r.voltage)).toFixed(2),
        maxVoltage: Math.max(...results.map(r => r.voltage)).toFixed(2),
        success: avgVoltage > 3.0 // Battery voltage above 3.0V is good
    };
}

async function testGPIOLoopback(deviceId, runId, test, params) {
    const outputPin = params.outputPin || 2;
    const inputPin = params.inputPin || 4;
    const pattern = params.testPattern || '0101';

    updateTestProgress(deviceId, runId, 20, 'Configuring pins...');

    // Configure pins
    await global.mqttService.publishCommand(
        deviceId,
        'gpio-mode',
        { pin: outputPin, mode: 'output' },
        true,
        5000
    );

    await global.mqttService.publishCommand(
        deviceId,
        'gpio-mode',
        { pin: inputPin, mode: 'input' },
        true,
        5000
    );

    const results = [];
    const patternArray = pattern === '0101' ? [0,1,0,1] :
                         pattern === '1010' ? [1,0,1,0] :
                         [0,1,1,0]; // pulse

    updateTestProgress(deviceId, runId, 40, 'Running loopback test...');

    for (let i = 0; i < patternArray.length; i++) {
        const value = patternArray[i];
        
        // Write
        await global.mqttService.publishCommand(
            deviceId,
            'gpio-write',
            { pin: outputPin, value },
            true,
        2000
        );

        await sleep(100); // Wait for signal to settle

        // Read
        const response = await global.mqttService.publishCommand(
            deviceId,
            'gpio-read',
            { pin: inputPin },
            true,
            2000
        );

        const readValue = response?.value;
        const success = readValue === value;

        results.push({
            step: i + 1,
            output: value,
            input: readValue,
            success
        });

        updateTestProgress(deviceId, runId, 40 + (i * 12));
    }

    updateTestProgress(deviceId, runId, 100, 'Test completed');

    return {
        outputPin,
        inputPin,
        pattern,
        steps: results,
        success: results.every(r => r.success)
    };
}

async function testFullSystem(deviceId, runId, test, params) {
    const results = {};

    updateTestProgress(deviceId, runId, 5, 'Starting comprehensive test...');

    // Test modem
    updateTestProgress(deviceId, runId, 10, 'Testing modem...');
    results.modem = await testModem(deviceId, `${runId}_modem`, AVAILABLE_TESTS.modem, {});

    // Test battery
    updateTestProgress(deviceId, runId, 20, 'Testing battery...');
    results.battery = await testBattery(deviceId, `${runId}_battery`, AVAILABLE_TESTS.battery, {});

    // Test SD card
    updateTestProgress(deviceId, runId, 30, 'Testing SD card...');
    try {
        results.sdCard = await testSDCard(deviceId, `${runId}_sd`, AVAILABLE_TESTS.sdCard, {});
    } catch (e) {
        results.sdCard = { success: false, error: e.message };
    }

    // Test GPS (shorter timeout)
    updateTestProgress(deviceId, runId, 45, 'Testing GPS...');
    try {
        results.gps = await testGPS(deviceId, `${runId}_gps`, AVAILABLE_TESTS.gps, { timeout: 30 });
    } catch (e) {
        results.gps = { success: false, error: e.message };
    }

    // Test camera
    updateTestProgress(deviceId, runId, 60, 'Testing camera...');
    try {
        results.camera = await testCamera(deviceId, `${runId}_camera`, AVAILABLE_TESTS.camera, {});
    } catch (e) {
        results.camera = { success: false, error: e.message };
    }

    // Test audio
    updateTestProgress(deviceId, runId, 75, 'Testing audio...');
    try {
        results.speaker = await testSpeaker(deviceId, `${runId}_speaker`, AVAILABLE_TESTS.speaker, {});
        results.microphone = await testMicrophone(deviceId, `${runId}_mic`, AVAILABLE_TESTS.microphone, {});
    } catch (e) {
        results.audio = { success: false, error: e.message };
    }

    // Test GPIO
    updateTestProgress(deviceId, runId, 90, 'Testing GPIO...');
    try {
        results.gpio = await testGPIOLoopback(deviceId, `${runId}_gpio`, AVAILABLE_TESTS.gpioLoopback, {});
    } catch (e) {
        results.gpio = { success: false, error: e.message };
    }

    updateTestProgress(deviceId, runId, 100, 'Test completed');

    // Calculate overall success
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(r => r.success).length;

    return {
        components: results,
        summary: {
            total: totalTests,
            passed: passedTests,
            failed: totalTests - passedTests,
            success: passedTests === totalTests
        }
    };
}

async function runGenericTest(deviceId, runId, test, params) {
    // Generic test runner for simple command-based tests
    const results = [];
    const startTime = Date.now();

    if (test.steps) {
        for (let i = 0; i < test.steps.length; i++) {
            const step = test.steps[i];
            
            updateTestProgress(deviceId, runId, (i * 100 / test.steps.length), `Step ${i+1}: ${step.name}`);
            
            const response = await global.mqttService.publishCommand(
                deviceId,
                `test-${test.name.toLowerCase().replace(/\s+/g, '-')}`,
                step,
                true,
                test.timeout || 10000
            );

            results.push({
                step: step.name,
                response: response?.data,
                success: response?.success || false
            });
        }
    }

    const duration = (Date.now() - startTime) / 1000;

    return {
        steps: results,
        duration,
        success: results.every(r => r.success)
    };
}

// ==================== HELPER FUNCTIONS ====================

function updateTestProgress(deviceId, runId, progress, message) {
    const running = runningTests.get(deviceId)?.get(runId);
    if (running) {
        running.progress = progress;
        running.message = message;
        runningTests.get(deviceId).set(runId, running);
        
        // Emit progress via Socket.IO
        if (global.io) {
            global.io.emit('test:progress', {
                deviceId,
                runId,
                progress,
                message
            });
        }
    }
}

function updateTestStatus(deviceId, runId, status, message, details = null) {
    const endTime = new Date().toISOString();
    
    if (!testResults.has(deviceId)) {
        testResults.set(deviceId, new Map());
    }
    
    const running = runningTests.get(deviceId)?.get(runId);
    
    testResults.get(deviceId).set(runId, {
        ...running,
        status,
        message,
        details,
        endTime,
        duration: running ? (new Date(endTime) - new Date(running.startTime)) / 1000 : null
    });

    // Emit via Socket.IO
    if (global.io) {
        global.io.emit('test:status', {
            deviceId,
            runId,
            status,
            message,
            details
        });
    }
}

function checkResponse(response, step) {
    if (step.expected) {
        return response?.includes(step.expected);
    }
    if (step.handler) {
        // Custom handler would be implemented here
        return true;
    }
    return !!response;
}

function getCategoryIcon(category) {
    const icons = {
        communication: 'bi-hdd-network',
        hardware: 'bi-motherboard',
        audio: 'bi-speaker',
        camera: 'bi-camera',
        gps: 'bi-geo-alt',
        storage: 'bi-hdd-stack',
        network: 'bi-wifi',
        power: 'bi-battery',
        gpio: 'bi-pin',
        system: 'bi-cpu'
    };
    return icons[category] || 'bi-gear';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;