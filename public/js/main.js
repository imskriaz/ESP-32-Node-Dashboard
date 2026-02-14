// Main JavaScript file for ESP32-S3 Manager Dashboard

// Socket.IO connection
let socket;
let connectionCheckInterval = null;
let deviceStatusInterval = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.IO
    initializeSocket();
    
    // Initialize Bootstrap components
    initializeBootstrap();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start connection monitoring
    startConnectionMonitoring();
    
    // Check unread messages
    updateUnreadBadge();
    
    // Handle orientation change
    window.addEventListener('orientationchange', function() {
        setTimeout(handleOrientationChange, 100);
    });
    
    // Handle resize
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(handleResize, 250);
    });
});

// Initialize Socket.IO
function initializeSocket() {
    // Show connecting state
    updateConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true
    });
    
    socket.on('connect', function() {
        console.log('🔌 Socket connected');
        reconnectAttempts = 0;
        updateConnectionStatus('server_connected');
        
        // Request initial status
        socket.emit('get:status');
        socket.emit('get:mqtt-status');
        socket.emit('get:device-status');
        
        showToast('Connected to server', 'success');
    });
    
    socket.on('connect_error', function(error) {
        console.error('Socket connection error:', error);
        reconnectAttempts++;
        
        if (reconnectAttempts >= maxReconnectAttempts) {
            updateConnectionStatus('server_disconnected');
            showToast('Failed to connect to server', 'danger');
        } else {
            updateConnectionStatus('reconnecting');
        }
    });
    
    socket.on('disconnect', function(reason) {
        console.log('🔌 Socket disconnected:', reason);
        updateConnectionStatus('server_disconnected');
        
        if (reason === 'io server disconnect') {
            // Server initiated disconnect, don't reconnect
            showToast('Disconnected by server', 'warning');
        } else {
            showToast('Disconnected from server', 'warning');
        }
    });
    
    socket.on('reconnect', function(attemptNumber) {
        console.log('🔄 Reconnected after', attemptNumber, 'attempts');
        updateConnectionStatus('server_connected');
        showToast('Reconnected to server', 'success');
    });
    
    socket.on('reconnect_attempt', function(attemptNumber) {
        console.log('🔄 Reconnection attempt', attemptNumber);
        updateConnectionStatus('reconnecting');
    });
    
    socket.on('reconnect_error', function(error) {
        console.log('🔄 Reconnection error:', error);
    });
    
    socket.on('reconnect_failed', function() {
        console.log('🔄 Reconnection failed');
        updateConnectionStatus('server_disconnected');
        showToast('Failed to reconnect to server', 'danger');
    });
    
    socket.on('connected', function(data) {
        console.log('Server confirmed connection:', data);
    });
    
    socket.on('mqtt:status', function(data) {
        console.log('MQTT status:', data);
        updateMQTTStatus(data.connected);
    });
    
    socket.on('mqtt:error', function(data) {
        console.error('MQTT error:', data.message);
        showToast('MQTT Error: ' + data.message, 'danger');
    });
    
    socket.on('device:status', function(data) {
        console.log('Device status update:', data);
        updateSidebarDeviceStatus(data);
    });
    
    socket.on('device:heartbeat', function(data) {
        console.log('Device heartbeat:', data.deviceId);
        // Just update last seen, no UI change needed
    });
    
    socket.on('device:online', function(data) {
        console.log('Device online:', data.deviceId);
        showToast(`Device ${data.deviceId} is online`, 'success');
        // Request full status
        socket.emit('get:device-status');
    });
    
    socket.on('device:offline', function(data) {
        console.log('Device offline:', data.deviceId);
        showToast(`Device ${data.deviceId} went offline`, 'warning');
        updateSidebarDeviceStatus({ online: false });
    });
    
    socket.on('devices:status', function(devices) {
        console.log('Devices status:', devices);
    });
    
    socket.on('sms:received', function(data) {
        console.log('📨 New SMS received:', data);
        showToast(`New SMS from ${data.from_number}: ${data.message.substring(0, 30)}...`, 'info');
        updateUnreadBadge();
        
        // Show notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New SMS', {
                body: `From: ${data.from_number}\n${data.message.substring(0, 50)}...`,
                icon: '/favicon.ico'
            });
        }
    });
    
    socket.on('sms:sent', function(data) {
        console.log('📤 SMS sent:', data);
        showToast('SMS sent successfully', 'success');
    });
    
    socket.on('sms:delivered', function(data) {
        console.log('✅ SMS delivered:', data);
        showToast('SMS delivered to recipient', 'success');
    });
    
    socket.on('call:incoming', function(data) {
        console.log('📞 Incoming call:', data);
        showToast(`Incoming call from ${data.number}`, 'warning');
    });
    
    socket.on('call:status', function(data) {
        console.log('📞 Call status:', data);
    });
    
    socket.on('ussd:response', function(data) {
        console.log('💬 USSD response:', data);
        showToast('USSD response received', 'info');
    });
    
    socket.on('webcam:capture', function(data) {
        console.log('📸 Webcam capture:', data);
        showToast('New image captured', 'success');
        
        // Update gallery if on webcam page
        if (window.location.pathname.includes('webcam')) {
            refreshWebcamData();
        }
    });
    
    socket.on('modem:wifi-scan', function(data) {
        console.log('📡 WiFi scan results:', data);
    });
    
    socket.on('modem:hotspot-clients', function(data) {
        console.log('📱 Hotspot clients:', data);
    });
    
    socket.on('command:response', function(data) {
        console.log('📨 Command response:', data);
    });
}

