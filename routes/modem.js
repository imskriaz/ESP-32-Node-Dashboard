const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Internet Connection State
let connectionState = {
    // Mobile Data (Cellular)
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
        }
    },
    
    // WiFi Client (Connect to existing WiFi)
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
    
    // WiFi Hotspot (Share internet)
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
        dhcp: {
            start: '192.168.4.2',
            end: '192.168.4.100',
            gateway: '192.168.4.1',
            dns: '8.8.8.8'
        }
    },
    
    // USB Tethering
    usb: {
        enabled: false,
        connected: false,
        interface: 'usb0',
        ipAddress: '',
        clientIp: '',
        sharing: false
    },
    
    // Internet Routing
    routing: {
        defaultGateway: '',
        primarySource: 'none', // 'mobile', 'wifi', 'usb', 'none'
        failover: false,
        loadBalancing: false,
        nat: true,
        firewall: true,
        connectedDevices: 0
    },
    
    // System
    temperature: 42,
    uptime: '3d 4h 23m',
    firmware: 'A7670E_FASE_V1.0.0'
};

// ==================== MOBILE DATA (CELLULAR) ====================

// Get mobile data status
router.get('/mobile/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: connectionState.mobile
        });
    } catch (error) {
        logger.error('API mobile status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get mobile data status'
        });
    }
});

// Toggle mobile data
router.post('/mobile/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required')
], async (req, res) => {
    try {
        const { enabled } = req.body;
        
        if (enabled) {
            // Disable WiFi client if both are enabled (can't have both)
            if (connectionState.wifiClient.enabled) {
                connectionState.wifiClient.enabled = false;
                connectionState.wifiClient.connected = false;
            }
            
            // Simulate connecting to mobile network
            connectionState.mobile.enabled = true;
            
            setTimeout(() => {
                connectionState.mobile.connected = true;
                connectionState.mobile.operator = 'Robi';
                connectionState.mobile.networkType = '4G LTE';
                connectionState.mobile.signalStrength = 85;
                connectionState.mobile.ipAddress = '10.120.45.67';
                connectionState.routing.primarySource = 'mobile';
                connectionState.routing.defaultGateway = '10.120.45.1';
                
                req.io.emit('internet:mobile', { connected: true });
                logger.info('Mobile data connected');
            }, 3000);
        } else {
            connectionState.mobile.enabled = false;
            connectionState.mobile.connected = false;
            connectionState.mobile.operator = '';
            connectionState.mobile.networkType = '';
            connectionState.mobile.signalStrength = 0;
            connectionState.mobile.ipAddress = '';
            
            if (connectionState.routing.primarySource === 'mobile') {
                connectionState.routing.primarySource = 'none';
            }
            
            req.io.emit('internet:mobile', { connected: false });
            logger.info('Mobile data disabled');
        }
        
        res.json({
            success: true,
            message: `Mobile data ${enabled ? 'enabled' : 'disabled'}`,
            data: { enabled: connectionState.mobile.enabled }
        });
    } catch (error) {
        logger.error('API mobile toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle mobile data'
        });
    }
});

// Configure APN
router.post('/mobile/apn', [
    body('apn').notEmpty().withMessage('APN is required'),
    body('username').optional(),
    body('password').optional(),
    body('auth').optional().isIn(['none', 'pap', 'chap'])
], async (req, res) => {
    try {
        const { apn, username, password, auth } = req.body;
        
        connectionState.mobile.apn = {
            name: apn,
            username: username || '',
            password: password || '',
            auth: auth || 'none'
        };
        
        logger.info(`APN configured: ${apn}`);
        
        // If mobile data is enabled, reconnect to apply new APN
        if (connectionState.mobile.enabled) {
            connectionState.mobile.connected = false;
            setTimeout(() => {
                connectionState.mobile.connected = true;
                req.io.emit('internet:mobile', { connected: true });
            }, 2000);
        }
        
        res.json({
            success: true,
            message: 'APN configured successfully',
            data: connectionState.mobile.apn
        });
    } catch (error) {
        logger.error('API APN error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure APN'
        });
    }
});

// ==================== WIFI CLIENT (Connect to WiFi) ====================

// Get WiFi client status
router.get('/wifi/client/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: connectionState.wifiClient
        });
    } catch (error) {
        logger.error('API WiFi client status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get WiFi client status'
        });
    }
});

