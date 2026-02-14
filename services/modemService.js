const logger = require('../utils/logger');

class ModemService {
    constructor() {
        this.devices = new Map(); // Track multiple devices
        this.wifiNetworks = [];
        this.hotspotClients = [];
        
        // DO NOT create any default devices - wait for actual heartbeats
        // This ensures device only shows online when actually connected
    }

    // Get status for a specific device
    getStatus(deviceId = 'esp32-s3-1') {
        const device = this.devices.get(deviceId);
        
        if (!device) {
            // No device found - return offline status with all zeros
            return {
                online: false,
                signal: 0,
                battery: 0,
                charging: false,
                network: 'No Device',
                operator: 'Not Connected',
                ip: '0.0.0.0',
                temperature: 0,
                uptime: '0s',
                lastSeen: null,
                firstSeen: null
            };
        }

        // Check if device is still online (last seen within 2 minutes)
        const now = new Date();
        const lastSeen = new Date(device.lastSeen);
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        device.online = lastSeen > twoMinutesAgo;

        return {
            online: device.online,
            signal: device.mobile?.signalStrength || 0,
            battery: device.system?.battery || 0,
            charging: device.system?.charging || false,
            network: device.mobile?.networkType || 'No Service',
            operator: device.mobile?.operator || 'Unknown',
            ip: device.mobile?.ipAddress || '0.0.0.0',
            temperature: device.system?.temperature || 0,
            uptime: device.system?.uptime || '0s',
            lastSeen: device.lastSeen,
            firstSeen: device.firstSeen
        };
    }

    // Get device status for a specific device (alias for getStatus)
    getDeviceStatus(deviceId = 'esp32-s3-1') {
        return this.getStatus(deviceId);
    }

    // Update device status from MQTT
    updateDeviceStatus(deviceId, data) {
        try {
            const device = this.devices.get(deviceId) || {
                id: deviceId,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                online: true,
                mobile: {
                    signalStrength: 0,
                    networkType: 'Unknown',
                    operator: 'Unknown',
                    ipAddress: '0.0.0.0',
                    connected: false
                },
                system: {
                    battery: 0,
                    charging: false,
                    uptime: '0s',
                    temperature: 0
                },
                status: {}
            };

            // Update last seen
            device.lastSeen = new Date().toISOString();
            device.online = true;
            
            // Update status data
            device.status = {
                ...device.status,
                ...data,
                lastUpdate: new Date().toISOString()
            };

            // Extract mobile data if present
            if (data.mobile) {
                device.mobile = {
                    ...device.mobile,
                    ...data.mobile
                };
            }

            // Extract WiFi data if present
            if (data.wifi) {
                device.wifi = {
                    ...device.wifi,
                    ...data.wifi
                };
            }

            // Extract system data if present
            if (data.system) {
                device.system = {
                    ...device.system,
                    ...data.system
                };
            }

            this.devices.set(deviceId, device);
            
            logger.info(`📱 Device ${deviceId} status updated`, {
                signal: device.mobile?.signalStrength,
                network: device.mobile?.networkType,
                online: device.online
            });

            return device;
        } catch (error) {
            logger.error('Error updating device status:', error);
            return null;
        }
    }

    // Handle device heartbeat (simple ping)
    handleHeartbeat(deviceId) {
        const device = this.devices.get(deviceId);
        
        if (!device) {
            // New device detected via heartbeat
            logger.info(`🆕 New device detected: ${deviceId}`);
            this.devices.set(deviceId, {
                id: deviceId,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                online: true,
                mobile: {
                    signalStrength: 0,
                    networkType: 'Unknown',
                    operator: 'Unknown',
                    ipAddress: '0.0.0.0',
                    connected: false
                },
                system: {
                    battery: 0,
                    charging: false,
                    uptime: '0s',
                    temperature: 0
                },
                status: {}
            });
        } else {
            // Update last seen for existing device
            device.lastSeen = new Date().toISOString();
            device.online = true;
            this.devices.set(deviceId, device);
        }

        logger.debug(`💓 Heartbeat from device ${deviceId}`);
    }

    // Check which devices are online (heartbeat within last 2 minutes)
    checkOnlineDevices() {
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        const onlineDevices = [];

        for (const [deviceId, device] of this.devices) {
            const lastSeen = new Date(device.lastSeen);
            const wasOnline = device.online;
            
            device.online = lastSeen > twoMinutesAgo;
            
            if (wasOnline && !device.online) {
                logger.warn(`⚠️ Device ${deviceId} went offline (last seen: ${device.lastSeen})`);
                // Emit offline event
                if (global.io) {
                    global.io.emit('device:offline', { deviceId });
                }
            } else if (!wasOnline && device.online) {
                logger.info(`✅ Device ${deviceId} came online`);
                // Emit online event
                if (global.io) {
                    global.io.emit('device:online', { deviceId });
                }
            }
            
            if (device.online) {
                onlineDevices.push(deviceId);
            }
        }

        return onlineDevices;
    }

    // Get all devices
    getAllDevices() {
        this.checkOnlineDevices(); // Update online status
        return Array.from(this.devices.values()).map(d => ({
            id: d.id,
            online: d.online,
            lastSeen: d.lastSeen,
            signal: d.mobile?.signalStrength || 0,
            network: d.mobile?.networkType || 'Unknown',
            operator: d.mobile?.operator || 'Unknown'
        }));
    }

    // Update WiFi scan results
    updateWifiNetworks(deviceId, networks) {
        try {
            this.wifiNetworks = networks;
            const device = this.devices.get(deviceId);
            if (device) {
                device.wifiNetworks = networks;
                this.devices.set(deviceId, device);
            }
            global.io?.emit('modem:wifi-scan', { deviceId, networks });
        } catch (error) {
            logger.error('Error updating WiFi networks:', error);
        }
    }

    // Update hotspot clients
    updateHotspotClients(deviceId, clients) {
        try {
            this.hotspotClients = clients;
            const device = this.devices.get(deviceId);
            if (device) {
                device.hotspotClients = clients;
                device.wifiHotspot = device.wifiHotspot || {};
                device.wifiHotspot.connectedClients = clients.length;
                this.devices.set(deviceId, device);
            }
            global.io?.emit('modem:hotspot-clients', { deviceId, clients });
        } catch (error) {
            logger.error('Error updating hotspot clients:', error);
        }
    }

    // Remove offline devices (cleanup after 5 minutes offline)
    cleanupOfflineDevices() {
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        for (const [deviceId, device] of this.devices) {
            const lastSeen = new Date(device.lastSeen);
            if (lastSeen < fiveMinutesAgo && !device.online) {
                logger.info(`🧹 Removing stale device: ${deviceId} (last seen: ${device.lastSeen})`);
                this.devices.delete(deviceId);
            }
        }
    }

    // Check if any device exists
    hasDevices() {
        return this.devices.size > 0;
    }

    // Get device count
    getDeviceCount() {
        return this.devices.size;
    }
    
    // Reset all devices (useful for testing)
    resetDevices() {
        this.devices.clear();
        logger.info('🔄 All devices cleared');
    }
}

module.exports = new ModemService();