// Update connection status UI
function updateConnectionStatus(status) {
    const serverConnecting = document.getElementById('serverConnecting');
    const serverConnected = document.getElementById('serverConnected');
    const serverDisconnected = document.getElementById('serverDisconnected');
    const serverStatusText = document.getElementById('serverStatusText');
    const serverStatusBadge = document.getElementById('serverStatusBadge');
    const loadingSkeleton = document.getElementById('loadingSkeleton');
    const metricsPanel = document.getElementById('metricsPanel');
    
    if (!serverConnecting || !serverConnected || !serverDisconnected) return;
    
    switch(status) {
        case 'connecting':
            serverConnecting.style.display = 'inline-block';
            serverConnected.style.display = 'none';
            serverDisconnected.style.display = 'none';
            if (serverStatusText) serverStatusText.textContent = 'Connecting...';
            if (serverStatusBadge) {
                serverStatusBadge.textContent = 'Connecting';
                serverStatusBadge.className = 'badge bg-warning';
            }
            if (loadingSkeleton) loadingSkeleton.style.display = 'block';
            if (metricsPanel) metricsPanel.style.display = 'none';
            break;
            
        case 'server_connected':
            serverConnecting.style.display = 'none';
            serverConnected.style.display = 'inline-block';
            serverDisconnected.style.display = 'none';
            if (serverStatusText) serverStatusText.textContent = 'Connected';
            if (serverStatusBadge) {
                serverStatusBadge.textContent = 'Server Online';
                serverStatusBadge.className = 'badge bg-success';
            }
            break;
            
        case 'server_disconnected':
            serverConnecting.style.display = 'none';
            serverConnected.style.display = 'none';
            serverDisconnected.style.display = 'inline-block';
            if (serverStatusText) serverStatusText.textContent = 'Disconnected';
            if (serverStatusBadge) {
                serverStatusBadge.textContent = 'Server Offline';
                serverStatusBadge.className = 'badge bg-danger';
            }
            if (loadingSkeleton) loadingSkeleton.style.display = 'none';
            if (metricsPanel) metricsPanel.style.display = 'none';
            break;
            
        case 'reconnecting':
            serverConnecting.style.display = 'inline-block';
            serverConnected.style.display = 'none';
            serverDisconnected.style.display = 'none';
            if (serverStatusText) serverStatusText.textContent = 'Reconnecting...';
            if (serverStatusBadge) {
                serverStatusBadge.textContent = 'Reconnecting';
                serverStatusBadge.className = 'badge bg-warning';
            }
            break;
    }
}

