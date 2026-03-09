const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Internet Connection State (initialized with defaults)
let connectionState = {
    mobile: {
        enabled: false,
        connected: false,
        operator: '',
        networkType: '',
        signalStrength: 0,
        ipAddress: '',
        dataUsage: {
            sent: 0,
            received: 0,
            total: 0
        },
        apn: {
            name: 'internet',
            username: '',
            password: '',
            auth: 'none'
        },
        imei: '',
        iccid: '',
        simStatus: 'absent'
    },
    
    wifiClient: {
        enabled: false,
        connected: false,
        ssid: '',
        bssid: '',
        signalStrength: 0,
        ipAddress: '',
        security: '',
        channel: 0,
        dataUsage: {
            sent: 0,
            received: 0
        }
    },
    
    wifiHotspot: {
        enabled: false,
        ssid: 'ESP32-S3-Hotspot',
        password: '12345678',
        security: 'WPA2-PSK',
        band: '2.4GHz',
        channel: 6,
        maxClients: 10,
        connectedClients: 0,
        hidden: false,
        ipAddress: '192.168.4.1',
        clients: []
    },
    
    usb: {
        enabled: false,
        connected: false,
        interface: 'usb0',
        ipAddress: '',
        clientIp: ''
    },
    
    routing: {
        defaultGateway: '',
        primarySource: 'none',
        failover: false,
        loadBalancing: false,
        nat: true,
        firewall: true,
        connectedDevices: 0
    },
    
    system: {
        temperature: 0,
        uptime: '0s',
        firmware: 'unknown'
    }
};

// Cache for storing real data from device
let deviceCache = new Map(); // deviceId -> { timestamp, data }

// ==================== HELPER FUNCTIONS ====================

/**
 * Get real device data via MQTT
 */
