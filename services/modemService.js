const logger = require('../utils/logger');

class ModemService {
    constructor() {
        this.modemState = {
            mobile: {
                enabled: false,
                connected: false,
                operator: '',
                networkType: '',
                signalStrength: 0,
                ipAddress: '',
                dataUsage: { sent: 0, received: 0, total: 0 },
                apn: { name: 'internet', username: '', password: '', auth: 'none' }
            },
            wifiClient: {
                enabled: false,
                connected: false,
                ssid: '',
                signalStrength: 0,
                ipAddress: ''
            },
            wifiHotspot: {
                enabled: false,
                ssid: 'ESP32-S3-Hotspot',
                password: '12345678',
                security: 'WPA2-PSK',
                connectedClients: 0
            },
            usb: {
                enabled: false,
                connected: false
            },
            routing: {
                primarySource: 'none',
                connectedDevices: 0
            }
        };
    }

    // Update from MQTT status messages
    updateFromMqtt(data) {
        if (data.mobile) {
            this.modemState.mobile = {
                ...this.modemState.mobile,
                ...data.mobile
            };
        }
        
        if (data.wifi) {
            this.modemState.wifiClient = {
                ...this.modemState.wifiClient,
                ...data.wifi
            };
        }
        
        if (data.hotspot) {
            this.modemState.wifiHotspot = {
                ...this.modemState.wifiHotspot,
                ...data.hotspot
            };
        }
        
        if (data.routing) {
            this.modemState.routing = {
                ...this.modemState.routing,
                ...data.routing
            };
        }

        logger.debug('Modem state updated from MQTT');
    }

    getStatus() {
        const internetAvailable = this.modemState.mobile.connected || 
                                 this.modemState.wifiClient.connected || 
                                 this.modemState.usb.connected;
        
        const activeSource = this.modemState.mobile.connected ? 'mobile' :
                           this.modemState.wifiClient.connected ? 'wifi' :
                           this.modemState.usb.connected ? 'usb' : 'none';

        return {
            internet: {
                available: internetAvailable,
                activeSource,
                sources: {
                    mobile: this.modemState.mobile.connected,
                    wifi: this.modemState.wifiClient.connected,
                    usb: this.modemState.usb.connected
                }
            },
            sharing: {
                hotspot: this.modemState.wifiHotspot.enabled,
                usb: this.modemState.usb.enabled && this.modemState.usb.connected,
                connectedDevices: this.modemState.routing.connectedDevices
            },
            mobile: this.modemState.mobile,
            wifiClient: this.modemState.wifiClient,
            wifiHotspot: this.modemState.wifiHotspot,
            usb: this.modemState.usb,
            routing: this.modemState.routing
        };
    }

    // Commands to send via MQTT
    toggleMobile(enabled) {
        return {
            command: 'set-mobile',
            payload: { enabled }
        };
    }

    setAPN(apn, username, password, auth) {
        return {
            command: 'set-apn',
            payload: { apn, username, password, auth }
        };
    }

    scanWifi() {
        return {
            command: 'scan-wifi',
            payload: {}
        };
    }

    connectToWifi(ssid, password, security) {
        return {
            command: 'connect-wifi',
            payload: { ssid, password, security }
        };
    }

    toggleHotspot(enabled) {
        return {
            command: 'set-hotspot',
            payload: { enabled }
        };
    }

    configureHotspot(config) {
        return {
            command: 'configure-hotspot',
            payload: config
        };
    }

    toggleUSB(enabled) {
        return {
            command: 'set-usb',
            payload: { enabled }
        };
    }

    setRouting(config) {
        return {
            command: 'set-routing',
            payload: config
        };
    }
}

module.exports = new ModemService();