// Update MQTT status UI
function updateMQTTStatus(connected) {
    const mqttConnecting = document.getElementById('mqttConnecting');
    const mqttConnected = document.getElementById('mqttConnected');
    const mqttDisconnected = document.getElementById('mqttDisconnected');
    const mqttStatusText = document.getElementById('mqttStatusText');
    const loadingSkeleton = document.getElementById('loadingSkeleton');
    const metricsPanel = document.getElementById('metricsPanel');
    
    if (!mqttConnecting || !mqttConnected || !mqttDisconnected) return;
    
    if (connected) {
        mqttConnecting.style.display = 'none';
        mqttConnected.style.display = 'inline-block';
        mqttDisconnected.style.display = 'none';
        if (mqttStatusText) {
            mqttStatusText.textContent = 'Connected';
            mqttStatusText.className = 'fw-medium text-success';
        }
        
        // Hide loading skeleton, show metrics panel
        if (loadingSkeleton) loadingSkeleton.style.display = 'none';
        if (metricsPanel) metricsPanel.style.display = 'block';
        
        // Update device connection
        updateDeviceConnection(true);
    } else {
        mqttConnecting.style.display = 'none';
        mqttConnected.style.display = 'none';
        mqttDisconnected.style.display = 'inline-block';
        if (mqttStatusText) {
            mqttStatusText.textContent = 'Disconnected';
            mqttStatusText.className = 'fw-medium text-danger';
        }
        
        // Hide metrics panel, show loading skeleton
        if (loadingSkeleton) loadingSkeleton.style.display = 'block';
        if (metricsPanel) metricsPanel.style.display = 'none';
        
        // Update device connection
        updateDeviceConnection(false);
    }
}

// Update device connection status
function updateDeviceConnection(online) {
    const deviceOffline = document.getElementById('deviceOffline');
    const deviceOnline = document.getElementById('deviceOnline');
    const deviceStatusText = document.getElementById('deviceStatusText');
    
    if (!deviceOffline || !deviceOnline || !deviceStatusText) return;
    
    if (online) {
        deviceOffline.style.display = 'none';
        deviceOnline.style.display = 'inline-block';
        deviceStatusText.textContent = 'Online';
        deviceStatusText.className = 'fw-medium text-success';
    } else {
        deviceOffline.style.display = 'inline-block';
        deviceOnline.style.display = 'none';
        deviceStatusText.textContent = 'Offline';
        deviceStatusText.className = 'fw-medium text-secondary';
    }
}

// Update sidebar device status
function updateSidebarDeviceStatus(status) {
    if (!status) return;
    
    // Update online status
    updateDeviceConnection(status.online);
    
    if (status.online) {
        // Update metrics
        updateDeviceMetrics(status);
    } else {
        // Show placeholder values
        const signalEl = document.getElementById('sidebarSignal');
        const signalBar = document.getElementById('sidebarSignalBar');
        const batteryEl = document.getElementById('sidebarBattery');
        const batteryBar = document.getElementById('sidebarBatteryBar');
        const networkEl = document.getElementById('sidebarNetwork');
        const operatorEl = document.getElementById('sidebarOperator');
        const uptimeEl = document.getElementById('sidebarUptime');
        
        if (signalEl) signalEl.textContent = '--%';
        if (signalBar) signalBar.style.width = '0%';
        if (batteryEl) batteryEl.textContent = '--%';
        if (batteryBar) batteryBar.style.width = '0%';
        if (networkEl) networkEl.textContent = '---';
        if (operatorEl) operatorEl.textContent = '---';
        if (uptimeEl) uptimeEl.textContent = '0d 0h';
    }
}