async function getDeviceData(deviceId, command, params = {}, timeout = 5000) {
    if (!global.mqttService || !global.mqttService.connected) {
        return { success: false, error: 'MQTT not connected' };
    }

    try {
        const response = await global.mqttService.publishCommand(
            deviceId,
            command,
            params,
            true,
            timeout
        );

        return response || { success: false, error: 'No response' };
    } catch (error) {
        logger.error(`MQTT error for ${command}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Update connection state with real data
 */
function updateStateFromDevice(deviceId, data) {
    if (!data) return;

    // Update cache
    deviceCache.set(deviceId, {
        timestamp: Date.now(),
        data: data
    });

    // Mobile data
    if (data.mobile) {
        connectionState.mobile = {
            ...connectionState.mobile,
            ...data.mobile
        };
    }

    // WiFi client
    if (data.wifi) {
        connectionState.wifiClient = {
            ...connectionState.wifiClient,
            ...data.wifi
        };
    }

    // WiFi hotspot
    if (data.hotspot) {
        connectionState.wifiHotspot = {
            ...connectionState.wifiHotspot,
            ...data.hotspot
        };
    }

    // USB
    if (data.usb) {
        connectionState.usb = {
            ...connectionState.usb,
            ...data.usb
        };
    }

    // System
    if (data.system) {
        connectionState.system = {
            ...connectionState.system,
            ...data.system
        };
    }

    // Determine internet availability
    connectionState.mobile.connected = connectionState.mobile.enabled && 
                                        connectionState.mobile.signalStrength > 0;
    connectionState.wifiClient.connected = connectionState.wifiClient.enabled && 
                                           connectionState.wifiClient.ssid !== '';

    // Update routing
    if (connectionState.mobile.connected) {
        connectionState.routing.primarySource = 'mobile';
    } else if (connectionState.wifiClient.connected) {
        connectionState.routing.primarySource = 'wifi';
    } else if (connectionState.usb.connected) {
        connectionState.routing.primarySource = 'usb';
    } else {
        connectionState.routing.primarySource = 'none';
    }
}

// ==================== MAIN STATUS ENDPOINT ====================

/**
 * Get complete internet status (real data from device)
 * GET /api/modem/status?deviceId=esp32-s3-1
 */
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        // Try to get real data from device
        const response = await getDeviceData(deviceId, 'internet-status', {}, 5000);

        if (response && response.success) {
            updateStateFromDevice(deviceId, response.data);
        } else {
            // Check cache first
            const cached = deviceCache.get(deviceId);
            if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
                updateStateFromDevice(deviceId, cached.data);
            } else {
                // Use defaults but mark as offline
                connectionState.mobile.enabled = false;
                connectionState.mobile.connected = false;
                connectionState.wifiClient.enabled = false;
                connectionState.wifiClient.connected = false;
                connectionState.wifiHotspot.enabled = false;
            }
        }

        const internetAvailable = connectionState.mobile.connected || 
                                 connectionState.wifiClient.connected || 
                                 connectionState.usb.connected;

        res.json({
            success: true,
            data: {
                internet: {
                    available: internetAvailable,
                    activeSource: connectionState.routing.primarySource,
                    sources: {
                        mobile: connectionState.mobile.connected,
                        wifi: connectionState.wifiClient.connected,
                        usb: connectionState.usb.connected
                    }
                },
                sharing: {
                    hotspot: connectionState.wifiHotspot.enabled,
                    usb: connectionState.usb.enabled && connectionState.usb.connected,
                    connectedDevices: connectionState.wifiHotspot.connectedClients
                },
                routing: connectionState.routing,
                mobile: connectionState.mobile,
                wifiClient: connectionState.wifiClient,
                wifiHotspot: connectionState.wifiHotspot,
                usb: connectionState.usb,
                system: connectionState.system
            }
        });
    } catch (error) {
        logger.error('API internet status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get internet status: ' + error.message
        });
    }
});

// ==================== MOBILE DATA ====================

/**
 * Get mobile data status
 * GET /api/modem/mobile/status?deviceId=esp32-s3-1
 */
router.get('/mobile/status', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const response = await getDeviceData(deviceId, 'mobile-status', {}, 5000);

        if (response && response.success) {
            connectionState.mobile = {
                ...connectionState.mobile,
                ...response.data
            };
        }

        res.json({
            success: true,
            data: connectionState.mobile
        });
    } catch (error) {
        logger.error('API mobile status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get mobile data status: ' + error.message
        });
    }
});

/**
 * Toggle mobile data
 * POST /api/modem/mobile/toggle
 */
router.post('/mobile/toggle', [
    body('enabled').isBoolean(),
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

        const { enabled, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'mobile-toggle',
            { enabled },
            true,
            10000
        );

        if (response && response.success) {
            connectionState.mobile.enabled = enabled;
            
            // Emit socket event
            if (req.io) {
                req.io.emit('internet:mobile', { enabled });
            }

            res.json({
                success: true,
                message: `Mobile data ${enabled ? 'enabled' : 'disabled'}`,
                data: { enabled }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to toggle mobile data'
            });
        }
    } catch (error) {
        logger.error('API mobile toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle mobile data: ' + error.message
        });
    }
});

/**
 * Configure APN
 * POST /api/modem/mobile/apn
 */
router.post('/mobile/apn', [
    body('apn').notEmpty(),
    body('username').optional(),
    body('password').optional(),
    body('auth').optional().isIn(['none', 'pap', 'chap'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { apn, username, password, auth, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const apnConfig = {
            apn,
            username: username || '',
            password: password || '',
            auth: auth || 'none'
        };

        const response = await global.mqttService.publishCommand(
            deviceId,
            'mobile-apn',
            apnConfig,
            true,
            10000
        );

        if (response && response.success) {
            connectionState.mobile.apn = apnConfig;

            res.json({
                success: true,
                message: 'APN configured successfully',
                data: apnConfig
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to configure APN'
            });
        }
    } catch (error) {
        logger.error('API APN error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure APN: ' + error.message
        });
    }
});

// ==================== WIFI CLIENT ====================

/**
 * Scan WiFi networks (real scan)
 * GET /api/modem/wifi/client/scan?deviceId=esp32-s3-1
 */
router.get('/wifi/client/scan', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        // Request scan from device
        const response = await global.mqttService.publishCommand(
            deviceId,
            'wifi-scan',
            {},
            true,
            15000 // 15 second timeout for scan
        );

        if (response && response.success && response.networks) {
            // Format networks for display
            const networks = response.networks.map(net => ({
                ssid: net.ssid || 'Hidden Network',
                bssid: net.bssid || '',
                signal: net.rssi ? Math.min(100, Math.max(0, (net.rssi + 100) * 2)) : 0,
                security: net.encryption || 'open',
                channel: net.channel || 0,
                band: net.frequency > 2400 ? '2.4GHz' : '5GHz',
                encrypted: net.encryption !== 'open'
            }));

            res.json({
                success: true,
                data: networks
            });
        } else {
            res.json({
                success: true,
                data: [] // No networks found
            });
        }
    } catch (error) {
        logger.error('API WiFi scan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to scan WiFi networks: ' + error.message
        });
    }
});

/**
 * Connect to WiFi network
 * POST /api/modem/wifi/client/connect
 */
router.post('/wifi/client/connect', [
    body('ssid').notEmpty(),
    body('password').optional(),
    body('security').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ssid, password, security, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'wifi-connect',
            { ssid, password, security: security || 'WPA2' },
            true,
            30000 // 30 second timeout for connection
        );

        if (response && response.success) {
            connectionState.wifiClient.enabled = true;
            connectionState.wifiClient.ssid = ssid;
            connectionState.wifiClient.security = security || 'WPA2';
            
            // Emit socket event
            if (req.io) {
                req.io.emit('internet:wifi-client', { connected: true, ssid });
            }

            res.json({
                success: true,
                message: `Connected to ${ssid}`,
                data: { ssid, status: 'connected' }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to connect'
            });
        }
    } catch (error) {
        logger.error('API WiFi connect error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to connect to WiFi: ' + error.message
        });
    }
});

/**
 * Disconnect from WiFi
 * POST /api/modem/wifi/client/disconnect
 */
router.post('/wifi/client/disconnect', async (req, res) => {
    try {
        const { deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'wifi-disconnect',
            {},
            true,
            10000
        );

        if (response && response.success) {
            connectionState.wifiClient.enabled = false;
            connectionState.wifiClient.connected = false;
            connectionState.wifiClient.ssid = '';

            if (req.io) {
                req.io.emit('internet:wifi-client', { connected: false });
            }

            res.json({
                success: true,
                message: 'Disconnected from WiFi'
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to disconnect'
            });
        }
    } catch (error) {
        logger.error('API WiFi disconnect error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect: ' + error.message
        });
    }
});

// ==================== WIFI HOTSPOT ====================

/**
 * Toggle WiFi hotspot
 * POST /api/modem/wifi/hotspot/toggle
 */
router.post('/wifi/hotspot/toggle', [
    body('enabled').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { enabled, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'hotspot-toggle',
            { enabled },
            true,
            10000
        );

        if (response && response.success) {
            connectionState.wifiHotspot.enabled = enabled;

            if (req.io) {
                req.io.emit('internet:hotspot', { enabled });
            }

            res.json({
                success: true,
                message: `WiFi hotspot ${enabled ? 'started' : 'stopped'}`,
                data: { enabled }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to toggle hotspot'
            });
        }
    } catch (error) {
        logger.error('API hotspot toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle hotspot: ' + error.message
        });
    }
});

/**
 * Configure WiFi hotspot
 * POST /api/modem/wifi/hotspot/configure
 */
router.post('/wifi/hotspot/configure', [
    body('ssid').notEmpty(),
    body('password').isLength({ min: 8 }),
    body('security').isIn(['WPA2-PSK', 'WPA3', 'open']),
    body('band').isIn(['2.4GHz', '5GHz']),
    body('channel').isInt({ min: 1, max: 11 }),
    body('maxClients').isInt({ min: 1, max: 50 }),
    body('hidden').isBoolean()
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
            ssid, password, security, band, channel, 
            maxClients, hidden, deviceId = 'esp32-s3-1' 
        } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const config = {
            ssid,
            password,
            security,
            band,
            channel: parseInt(channel),
            maxClients: parseInt(maxClients),
            hidden
        };

        const response = await global.mqttService.publishCommand(
            deviceId,
            'hotspot-configure',
            config,
            true,
            10000
        );

        if (response && response.success) {
            connectionState.wifiHotspot = {
                ...connectionState.wifiHotspot,
                ...config
            };

            res.json({
                success: true,
                message: 'Hotspot configured',
                data: config
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to configure'
            });
        }
    } catch (error) {
        logger.error('API hotspot configure error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure hotspot: ' + error.message
        });
    }
});

/**
 * Get hotspot clients (real connected devices)
 * GET /api/modem/wifi/hotspot/clients?deviceId=esp32-s3-1
 */
router.get('/wifi/hotspot/clients', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        if (!global.mqttService || !global.mqttService.connected) {
            return res.json({
                success: true,
                data: [],
                count: 0
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'hotspot-clients',
            {},
            true,
            5000
        );

        if (response && response.success && response.clients) {
            connectionState.wifiHotspot.connectedClients = response.clients.length;
            connectionState.wifiHotspot.clients = response.clients;

            res.json({
                success: true,
                data: response.clients,
                count: response.clients.length
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0
            });
        }
    } catch (error) {
        logger.error('API hotspot clients error:', error);
        res.json({
            success: true,
            data: [],
            count: 0,
            error: error.message
        });
    }
});

/**
 * Block hotspot client
 * POST /api/modem/wifi/hotspot/clients/block
 */
router.post('/wifi/hotspot/clients/block', [
    body('mac').notEmpty()
], async (req, res) => {
    try {
        const { mac, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'hotspot-block',
            { mac },
            true,
            5000
        );

        if (response && response.success) {
            // Remove from clients list
            connectionState.wifiHotspot.clients = 
                connectionState.wifiHotspot.clients.filter(c => c.mac !== mac);
            connectionState.wifiHotspot.connectedClients--;

            res.json({
                success: true,
                message: 'Client blocked'
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to block client'
            });
        }
    } catch (error) {
        logger.error('API block client error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to block client: ' + error.message
        });
    }
});

// ==================== USB TETHERING ====================

/**
 * Toggle USB tethering
 * POST /api/modem/usb/toggle
 */
router.post('/usb/toggle', [
    body('enabled').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { enabled, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'usb-toggle',
            { enabled },
            true,
            10000
        );

        if (response && response.success) {
            connectionState.usb.enabled = enabled;

            if (req.io) {
                req.io.emit('internet:usb', { enabled });
            }

            res.json({
                success: true,
                message: `USB tethering ${enabled ? 'enabled' : 'disabled'}`,
                data: { enabled }
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to toggle USB'
            });
        }
    } catch (error) {
        logger.error('API USB toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle USB: ' + error.message
        });
    }
});

// ==================== DATA USAGE ====================

/**
 * Get real data usage
 * GET /api/modem/data-usage?deviceId=esp32-s3-1
 */
router.get('/data-usage', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const response = await getDeviceData(deviceId, 'data-usage', {}, 5000);

        if (response && response.success) {
            res.json({
                success: true,
                data: response.data
            });
        } else {
            // Return cached or default
            res.json({
                success: true,
                data: {
                    mobile: connectionState.mobile.dataUsage,
                    wifi: connectionState.wifiClient.dataUsage,
                    total: {
                        sent: connectionState.mobile.dataUsage.sent + connectionState.wifiClient.dataUsage.sent,
                        received: connectionState.mobile.dataUsage.received + connectionState.wifiClient.dataUsage.received
                    }
                }
            });
        }
    } catch (error) {
        logger.error('API data usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get data usage: ' + error.message
        });
    }
});

/**
 * Reset data usage counters
 * POST /api/modem/data-usage/reset
 */
router.post('/data-usage/reset', async (req, res) => {
    try {
        const { deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const response = await global.mqttService.publishCommand(
            deviceId,
            'data-usage-reset',
            {},
            true,
            5000
        );

        if (response && response.success) {
            connectionState.mobile.dataUsage = { sent: 0, received: 0, total: 0 };
            connectionState.wifiClient.dataUsage = { sent: 0, received: 0 };

            res.json({
                success: true,
                message: 'Data usage reset'
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to reset'
            });
        }
    } catch (error) {
        logger.error('API reset data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset data usage: ' + error.message
        });
    }
});

// ==================== ROUTING ====================

/**
 * Configure routing
 * POST /api/modem/routing/configure
 */
router.post('/routing/configure', [
    body('failover').optional().isBoolean(),
    body('loadBalancing').optional().isBoolean(),
    body('nat').optional().isBoolean(),
    body('firewall').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { failover, loadBalancing, nat, firewall, deviceId = 'esp32-s3-1' } = req.body;

        if (!global.mqttService || !global.mqttService.connected) {
            return res.status(503).json({
                success: false,
                message: 'MQTT not connected'
            });
        }

        const config = {
            failover: failover !== undefined ? failover : connectionState.routing.failover,
            loadBalancing: loadBalancing !== undefined ? loadBalancing : connectionState.routing.loadBalancing,
            nat: nat !== undefined ? nat : connectionState.routing.nat,
            firewall: firewall !== undefined ? firewall : connectionState.routing.firewall
        };

        const response = await global.mqttService.publishCommand(
            deviceId,
            'routing-configure',
            config,
            true,
            10000
        );

        if (response && response.success) {
            connectionState.routing = {
                ...connectionState.routing,
                ...config
            };

            res.json({
                success: true,
                message: 'Routing configured',
                data: config
            });
        } else {
            res.status(500).json({
                success: false,
                message: response?.message || 'Failed to configure'
            });
        }
    } catch (error) {
        logger.error('API routing config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure routing: ' + error.message
        });
    }
});

// ==================== SIGNAL QUALITY ====================

/**
 * Get real-time signal quality
 * GET /api/modem/signal?deviceId=esp32-s3-1
 */
router.get('/signal', async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'esp32-s3-1';

        const response = await getDeviceData(deviceId, 'signal-quality', {}, 3000);

        if (response && response.success) {
            res.json({
                success: true,
                data: {
                    rssi: response.rssi,
                    ber: response.ber,
                    quality: response.quality,
                    bars: response.bars
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    rssi: -85,
                    ber: 0,
                    quality: connectionState.mobile.signalStrength,
                    bars: Math.floor(connectionState.mobile.signalStrength / 20)
                }
            });
        }
    } catch (error) {
        logger.error('API signal error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get signal: ' + error.message
        });
    }
});

module.exports = router;