// Scan WiFi networks (as client)
router.get('/wifi/client/scan', async (req, res) => {
    try {
        // Mock WiFi networks
        const networks = [
            { 
                ssid: 'Robi-Fi-4G', 
                bssid: '00:11:22:33:44:55',
                signal: 85, 
                security: 'WPA2-PSK',
                channel: 6, 
                band: '2.4GHz',
                encryption: 'CCMP',
                available: true
            },
            { 
                ssid: 'Grameenphone', 
                bssid: 'AA:BB:CC:DD:EE:FF',
                signal: 72, 
                security: 'WPA2-PSK',
                channel: 1, 
                band: '2.4GHz',
                encryption: 'TKIP',
                available: true
            },
            { 
                ssid: 'Banglalink', 
                bssid: '11:22:33:44:55:66',
                signal: 68, 
                security: 'WPA3',
                channel: 11, 
                band: '2.4GHz',
                encryption: 'SAE',
                available: true
            },
            { 
                ssid: 'Office-WiFi', 
                bssid: '22:33:44:55:66:77',
                signal: 92, 
                security: 'WPA2-Enterprise',
                channel: 36, 
                band: '5GHz',
                encryption: 'CCMP',
                available: true,
                enterprise: true
            },
            { 
                ssid: 'Public-Hotspot', 
                bssid: '33:44:55:66:77:88',
                signal: 45, 
                security: 'open',
                channel: 6, 
                band: '2.4GHz',
                encryption: 'none',
                available: true
            }
        ];
        
        res.json({
            success: true,
            data: networks
        });
    } catch (error) {
        logger.error('API WiFi scan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to scan WiFi networks'
        });
    }
});

// Connect to WiFi network
router.post('/wifi/client/connect', [
    body('ssid').notEmpty().withMessage('SSID is required'),
    body('password').optional(),
    body('security').optional(),
    body('username').optional(),
    body('identity').optional()
], async (req, res) => {
    try {
        const { ssid, password, security, username, identity } = req.body;
        
        // Disable mobile data if enabled
        if (connectionState.mobile.enabled) {
            connectionState.mobile.enabled = false;
            connectionState.mobile.connected = false;
        }
        
        // Simulate connection
        connectionState.wifiClient.enabled = true;
        connectionState.wifiClient.ssid = ssid;
        connectionState.wifiClient.security = security || 'WPA2-PSK';
        
        // Simulate connection process
        setTimeout(() => {
            connectionState.wifiClient.connected = true;
            connectionState.wifiClient.signalStrength = 85;
            connectionState.wifiClient.ipAddress = '192.168.1.100';
            connectionState.wifiClient.bssid = '00:11:22:33:44:55';
            connectionState.wifiClient.channel = 6;
            connectionState.routing.primarySource = 'wifi';
            connectionState.routing.defaultGateway = '192.168.1.1';
            
            req.io.emit('internet:wifi-client', { connected: true, ssid });
            logger.info(`Connected to WiFi: ${ssid}`);
        }, 3000);
        
        res.json({
            success: true,
            message: `Connecting to ${ssid}...`,
            data: { ssid, status: 'connecting' }
        });
    } catch (error) {
        logger.error('API WiFi connect error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to connect to WiFi'
        });
    }
});

// Disconnect from WiFi
router.post('/wifi/client/disconnect', async (req, res) => {
    try {
        connectionState.wifiClient.enabled = false;
        connectionState.wifiClient.connected = false;
        connectionState.wifiClient.ssid = '';
        connectionState.wifiClient.ipAddress = '';
        
        if (connectionState.routing.primarySource === 'wifi') {
            connectionState.routing.primarySource = 'none';
        }
        
        req.io.emit('internet:wifi-client', { connected: false });
        logger.info('Disconnected from WiFi');
        
        res.json({
            success: true,
            message: 'Disconnected from WiFi'
        });
    } catch (error) {
        logger.error('API WiFi disconnect error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect from WiFi'
        });
    }
});

// ==================== WIFI HOTSPOT (Share Internet) ====================

// Get WiFi hotspot status
router.get('/wifi/hotspot/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: connectionState.wifiHotspot
        });
    } catch (error) {
        logger.error('API hotspot status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get hotspot status'
        });
    }
});

// Toggle WiFi hotspot
router.post('/wifi/hotspot/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required')
], async (req, res) => {
    try {
        const { enabled } = req.body;
        
        connectionState.wifiHotspot.enabled = enabled;
        
        if (enabled) {
            // Simulate hotspot starting
            connectionState.wifiHotspot.connectedClients = 0;
            connectionState.routing.connectedDevices = 0;
            logger.info('WiFi hotspot started');
        } else {
            connectionState.wifiHotspot.connectedClients = 0;
            connectionState.routing.connectedDevices = 0;
            logger.info('WiFi hotspot stopped');
        }
        
        req.io.emit('internet:hotspot', { enabled });
        
        res.json({
            success: true,
            message: `WiFi hotspot ${enabled ? 'started' : 'stopped'}`,
            data: { enabled }
        });
    } catch (error) {
        logger.error('API hotspot toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle hotspot'
        });
    }
});