// Update device metrics
function updateDeviceMetrics(status) {
    // Update signal
    const signal = status.signal || 0;
    const signalEl = document.getElementById('sidebarSignal');
    const signalBar = document.getElementById('sidebarSignalBar');
    
    if (signalEl) signalEl.textContent = signal + '%';
    if (signalBar) {
        signalBar.style.width = signal + '%';
        signalBar.className = signal > 70 ? 'progress-bar bg-success' : 
                             signal > 40 ? 'progress-bar bg-warning' : 
                             'progress-bar bg-danger';
    }
    
    // Update battery
    const battery = status.battery || 0;
    const batteryEl = document.getElementById('sidebarBattery');
    const batteryBar = document.getElementById('sidebarBatteryBar');
    const chargingEl = document.getElementById('sidebarCharging');
    
    if (batteryEl) batteryEl.textContent = battery + '%';
    if (batteryBar) batteryBar.style.width = battery + '%';
    if (chargingEl) {
        chargingEl.style.display = status.charging ? 'inline-block' : 'none';
    }
    
    // Update network
    const networkEl = document.getElementById('sidebarNetwork');
    const operatorEl = document.getElementById('sidebarOperator');
    const uptimeEl = document.getElementById('sidebarUptime');
    
    if (networkEl) networkEl.textContent = status.network || '---';
    if (operatorEl) operatorEl.textContent = status.operator || '---';
    if (uptimeEl) uptimeEl.textContent = status.uptime || '0d 0h';
}

// Initialize Bootstrap components
function initializeBootstrap() {
    // Initialize all tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            boundary: document.body
        });
    });
    
    // Initialize all popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function(popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl, {
            boundary: document.body
        });
    });
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Quick SMS send from dashboard
    const quickSendBtn = document.getElementById('quickSendSms');
    if (quickSendBtn) {
        quickSendBtn.addEventListener('click', function() {
            sendSms('quickSmsForm', this);
        });
    }
    
    // Message character counter
    const messageTextarea = document.querySelector('textarea[name="message"]');
    if (messageTextarea) {
        messageTextarea.addEventListener('input', function() {
            const count = this.value.length;
            
            // Find the closest counter
            const modal = this.closest('.modal');
            const counterId = modal ? 'composeCharCount' : 'charCount';
            const counter = document.getElementById(counterId);
            
            if (counter) {
                counter.textContent = count;
                
                // Change color when approaching limit
                counter.className = '';
                if (count > 140) {
                    counter.classList.add('text-warning');
                }
                if (count >= 160) {
                    counter.classList.add('text-danger');
                }
            }
        });
    }
    
    // Mobile touch optimization
    document.querySelectorAll('.btn, .nav-link, .list-group-item').forEach(el => {
        el.addEventListener('touchstart', function() {
            this.style.opacity = '0.8';
        });
        el.addEventListener('touchend', function() {
            this.style.opacity = '1';
        });
    });
}

// Start connection monitoring
function startConnectionMonitoring() {
    // Check connection every 30 seconds
    connectionCheckInterval = setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('get:mqtt-status');
            socket.emit('get:device-status');
        }
    }, 30000);
}

// Start periodic device status updates
function startDeviceStatusUpdates() {
    // Clear existing interval
    if (window.deviceStatusInterval) {
        clearInterval(window.deviceStatusInterval);
    }
    
    // Update every 10 seconds
    window.deviceStatusInterval = setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('get:device-status');
        }
    }, 10000);
}

// Update device status via API
function updateDeviceStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateSidebarDeviceStatus(data.data);
            }
        })
        .catch(error => console.error('Error updating device status:', error));
}

// Refresh connection status manually
window.refreshConnectionStatus = function() {
    const btn = event.target.closest('button');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;
    
    updateConnectionStatus('connecting');
    
    if (socket && !socket.connected) {
        socket.connect();
    } else if (socket) {
        socket.emit('get:mqtt-status');
        socket.emit('get:device-status');
    }
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
};

