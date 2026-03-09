// Modem/Internet Management JavaScript
(function () {
    'use strict';

    console.log('Internet Manager loaded - ' + new Date().toISOString());

    let updateInterval = null;
    let initialized = false;
    let currentStatus = null;
    let deviceId = 'esp32-s3-1';
    let isDeviceOnline = false;
    let scanInProgress = false;

    // DOM Elements
    const elements = {
        // Internet status
        internetStatusCard: document.getElementById('internetStatusCard'),
        internetIcon: document.getElementById('internetIcon'),
        internetStatus: document.getElementById('internetStatus'),
        internetDetails: document.getElementById('internetDetails'),
        activeSource: document.getElementById('activeSource'),

        // Mobile
        mobileToggle: document.getElementById('mobileToggle'),
        mobileIcon: document.getElementById('mobileIcon'),
        mobileStatus: document.getElementById('mobileStatus'),
        mobileOperator: document.getElementById('mobileOperator'),
        mobileNetwork: document.getElementById('mobileNetwork'),
        mobileSignalBar: document.getElementById('mobileSignalBar'),
        mobileSignal: document.getElementById('mobileSignal'),
        mobileIP: document.getElementById('mobileIP'),
        mobileDataUsed: document.getElementById('mobileDataUsed'),

        // WiFi Client
        wifiClientBadge: document.getElementById('wifiClientBadge'),
        wifiClientIcon: document.getElementById('wifiClientIcon'),
        wifiClientSSID: document.getElementById('wifiClientSSID'),
        wifiClientStatus: document.getElementById('wifiClientStatus'),
        wifiClientSignalBar: document.getElementById('wifiClientSignalBar'),
        wifiClientSignal: document.getElementById('wifiClientSignal'),
        wifiClientIP: document.getElementById('wifiClientIP'),
        wifiClientSecurity: document.getElementById('wifiClientSecurity'),
        wifiClientChannel: document.getElementById('wifiClientChannel'),
        disconnectWiFiBtn: document.getElementById('disconnectWiFiBtn'),

        // WiFi Hotspot
        hotspotToggle: document.getElementById('hotspotToggle'),
        hotspotIcon: document.getElementById('hotspotIcon'),
        hotspotSSID: document.getElementById('hotspotSSID'),
        clientCount: document.getElementById('clientCount'),
        clientsList: document.getElementById('clientsList'),

        // USB
        usbToggle: document.getElementById('usbToggle'),
        usbIcon: document.getElementById('usbIcon'),
        usbStatus: document.getElementById('usbStatus'),
        usbDetails: document.getElementById('usbDetails'),

        // Routing
        routingSource: document.getElementById('routingSource'),
        routingGateway: document.getElementById('routingGateway'),
        routingNat: document.getElementById('routingNat'),
        routingFirewall: document.getElementById('routingFirewall'),
        routingFailover: document.getElementById('routingFailover'),
        routingBalancing: document.getElementById('routingBalancing'),
        routingDevices: document.getElementById('routingDevices'),
        routingFailoverCheck: document.getElementById('routingFailoverCheck'),
        routingBalancingCheck: document.getElementById('routingBalancingCheck'),
        routingNatCheck: document.getElementById('routingNatCheck'),
        routingFirewallCheck: document.getElementById('routingFirewallCheck'),
        pathMobile: document.getElementById('pathMobile'),
        pathWiFi: document.getElementById('pathWiFi'),
        pathUSB: document.getElementById('pathUSB'),

        // Data Usage
        totalSent: document.getElementById('totalSent'),
        totalReceived: document.getElementById('totalReceived'),
        totalUsage: document.getElementById('totalUsage'),
        mobileSent: document.getElementById('mobileSent'),
        mobileReceived: document.getElementById('mobileReceived'),
        wifiSent: document.getElementById('wifiSent'),
        wifiReceived: document.getElementById('wifiReceived'),

        // APN Form
        apnName: document.getElementById('apnName'),
        apnUsername: document.getElementById('apnUsername'),
        apnPassword: document.getElementById('apnPassword'),
        apnAuth: document.getElementById('apnAuth'),

        // Hotspot Form
        hotspotSsid: document.getElementById('hotspotSsid'),
        hotspotPassword: document.getElementById('hotspotPassword'),
        hotspotSecurity: document.getElementById('hotspotSecurity'),
        hotspotBand: document.getElementById('hotspotBand'),
        hotspotChannel: document.getElementById('hotspotChannel'),
        hotspotMaxClients: document.getElementById('hotspotMaxClients'),
        hotspotHidden: document.getElementById('hotspotHidden')
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        if (initialized) return;
        initialized = true;

        console.log('Initializing Internet Manager...');

        loadStatus();
        attachEventListeners();
        startUpdates();
        attachSocketListeners();
    }

    // Load complete status
    function loadStatus() {
        fetch(`/api/modem/status?deviceId=${deviceId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentStatus = data.data;
                    isDeviceOnline = true;
                    updateUI(data.data);
                } else {
                    showError('Failed to load status');
                }
            })
            .catch(error => {
                console.error('Error loading status:', error);
                isDeviceOnline = false;
                showOfflineUI();
            });
    }

    function showOfflineUI() {
        // Update internet status
        if (elements.internetStatusCard) {
            elements.internetStatusCard.className = 'card bg-secondary bg-opacity-10 border-0';
        }
        if (elements.internetIcon) elements.internetIcon.className = 'bi bi-globe2 fs-1 text-secondary';
        if (elements.internetStatus) elements.internetStatus.textContent = 'Device Offline';
        if (elements.internetDetails) elements.internetDetails.textContent = 'Connect to device to see status';
        if (elements.activeSource) elements.activeSource.textContent = 'OFFLINE';

        // Disable toggles
        if (elements.mobileToggle) {
            elements.mobileToggle.disabled = true;
            elements.mobileToggle.checked = false;
        }
        if (elements.hotspotToggle) {
            elements.hotspotToggle.disabled = true;
            elements.hotspotToggle.checked = false;
        }
        if (elements.usbToggle) {
            elements.usbToggle.disabled = true;
            elements.usbToggle.checked = false;
        }
    }

    // Update all UI elements
    function updateUI(status) {
        updateInternetStatus(status);
        updateMobileUI(status.mobile);
        updateWiFiClientUI(status.wifiClient);
        updateHotspotUI(status.wifiHotspot);
        updateUSBUI(status.usb);
        updateRoutingUI(status.routing);
        updateDataUsageUI(status);
    }

    // Update internet status overview
    function updateInternetStatus(status) {
        const internetAvailable = status.internet.available;
        
        if (elements.internetStatusCard) {
            elements.internetStatusCard.className = internetAvailable ? 
                'card bg-success bg-opacity-10 border-0' : 
                'card bg-danger bg-opacity-10 border-0';
        }
        
        if (elements.internetIcon) {
            elements.internetIcon.className = internetAvailable ? 
                'bi bi-globe2 fs-1 text-success' : 
                'bi bi-globe2 fs-1 text-danger';
        }
        
        if (elements.internetStatus) {
            elements.internetStatus.textContent = internetAvailable ? 
                'Internet Connected' : 
                'No Internet Connection';
        }
        
        if (elements.activeSource) {
            elements.activeSource.textContent = status.internet.activeSource.toUpperCase();
        }

        if (elements.internetDetails) {
            const sources = [];
            if (status.mobile.connected) sources.push('Mobile Data');
            if (status.wifiClient.connected) sources.push('WiFi');
            if (status.usb.connected) sources.push('USB');
            elements.internetDetails.textContent = sources.length > 0 ?
                `Connected via: ${sources.join(' + ')}` :
                'Connect via Mobile Data or WiFi';
        }
    }

    // Update mobile UI
    function updateMobileUI(mobile) {
        if (elements.mobileToggle) {
            elements.mobileToggle.checked = mobile.enabled;
            elements.mobileToggle.disabled = !isDeviceOnline;
        }

        if (mobile.connected) {
            if (elements.mobileIcon) elements.mobileIcon.className = 'bi bi-broadcast text-success';
            if (elements.mobileStatus) elements.mobileStatus.textContent = 'Connected';
            if (elements.mobileOperator) elements.mobileOperator.textContent = mobile.operator || 'Unknown';
            if (elements.mobileNetwork) elements.mobileNetwork.textContent = mobile.networkType || 'Unknown';
            
            if (elements.mobileSignalBar) {
                elements.mobileSignalBar.style.width = mobile.signalStrength + '%';
                elements.mobileSignalBar.className = mobile.signalStrength > 70 ? 'progress-bar bg-success' :
                    mobile.signalStrength > 40 ? 'progress-bar bg-warning' : 'progress-bar bg-danger';
            }
            
            if (elements.mobileSignal) elements.mobileSignal.textContent = mobile.signalStrength + '%';
            if (elements.mobileIP) elements.mobileIP.textContent = mobile.ipAddress || '0.0.0.0';
            
            const totalMB = Math.round((mobile.dataUsage.sent + mobile.dataUsage.received) / (1024 * 1024));
            if (elements.mobileDataUsed) elements.mobileDataUsed.textContent = totalMB + ' MB';
        } else if (mobile.enabled) {
            if (elements.mobileIcon) elements.mobileIcon.className = 'bi bi-broadcast text-warning';
            if (elements.mobileStatus) elements.mobileStatus.textContent = 'Connecting...';
            if (elements.mobileOperator) elements.mobileOperator.textContent = '—';
            if (elements.mobileNetwork) elements.mobileNetwork.textContent = '—';
            if (elements.mobileSignalBar) elements.mobileSignalBar.style.width = '0%';
            if (elements.mobileSignal) elements.mobileSignal.textContent = '0%';
            if (elements.mobileIP) elements.mobileIP.textContent = '—';
        } else {
            if (elements.mobileIcon) elements.mobileIcon.className = 'bi bi-broadcast text-secondary';
            if (elements.mobileStatus) elements.mobileStatus.textContent = 'Disabled';
            if (elements.mobileOperator) elements.mobileOperator.textContent = '—';
            if (elements.mobileNetwork) elements.mobileNetwork.textContent = '—';
            if (elements.mobileSignalBar) elements.mobileSignalBar.style.width = '0%';
            if (elements.mobileSignal) elements.mobileSignal.textContent = '0%';
            if (elements.mobileIP) elements.mobileIP.textContent = '—';
        }

        // Update APN form
        if (elements.apnName) elements.apnName.value = mobile.apn.name || 'internet';
        if (elements.apnUsername) elements.apnUsername.value = mobile.apn.username || '';
        if (elements.apnPassword) elements.apnPassword.value = mobile.apn.password || '';
        if (elements.apnAuth) elements.apnAuth.value = mobile.apn.auth || 'none';
    }

    // Update WiFi client UI
    function updateWiFiClientUI(wifi) {
        if (elements.wifiClientBadge) {
            elements.wifiClientBadge.textContent = wifi.connected ? 'Connected' : 'Disconnected';
            elements.wifiClientBadge.className = wifi.connected ? 'badge bg-success' : 'badge bg-danger';
        }

        if (elements.wifiClientIcon) {
            elements.wifiClientIcon.className = wifi.connected ? 
                'bi bi-wifi text-success' : 
                'bi bi-wifi text-secondary';
        }

        if (elements.wifiClientSSID) elements.wifiClientSSID.textContent = wifi.ssid || 'Not Connected';
        
        if (elements.wifiClientStatus) {
            elements.wifiClientStatus.textContent = wifi.connected ? 'Connected' : 'Disconnected';
            elements.wifiClientStatus.className = wifi.connected ? 'badge bg-success' : 'badge bg-danger';
        }

        if (wifi.connected) {
            if (elements.wifiClientSignalBar) {
                elements.wifiClientSignalBar.style.width = wifi.signalStrength + '%';
                elements.wifiClientSignalBar.className = wifi.signalStrength > 70 ? 'progress-bar bg-success' :
                    wifi.signalStrength > 40 ? 'progress-bar bg-warning' : 'progress-bar bg-danger';
            }
            if (elements.wifiClientSignal) elements.wifiClientSignal.textContent = wifi.signalStrength + '%';
            if (elements.wifiClientIP) elements.wifiClientIP.textContent = wifi.ipAddress || '0.0.0.0';
            if (elements.wifiClientSecurity) elements.wifiClientSecurity.textContent = wifi.security || '—';
            if (elements.wifiClientChannel) elements.wifiClientChannel.textContent = wifi.channel || '—';
        } else {
            if (elements.wifiClientSignalBar) elements.wifiClientSignalBar.style.width = '0%';
            if (elements.wifiClientSignal) elements.wifiClientSignal.textContent = '0%';
            if (elements.wifiClientIP) elements.wifiClientIP.textContent = '—';
            if (elements.wifiClientSecurity) elements.wifiClientSecurity.textContent = '—';
            if (elements.wifiClientChannel) elements.wifiClientChannel.textContent = '—';
        }

        if (elements.disconnectWiFiBtn) {
            elements.disconnectWiFiBtn.style.display = wifi.connected ? 'block' : 'none';
        }
    }

    // Update hotspot UI
    function updateHotspotUI(hotspot) {
        if (elements.hotspotToggle) {
            elements.hotspotToggle.checked = hotspot.enabled;
            elements.hotspotToggle.disabled = !isDeviceOnline;
        }

        if (elements.hotspotIcon) {
            elements.hotspotIcon.className = hotspot.enabled ? 
                'bi bi-wifi text-success' : 
                'bi bi-wifi text-secondary';
        }

        if (elements.hotspotSSID) elements.hotspotSSID.textContent = hotspot.ssid || 'Disabled';
        if (elements.clientCount) elements.clientCount.textContent = hotspot.connectedClients + '/' + hotspot.maxClients;

        // Update form
        if (elements.hotspotSsid) elements.hotspotSsid.value = hotspot.ssid || 'ESP32-S3-Hotspot';
        if (elements.hotspotPassword) elements.hotspotPassword.value = hotspot.password || '12345678';
        if (elements.hotspotSecurity) elements.hotspotSecurity.value = hotspot.security || 'WPA2-PSK';
        if (elements.hotspotBand) elements.hotspotBand.value = hotspot.band || '2.4GHz';
        if (elements.hotspotChannel) elements.hotspotChannel.value = hotspot.channel || 6;
        if (elements.hotspotMaxClients) elements.hotspotMaxClients.value = hotspot.maxClients || 10;
        if (elements.hotspotHidden) elements.hotspotHidden.checked = hotspot.hidden || false;
    }

    // Update USB UI
    function updateUSBUI(usb) {
        if (elements.usbToggle) {
            elements.usbToggle.checked = usb.enabled;
            elements.usbToggle.disabled = !isDeviceOnline;
        }

        if (usb.connected) {
            if (elements.usbIcon) elements.usbIcon.className = 'bi bi-usb-symbol text-success';
            if (elements.usbStatus) elements.usbStatus.textContent = 'Connected';
            if (elements.usbDetails) elements.usbDetails.textContent = `IP: ${usb.clientIp || '0.0.0.0'}`;
        } else if (usb.enabled) {
            if (elements.usbIcon) elements.usbIcon.className = 'bi bi-usb-symbol text-warning';
            if (elements.usbStatus) elements.usbStatus.textContent = 'Waiting for USB...';
            if (elements.usbDetails) elements.usbDetails.textContent = 'Connect USB cable to computer';
        } else {
            if (elements.usbIcon) elements.usbIcon.className = 'bi bi-usb-symbol text-secondary';
            if (elements.usbStatus) elements.usbStatus.textContent = 'Disabled';
            if (elements.usbDetails) elements.usbDetails.textContent = 'Connect USB cable to share internet';
        }
    }

    // Update routing UI
    function updateRoutingUI(routing) {
        if (elements.routingSource) elements.routingSource.textContent = routing.primarySource || 'None';
        if (elements.routingGateway) elements.routingGateway.textContent = routing.defaultGateway || '—';
        if (elements.routingNat) {
            elements.routingNat.textContent = routing.nat ? 'Yes' : 'No';
            elements.routingNat.className = routing.nat ? 'badge bg-success' : 'badge bg-danger';
        }
        if (elements.routingFirewall) {
            elements.routingFirewall.textContent = routing.firewall ? 'Enabled' : 'Disabled';
            elements.routingFirewall.className = routing.firewall ? 'badge bg-success' : 'badge bg-danger';
        }
        if (elements.routingFailover) {
            elements.routingFailover.textContent = routing.failover ? 'Enabled' : 'Disabled';
            elements.routingFailover.className = routing.failover ? 'badge bg-success' : 'badge bg-secondary';
        }
        if (elements.routingBalancing) {
            elements.routingBalancing.textContent = routing.loadBalancing ? 'Enabled' : 'Disabled';
            elements.routingBalancing.className = routing.loadBalancing ? 'badge bg-success' : 'badge bg-secondary';
        }
        if (elements.routingDevices) elements.routingDevices.textContent = routing.connectedDevices || 0;

        // Checkboxes
        if (elements.routingFailoverCheck) elements.routingFailoverCheck.checked = routing.failover || false;
        if (elements.routingBalancingCheck) elements.routingBalancingCheck.checked = routing.loadBalancing || false;
        if (elements.routingNatCheck) elements.routingNatCheck.checked = routing.nat !== false;
        if (elements.routingFirewallCheck) elements.routingFirewallCheck.checked = routing.firewall !== false;

        // Path display
        if (elements.pathMobile) {
            elements.pathMobile.innerHTML = currentStatus?.mobile?.connected ?
                '<span class="text-success">Connected</span>' :
                '<span class="text-danger">Not Connected</span>';
        }
        if (elements.pathWiFi) {
            elements.pathWiFi.innerHTML = currentStatus?.wifiClient?.connected ?
                '<span class="text-success">Connected</span>' :
                '<span class="text-danger">Not Connected</span>';
        }
        if (elements.pathUSB) {
            elements.pathUSB.innerHTML = currentStatus?.usb?.connected ?
                '<span class="text-success">Connected</span>' :
                '<span class="text-danger">Not Connected</span>';
        }
    }

    // Update data usage UI
    function updateDataUsageUI(status) {
        const totalSent = (status.mobile.dataUsage.sent + status.wifiClient.dataUsage.sent);
        const totalReceived = (status.mobile.dataUsage.received + status.wifiClient.dataUsage.received);
        const totalMB = Math.round((totalSent + totalReceived) / (1024 * 1024));
        const sentMB = Math.round(totalSent / (1024 * 1024));
        const receivedMB = Math.round(totalReceived / (1024 * 1024));

        if (elements.totalSent) elements.totalSent.textContent = formatBytes(totalSent);
        if (elements.totalReceived) elements.totalReceived.textContent = formatBytes(totalReceived);
        if (elements.totalUsage) elements.totalUsage.textContent = totalMB + ' MB';

        if (elements.mobileSent) elements.mobileSent.textContent = formatBytes(status.mobile.dataUsage.sent);
        if (elements.mobileReceived) elements.mobileReceived.textContent = formatBytes(status.mobile.dataUsage.received);
        if (elements.wifiSent) elements.wifiSent.textContent = formatBytes(status.wifiClient.dataUsage.sent);
        if (elements.wifiReceived) elements.wifiReceived.textContent = formatBytes(status.wifiClient.dataUsage.received);
    }

    // ==================== MOBILE FUNCTIONS ====================

    function toggleMobile(enabled) {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            if (elements.mobileToggle) elements.mobileToggle.checked = !enabled;
            return;
        }

        const toggle = elements.mobileToggle;
        const originalChecked = toggle.checked;
        toggle.disabled = true;

        fetch('/api/modem/mobile/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                setTimeout(loadStatus, 1000);
            } else {
                showToast(data.message, 'danger');
                toggle.checked = originalChecked;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to toggle mobile data', 'danger');
            toggle.checked = originalChecked;
        })
        .finally(() => {
            toggle.disabled = false;
        });
    }

    function saveAPN() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        const apn = {
            apn: elements.apnName?.value,
            username: elements.apnUsername?.value,
            password: elements.apnPassword?.value,
            auth: elements.apnAuth?.value
        };

        if (!apn.apn) {
            showToast('APN is required', 'warning');
            return;
        }

        fetch('/api/modem/mobile/apn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...apn, deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('APN saved', 'success');
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to save APN', 'danger');
        });
    }

    function setAPN(apn, username, password, auth) {
        if (elements.apnName) elements.apnName.value = apn;
        if (elements.apnUsername) elements.apnUsername.value = username || '';
        if (elements.apnPassword) elements.apnPassword.value = password || '';
        if (elements.apnAuth) elements.apnAuth.value = auth || 'none';
        saveAPN();
    }

    // ==================== WIFI FUNCTIONS ====================

    function scanWiFiNetworks() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        if (scanInProgress) return;
        scanInProgress = true;

        const list = document.getElementById('wifiNetworksList');
        list.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Scanning for networks...</p>
            </div>
        `;

        fetch(`/api/modem/wifi/client/scan?deviceId=${deviceId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (data.data && data.data.length > 0) {
                        displayWiFiNetworks(data.data);
                    } else {
                        list.innerHTML = `
                            <div class="text-center py-4 text-muted">
                                <i class="bi bi-wifi fs-1 d-block mb-3"></i>
                                <p>No networks found</p>
                                <button class="btn btn-sm btn-outline-primary" onclick="scanWiFiNetworks()">
                                    Scan Again
                                </button>
                            </div>
                        `;
                    }
                } else {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                list.innerHTML = `
                    <div class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                        <p>Failed to scan: ${error.message}</p>
                        <button class="btn btn-sm btn-outline-danger" onclick="scanWiFiNetworks()">
                            Retry
                        </button>
                    </div>
                `;
            })
            .finally(() => {
                scanInProgress = false;
            });
    }

    function displayWiFiNetworks(networks) {
        const list = document.getElementById('wifiNetworksList');
        if (!list) return;

        if (!networks || networks.length === 0) {
            list.innerHTML = `
                <div class="text-center py-4 text-muted">
                    No networks found
                </div>
            `;
            return;
        }

        let html = '';
        networks.forEach(net => {
            const signalClass = net.signal > 70 ? 'success' : (net.signal > 40 ? 'warning' : 'danger');
            const securityIcon = !net.encrypted ? 'unlock' : 'lock';

            html += `
                <div class="list-group-item list-group-item-action" onclick="showConnectModal('${net.ssid.replace(/'/g, "\\'")}', ${net.encrypted})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="bi bi-${securityIcon} me-2"></i>
                            <strong>${net.ssid}</strong>
                            ${net.bssid ? `<br><small class="text-muted">${net.bssid}</small>` : ''}
                        </div>
                        <div class="text-end">
                            <div class="progress mb-1" style="width: 100px;">
                                <div class="progress-bar bg-${signalClass}" style="width: ${net.signal}%"></div>
                            </div>
                            <small>${net.signal}%</small>
                            <br>
                            <small class="text-muted">${net.band} | CH ${net.channel}</small>
                        </div>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    }

    function showConnectModal(ssid, encrypted) {
        document.getElementById('connectSsid').value = ssid;
        document.getElementById('connectSsidDisplay').value = ssid;

        if (encrypted) {
            document.getElementById('passwordField').style.display = 'block';
        } else {
            document.getElementById('passwordField').style.display = 'none';
        }

        const modal = new bootstrap.Modal(document.getElementById('wifiConnectModal'));
        modal.show();
    }

    function connectToWiFi() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        const ssid = document.getElementById('connectSsid').value;
        const password = document.getElementById('connectPassword').value;
        const security = document.getElementById('connectSecurity')?.value || 'WPA2';

        if (!ssid) {
            showToast('SSID is required', 'warning');
            return;
        }

        const data = { ssid, password, security, deviceId };

        fetch('/api/modem/wifi/client/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('wifiConnectModal'));
                modal.hide();
                loadStatus();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to connect', 'danger');
        });
    }

    function disconnectWiFi() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        if (!confirm('Disconnect from WiFi?')) return;

        fetch('/api/modem/wifi/client/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                loadStatus();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to disconnect', 'danger');
        });
    }

    // ==================== HOTSPOT FUNCTIONS ====================

    function toggleHotspot(enabled) {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            if (elements.hotspotToggle) elements.hotspotToggle.checked = !enabled;
            return;
        }

        fetch('/api/modem/wifi/hotspot/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                loadStatus();
            } else {
                if (elements.hotspotToggle) elements.hotspotToggle.checked = !enabled;
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            if (elements.hotspotToggle) elements.hotspotToggle.checked = !enabled;
            showToast('Failed to toggle hotspot', 'danger');
        });
    }

    function loadHotspotClients() {
        if (!isDeviceOnline) return;

        fetch(`/api/modem/wifi/hotspot/clients?deviceId=${deviceId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayHotspotClients(data.data);
                }
            })
            .catch(console.error);
    }

    function displayHotspotClients(clients) {
        const list = elements.clientsList;
        if (!list) return;

        if (!clients || clients.length === 0) {
            list.innerHTML = '<div class="text-center py-4 text-muted">No clients connected</div>';
            return;
        }

        let html = '';
        clients.forEach(client => {
            const signalClass = client.rssi ? 
                (client.rssi > -50 ? 'success' : client.rssi > -70 ? 'warning' : 'danger') : 
                'secondary';
            const connectedTime = client.connected ? formatConnectedTime(client.connected) : 'Just now';

            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="bi bi-${client.hostname?.includes('iPhone') ? 'phone' : 'laptop'} me-2"></i>
                            <strong>${client.hostname || 'Unknown Device'}</strong>
                            <br>
                            <small class="text-muted">${client.mac || 'Unknown MAC'}</small>
                        </div>
                        <div class="text-end">
                            <small>${client.ip || '0.0.0.0'}</small>
                            <br>
                            <small class="text-muted">${connectedTime}</small>
                        </div>
                    </div>
                    ${client.rssi ? `
                        <div class="mt-2">
                            <div class="progress" style="height: 4px;">
                                <div class="progress-bar bg-${signalClass}" style="width: ${Math.min(100, (client.rssi + 100) * 2)}%"></div>
                            </div>
                        </div>
                    ` : ''}
                    <div class="mt-2 d-flex justify-content-end gap-2">
                        <button class="btn btn-sm btn-outline-warning" onclick="limitClient('${client.mac}')">
                            <i class="bi bi-speedometer2"></i> Limit
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="blockClient('${client.mac}')">
                            <i class="bi bi-slash-circle"></i> Block
                        </button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    }

    function saveHotspotConfig() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        const config = {
            ssid: elements.hotspotSsid?.value,
            password: elements.hotspotPassword?.value,
            security: elements.hotspotSecurity?.value,
            band: elements.hotspotBand?.value,
            channel: parseInt(elements.hotspotChannel?.value),
            maxClients: parseInt(elements.hotspotMaxClients?.value),
            hidden: elements.hotspotHidden?.checked,
            deviceId
        };

        if (!config.ssid || !config.password) {
            showToast('SSID and password are required', 'warning');
            return;
        }

        if (config.password.length < 8) {
            showToast('Password must be at least 8 characters', 'warning');
            return;
        }

        fetch('/api/modem/wifi/hotspot/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Hotspot configured', 'success');
                loadStatus();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to save config', 'danger');
        });
    }

    function limitClient(mac) {
        const speed = prompt('Enter speed limit in Kbps (e.g., 512):', '512');
        if (speed) {
            fetch('/api/modem/wifi/hotspot/clients/limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, speed: parseInt(speed), deviceId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(`Client limited to ${speed} Kbps`, 'success');
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(console.error);
        }
    }

    function blockClient(mac) {
        if (!confirm(`Block client ${mac}?`)) return;

        fetch('/api/modem/wifi/hotspot/clients/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac, deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Client blocked', 'success');
                loadHotspotClients();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    // ==================== USB FUNCTIONS ====================

    function toggleUSB(enabled) {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            if (elements.usbToggle) elements.usbToggle.checked = !enabled;
            return;
        }

        fetch('/api/modem/usb/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                loadStatus();
            } else {
                if (elements.usbToggle) elements.usbToggle.checked = !enabled;
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            if (elements.usbToggle) elements.usbToggle.checked = !enabled;
            showToast('Failed to toggle USB', 'danger');
        });
    }

    // ==================== ROUTING FUNCTIONS ====================

    function saveRoutingConfig() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        const config = {
            failover: elements.routingFailoverCheck?.checked || false,
            loadBalancing: elements.routingBalancingCheck?.checked || false,
            nat: elements.routingNatCheck?.checked !== false,
            firewall: elements.routingFirewallCheck?.checked !== false,
            deviceId
        };

        fetch('/api/modem/routing/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Routing configuration saved', 'success');
                loadStatus();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    // ==================== DATA USAGE FUNCTIONS ====================

    function resetDataUsage() {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        if (!confirm('Reset all data usage counters?')) return;

        fetch('/api/modem/data-usage/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Data usage reset', 'success');
                loadStatus();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    // ==================== UTILITY FUNCTIONS ====================

    function attachEventListeners() {
        // Mobile toggle
        if (elements.mobileToggle) {
            const newToggle = elements.mobileToggle.cloneNode(true);
            elements.mobileToggle.parentNode.replaceChild(newToggle, elements.mobileToggle);
            newToggle.addEventListener('change', (e) => toggleMobile(e.target.checked));
            elements.mobileToggle = newToggle;
        }

        // Hotspot toggle
        if (elements.hotspotToggle) {
            const newToggle = elements.hotspotToggle.cloneNode(true);
            elements.hotspotToggle.parentNode.replaceChild(newToggle, elements.hotspotToggle);
            newToggle.addEventListener('change', (e) => toggleHotspot(e.target.checked));
            elements.hotspotToggle = newToggle;
        }

        // USB toggle
        if (elements.usbToggle) {
            const newToggle = elements.usbToggle.cloneNode(true);
            elements.usbToggle.parentNode.replaceChild(newToggle, elements.usbToggle);
            newToggle.addEventListener('change', (e) => toggleUSB(e.target.checked));
            elements.usbToggle = newToggle;
        }
    }

    function attachSocketListeners() {
        if (typeof socket === 'undefined') return;

        socket.off('internet:mobile');
        socket.off('internet:wifi-client');
        socket.off('internet:hotspot');
        socket.off('internet:usb');

        socket.on('internet:mobile', () => loadStatus());
        socket.on('internet:wifi-client', () => loadStatus());
        socket.on('internet:hotspot', () => loadStatus());
        socket.on('internet:usb', () => loadStatus());
    }

    function startUpdates() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(loadStatus, 10000);
        setInterval(loadHotspotClients, 15000);
    }

    function refreshStatus() {
        loadStatus();
        showToast('Status refreshed', 'success');
    }

    function togglePassword() {
        const input = document.getElementById('connectPassword');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    function toggleHotspotPassword() {
        const input = document.getElementById('hotspotPassword');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatConnectedTime(seconds) {
        if (!seconds) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    function showError(message) {
        showToast(message, 'danger');
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (updateInterval) clearInterval(updateInterval);
    });

    // Export functions
    window.toggleMobile = toggleMobile;
    window.saveAPN = saveAPN;
    window.setAPN = setAPN;
    window.scanWiFiNetworks = scanWiFiNetworks;
    window.showConnectModal = showConnectModal;
    window.connectToWiFi = connectToWiFi;
    window.disconnectWiFi = disconnectWiFi;
    window.toggleHotspot = toggleHotspot;
    window.saveHotspotConfig = saveHotspotConfig;
    window.toggleUSB = toggleUSB;
    window.blockClient = blockClient;
    window.saveRoutingConfig = saveRoutingConfig;
    window.resetDataUsage = resetDataUsage;
    window.refreshStatus = refreshStatus;
    window.togglePassword = togglePassword;
    window.toggleHotspotPassword = toggleHotspotPassword;

    console.log('Internet Manager initialized');
})();