// Configure WiFi hotspot
router.post('/wifi/hotspot/configure', [
    body('ssid').notEmpty().withMessage('SSID is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('security').isIn(['WPA2-PSK', 'WPA3', 'open']),
    body('band').isIn(['2.4GHz', '5GHz']),
    body('channel').isInt({ min: 1, max: 11 }),
    body('maxClients').isInt({ min: 1, max: 50 }),
    body('hidden').isBoolean()
], async (req, res) => {
    try {
        const { ssid, password, security, band, channel, maxClients, hidden } = req.body;
        
        connectionState.wifiHotspot.ssid = ssid;
        connectionState.wifiHotspot.password = password;
        connectionState.wifiHotspot.security = security;
        connectionState.wifiHotspot.band = band;
        connectionState.wifiHotspot.channel = parseInt(channel);
        connectionState.wifiHotspot.maxClients = parseInt(maxClients);
        connectionState.wifiHotspot.hidden = hidden;
        
        logger.info(`Hotspot configured: SSID=${ssid}`);
        
        req.io.emit('internet:hotspot-configured', connectionState.wifiHotspot);
        
        res.json({
            success: true,
            message: 'Hotspot configured successfully',
            data: connectionState.wifiHotspot
        });
    } catch (error) {
        logger.error('API hotspot configure error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure hotspot'
        });
    }
});

// Get hotspot clients
router.get('/wifi/hotspot/clients', async (req, res) => {
    try {
        const clients = connectionState.wifiHotspot.enabled ? [
            { 
                id: 1,
                mac: 'AA:BB:CC:DD:EE:FF', 
                ip: '192.168.4.10', 
                hostname: 'iPhone-12', 
                signal: 85,
                rxRate: '72 Mbps',
                txRate: '65 Mbps',
                connected: '5 min',
                vendor: 'Apple',
                dataUsed: '156 MB'
            },
            { 
                id: 2,
                mac: '11:22:33:44:55:66', 
                ip: '192.168.4.11', 
                hostname: 'MacBook-Pro', 
                signal: 92,
                rxRate: '130 Mbps',
                txRate: '120 Mbps',
                connected: '12 min',
                vendor: 'Apple',
                dataUsed: '450 MB'
            }
        ] : [];
        
        connectionState.wifiHotspot.connectedClients = clients.length;
        connectionState.routing.connectedDevices = clients.length;
        
        res.json({
            success: true,
            data: clients,
            count: clients.length
        });
    } catch (error) {
        logger.error('API hotspot clients error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get hotspot clients'
        });
    }
});

// Block hotspot client
router.post('/wifi/hotspot/clients/block', [
    body('mac').notEmpty().withMessage('MAC address is required')
], async (req, res) => {
    try {
        const { mac } = req.body;
        
        logger.info(`Blocked client ${mac} from hotspot`);
        req.io.emit('internet:client-blocked', { mac });
        
        res.json({
            success: true,
            message: `Client blocked successfully`
        });
    } catch (error) {
        logger.error('API block client error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to block client'
        });
    }
});

// ==================== USB TETHERING ====================

// Get USB status
router.get('/usb/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: connectionState.usb
        });
    } catch (error) {
        logger.error('API USB status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get USB status'
        });
    }
});

// Toggle USB tethering
router.post('/usb/toggle', [
    body('enabled').isBoolean().withMessage('Enabled status required')
], async (req, res) => {
    try {
        const { enabled } = req.body;
        
        connectionState.usb.enabled = enabled;
        
        if (enabled) {
            // Simulate USB connection
            setTimeout(() => {
                connectionState.usb.connected = true;
                connectionState.usb.ipAddress = '192.168.42.1';
                connectionState.usb.clientIp = '192.168.42.100';
                connectionState.routing.connectedDevices += 1;
                
                req.io.emit('internet:usb', { connected: true });
                logger.info('USB tethering connected');
            }, 2000);
        } else {
            connectionState.usb.connected = false;
            connectionState.usb.ipAddress = '';
            connectionState.usb.clientIp = '';
            connectionState.routing.connectedDevices = Math.max(0, connectionState.routing.connectedDevices - 1);
            
            req.io.emit('internet:usb', { connected: false });
            logger.info('USB tethering disabled');
        }
        
        res.json({
            success: true,
            message: `USB tethering ${enabled ? 'enabled' : 'disabled'}`,
            data: { enabled }
        });
    } catch (error) {
        logger.error('API USB toggle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle USB tethering'
        });
    }
});