// Send SMS function
function sendSms(formId, button) {
    const form = document.getElementById(formId);
    if (!form) {
        console.error('Form not found:', formId);
        return;
    }
    
    // Get form data
    const formData = new FormData(form);
    let to = formData.get('to');
    const message = formData.get('message');
    
    // Validate
    if (!to || !message) {
        showToast('Please fill in all fields', 'warning');
        return;
    }
    
    // Clean phone number
    to = to.replace(/\s/g, '');
    
    // Show loading state
    const spinner = button.querySelector('.spinner-border');
    if (spinner) spinner.classList.remove('d-none');
    button.disabled = true;
    
    console.log('Sending SMS to:', to, 'Message:', message);
    
    fetch('/api/sms/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: to, message: message })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('SMS send response:', data);
        
        if (data.success) {
            // Close modal
            const modalElement = form.closest('.modal');
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) modal.hide();
            }
            
            // Show success message
            showToast('SMS sent successfully!', 'success');
            
            // Reset form
            form.reset();
            
            // Reset counter
            const counterId = formId === 'quickSmsForm' ? 'charCount' : 'composeCharCount';
            const counter = document.getElementById(counterId);
            if (counter) counter.textContent = '0';
            
            // Reload page after 1.5 seconds to show new message
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            showToast('Failed to send SMS: ' + (data.message || 'Unknown error'), 'danger');
        }
    })
    .catch(error => {
        console.error('Error sending SMS:', error);
        showToast('Error sending SMS. Please try again.', 'danger');
    })
    .finally(() => {
        // Hide loading state
        if (spinner) spinner.classList.add('d-none');
        button.disabled = false;
    });
}

// Update unread SMS badge
function updateUnreadBadge() {
    fetch('/api/sms/unread')
        .then(response => response.json())
        .then(data => {
            const badge = document.getElementById('unreadSmsBadge');
            const inboxBadge = document.getElementById('inboxUnreadBadge');
            
            if (data.count > 0) {
                if (badge) {
                    badge.textContent = data.count;
                    badge.style.display = 'inline';
                }
                if (inboxBadge) {
                    inboxBadge.textContent = data.count;
                    inboxBadge.classList.remove('d-none');
                }
                
                // Update page title with unread count
                document.title = `(${data.count}) ESP32-S3 Manager`;
            } else {
                if (badge) badge.style.display = 'none';
                if (inboxBadge) inboxBadge.classList.add('d-none');
                document.title = 'ESP32-S3 Manager';
            }
        })
        .catch(error => console.error('Error updating unread badge:', error));
}

// Show toast notification
function showToast(message, type = 'info', title = 'Notification') {
    const toastEl = document.getElementById('liveToast');
    if (!toastEl) return;
    
    const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 5000
    });
    
    // Set icon based on type
    const iconMap = {
        success: 'bi-check-circle-fill text-success',
        danger: 'bi-exclamation-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };
    
    const icon = toastEl.querySelector('.toast-header i');
    icon.className = iconMap[type] || 'bi-info-circle-fill text-info';
    
    // Set title and message
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastTime').textContent = 'just now';
    
    toast.show();
}

// Handle orientation change
function handleOrientationChange() {
    const isLandscape = window.orientation === 90 || window.orientation === -90;
    
    if (isLandscape) {
        document.body.classList.add('landscape');
    } else {
        document.body.classList.remove('landscape');
    }
    
    // Close sidebar on orientation change if needed
    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && sidebar.classList.contains('show')) {
            sidebar.classList.remove('show');
            overlay.style.display = 'none';
        }
    }
}

// Handle resize events
function handleResize() {
    updatePaginationDisplay();
}

// Update pagination for mobile
function updatePaginationDisplay() {
    const isMobile = window.innerWidth < 768;
    const paginationItems = document.querySelectorAll('.pagination .page-item:not(:first-child):not(:last-child)');
    
    if (isMobile && paginationItems.length > 3) {
        paginationItems.forEach((item, index) => {
            if (index > 2 && index < paginationItems.length - 1) {
                item.style.display = 'none';
            }
        });
    } else {
        paginationItems.forEach(item => {
            item.style.display = '';
        });
    }
}

