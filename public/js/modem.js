// Modem/Internet Management JavaScript
(function () {
    'use strict';

    console.log('Internet Manager loaded - ' + new Date().toISOString());

    let updateInterval = null;
    let initialized = false;
    let currentStatus = null;

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
        fetch('/api/modem/status')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentStatus = data.data;
                    updateUI(data.data);
                }
            })
            .catch(error => console.error('Error loading status:', error));
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
        const card = document.getElementById('internetStatusCard');
        const icon = document.getElementById('internetIcon');
        const statusEl = document.getElementById('internetStatus');
        const details = document.getElementById('internetDetails');
        const source = document.getElementById('activeSource');

        if (internetAvailable) {
            card.className = 'card bg-success bg-opacity-10 border-0';
            icon.className = 'bi bi-globe2 fs-1 text-success';
            statusEl.textContent = 'Internet Connected';
            source.textContent = status.internet.activeSource.toUpperCase();

            const sources = [];
            if (status.mobile.connected) sources.push('Mobile Data');
            if (status.wifiClient.connected) sources.push('WiFi');
            if (status.usb.connected) sources.push('USB');
            details.textContent = `Connected via: ${sources.join(' + ')}`;
        } else {
            card.className = 'card bg-danger bg-opacity-10 border-0';
            icon.className = 'bi bi-globe2 fs-1 text-danger';
            statusEl.textContent = 'No Internet Connection';
            source.textContent = 'NO SOURCE';
            details.textContent = 'Connect via Mobile Data or WiFi';
        }
    }

    // ==================== MOBILE DATA FUNCTIONS ====================
    function updateMobileUI(mobile) {
        const toggle = document.getElementById('mobileToggle');
        const icon = document.getElementById('mobileIcon');
        const statusEl = document.getElementById('mobileStatus');
        const operator = document.getElementById('mobileOperator');
        const network = document.getElementById('mobileNetwork');
        const signalBar = document.getElementById('mobileSignalBar');
        const signal = document.getElementById('mobileSignal');
        const ip = document.getElementById('mobileIP');
        const dataUsed = document.getElementById('mobileDataUsed');

        if (toggle) toggle.checked = mobile.enabled;

        if (mobile.connected) {
            icon.className = 'bi bi-broadcast text-success';
            statusEl.textContent = 'Connected';
            operator.textContent = mobile.operator;
            network.textContent = mobile.networkType;
            signalBar.style.width = mobile.signalStrength + '%';
            signalBar.className = mobile.signalStrength > 70 ? 'progress-bar bg-success' :
                mobile.signalStrength > 40 ? 'progress-bar bg-warning' :
                    'progress-bar bg-danger';
            signal.textContent = mobile.signalStrength + '%';
            ip.textContent = mobile.ipAddress;
            dataUsed.textContent = formatBytes(mobile.dataUsage.total * 1024 * 1024);
        } else if (mobile.enabled) {
            icon.className = 'bi bi-broadcast text-warning';
            statusEl.textContent = 'Connecting...';
            operator.textContent = '—';
            network.textContent = '—';
            signalBar.style.width = '0%';
            signal.textContent = '0%';
            ip.textContent = '—';
        } else {
            icon.className = 'bi bi-broadcast text-secondary';
            statusEl.textContent = 'Disabled';
            operator.textContent = '—';
            network.textContent = '—';
            signalBar.style.width = '0%';
            signal.textContent = '0%';
            ip.textContent = '—';
        }
    }

    function toggleMobile(enabled) {
        const toggle = document.getElementById('mobileToggle');
        const originalChecked = toggle.checked;

        // Show loading state
        toggle.disabled = true;

        fetch('/api/modem/mobile/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    // Status will update via WebSocket or next poll
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

    // Save APN
    function saveAPN() {
        const apn = {
            apn: document.getElementById('apnName').value,
            username: document.getElementById('apnUsername').value,
            password: document.getElementById('apnPassword').value,
            auth: document.getElementById('apnAuth').value
        };

        fetch('/api/modem/mobile/apn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apn)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('APN saved successfully', 'success');
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Failed to save APN', 'danger');
            });
    }

    // Set APN preset
    function setAPN(apn, username, password, auth) {
        document.getElementById('apnName').value = apn;
        document.getElementById('apnUsername').value = username;
        document.getElementById('apnPassword').value = password;
        document.getElementById('apnAuth').value = auth;

        // Auto-save with visual feedback
        const saveBtn = document.querySelector('button[onclick="saveAPN()"]');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        saveBtn.disabled = true;

        saveAPN().finally(() => {
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }, 1000);
        });
    }

    // ==================== WIFI CLIENT FUNCTIONS ====================
    function updateWiFiClientUI(wifi) {
        const badge = document.getElementById('wifiClientBadge');
        const icon = document.getElementById('wifiClientIcon');
        const ssid = document.getElementById('wifiClientSSID');
        const statusEl = document.getElementById('wifiClientStatus');
        const signalBar = document.getElementById('wifiClientSignalBar');
        const signal = document.getElementById('wifiClientSignal');
        const ip = document.getElementById('wifiClientIP');
        const security = document.getElementById('wifiClientSecurity');
        const channel = document.getElementById('wifiClientChannel');
        const disconnectBtn = document.getElementById('disconnectWiFiBtn');

        if (wifi.connected) {
            badge.textContent = 'Connected';
            badge.className = 'badge bg-success';
            icon.className = 'bi bi-wifi text-success';
            ssid.textContent = wifi.ssid;
            statusEl.textContent = 'Connected';
            statusEl.className = 'badge bg-success';
            signalBar.style.width = wifi.signalStrength + '%';
            signalBar.className = wifi.signalStrength > 70 ? 'progress-bar bg-success' :
                wifi.signalStrength > 40 ? 'progress-bar bg-warning' :
                    'progress-bar bg-danger';
            signal.textContent = wifi.signalStrength + '%';
            ip.textContent = wifi.ipAddress;
            security.textContent = wifi.security;
            channel.textContent = wifi.channel;
            disconnectBtn.style.display = 'block';
        } else {
            badge.textContent = 'Disconnected';
            badge.className = 'badge bg-danger';
            icon.className = 'bi bi-wifi text-secondary';
            ssid.textContent = 'Not Connected';
            statusEl.textContent = 'Disconnected';
            statusEl.className = 'badge bg-danger';
            signalBar.style.width = '0%';
            signal.textContent = '0%';
            ip.textContent = '—';
            security.textContent = '—';
            channel.textContent = '—';
            disconnectBtn.style.display = 'none';
        }
    }

    function scanWiFiNetworks() {
        const list = document.getElementById('wifiNetworksList');
        list.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2">Scanning for networks...</p>
        </div>
    `;

        fetch('/api/modem/wifi/client/scan')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Scan initiated', 'success');
                    // Results will come via WebSocket
                    // Display whatever is already in modemService
                    setTimeout(() => {
                        fetch('/api/modem/status')
                            .then(res => res.json())
                            .then(statusData => {
                                if (statusData.success && statusData.data.wifiNetworks) {
                                    displayWiFiNetworks(statusData.data.wifiNetworks);
                                }
                            });
                    }, 3000);
                } else {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                list.innerHTML = `
                <div class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                    <p>Failed to scan networks</p>
                    <button class="btn btn-sm btn-outline-danger" onclick="scanWiFiNetworks()">
                        <i class="bi bi-arrow-repeat"></i> Retry
                    </button>
                </div>
            `;
            });
    }

    // Display WiFi networks
    function displayWiFiNetworks(networks) {
        const list = document.getElementById('wifiNetworksList');

        if (!networks || networks.length === 0) {
            list.innerHTML = `
                <div class="text-center py-4">
                    No networks found
                </div>
            `;
            return;
        }

        let html = '';
        networks.forEach(net => {
            const signalClass = net.signal > 70 ? 'success' : (net.signal > 40 ? 'warning' : 'danger');
            const securityIcon = net.security === 'open' ? 'unlock' : 'lock';

            html += `
                <div class="list-group-item list-group-item-action" onclick="showConnectModal('${net.ssid}', '${net.security}', ${net.enterprise || false})">
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

    // Show connect modal
    function showConnectModal(ssid, security, enterprise) {
        document.getElementById('connectSsid').value = ssid;
        document.getElementById('connectSsidDisplay').value = ssid;
        document.getElementById('connectSecurity').value = security;

        if (security === 'open') {
            document.getElementById('passwordField').style.display = 'none';
        } else {
            document.getElementById('passwordField').style.display = 'block';
        }

        if (enterprise) {
            document.getElementById('enterpriseFields').classList.remove('d-none');
        } else {
            document.getElementById('enterpriseFields').classList.add('d-none');
        }

        const modal = new bootstrap.Modal(document.getElementById('wifiConnectModal'));
        modal.show();
    }

    // Connect to WiFi
    function connectToWiFi() {
        const ssid = document.getElementById('connectSsid').value;
        const password = document.getElementById('connectPassword').value;
        const security = document.getElementById('connectSecurity').value;
        const username = document.getElementById('connectUsername')?.value;
        const identity = document.getElementById('connectIdentity')?.value;

        const data = { ssid, password, security };
        if (username) data.username = username;
        if (identity) data.identity = identity;

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

    // Disconnect WiFi
    function disconnectWiFi() {
        if (!confirm('Disconnect from WiFi?')) return;

        fetch('/api/modem/wifi/client/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    loadStatus();
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Failed to disconnect', 'danger');
            });
    }

    // ==================== HOTSPOT FUNCTIONS ====================
    function updateHotspotUI(hotspot) {
        const toggle = document.getElementById('hotspotToggle');
        const icon = document.getElementById('hotspotIcon');
        const ssid = document.getElementById('hotspotSSID');
        const clientCount = document.getElementById('clientCount');
        const clientsList = document.getElementById('clientsList');

        if (toggle) toggle.checked = hotspot.enabled;

        if (hotspot.enabled) {
            icon.className = 'bi bi-wifi text-success';
            ssid.textContent = hotspot.ssid;
            clientCount.textContent = hotspot.connectedClients + '/' + hotspot.maxClients;

            // Load connected clients
            loadHotspotClients();
        } else {
            icon.className = 'bi bi-wifi text-secondary';
            ssid.textContent = 'Disabled';
            clientCount.textContent = '0/0';
            clientsList.innerHTML = '<div class="text-center py-4 text-muted">Hotspot disabled</div>';
        }

        // Fill form
        document.getElementById('hotspotSsid').value = hotspot.ssid;
        document.getElementById('hotspotPassword').value = hotspot.password;
        document.getElementById('hotspotSecurity').value = hotspot.security;
        document.getElementById('hotspotBand').value = hotspot.band;
        document.getElementById('hotspotChannel').value = hotspot.channel;
        document.getElementById('hotspotMaxClients').value = hotspot.maxClients;
        document.getElementById('hotspotHidden').checked = hotspot.hidden;
    }

    function loadHotspotClients() {
        const clientsList = document.getElementById('clientsList');
        const clientCount = document.getElementById('clientCount');

        fetch('/api/modem/wifi/hotspot/clients')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (clientCount) {
                        clientCount.textContent = data.count || 0;
                    }
                    displayHotspotClients(data.data || []);
                }
            })
            .catch(error => {
                console.error('Error loading clients:', error);
                clientsList.innerHTML = `
                <div class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle"></i> Error loading clients
                </div>
            `;
            });
    }

    function displayHotspotClients(clients) {
        const list = document.getElementById('clientsList');

        if (!clients || clients.length === 0) {
            list.innerHTML = '<div class="text-center py-4 text-muted">No clients connected</div>';
            return;
        }

        let html = '';
        clients.forEach((client, index) => {
            const signalClass = client.signal > 70 ? 'success' : (client.signal > 40 ? 'warning' : 'danger');
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
                <div class="mt-2">
                    <div class="progress" style="height: 4px;">
                        <div class="progress-bar bg-${signalClass}" style="width: ${client.signal || 100}%"></div>
                    </div>
                </div>
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

    function toggleHotspot(enabled) {
        fetch('/api/modem/wifi/hotspot/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    loadStatus();
                } else {
                    document.getElementById('hotspotToggle').checked = !enabled;
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Failed to toggle hotspot', 'danger');
            });
    }

    function formatConnectedTime(seconds) {
        if (!seconds) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function saveHotspotConfig() {
        const config = {
            ssid: document.getElementById('hotspotSsid').value,
            password: document.getElementById('hotspotPassword').value,
            security: document.getElementById('hotspotSecurity').value,
            band: document.getElementById('hotspotBand').value,
            channel: parseInt(document.getElementById('hotspotChannel').value),
            maxClients: parseInt(document.getElementById('hotspotMaxClients').value),
            hidden: document.getElementById('hotspotHidden').checked
        };

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

    window.limitClient = function (mac) {
        const speed = prompt('Enter speed limit in Kbps (e.g., 512):', '512');
        if (speed) {
            fetch('/api/modem/wifi/hotspot/clients/limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, speed: parseInt(speed) })
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
    };

    // Block client
    function blockClient(mac) {
        if (!confirm(`Block client ${mac}?`)) return;

        fetch('/api/modem/wifi/hotspot/clients/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Client blocked', 'success');
                    loadHotspotClients();
                }
            })
            .catch(console.error);
    }

    // ==================== USB FUNCTIONS ====================
    function updateUSBUI(usb) {
        const toggle = document.getElementById('usbToggle');
        const icon = document.getElementById('usbIcon');
        const status = document.getElementById('usbStatus');
        const details = document.getElementById('usbDetails');

        if (toggle) toggle.checked = usb.enabled;

        if (usb.connected) {
            icon.className = 'bi bi-usb-symbol text-success';
            status.textContent = 'Connected';
            details.textContent = `IP: ${usb.clientIp} | Interface: ${usb.interface}`;
        } else if (usb.enabled) {
            icon.className = 'bi bi-usb-symbol text-warning';
            status.textContent = 'Waiting for USB...';
            details.textContent = 'Connect USB cable to computer';
        } else {
            icon.className = 'bi bi-usb-symbol text-secondary';
            status.textContent = 'Disabled';
            details.textContent = 'Connect USB cable to share internet';
        }
    }

    // Toggle USB
    function toggleUSB(enabled) {
        fetch('/api/modem/usb/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    loadStatus();
                } else {
                    document.getElementById('usbToggle').checked = !enabled;
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Failed to toggle USB', 'danger');
            });
    }

    // ==================== ROUTING FUNCTIONS ====================
    function updateRoutingUI(routing) {
        document.getElementById('routingSource').textContent = routing.primarySource || 'None';
        document.getElementById('routingGateway').textContent = routing.defaultGateway || '—';
        document.getElementById('routingNat').textContent = routing.nat ? 'Yes' : 'No';
        document.getElementById('routingNat').className = routing.nat ? 'badge bg-success' : 'badge bg-danger';
        document.getElementById('routingFirewall').textContent = routing.firewall ? 'Enabled' : 'Disabled';
        document.getElementById('routingFirewall').className = routing.firewall ? 'badge bg-success' : 'badge bg-danger';
        document.getElementById('routingFailover').textContent = routing.failover ? 'Enabled' : 'Disabled';
        document.getElementById('routingFailover').className = routing.failover ? 'badge bg-success' : 'badge bg-secondary';
        document.getElementById('routingBalancing').textContent = routing.loadBalancing ? 'Enabled' : 'Disabled';
        document.getElementById('routingBalancing').className = routing.loadBalancing ? 'badge bg-success' : 'badge bg-secondary';
        document.getElementById('routingDevices').textContent = routing.connectedDevices || 0;

        document.getElementById('routingFailoverCheck').checked = routing.failover || false;
        document.getElementById('routingBalancingCheck').checked = routing.loadBalancing || false;
        document.getElementById('routingNatCheck').checked = routing.nat !== false;
        document.getElementById('routingFirewallCheck').checked = routing.firewall !== false;

        // Update path display
        document.getElementById('pathMobile').innerHTML = currentStatus?.mobile?.connected ?
            '<span class="text-success">Connected</span>' :
            '<span class="text-danger">Not Connected</span>';
        document.getElementById('pathWiFi').innerHTML = currentStatus?.wifiClient?.connected ?
            '<span class="text-success">Connected</span>' :
            '<span class="text-danger">Not Connected</span>';
        document.getElementById('pathUSB').innerHTML = currentStatus?.usb?.connected ?
            '<span class="text-success">Connected</span>' :
            '<span class="text-danger">Not Connected</span>';
    }

    // Save routing config
    function saveRoutingConfig() {
        const config = {
            failover: document.getElementById('routingFailoverCheck').checked,
            loadBalancing: document.getElementById('routingBalancingCheck').checked,
            nat: document.getElementById('routingNatCheck').checked,
            firewall: document.getElementById('routingFirewallCheck').checked
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
                }
            })
            .catch(console.error);
    }

    // ==================== DATA USAGE FUNCTIONS ====================
    function updateDataUsageUI(status) {
        const totalSent = (status.mobile.dataUsage.sent + status.wifiClient.dataUsage.sent) * 1024 * 1024;
        const totalReceived = (status.mobile.dataUsage.received + status.wifiClient.dataUsage.received) * 1024 * 1024;

        document.getElementById('totalSent').textContent = formatBytes(totalSent);
        document.getElementById('totalReceived').textContent = formatBytes(totalReceived);
        document.getElementById('totalUsage').textContent = formatBytes(totalSent + totalReceived);

        document.getElementById('mobileSent').textContent = formatBytes(status.mobile.dataUsage.sent * 1024 * 1024);
        document.getElementById('mobileReceived').textContent = formatBytes(status.mobile.dataUsage.received * 1024 * 1024);

        document.getElementById('wifiSent').textContent = formatBytes(status.wifiClient.dataUsage.sent * 1024 * 1024);
        document.getElementById('wifiReceived').textContent = formatBytes(status.wifiClient.dataUsage.received * 1024 * 1024);
    }

    // Reset data usage
    function resetDataUsage() {
        if (!confirm('Reset all data usage counters?')) return;

        fetch('/api/modem/data-usage/reset', {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Data usage reset', 'success');
                    loadStatus();
                }
            })
            .catch(console.error);
    }

    // ==================== UTILITY FUNCTIONS ====================
    function attachEventListeners() {
        // Mobile toggle
        const mobileToggle = document.getElementById('mobileToggle');
        if (mobileToggle) {
            const newToggle = mobileToggle.cloneNode(true);
            mobileToggle.parentNode.replaceChild(newToggle, mobileToggle);
            newToggle.addEventListener('change', (e) => toggleMobile(e.target.checked));
        }

        // Hotspot toggle
        const hotspotToggle = document.getElementById('hotspotToggle');
        if (hotspotToggle) {
            const newToggle = hotspotToggle.cloneNode(true);
            hotspotToggle.parentNode.replaceChild(newToggle, hotspotToggle);
            newToggle.addEventListener('change', (e) => toggleHotspot(e.target.checked));
        }

        // USB toggle
        const usbToggle = document.getElementById('usbToggle');
        if (usbToggle) {
            const newToggle = usbToggle.cloneNode(true);
            usbToggle.parentNode.replaceChild(newToggle, usbToggle);
            newToggle.addEventListener('change', (e) => toggleUSB(e.target.checked));
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

        updateInterval = setInterval(() => {
            loadStatus();
            if (currentStatus?.wifiHotspot?.enabled) {
                loadHotspotClients();
            }
        }, 10000);
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
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (updateInterval) clearInterval(updateInterval);
    });

    if (typeof socket !== 'undefined') {
        socket.on('modem:wifi-scan', (data) => {
            if (data.networks) {
                displayWiFiNetworks(data.networks);
            }
        });

        socket.on('modem:hotspot-clients', (data) => {
            if (data.clients) {
                displayHotspotClients(data.clients);
                document.getElementById('clientCount').textContent = data.clients.length;
            }
        });
    }

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
})();