// ==================== INTERNET ROUTING ====================

// Get routing status
router.get('/routing/status', (req, res) => {
    try {
        res.json({
            success: true,
            data: connectionState.routing
        });
    } catch (error) {
        logger.error('API routing status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get routing status'
        });
    }
});

// Configure routing
router.post('/routing/configure', [
    body('failover').optional().isBoolean(),
    body('loadBalancing').optional().isBoolean(),
    body('nat').optional().isBoolean(),
    body('firewall').optional().isBoolean()
], async (req, res) => {
    try {
        const { failover, loadBalancing, nat, firewall } = req.body;
        
        if (failover !== undefined) connectionState.routing.failover = failover;
        if (loadBalancing !== undefined) connectionState.routing.loadBalancing = loadBalancing;
        if (nat !== undefined) connectionState.routing.nat = nat;
        if (firewall !== undefined) connectionState.routing.firewall = firewall;
        
        logger.info('Routing configuration updated');
        
        res.json({
            success: true,
            message: 'Routing configuration updated',
            data: connectionState.routing
        });
    } catch (error) {
        logger.error('API routing config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to configure routing'
        });
    }
});

// Get overall internet status
router.get('/status', (req, res) => {
    try {
        const internetAvailable = connectionState.mobile.connected || 
                                 connectionState.wifiClient.connected || 
                                 connectionState.usb.connected;
        
        const activeSource = connectionState.mobile.connected ? 'mobile' :
                           connectionState.wifiClient.connected ? 'wifi' :
                           connectionState.usb.connected ? 'usb' : 'none';
        
        const status = {
            internet: {
                available: internetAvailable,
                activeSource: activeSource,
                sources: {
                    mobile: connectionState.mobile.connected,
                    wifi: connectionState.wifiClient.connected,
                    usb: connectionState.usb.connected
                }
            },
            sharing: {
                hotspot: connectionState.wifiHotspot.enabled,
                usb: connectionState.usb.enabled && connectionState.usb.connected,
                connectedDevices: connectionState.routing.connectedDevices
            },
            routing: connectionState.routing,
            mobile: connectionState.mobile,
            wifiClient: connectionState.wifiClient,
            wifiHotspot: connectionState.wifiHotspot,
            usb: connectionState.usb,
            system: {
                temperature: connectionState.temperature,
                uptime: connectionState.uptime,
                firmware: connectionState.firmware
            }
        };
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('API internet status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get internet status'
        });
    }
});

// ==================== DATA USAGE ====================

// Get data usage
router.get('/data-usage', (req, res) => {
    try {
        const usage = {
            total: {
                sent: connectionState.mobile.dataUsage.sent + connectionState.wifiClient.dataUsage.sent,
                received: connectionState.mobile.dataUsage.received + connectionState.wifiClient.dataUsage.received,
                total: connectionState.mobile.dataUsage.total + 
                       (connectionState.wifiClient.dataUsage.sent + connectionState.wifiClient.dataUsage.received)
            },
            mobile: connectionState.mobile.dataUsage,
            wifi: connectionState.wifiClient.dataUsage,
            history: [
                { date: '2026-02-14', sent: 156, received: 1245 },
                { date: '2026-02-13', sent: 234, received: 1890 },
                { date: '2026-02-12', sent: 123, received: 978 },
                { date: '2026-02-11', sent: 345, received: 2345 },
                { date: '2026-02-10', sent: 234, received: 1567 }
            ]
        };
        
        res.json({
            success: true,
            data: usage
        });
    } catch (error) {
        logger.error('API data usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get data usage'
        });
    }
});

// Add this to your modem routes for debugging
router.post('/reset-devices', (req, res) => {
    try {
        if (global.modemService) {
            global.modemService.resetDevices();
            res.json({
                success: true,
                message: 'All devices cleared'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Modem service not available'
            });
        }
    } catch (error) {
        logger.error('Reset devices error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Reset data usage
router.post('/data-usage/reset', (req, res) => {
    try {
        connectionState.mobile.dataUsage = { sent: 0, received: 0, total: 0 };
        connectionState.wifiClient.dataUsage = { sent: 0, received: 0 };
        
        res.json({
            success: true,
            message: 'Data usage reset successfully'
        });
    } catch (error) {
        logger.error('API reset data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset data usage'
        });
    }
});

module.exports = router;