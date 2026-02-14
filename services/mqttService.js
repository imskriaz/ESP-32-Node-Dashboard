const mqtt = require('mqtt');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class MQTTService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.connected = false;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.reconnectDelay = 5000;
        this.reconnectTimer = null;
        this.connectionTimeout = null;
        
        // Load options from environment
        this.options = {
            host: process.env.MQTT_HOST || '163.227.6.71',
            port: parseInt(process.env.MQTT_PORT) || 1883,
            protocol: process.env.MQTT_PROTOCOL || 'mqtt',
            username: process.env.MQTT_USER || 'deviceuser',
            password: process.env.MQTT_PASSWORD,
            clientId: `dashboard_${Math.random().toString(16).substr(2, 8)}_${Date.now()}`,
            keepalive: 60,
            clean: true,
            reconnectPeriod: -1, // We'll handle reconnection manually
            connectTimeout: 30 * 1000,
            rejectUnauthorized: false
        };
        
        this.subscribedTopics = new Set();
        this.messageHandlers = new Map();
        this.pendingMessages = new Map();
        this.deviceStatus = new Map(); // Track device last seen
        
        // Bind methods to maintain 'this' context
        this.handleConnect = this.handleConnect.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this);
    }

    connect() {
        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.connected || this.connecting) {
            logger.warn('MQTT already connecting or connected');
            return;
        }

        this.connecting = true;
        this.emit('connecting');

        // Build broker URL
        const brokerUrl = `${this.options.protocol}://${this.options.host}:${this.options.port}`;
        
        logger.info('Connecting to MQTT broker...', {
            url: brokerUrl,
            username: this.options.username,
            clientId: this.options.clientId
        });

        try {
            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (this.connecting && !this.connected) {
                    logger.error('MQTT connection timeout');
                    if (this.client) {
                        this.client.end(true);
                    }
                    this.connecting = false;
                    this.emit('error', new Error('Connection timeout'));
                    this.scheduleReconnect();
                }
            }, this.options.connectTimeout);

            this.client = mqtt.connect(brokerUrl, {
                clientId: this.options.clientId,
                username: this.options.username,
                password: this.options.password,
                keepalive: this.options.keepalive,
                clean: this.options.clean,
                reconnectPeriod: this.options.reconnectPeriod,
                connectTimeout: this.options.connectTimeout,
                rejectUnauthorized: this.options.rejectUnauthorized
            });

            this.client.on('connect', this.handleConnect);
            this.client.on('close', this.handleClose);
            this.client.on('error', this.handleError);
            this.client.on('offline', this.handleOffline);
            this.client.on('message', this.handleMessage);
            this.client.on('reconnect', this.handleReconnect);

        } catch (error) {
            this.connecting = false;
            clearTimeout(this.connectionTimeout);
            logger.error('MQTT connection error:', error);
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    handleConnect() {
        clearTimeout(this.connectionTimeout);
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        logger.info('✅ MQTT connected successfully');
        
        // Subscribe to all device topics
        this.subscribeToDefaultTopics();
        
        this.emit('connect');
        
        // Emit via global IO if available
        if (global.io) {
            global.io.emit('mqtt:status', { connected: true });
        }
    }

    subscribeToDefaultTopics() {
        const topics = [
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
            'device/+/storage/mkdir',
            // GPS topics
            'device/+/gps/status',
            'device/+/gps/location',
            // GPIO topics
            'device/+/gpio/status',
            'device/+/gpio/read',
            'device/+/gpio/write'
        ];

        this.subscribe(topics);
    }

    handleClose() {
        this.connected = false;
        this.connecting = false;
        logger.warn('⚠️ MQTT connection closed');
        this.emit('close');
        
        // Reject all pending messages
        this.pendingMessages.forEach((pending, messageId) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('MQTT connection closed'));
        });
        this.pendingMessages.clear();
        
        // Emit via global IO if available
        if (global.io) {
            global.io.emit('mqtt:status', { connected: false });
        }
        
        this.scheduleReconnect();
    }

    handleError(error) {
        logger.error('❌ MQTT error:', error.message);
        this.emit('error', error);
        
        // Don't schedule reconnect here, handleClose will be called
    }

    handleOffline() {
        this.connected = false;
        this.connecting = false;
        logger.warn('⚠️ MQTT offline');
        this.emit('offline');
        
        // Emit via global IO if available
        if (global.io) {
            global.io.emit('mqtt:status', { connected: false });
        }
        
        this.scheduleReconnect();
    }

    handleReconnect() {
        logger.info('🔄 MQTT reconnecting...');
        this.emit('reconnect');
    }

    handleMessage(topic, message) {
        try {
            const messageStr = message.toString();
            
            // Parse message (try JSON first, fallback to raw)
            let data;
            try {
                data = JSON.parse(messageStr);
            } catch (e) {
                data = { 
                    raw: messageStr,
                    contentType: 'text/plain'
                };
            }

            logger.debug(`📨 MQTT message received on ${topic}:`, 
                typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data).substring(0, 200));

            // Extract device ID from topic (format: device/{deviceId}/{type}/{action})
            const topicParts = topic.split('/');
            if (topicParts.length >= 2) {
                const deviceId = topicParts[1];
                data.deviceId = deviceId;
                data.topic = topic;
                data.timestamp = new Date().toISOString();

                // Update device last seen
                this.deviceStatus.set(deviceId, {
                    lastSeen: data.timestamp,
                    online: true
                });

                // Always emit a heartbeat for any message from device
                this.emit('heartbeat', deviceId, { timestamp: data.timestamp });

                // If this is a status message, emit status event
                if (topic.includes('/status') || data.type === 'status' || topic.endsWith('/status')) {
                    this.emit('status', deviceId, data);
                }

                // Check if this is a response to a pending command
                if (data.messageId && this.pendingMessages.has(data.messageId)) {
                    const pending = this.pendingMessages.get(data.messageId);
                    clearTimeout(pending.timeout);
                    pending.resolve(data);
                    this.pendingMessages.delete(data.messageId);
                    logger.debug(`✅ Resolved pending message: ${data.messageId}`);
                }

                // Emit event for specific message type
                if (topicParts.length >= 4) {
                    // Format: device/deviceId/type/action
                    const eventName = `${topicParts[2]}:${topicParts[3]}`;
                    this.emit(eventName, deviceId, data);
                    
                    // Also emit a generic event for the action
                    this.emit(topicParts[3], deviceId, data);
                } else if (topicParts.length >= 3) {
                    // Format: device/deviceId/type
                    const eventName = topicParts[2];
                    this.emit(eventName, deviceId, data);
                }
            }

            // Call registered handlers
            for (const [pattern, handler] of this.messageHandlers) {
                if (this.topicMatches(pattern, topic)) {
                    try {
                        handler(topic, data);
                    } catch (handlerError) {
                        logger.error('Error in message handler:', handlerError);
                    }
                }
            }

        } catch (error) {
            logger.error('Error handling MQTT message:', error);
        }
    }

    scheduleReconnect() {
        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('❌ Max reconnection attempts reached');
            this.emit('max_reconnect');
            return;
        }

        this.reconnectAttempts++;
        
        // Exponential backoff with max of 30 seconds
        const delay = Math.min(
            this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
            30000
        );
        
        logger.info(`⏳ Scheduling reconnect in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            if (!this.connected && !this.connecting) {
                logger.info('🔄 Attempting to reconnect...');
                this.connect();
            }
            this.reconnectTimer = null;
        }, delay);
    }

    subscribe(topics) {
        if (!this.connected || !this.client) {
            logger.warn('Cannot subscribe: MQTT not connected');
            return false;
        }

        const topicArray = Array.isArray(topics) ? topics : [topics];
        let successCount = 0;
        
        topicArray.forEach(topic => {
            this.client.subscribe(topic, { qos: 1 }, (err) => {
                if (err) {
                    logger.error(`Failed to subscribe to ${topic}:`, err);
                } else {
                    this.subscribedTopics.add(topic);
                    successCount++;
                    logger.info(`📡 Subscribed to ${topic}`);
                }
            });
        });

        return successCount === topicArray.length;
    }

    resubscribe() {
        if (this.subscribedTopics.size > 0) {
            logger.info(`🔄 Resubscribing to ${this.subscribedTopics.size} topics`);
            this.subscribedTopics.forEach(topic => {
                this.client.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) logger.error(`Failed to resubscribe to ${topic}:`, err);
                });
            });
        }
    }

    unsubscribe(topics) {
        if (!this.connected || !this.client) return false;

        const topicArray = Array.isArray(topics) ? topics : [topics];
        let successCount = 0;
        
        topicArray.forEach(topic => {
            this.client.unsubscribe(topic, (err) => {
                if (err) {
                    logger.error(`Failed to unsubscribe from ${topic}:`, err);
                } else {
                    this.subscribedTopics.delete(topic);
                    successCount++;
                    logger.info(`Unsubscribed from ${topic}`);
                }
            });
        });

        return successCount === topicArray.length;
    }

    publish(topic, message, options = { qos: 1, retain: false }) {
        if (!this.connected || !this.client) {
            logger.error('Cannot publish: MQTT not connected');
            return Promise.reject(new Error('MQTT not connected'));
        }

        return new Promise((resolve, reject) => {
            const messageId = options.messageId || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const payload = typeof message === 'string' ? message : JSON.stringify(message);

            this.client.publish(topic, payload, options, (err) => {
                if (err) {
                    logger.error(`Failed to publish to ${topic}:`, err);
                    reject(err);
                } else {
                    logger.debug(`📤 Published to ${topic}:`, payload.substring(0, 200));
                    resolve({ topic, messageId });
                }
            });
        });
    }

    publishCommand(deviceId, command, payload = {}, waitForResponse = false, timeout = 30000) {
        if (!this.connected) {
            return Promise.reject(new Error('MQTT not connected'));
        }

        const topic = `device/${deviceId}/command/${command}`;
        const messageId = `${command}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const message = {
            ...payload,
            messageId,
            timestamp: Date.now(),
            source: 'dashboard'
        };

        logger.info(`📤 Publishing command to ${topic}:`, { command, messageId });

        if (waitForResponse) {
            return new Promise((resolve, reject) => {
                // Set timeout
                const timeoutId = setTimeout(() => {
                    if (this.pendingMessages.has(messageId)) {
                        this.pendingMessages.delete(messageId);
                        reject(new Error(`Command timeout after ${timeout}ms`));
                    }
                }, timeout);

                // Store pending message
                this.pendingMessages.set(messageId, {
                    command,
                    deviceId,
                    payload,
                    timestamp: Date.now(),
                    resolve,
                    reject,
                    timeout: timeoutId
                });

                // Publish message
                this.publish(topic, message)
                    .catch(err => {
                        clearTimeout(timeoutId);
                        this.pendingMessages.delete(messageId);
                        reject(err);
                    });
            });
        } else {
            // Just publish without waiting for response
            return this.publish(topic, message);
        }
    }

    // ==================== CONVENIENCE METHODS ====================

    // SMS Commands
    sendSms(deviceId, to, message) {
        return this.publishCommand(deviceId, 'send-sms', { to, message }, true, 60000);
    }

    // Call Commands
    makeCall(deviceId, number) {
        return this.publishCommand(deviceId, 'make-call', { number }, true, 60000);
    }

    answerCall(deviceId) {
        return this.publishCommand(deviceId, 'answer-call', {}, true, 10000);
    }

    rejectCall(deviceId) {
        return this.publishCommand(deviceId, 'reject-call', {}, true, 10000);
    }

    endCall(deviceId) {
        return this.publishCommand(deviceId, 'end-call', {}, true, 10000);
    }

    holdCall(deviceId, hold) {
        return this.publishCommand(deviceId, 'hold-call', { hold }, true, 10000);
    }

    // USSD Commands
    sendUssd(deviceId, code) {
        return this.publishCommand(deviceId, 'send-ussd', { code }, true, 60000);
    }

    // Device Commands
    requestStatus(deviceId) {
        return this.publishCommand(deviceId, 'get-status', {}, true, 10000);
    }

    restartDevice(deviceId) {
        return this.publishCommand(deviceId, 'restart', {}, false);
    }

    // ==================== STORAGE COMMANDS ====================

    /**
     * Get list of files in a directory
     */
    listFiles(deviceId, path = '/') {
        return this.publishCommand(deviceId, 'storage-list', { path }, true, 10000);
    }

    /**
     * Get SD card information (total, used, free space)
     */
    getStorageInfo(deviceId) {
        return this.publishCommand(deviceId, 'storage-info', {}, true, 10000);
    }

    /**
     * Read a file from SD card
     */
    readFile(deviceId, path) {
        return this.publishCommand(deviceId, 'storage-read', { path }, true, 30000);
    }

    /**
     * Write a file to SD card
     * @param {string} deviceId - Device ID
     * @param {string} path - Destination path
     * @param {string} filename - File name
     * @param {string} content - Base64 encoded file content
     * @param {boolean} append - Whether to append to existing file
     */
    writeFile(deviceId, path, filename, content, append = false) {
        return this.publishCommand(deviceId, 'storage-write', { 
            path, 
            filename, 
            content, 
            append 
        }, true, 60000);
    }

    /**
     * Delete files or directories
     */
    deleteFiles(deviceId, items) {
        return this.publishCommand(deviceId, 'storage-delete', { items }, true, 30000);
    }

    /**
     * Rename a file or directory
     */
    renameFile(deviceId, oldPath, newName) {
        return this.publishCommand(deviceId, 'storage-rename', { oldPath, newName }, true, 10000);
    }

    /**
     * Move files to another directory
     */
    moveFiles(deviceId, items, destination) {
        return this.publishCommand(deviceId, 'storage-move', { items, destination }, true, 30000);
    }

    /**
     * Copy files to another directory
     */
    copyFiles(deviceId, items, destination) {
        return this.publishCommand(deviceId, 'storage-copy', { items, destination }, true, 60000);
    }

    /**
     * Create a new directory
     */
    createDirectory(deviceId, path, name) {
        return this.publishCommand(deviceId, 'storage-mkdir', { path, name }, true, 10000);
    }

    // ==================== GPS COMMANDS ====================

    /**
     * Get GPS status
     */
    getGpsStatus(deviceId) {
        return this.publishCommand(deviceId, 'gps-status', {}, true, 10000);
    }

    /**
     * Get current GPS location
     */
    getGpsLocation(deviceId) {
        return this.publishCommand(deviceId, 'gps-location', {}, true, 10000);
    }

    /**
     * Enable/disable GPS
     */
    setGpsEnabled(deviceId, enabled) {
        return this.publishCommand(deviceId, 'gps-set-enabled', { enabled }, true, 10000);
    }

    // ==================== GPIO COMMANDS ====================

    /**
     * Get GPIO pin status
     */
    getGpioStatus(deviceId) {
        return this.publishCommand(deviceId, 'gpio-status', {}, true, 10000);
    }

    /**
     * Read GPIO pin
     */
    readGpioPin(deviceId, pin) {
        return this.publishCommand(deviceId, 'gpio-read', { pin }, true, 10000);
    }

    /**
     * Write GPIO pin
     */
    writeGpioPin(deviceId, pin, value) {
        return this.publishCommand(deviceId, 'gpio-write', { pin, value }, true, 10000);
    }

    /**
     * Set GPIO pin mode
     */
    setGpioMode(deviceId, pin, mode) {
        return this.publishCommand(deviceId, 'gpio-mode', { pin, mode }, true, 10000);
    }

    // ==================== UTILITY METHODS ====================

    // Topic matching helper
    topicMatches(pattern, topic) {
        const patternParts = pattern.split('/');
        const topicParts = topic.split('/');

        if (patternParts.length !== topicParts.length && !pattern.includes('#')) {
            return false;
        }

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i] === '+') continue;
            if (patternParts[i] === '#') return true;
            if (patternParts[i] !== topicParts[i]) return false;
        }

        return true;
    }

    // Register message handler
    onMessage(pattern, handler) {
        this.messageHandlers.set(pattern, handler);
    }

    // Remove message handler
    offMessage(pattern) {
        this.messageHandlers.delete(pattern);
    }

    // Get connection status
    getStatus() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            host: this.options.host,
            port: this.options.port,
            protocol: this.options.protocol,
            clientId: this.options.clientId,
            username: this.options.username,
            subscribedTopics: Array.from(this.subscribedTopics),
            pendingMessages: this.pendingMessages.size,
            reconnectAttempts: this.reconnectAttempts,
            devices: Array.from(this.deviceStatus.entries()).map(([id, status]) => ({
                id,
                lastSeen: status.lastSeen,
                online: status.online
            }))
        };
    }

    // Get device online status
    isDeviceOnline(deviceId) {
        const device = this.deviceStatus.get(deviceId);
        if (!device) return false;
        
        const lastSeen = new Date(device.lastSeen);
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        
        return lastSeen > twoMinutesAgo;
    }

    // Reconnect with new options
    reconnect(newOptions = null) {
        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (newOptions) {
            this.options = { ...this.options, ...newOptions };
            this.options.clientId = `dashboard_${Math.random().toString(16).substr(2, 8)}_${Date.now()}`;
        }

        if (this.client) {
            this.client.end(true, () => {
                this.connected = false;
                this.connecting = false;
                setTimeout(() => this.connect(), 1000);
            });
        } else {
            this.connect();
        }
    }

    // Disconnect
    disconnect() {
        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.client) {
            this.client.end(true);
            this.connected = false;
            this.connecting = false;
            logger.info('MQTT disconnected');
            
            // Reject all pending messages
            this.pendingMessages.forEach((pending, messageId) => {
                clearTimeout(pending.timeout);
                pending.reject(new Error('MQTT disconnected'));
            });
            this.pendingMessages.clear();
        }
    }

    // Check if connected
    isConnected() {
        return this.connected;
    }

    // Get client ID
    getClientId() {
        return this.options.clientId;
    }

    // Get device last seen
    getDeviceLastSeen(deviceId) {
        const device = this.deviceStatus.get(deviceId);
        return device ? device.lastSeen : null;
    }

    // Clear device status
    clearDeviceStatus(deviceId) {
        this.deviceStatus.delete(deviceId);
    }

    // Clear all device statuses
    clearAllDevices() {
        this.deviceStatus.clear();
    }
}

module.exports = new MQTTService();