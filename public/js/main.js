// Main JavaScript file for ESP32-S3 Manager Dashboard

// Socket.IO connection
let socket;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.IO
    initializeSocket();
    
    // Initialize Bootstrap components
    initializeBootstrap();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update status periodically
    startStatusUpdates();
    
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
    socket = io({
        auth: {
            sessionId: 'dummy-session-id'
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', function() {
        console.log('Socket connected');
    });
    
    socket.on('disconnect', function() {
        console.log('Socket disconnected');
        showToast('Disconnected from server', 'warning');
    });
    
    socket.on('reconnect', function(attemptNumber) {
        console.log('Reconnected after', attemptNumber, 'attempts');
        showToast('Reconnected to server', 'success');
    });
    
    socket.on('sms:received', function(data) {
        console.log('New SMS received:', data);
        showToast('New SMS received from ' + data.from_number, 'info');
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
        console.log('SMS sent:', data);
        showToast('SMS sent successfully', 'success');
    });
    
    socket.on('sms:delivered', function(data) {
        console.log('SMS delivered:', data);
        showToast('SMS delivered to recipient', 'success');
    });
    
    socket.on('sms:read', function(data) {
        console.log('SMS marked as read:', data);
        updateUnreadBadge();
    });
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

// Send SMS function - FIXED
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

// Start periodic status updates
function startStatusUpdates() {
    updateDeviceStatus();
    setInterval(updateDeviceStatus, 30000); // Update every 30 seconds
}

// Update device status in sidebar
function updateDeviceStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const signalEl = document.getElementById('sidebarSignal');
                const batteryEl = document.getElementById('sidebarBattery');
                const signalBar = document.getElementById('sidebarSignalBar');
                const batteryBar = document.getElementById('sidebarBatteryBar');
                const networkEl = document.getElementById('sidebarNetwork');
                const tempEl = document.getElementById('sidebarTemp');
                const uptimeEl = document.getElementById('sidebarUptime');
                
                if (signalEl) signalEl.textContent = data.data.signal + '%';
                if (signalBar) signalBar.style.width = data.data.signal + '%';
                if (batteryEl) batteryEl.textContent = data.data.battery + '%';
                if (batteryBar) batteryBar.style.width = data.data.battery + '%';
                if (networkEl) networkEl.textContent = data.data.network;
                if (tempEl) tempEl.textContent = data.data.temperature + '°C';
                if (uptimeEl) uptimeEl.textContent = data.data.uptime;
            }
        })
        .catch(error => console.error('Error updating status:', error));
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

// Export functions for use in other files
window.showToast = showToast;
window.updateUnreadBadge = updateUnreadBadge;
window.sendSms = sendSms;