// Update storage info in sidebar
function updateStorageInfo() {
    fetch('/api/storage/info')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const internal = data.data.internal;
                const sd = data.data.sd;
                
                // Use internal storage for main display, or SD if available
                const storage = internal.available ? internal : (sd.available ? sd : null);
                
                if (storage) {
                    const usedPercent = Math.round((storage.used / storage.total) * 100);
                    const freeGB = (storage.free / (1024 * 1024 * 1024)).toFixed(1);
                    
                    document.getElementById('sidebarStorageUsed').textContent = usedPercent + '%';
                    document.getElementById('sidebarStorageFree').textContent = freeGB + ' GB free';
                } else {
                    document.getElementById('sidebarStorageUsed').textContent = 'N/A';
                    document.getElementById('sidebarStorageFree').textContent = 'No storage';
                }
            }
        })
        .catch(error => console.error('Error loading storage info:', error));
}

// Update GPS info in sidebar
function updateGPSInfo() {
    // This would come from MQTT in real implementation
    // For now, check if we have GPS data in modemService
    if (socket) {
        socket.emit('get:gps-status');
    }
}

// Add socket listener for GPS data
socket.on('gps:status', function(data) {
    const gpsInfo = document.getElementById('gpsInfo');
    const gpsFix = document.getElementById('gpsFix');
    const gpsLat = document.getElementById('gpsLat');
    const gpsLng = document.getElementById('gpsLng');
    const gpsSat = document.getElementById('gpsSat');
    const gpsBadge = document.getElementById('gpsBadge');
    
    if (data.fixed) {
        gpsInfo.style.display = 'block';
        gpsFix.textContent = '3D Fix';
        gpsFix.className = 'fw-bold text-success';
        gpsLat.textContent = data.latitude?.toFixed(6) + '°';
        gpsLng.textContent = data.longitude?.toFixed(6) + '°';
        gpsSat.textContent = data.satellites + ' sat';
        
        if (gpsBadge) {
            gpsBadge.style.display = 'inline-block';
            gpsBadge.textContent = '3D';
        }
    } else {
        gpsInfo.style.display = 'none';
        if (gpsBadge) {
            gpsBadge.style.display = 'none';
        }
    }
});

// Add GPIO status listener
socket.on('gpio:status', function(data) {
    const gpioBadge = document.getElementById('gpioBadge');
    if (gpioBadge && data.activePins) {
        gpioBadge.style.display = 'inline-block';
        gpioBadge.textContent = data.activePins;
    }
});

// Update the refreshConnectionStatus function to include storage
window.refreshConnectionStatus = function() {
    const btn = event.target.closest('button');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;
    
    updateConnectionStatus('connecting');
    
    if (socket && !socket.connected) {
        socket.connect();
    } else if (socket) {
        socket.emit('get:mqtt-status');
        socket.emit('get:device-status');
        socket.emit('get:gps-status');
    }
    
    // Also fetch storage info
    updateStorageInfo();
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
};

// Call storage update periodically
setInterval(updateStorageInfo, 60000); // Update every minute

// Initial calls
setTimeout(() => {
    updateStorageInfo();
}, 2000);

// Toggle sidebar
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar || !overlay) return;
    
    sidebar.classList.toggle('show');
    
    if (sidebar.classList.contains('show')) {
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    } else {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }
};

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    if (window.deviceStatusInterval) {
        clearInterval(window.deviceStatusInterval);
    }
});

// Export functions for use in other files
window.showToast = showToast;
window.updateUnreadBadge = updateUnreadBadge;
window.sendSms = sendSms;
window.refreshConnectionStatus = refreshConnectionStatus;
window.toggleSidebar = toggleSidebar;