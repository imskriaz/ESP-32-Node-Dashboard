const mqtt = require('mqtt');
const logger = require('../utils/logger');
const modemService = require('./modemService');

class MQTTService {
    constructor() {
        this.client = null;
        this.connected = false;
        this.messageHandlers = new Map();
        this.pendingMessages = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        try {
            const options = {
                host: process.env.MQTT_HOST || 'device.atebd.com',
                port: parseInt(process.env.MQTT_PORT) || 1883,
                username: process.env.MQTT_USER || 'deviceuser',
                password: process.env.MQTT_PASSWORD,
                clientId: `dashboard_${Math.random().toString(16).substr(2, 8)}`,
                keepalive: 60,
                reconnectPeriod: 5000,
                connectTimeout: 30000,
                clean: true
            };

            logger.info('Connecting to MQTT broker...');
            
            this.client = mqtt.connect(`mqtt://${options.host}`, options);

            this.client.on('connect', () => {
                try {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    logger.info('MQTT connected');
                    this.subscribeToTopics();
                } catch (error) {
                    logger.error('Error in MQTT connect handler:', error);
                }
            });

            this.client.on('error', (error) => {
                try {
                    logger.error('MQTT error:', error);
                    this.connected = false;
                } catch (err) {
                    logger.error('Error in MQTT error handler:', err);
                }
            });

            this.client.on('message', (topic, message) => {
                try {
                    this.handleMessage(topic, message.toString());
                } catch (error) {
                    logger.error('Error handling MQTT message:', error);
                }
            });

            this.client.on('close', () => {
                try {
                    this.connected = false;
                    logger.warn('MQTT disconnected');
                    
                    // Reject all pending messages
                    this.pendingMessages.forEach((pending, messageId) => {
                        try {
                            pending.reject(new Error('MQTT connection closed'));
                        } catch (err) {
                            logger.error(`Error rejecting message ${messageId}:`, err);
                        }
                    });
                    this.pendingMessages.clear();
                } catch (error) {
                    logger.error('Error in MQTT close handler:', error);
                }
            });

            this.client.on('offline', () => {
                try {
                    this.connected = false;
                    this.reconnectAttempts++;
                    logger.warn(`MQTT offline (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    
                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        logger.error('Max reconnection attempts reached');
                    }
                } catch (error) {
                    logger.error('Error in MQTT offline handler:', error);
                }
            });

        } catch (error) {
            logger.error('Failed to create MQTT client:', error);
            this.connected = false;
        }
    }

    subscribeToTopics() {
        try {
            if (!this.client || !this.connected) {
                logger.warn('Cannot subscribe: MQTT not connected');
                return;
            }

            const topics = [
                'device/+/sms/incoming',
                'device/+/sms/delivered',
                'device/+/status',
                'device/+/call/incoming',
                'device/+/call/status',
                'device/+/ussd/response',
                'device/+/ussd/session',
                'device/+/webcam/image',
                'device/+/wifi/scan',
                'device/+/hotspot/clients',
                'device/+/location'
            ];

            topics.forEach(topic => {
                try {
                    this.client.subscribe(topic, { qos: 1 }, (err) => {
                        if (err) {
                            logger.error(`Failed to subscribe to ${topic}:`, err);
                        } else {
                            logger.debug(`Subscribed to ${topic}`);
                        }
                    });
                } catch (error) {
                    logger.error(`Error subscribing to ${topic}:`, error);
                }
            });
        } catch (error) {
            logger.error('Error in subscribeToTopics:', error);
        }
    }

    handleMessage(topic, message) {
        try {
            const parts = topic.split('/');
            if (parts.length < 4) {
                logger.warn(`Invalid topic format: ${topic}`);
                return;
            }

            const deviceId = parts[1];
            const type = parts[2];
            const action = parts[3];

            logger.debug(`MQTT message: ${topic}`);

            // Parse JSON message
            let data;
            try {
                data = JSON.parse(message);
                data.deviceId = deviceId;
                data.timestamp = new Date().toISOString();
            } catch (e) {
                data = { raw: message, deviceId, timestamp: new Date().toISOString() };
            }

            // Check if this is a response to a pending command
            if (data.messageId && this.pendingMessages.has(data.messageId)) {
                try {
                    const pending = this.pendingMessages.get(data.messageId);
                    pending.resolve(data);
                    this.pendingMessages.delete(data.messageId);
                } catch (error) {
                    logger.error(`Error resolving pending message ${data.messageId}:`, error);
                }
            }

            // Update modem service with status
            try {
                if (type === 'status') {
                    modemService.updateFromMqtt(data);
                } else if (type === 'wifi' && action === 'scan') {
                    modemService.updateWifiNetworks(data.networks || []);
                } else if (type === 'hotspot' && action === 'clients') {
                    modemService.updateHotspotClients(data.clients || []);
                }
            } catch (error) {
                logger.error('Error updating modem service:', error);
            }

            // Save to database for certain message types
            this.saveToDatabase(type, action, deviceId, data).catch(error => {
                logger.error('Error saving to database:', error);
            });

            // Emit via Socket.IO
            try {
                if (global.io) {
                    global.io.emit(`${type}:${action}`, data);
                }
            } catch (error) {
                logger.error('Error emitting socket event:', error);
            }

            // Call registered handlers
            try {
                const handlerKey = `${type}:${action}`;
                if (this.messageHandlers.has(handlerKey)) {
                    this.messageHandlers.get(handlerKey)(deviceId, data);
                }
            } catch (error) {
                logger.error('Error calling message handler:', error);
            }

        } catch (error) {
            logger.error('Error handling MQTT message:', error);
        }
    }

    async saveToDatabase(type, action, deviceId, data) {
        try {
            const db = global.app?.locals?.db;
            if (!db) {
                logger.warn('Database not available for saving MQTT data');
                return;
            }

            if (type === 'sms' && action === 'incoming') {
                await db.run(`
                    INSERT INTO sms (from_number, message, type, device_id, timestamp, read) 
                    VALUES (?, ?, 'incoming', ?, ?, 0)
                `, [data.from, data.message, deviceId, data.timestamp || new Date().toISOString()]);
                
                logger.info(`Saved incoming SMS from ${data.from}`);
            }
            else if (type === 'sms' && action === 'delivered') {
                await db.run(`
                    UPDATE sms SET status = 'delivered' 
                    WHERE device_id = ? AND to_number = ? ORDER BY timestamp DESC LIMIT 1
                `, [deviceId, data.to]);
            }
            else if (type === 'call' && action === 'status') {
                await db.run(`
                    UPDATE calls SET status = ?, duration = ? 
                    WHERE device_id = ? AND phone_number = ? AND status IN ('dialing', 'ringing')
                `, [data.status, data.duration || 0, deviceId, data.number]);
            }
            else if (type === 'ussd' && action === 'response') {
                await db.run(`
                    UPDATE ussd SET response = ?, status = 'success' 
                    WHERE device_id = ? AND code = ? AND status = 'pending'
                    ORDER BY timestamp DESC LIMIT 1
                `, [data.response, deviceId, data.code]);
            }
            else if (type === 'webcam' && action === 'image') {
                try {
                    // Save image to file system
                    const fs = require('fs');
                    const path = require('path');
                    
                    const uploadDir = path.join(__dirname, '../public/uploads/webcam');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    
                    const filename = `capture-${Date.now()}.jpg`;
                    const filepath = path.join(uploadDir, filename);
                    
                    const imageData = Buffer.from(data.image, 'base64');
                    fs.writeFileSync(filepath, imageData);
                    
                    const imageUrl = `/uploads/webcam/${filename}`;
                    
                    if (global.io) {
                        global.io.emit('webcam:capture', {
                            path: imageUrl,
                            timestamp: data.timestamp || new Date().toISOString()
                        });
                    }
                } catch (error) {
                    logger.error('Error saving webcam image:', error);
                }
            }
        } catch (error) {
            logger.error('Error saving MQTT data to database:', error);
            throw error; // Re-throw for caller to handle
        }
    }

    // Register handler for specific message types
    on(topic, handler) {
        try {
            this.messageHandlers.set(topic, handler);
        } catch (error) {
            logger.error(`Error registering handler for ${topic}:`, error);
        }
    }

    // Publish command to device with response tracking
    async publishCommand(deviceId, command, payload = {}, timeout = 30000) {
        if (!this.connected) {
            logger.error('MQTT not connected');
            throw new Error('MQTT not connected');
        }

        const messageId = `${command}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const topic = `device/${deviceId}/command/${command}`;
        const message = JSON.stringify({
            ...payload,
            messageId,
            timestamp: Date.now()
        });

        return new Promise((resolve, reject) => {
            try {
                // Set timeout
                const timer = setTimeout(() => {
                    try {
                        if (this.pendingMessages.has(messageId)) {
                            this.pendingMessages.delete(messageId);
                            reject(new Error(`Command timeout after ${timeout}ms`));
                        }
                    } catch (error) {
                        logger.error('Error in timeout handler:', error);
                    }
                }, timeout);

                this.client.publish(topic, message, { qos: 1 }, (err) => {
                    try {
                        if (err) {
                            clearTimeout(timer);
                            logger.error(`Failed to publish to ${topic}:`, err);
                            reject(err);
                        } else {
                            logger.info(`Published to ${topic}: ${command}`);
                            
                            // Store pending message
                            this.pendingMessages.set(messageId, {
                                command,
                                deviceId,
                                payload,
                                timestamp: Date.now(),
                                resolve: (result) => {
                                    try {
                                        clearTimeout(timer);
                                        resolve(result);
                                    } catch (error) {
                                        logger.error('Error in resolve callback:', error);
                                    }
                                },
                                reject: (error) => {
                                    try {
                                        clearTimeout(timer);
                                        reject(error);
                                    } catch (err) {
                                        logger.error('Error in reject callback:', err);
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        logger.error('Error in publish callback:', error);
                        reject(error);
                    }
                });
            } catch (error) {
                logger.error('Error in publishCommand:', error);
                reject(error);
            }
        });
    }

    // Send SMS via device
    async sendSms(deviceId, to, message) {
        try {
            if (!this.connected) {
                throw new Error('MQTT not connected');
            }
            const result = await this.publishCommand(deviceId, 'send-sms', { to, message });
            return { success: true, messageId: result.messageId };
        } catch (error) {
            logger.error('Failed to send SMS:', error);
            return { success: false, error: error.message };
        }
    }

    // Make call
    async makeCall(deviceId, number) {
        try {
            if (!this.connected) {
                throw new Error('MQTT not connected');
            }
            const result = await this.publishCommand(deviceId, 'make-call', { number });
            return { success: true, messageId: result.messageId };
        } catch (error) {
            logger.error('Failed to make call:', error);
            return { success: false, error: error.message };
        }
    }

    // Send USSD
    async sendUssd(deviceId, code) {
        try {
            if (!this.connected) {
                throw new Error('MQTT not connected');
            }
            const result = await this.publishCommand(deviceId, 'send-ussd', { code });
            return { success: true, messageId: result.messageId };
        } catch (error) {
            logger.error('Failed to send USSD:', error);
            return { success: false, error: error.message };
        }
    }

    // Get device status
    async requestStatus(deviceId) {
        try {
            if (!this.connected) {
                throw new Error('MQTT not connected');
            }
            const result = await this.publishCommand(deviceId, 'get-status', {});
            return { success: true, messageId: result.messageId };
        } catch (error) {
            logger.error('Failed to request status:', error);
            return { success: false, error: error.message };
        }
    }

    // Capture image from webcam
    async captureImage(deviceId) {
        try {
            if (!this.connected) {
                throw new Error('MQTT not connected');
            }
            const result = await this.publishCommand(deviceId, 'capture-image', {});
            return { success: true, messageId: result.messageId };
        } catch (error) {
            logger.error('Failed to capture image:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new MQTTService();