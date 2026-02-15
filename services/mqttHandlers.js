const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class MQTTHandlers {
    constructor(mqttService, io, app) {
        this.mqttService = mqttService;
        this.io = io;
        this.app = app;
        this.modemService = global.modemService;
    }

    initialize() {
        this.setupEventHandlers();
        this.setupPeriodicTasks();
        this.connect();
    }

    setupEventHandlers() {
        // Connection events
        this.mqttService.on('connect', () => {
            logger.info('✅ MQTT service connected');

            // Subscribe to topics including storage
            this.mqttService.subscribe([
                'device/+/status',
                'device/+/heartbeat',
                'device/+/sms/incoming',
                'device/+/sms/delivered',
                'device/+/call/incoming',
                'device/+/call/status',
                'device/+/ussd/response',
                'device/+/webcam/image',
                'device/+/wifi/scan',
                'device/+/hotspot/clients',
                'device/+/location',
                'device/+/command/response',
                // Storage topics
                'device/+/storage/list',
                'device/+/storage/info',
                'device/+/storage/read',
                'device/+/storage/write',
                'device/+/storage/delete',
                'device/+/storage/rename',
                'device/+/storage/move',
                'device/+/storage/copy',
                'device/+/storage/mkdir'
            ]);

            // Emit to all connected clients
            this.io.emit('mqtt:status', { connected: true });

            // Request initial status from device
            setTimeout(() => {
                this.mqttService.requestStatus('esp32-s3-1').catch(err => {
                    logger.debug('Initial status request failed (normal if device offline)');
                });
            }, 5000);
        });

        this.mqttService.on('connecting', () => {
            logger.info('⏳ MQTT connecting...');
            this.io.emit('mqtt:status', { connected: false, connecting: true });
        });

        this.mqttService.on('reconnect', () => {
            logger.info('🔄 MQTT reconnecting...');
            this.io.emit('mqtt:status', { connected: false, reconnecting: true });
        });

        this.mqttService.on('close', () => {
            logger.warn('⚠️ MQTT connection closed');
            this.io.emit('mqtt:status', { connected: false });
        });

        this.mqttService.on('error', (error) => {
            logger.error('❌ MQTT service error:', error.message);
            this.io.emit('mqtt:error', { message: error.message });
        });

        this.mqttService.on('offline', () => {
            logger.warn('⚠️ MQTT offline');
            this.io.emit('mqtt:status', { connected: false });
        });

        this.mqttService.on('max_reconnect', () => {
            logger.error('❌ MQTT max reconnection attempts reached');
            this.io.emit('mqtt:error', { message: 'Max reconnection attempts reached' });
        });

        // Device heartbeats
        this.mqttService.on('heartbeat', (deviceId, data) => {
            this.modemService.handleHeartbeat(deviceId);
            this.io.emit('device:heartbeat', {
                deviceId,
                timestamp: data.timestamp || new Date().toISOString()
            });
        });

        // Status updates
        this.mqttService.on('status', (deviceId, data) => {
            const device = this.modemService.updateDeviceStatus(deviceId, data);

            // Emit status update
            this.io.emit('device:status', {
                deviceId,
                online: true,
                signal: data.mobile?.signalStrength || 0,
                battery: data.system?.battery || 0,
                charging: data.system?.charging || false,
                network: data.mobile?.networkType || 'No Service',
                operator: data.mobile?.operator || 'Unknown',
                ip: data.mobile?.ipAddress || '0.0.0.0',
                temperature: data.system?.temperature || 0,
                uptime: data.system?.uptime || '0s',
                timestamp: new Date().toISOString()
            });

            logger.debug(`Device ${deviceId} status update`, {
                signal: data.mobile?.signalStrength,
                network: data.mobile?.networkType
            });
        });

        // SMS handlers
        this.setupSMSHandlers();

        // Call handlers
        this.setupCallHandlers();

        // USSD handlers
        this.setupUSSDHandlers();

        // Webcam handlers
        this.setupWebcamHandlers();

        // WiFi handlers
        this.setupWiFiHandlers();

        // Location handlers
        this.setupLocationHandlers();

        // Command response handlers
        this.setupCommandHandlers();

        // Storage handlers
        this.setupStorageHandlers();

        this.setupGPSHandlers();

        this.setupGPIOHandlers();

        this.setupTestHandlers();
    }

    setupTestHandlers() {
        this.mqttService.on('test:result', async (deviceId, data) => {
            logger.info(`🧪 Test result from ${deviceId}: ${data.testId} = ${data.result}`);
            
            // Save to database
            const db = this.app.locals.db;
            if (db && data.runId) {
                await db.run(`
                    INSERT OR REPLACE INTO test_results 
                    (run_id, device_id, test_id, test_name, status, result, duration, details, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    data.runId,
                    deviceId,
                    data.testId,
                    data.testName,
                    data.status || 'completed',
                    data.result,
                    data.duration,
                    JSON.stringify(data.details || {}),
                    data.timestamp || new Date().toISOString()
                ]);
            }
            
            // Emit via Socket.IO
            this.io.emit('test:result', { deviceId, ...data });
        });

        this.mqttService.on('test:progress', (deviceId, data) => {
            this.io.emit('test:progress', { deviceId, ...data });
        });
    }

    setupGPIOHandlers() {
        this.mqttService.on('gpio:status', async (deviceId, data) => {
            logger.info(`🔌 GPIO status from ${deviceId}: ${data.pins?.length || 0} pins`);

            // Update modem service
            if (this.modemService) {
                this.modemService.updateDeviceStatus(deviceId, { gpio: data });
            }

            // Emit via Socket.IO
            this.io.emit('gpio:status', { deviceId, ...data });
        });

        this.mqttService.on('gpio:update', async (deviceId, data) => {
            logger.info(`⚡ GPIO update from ${deviceId}: pin ${data.pin} = ${data.value}`);

            // Save to database
            const db = this.app.locals.db;
            if (db) {
                await db.run(`
                INSERT INTO gpio_history (device_id, pin, value, type, timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [deviceId, data.pin, data.value, data.type || 'digital']);
            }

            // Emit via Socket.IO
            this.io.emit('gpio:update', { deviceId, ...data });
        });
    }

    setupGPSHandlers() {
        this.mqttService.on('gps:location', async (deviceId, data) => {
            logger.info(`📍 GPS location from ${deviceId}: ${data.lat || data.latitude}, ${data.lng || data.longitude}`);

            // Import location handler
            const locationHandler = require('../routes/location');
            if (locationHandler && locationHandler.handleGpsLocation) {
                locationHandler.handleGpsLocation(deviceId, data);
            }
        });

        this.mqttService.on('gps:status', async (deviceId, data) => {
            logger.info(`🛰️ GPS status from ${deviceId}: ${data.fix ? 'Fix' : 'No Fix'}, ${data.satellites || 0} sats`);
            this.io.emit('gps:status', { deviceId, ...data });
        });
    }

    setupSMSHandlers() {
        this.mqttService.on('sms:incoming', async (deviceId, data) => {
            logger.info(`📨 Incoming SMS from ${data.from}: ${data.message?.substring(0, 50)}...`);

            try {
                const db = this.app.locals.db;
                if (db) {
                    const result = await db.run(`
                        INSERT INTO sms (from_number, message, type, device_id, timestamp, read) 
                        VALUES (?, ?, 'incoming', ?, ?, 0)
                    `, [data.from, data.message, deviceId, data.timestamp || new Date().toISOString()]);

                    logger.info(`✅ Saved incoming SMS from ${data.from} (ID: ${result.lastID})`);

                    // Get updated unread count
                    const unread = await db.get(`
                        SELECT COUNT(*) as count FROM sms WHERE read = 0 AND type = 'incoming'
                    `);

                    this.io.emit('sms:received', {
                        deviceId,
                        ...data,
                        id: result.lastID,
                        unreadCount: unread.count
                    });
                }
            } catch (error) {
                logger.error('❌ Error saving incoming SMS:', error);
            }
        });

        this.mqttService.on('sms:delivered', async (deviceId, data) => {
            logger.info(`✅ SMS delivered to ${data.to}`);

            try {
                const db = this.app.locals.db;
                if (db) {
                    await db.run(`
                        UPDATE sms SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP 
                        WHERE device_id = ? AND to_number = ? AND status = 'sending'
                        ORDER BY timestamp DESC LIMIT 1
                    `, [deviceId, data.to]);
                }
            } catch (error) {
                logger.error('❌ Error updating SMS delivery status:', error);
            }

            this.io.emit('sms:delivered', { deviceId, ...data });
        });
    }

    setupCallHandlers() {
        this.mqttService.on('call:incoming', (deviceId, data) => {
            logger.info(`📞 Incoming call from ${data.number}`);
            this.io.emit('call:incoming', { deviceId, ...data });
        });

        this.mqttService.on('call:status', async (deviceId, data) => {
            logger.info(`📞 Call status: ${data.status} for ${data.number}`);

            try {
                const db = this.app.locals.db;
                if (db) {
                    await db.run(`
                        UPDATE calls SET status = ?, duration = ? 
                        WHERE device_id = ? AND phone_number = ? AND status IN ('dialing', 'ringing', 'connected')
                        ORDER BY start_time DESC LIMIT 1
                    `, [data.status, data.duration || 0, deviceId, data.number]);
                }
            } catch (error) {
                logger.error('❌ Error updating call status:', error);
            }

            this.io.emit('call:status', { deviceId, ...data });
        });
    }

    setupUSSDHandlers() {
        this.mqttService.on('ussd:response', async (deviceId, data) => {
            logger.info(`💬 USSD response for ${data.code}: ${data.response?.substring(0, 50)}...`);

            try {
                const db = this.app.locals.db;
                if (db) {
                    await db.run(`
                        UPDATE ussd SET response = ?, status = 'success' 
                        WHERE device_id = ? AND code = ? AND status = 'pending'
                        ORDER BY timestamp DESC LIMIT 1
                    `, [data.response, deviceId, data.code]);
                }
            } catch (error) {
                logger.error('❌ Error updating USSD response:', error);
            }

            this.io.emit('ussd:response', { deviceId, ...data });
        });
    }

    setupWebcamHandlers() {
        this.mqttService.on('webcam:image', async (deviceId, data) => {
            logger.info(`📸 Received image from webcam`);

            try {
                // Save image to file
                const uploadDir = path.join(__dirname, '../public/uploads/webcam');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const filename = `capture-${Date.now()}.jpg`;
                const filepath = path.join(uploadDir, filename);

                // Decode base64 image
                const imageBuffer = Buffer.from(data.image, 'base64');
                fs.writeFileSync(filepath, imageBuffer);

                const imageUrl = `/uploads/webcam/${filename}`;

                // Save to database
                const db = this.app.locals.db;
                if (db) {
                    await db.run(`
                        INSERT INTO webcam_captures (filename, path, size, timestamp, type) 
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'mqtt')
                    `, [filename, imageUrl, imageBuffer.length]);
                }

                this.io.emit('webcam:capture', {
                    deviceId,
                    path: imageUrl,
                    timestamp: new Date().toISOString(),
                    size: imageBuffer.length
                });

                logger.info(`✅ Image saved: ${filename} (${imageBuffer.length} bytes)`);

            } catch (error) {
                logger.error('❌ Error saving webcam image:', error);
            }
        });
    }

    setupWiFiHandlers() {
        this.mqttService.on('wifi:scan', (deviceId, data) => {
            logger.info(`📡 WiFi scan results from ${deviceId}: ${data.networks?.length || 0} networks`);

            if (this.modemService) {
                this.modemService.updateWifiNetworks(deviceId, data.networks || []);
            }

            this.io.emit('modem:wifi-scan', { deviceId, networks: data.networks || [] });
        });

        this.mqttService.on('hotspot:clients', (deviceId, data) => {
            logger.info(`📱 Hotspot clients from ${deviceId}: ${data.clients?.length || 0} connected`);

            if (this.modemService) {
                this.modemService.updateHotspotClients(deviceId, data.clients || []);
            }

            this.io.emit('modem:hotspot-clients', { deviceId, clients: data.clients || [] });
        });
    }

    setupLocationHandlers() {
        this.mqttService.on('location', (deviceId, data) => {
            logger.info(`📍 Location update from ${deviceId}: ${data.lat}, ${data.lng}`);
            this.io.emit('device:location', { deviceId, ...data });
        });
    }

    setupCommandHandlers() {
        this.mqttService.on('command:response', (deviceId, data) => {
            logger.debug(`📨 Command response from ${deviceId}:`, data);
            this.io.emit('command:response', { deviceId, ...data });
        });
    }

    setupStorageHandlers() {
        // Handle storage list response
        this.mqttService.on('storage:list', (deviceId, data) => {
            logger.info(`📁 Storage list from ${deviceId}: ${data.files?.length || 0} files`);

            // Update modemService with SD card info
            if (this.modemService && data.stats) {
                this.modemService.updateDeviceStatus(deviceId, {
                    sd: {
                        mounted: true,
                        total: data.stats.total,
                        used: data.stats.used,
                        free: data.stats.free
                    }
                });
            }

            // Emit via Socket.IO
            if (this.io) {
                this.io.emit('storage:list', { deviceId, ...data });
            }
        });

        // Handle storage info response
        this.mqttService.on('storage:info', (deviceId, data) => {
            logger.info(`💾 Storage info from ${deviceId}: ${data.total ? Math.round(data.total / 1024 / 1024 / 1024) + 'GB' : 'Unknown'}`);

            if (this.modemService) {
                this.modemService.updateDeviceStatus(deviceId, {
                    sd: {
                        mounted: data.success,
                        total: data.total || 0,
                        used: data.used || 0,
                        free: data.free || 0,
                        type: data.type || 'SD Card',
                        filesystem: data.filesystem || 'FAT32'
                    }
                });
            }

            if (this.io) {
                this.io.emit('storage:info', { deviceId, ...data });
            }
        });

        // Handle file read response
        this.mqttService.on('storage:read', (deviceId, data) => {
            logger.info(`📖 File read from ${deviceId}: ${data.path}`);
            if (this.io) {
                this.io.emit('storage:read', { deviceId, ...data });
            }
        });

        // Handle file write response
        this.mqttService.on('storage:write', (deviceId, data) => {
            logger.info(`📝 File written to ${deviceId}: ${data.path}`);
            if (this.io) {
                this.io.emit('storage:write', { deviceId, ...data });
            }
        });

        // Handle delete response
        this.mqttService.on('storage:delete', (deviceId, data) => {
            logger.info(`🗑️ Items deleted from ${deviceId}: ${data.items?.length || 0} items`);
            if (this.io) {
                this.io.emit('storage:delete', { deviceId, ...data });
            }
        });

        // Handle rename response
        this.mqttService.on('storage:rename', (deviceId, data) => {
            logger.info(`✏️ Item renamed on ${deviceId}: ${data.oldPath} -> ${data.newName}`);
            if (this.io) {
                this.io.emit('storage:rename', { deviceId, ...data });
            }
        });

        // Handle move response
        this.mqttService.on('storage:move', (deviceId, data) => {
            logger.info(`🚚 Items moved on ${deviceId}: ${data.items?.length || 0} items`);
            if (this.io) {
                this.io.emit('storage:move', { deviceId, ...data });
            }
        });

        // Handle copy response
        this.mqttService.on('storage:copy', (deviceId, data) => {
            logger.info(`📋 Items copied on ${deviceId}: ${data.items?.length || 0} items`);
            if (this.io) {
                this.io.emit('storage:copy', { deviceId, ...data });
            }
        });

        // Handle mkdir response
        this.mqttService.on('storage:mkdir', (deviceId, data) => {
            logger.info(`📁 Directory created on ${deviceId}: ${data.path}`);
            if (this.io) {
                this.io.emit('storage:mkdir', { deviceId, ...data });
            }
        });
    }

    setupPeriodicTasks() {
        // Start periodic online status checker
        setInterval(() => {
            this.modemService.checkOnlineDevices();

            // Get all devices and emit their status
            const devices = this.modemService.getAllDevices();
            this.io.emit('devices:status', devices);

            // Cleanup old devices
            this.modemService.cleanupOfflineDevices();
        }, 30000); // Check every 30 seconds

        // Request status from device periodically
        setInterval(() => {
            if (this.mqttService.connected) {
                this.mqttService.requestStatus('esp32-s3-1').catch(err => {
                    logger.debug('Status request failed (normal if device offline)');
                });
            }
        }, 60000); // Request every minute
    }

    connect() {
        // Connect to MQTT broker after a short delay
        setTimeout(() => {
            this.mqttService.connect();
        }, 3000);
    }

    disconnect() {
        this.mqttService.disconnect();
    }
}

module.exports = MQTTHandlers;