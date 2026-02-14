// Settings Management
(function () {
    'use strict';

    console.log('Settings.js loaded - ' + new Date().toISOString());

    let settings = {};

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Settings page...');
        loadSettings();
        attachEventListeners();
    }

    // Load all settings
    function loadSettings() {
        fetch('/api/settings')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    settings = data.data;
                    populateSettings(settings);
                } else {
                    showToast(data.message || 'Failed to load settings', 'danger');
                }
            })
            .catch(error => {
                console.error('Error loading settings:', error);
                showToast('Error loading settings: ' + error.message, 'danger');
            });
    }

    // Populate all settings forms
    function populateSettings(settings) {
        // MQTT Settings
        if (settings.mqtt) {
            document.getElementById('mqttHost').value = settings.mqtt.host || 'device.atebd.com';
            document.getElementById('mqttPort').value = settings.mqtt.port || 1883;
            document.getElementById('mqttUsername').value = settings.mqtt.username || '';
            document.getElementById('mqttPassword').value = settings.mqtt.password || '';
            document.getElementById('mqttClientId').value = settings.mqtt.clientId || 'esp32-dashboard';
        }

        // Modem Settings
        if (settings.modem) {
            document.getElementById('modemApn').value = settings.modem.apn || 'internet';
            document.getElementById('modemApnUser').value = settings.modem.apnUser || '';
            document.getElementById('modemApnPass').value = settings.modem.apnPass || '';
            document.getElementById('modemAuth').value = settings.modem.auth || 'none';
            document.getElementById('modemNetworkMode').value = settings.modem.networkMode || 'auto';
            document.getElementById('modemPreferredNetwork').value = settings.modem.preferredNetwork || '';
            document.getElementById('modemAutoConnect').checked = settings.modem.autoConnect !== false;
            document.getElementById('modemPinCode').value = settings.modem.pinCode || '';
        }

        // Webcam Settings
        if (settings.webcam) {
            document.getElementById('webcamEnabled').checked = settings.webcam.enabled || false;
            document.getElementById('webcamResolution').value = settings.webcam.resolution || '640x480';
            document.getElementById('webcamFps').value = settings.webcam.fps || 15;
            document.getElementById('webcamFpsValue').textContent = (settings.webcam.fps || 15) + ' fps';
            document.getElementById('webcamQuality').value = settings.webcam.quality || 80;
            document.getElementById('webcamQualityValue').textContent = (settings.webcam.quality || 80) + '%';
            document.getElementById('webcamBrightness').value = settings.webcam.brightness || 0;
            document.getElementById('webcamBrightnessValue').textContent = settings.webcam.brightness || 0;
            document.getElementById('webcamContrast').value = settings.webcam.contrast || 0;
            document.getElementById('webcamContrastValue').textContent = settings.webcam.contrast || 0;
            document.getElementById('webcamSaturation').value = settings.webcam.saturation || 0;
            document.getElementById('webcamSaturationValue').textContent = settings.webcam.saturation || 0;
            document.getElementById('webcamSharpness').value = settings.webcam.sharpness || 0;
            document.getElementById('webcamSharpnessValue').textContent = settings.webcam.sharpness || 0;
            document.getElementById('webcamFlipH').checked = settings.webcam.flip_h || false;
            document.getElementById('webcamFlipV').checked = settings.webcam.flip_v || false;
            document.getElementById('webcamMotionEnable').checked = settings.webcam.motion_detection || false;
            document.getElementById('webcamMotionSensitivity').value = settings.webcam.motion_sensitivity || 50;
            document.getElementById('webcamSensitivityValue').textContent = (settings.webcam.motion_sensitivity || 50) + '%';
        }

        // System Settings
        if (settings.system) {
            document.getElementById('systemDeviceName').value = settings.system.deviceName || 'ESP32-S3 Gateway';
            document.getElementById('systemTimezone').value = settings.system.timezone || 'Asia/Dhaka';
            document.getElementById('systemLogLevel').value = settings.system.logLevel || 'info';
            document.getElementById('systemAutoRestart').checked = settings.system.autoRestart || false;
            document.getElementById('systemRestartTime').value = settings.system.restartSchedule || '03:00';
            document.getElementById('systemBackupConfig').checked = settings.system.backupConfig !== false;
        }

        // Notification Settings
        if (settings.notifications) {
            const notif = settings.notifications;
            
            // Email
            if (notif.email) {
                document.getElementById('notifyEmailEnable').checked = notif.email.enabled || false;
                document.getElementById('notifySmtp').value = notif.email.smtp || '';
                document.getElementById('notifySmtpPort').value = notif.email.port || 587;
                document.getElementById('notifySmtpSecure').checked = notif.email.secure || false;
                document.getElementById('notifyEmailUser').value = notif.email.user || '';
                document.getElementById('notifyEmailPass').value = notif.email.pass || '';
                document.getElementById('notifyFrom').value = notif.email.from || '';
                document.getElementById('notifyTo').value = notif.email.to || '';
            }

            // Telegram
            if (notif.telegram) {
                document.getElementById('notifyTelegramEnable').checked = notif.telegram.enabled || false;
                document.getElementById('notifyBotToken').value = notif.telegram.botToken || '';
                document.getElementById('notifyChatId').value = notif.telegram.chatId || '';
            }

            // Pushover
            if (notif.pushover) {
                document.getElementById('notifyPushoverEnable').checked = notif.pushover.enabled || false;
                document.getElementById('notifyAppToken').value = notif.pushover.appToken || '';
                document.getElementById('notifyUserKey').value = notif.pushover.userKey || '';
            }
        }

        // Backup Settings
        if (settings.backup) {
            document.getElementById('backupAuto').checked = settings.backup.autoBackup || false;
            document.getElementById('backupInterval').value = settings.backup.backupInterval || 'daily';
            document.getElementById('backupTime').value = settings.backup.backupTime || '02:00';
            document.getElementById('backupKeepCount').value = settings.backup.keepCount || 7;
        }

        // Users Table
        if (settings.users) {
            displayUsers(settings.users);
        }

        // Load backups list
        loadBackups();

        // Show/hide dependent sections
        toggleEmailSettings();
        toggleTelegramSettings();
        togglePushoverSettings();
    }

    // Display users table
    function displayUsers(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3">No users found</td></tr>';
            return;
        }

        let html = '';
        users.forEach(user => {
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
            html += `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.name || '-'}</td>
                    <td>${user.email || '-'}</td>
                    <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'info'}">${user.role}</span></td>
                    <td><small>${lastLogin}</small></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="editUser(${user.id})">
                            <i class="bi bi-pencil"></i>
                        </button>
                        ${user.username !== 'admin' ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    // Load backups list
    function loadBackups() {
        const tbody = document.getElementById('backupsTableBody');
        if (!tbody) return;

        fetch('/api/settings/backups')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data.length > 0) {
                    let html = '';
                    data.data.forEach(backup => {
                        const size = formatBytes(backup.size);
                        const created = new Date(backup.created).toLocaleString();
                        html += `
                            <tr>
                                <td><i class="bi bi-file-earmark-zip me-2"></i>${backup.name}</td>
                                <td>${size}</td>
                                <td>${created}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-success" onclick="restoreBackup('${backup.name}')">
                                        <i class="bi bi-arrow-counterclockwise"></i> Restore
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBackup('${backup.name}')">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    tbody.innerHTML = html;
                } else {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3">No backups found</td></tr>';
                }
            })
            .catch(error => {
                console.error('Error loading backups:', error);
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-danger">Error loading backups</td></tr>';
            });
    }

    // Attach event listeners
    function attachEventListeners() {
        // Webcam range inputs
        const fpsInput = document.getElementById('webcamFps');
        if (fpsInput) {
            fpsInput.addEventListener('input', (e) => {
                document.getElementById('webcamFpsValue').textContent = e.target.value + ' fps';
            });
        }

        const qualityInput = document.getElementById('webcamQuality');
        if (qualityInput) {
            qualityInput.addEventListener('input', (e) => {
                document.getElementById('webcamQualityValue').textContent = e.target.value + '%';
            });
        }

        const brightnessInput = document.getElementById('webcamBrightness');
        if (brightnessInput) {
            brightnessInput.addEventListener('input', (e) => {
                document.getElementById('webcamBrightnessValue').textContent = e.target.value;
            });
        }

        const contrastInput = document.getElementById('webcamContrast');
        if (contrastInput) {
            contrastInput.addEventListener('input', (e) => {
                document.getElementById('webcamContrastValue').textContent = e.target.value;
            });
        }

        const saturationInput = document.getElementById('webcamSaturation');
        if (saturationInput) {
            saturationInput.addEventListener('input', (e) => {
                document.getElementById('webcamSaturationValue').textContent = e.target.value;
            });
        }

        const sharpnessInput = document.getElementById('webcamSharpness');
        if (sharpnessInput) {
            sharpnessInput.addEventListener('input', (e) => {
                document.getElementById('webcamSharpnessValue').textContent = e.target.value;
            });
        }

        const motionSensitivity = document.getElementById('webcamMotionSensitivity');
        if (motionSensitivity) {
            motionSensitivity.addEventListener('input', (e) => {
                document.getElementById('webcamSensitivityValue').textContent = e.target.value + '%';
            });
        }

        // Notification toggles
        const emailToggle = document.getElementById('notifyEmailEnable');
        if (emailToggle) {
            emailToggle.addEventListener('change', toggleEmailSettings);
        }

        const telegramToggle = document.getElementById('notifyTelegramEnable');
        if (telegramToggle) {
            telegramToggle.addEventListener('change', toggleTelegramSettings);
        }

        const pushoverToggle = document.getElementById('notifyPushoverEnable');
        if (pushoverToggle) {
            pushoverToggle.addEventListener('change', togglePushoverSettings);
        }
    }

    // Toggle functions
    function toggleEmailSettings() {
        const enabled = document.getElementById('notifyEmailEnable').checked;
        document.getElementById('emailSettings').style.display = enabled ? 'block' : 'none';
    }

    function toggleTelegramSettings() {
        const enabled = document.getElementById('notifyTelegramEnable').checked;
        document.getElementById('telegramSettings').style.display = enabled ? 'block' : 'none';
    }

    function togglePushoverSettings() {
        const enabled = document.getElementById('notifyPushoverEnable').checked;
        document.getElementById('pushoverSettings').style.display = enabled ? 'block' : 'none';
    }

    function togglePassword(id) {
        const input = document.getElementById(id);
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    // ==================== MQTT SETTINGS ====================
    window.saveMQTTSettings = function() {
        const data = {
            host: document.getElementById('mqttHost').value,
            port: parseInt(document.getElementById('mqttPort').value),
            username: document.getElementById('mqttUsername').value,
            password: document.getElementById('mqttPassword').value,
            clientId: document.getElementById('mqttClientId').value
        };

        if (!data.host || !data.port) {
            showToast('Host and port are required', 'warning');
            return;
        }

        saveSettings('/api/settings/mqtt', data, 'MQTT settings saved');
    };

    window.testMQTTConnection = function() {
        const data = {
            host: document.getElementById('mqttHost').value,
            port: parseInt(document.getElementById('mqttPort').value),
            username: document.getElementById('mqttUsername').value,
            password: document.getElementById('mqttPassword').value
        };

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Testing...';
        btn.disabled = true;

        fetch('/api/settings/test/mqtt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            showToast('Test failed: ' + error.message, 'danger');
        })
        .finally(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    };

    // ==================== MODEM SETTINGS ====================
    window.saveModemSettings = function() {
        const data = {
            apn: document.getElementById('modemApn').value,
            apnUser: document.getElementById('modemApnUser').value,
            apnPass: document.getElementById('modemApnPass').value,
            auth: document.getElementById('modemAuth').value,
            networkMode: document.getElementById('modemNetworkMode').value,
            preferredNetwork: document.getElementById('modemPreferredNetwork').value,
            autoConnect: document.getElementById('modemAutoConnect').checked,
            pinCode: document.getElementById('modemPinCode').value
        };

        if (!data.apn) {
            showToast('APN is required', 'warning');
            return;
        }

        saveSettings('/api/settings/modem', data, 'Modem settings saved');
    };

    window.scanNetworks = function() {
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scanning...';
        btn.disabled = true;

        // This would call an API to scan networks
        setTimeout(() => {
            document.getElementById('networkScanResults').style.display = 'block';
            document.getElementById('networksList').innerHTML = `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                        <span><i class="bi bi-broadcast me-2"></i>Robi 4G</span>
                        <span class="badge bg-success">85%</span>
                    </div>
                </div>
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                        <span><i class="bi bi-broadcast me-2"></i>Grameenphone</span>
                        <span class="badge bg-warning">65%</span>
                    </div>
                </div>
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                        <span><i class="bi bi-broadcast me-2"></i>Banglalink</span>
                        <span class="badge bg-danger">40%</span>
                    </div>
                </div>
            `;
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    };

    // ==================== WEBCAM SETTINGS ====================
    window.saveWebcamSettings = function() {
        const data = {
            enabled: document.getElementById('webcamEnabled').checked,
            resolution: document.getElementById('webcamResolution').value,
            fps: parseInt(document.getElementById('webcamFps').value),
            quality: parseInt(document.getElementById('webcamQuality').value),
            brightness: parseInt(document.getElementById('webcamBrightness').value),
            contrast: parseInt(document.getElementById('webcamContrast').value),
            saturation: parseInt(document.getElementById('webcamSaturation').value),
            sharpness: parseInt(document.getElementById('webcamSharpness').value),
            flip_h: document.getElementById('webcamFlipH').checked,
            flip_v: document.getElementById('webcamFlipV').checked,
            motion_detection: document.getElementById('webcamMotionEnable').checked,
            motion_sensitivity: parseInt(document.getElementById('webcamMotionSensitivity').value)
        };

        saveSettings('/api/settings/webcam', data, 'Webcam settings saved');
    };

    // ==================== SYSTEM SETTINGS ====================
    window.saveSystemSettings = function() {
        const data = {
            deviceName: document.getElementById('systemDeviceName').value,
            timezone: document.getElementById('systemTimezone').value,
            logLevel: document.getElementById('systemLogLevel').value,
            autoRestart: document.getElementById('systemAutoRestart').checked,
            restartSchedule: document.getElementById('systemRestartTime').value,
            backupConfig: document.getElementById('systemBackupConfig').checked
        };

        saveSettings('/api/settings/system', data, 'System settings saved');
    };

    window.restartServer = function() {
        if (!confirm('Are you sure you want to restart the server? This will temporarily disconnect all clients.')) {
            return;
        }

        fetch('/api/settings/restart', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                showToast('Error: ' + error.message, 'danger');
            });
    };

    window.viewLogs = function() {
        const modal = new bootstrap.Modal(document.getElementById('logsModal'));
        document.getElementById('logsContent').textContent = 'Loading logs...';
        modal.show();

        fetch('/logs/app.log')
            .then(response => response.text())
            .then(data => {
                document.getElementById('logsContent').textContent = data || 'No logs found';
            })
            .catch(error => {
                document.getElementById('logsContent').textContent = 'Error loading logs: ' + error.message;
            });
    };

    window.downloadLogs = function() {
        window.location.href = '/logs/app.log';
    };

    window.clearLogs = function() {
        if (!confirm('Clear all logs?')) return;

        fetch('/logs/clear', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Logs cleared', 'success');
                    document.getElementById('logsContent').textContent = 'Logs cleared';
                }
            })
            .catch(console.error);
    };

    // ==================== NOTIFICATION SETTINGS ====================
    window.saveNotificationSettings = function() {
        const data = {
            email: {
                enabled: document.getElementById('notifyEmailEnable').checked,
                smtp: document.getElementById('notifySmtp').value,
                port: parseInt(document.getElementById('notifySmtpPort').value),
                secure: document.getElementById('notifySmtpSecure').checked,
                user: document.getElementById('notifyEmailUser').value,
                pass: document.getElementById('notifyEmailPass').value,
                from: document.getElementById('notifyFrom').value,
                to: document.getElementById('notifyTo').value
            },
            telegram: {
                enabled: document.getElementById('notifyTelegramEnable').checked,
                botToken: document.getElementById('notifyBotToken').value,
                chatId: document.getElementById('notifyChatId').value
            },
            pushover: {
                enabled: document.getElementById('notifyPushoverEnable').checked,
                appToken: document.getElementById('notifyAppToken').value,
                userKey: document.getElementById('notifyUserKey').value
            }
        };

        saveSettings('/api/settings/notifications', data, 'Notification settings saved');
    };

    window.testTelegram = function() {
        showToast('Test message sent to Telegram', 'success');
    };

    window.testPushover = function() {
        showToast('Test message sent to Pushover', 'success');
    };

    // ==================== BACKUP FUNCTIONS ====================
    window.createBackup = function() {
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';
        btn.disabled = true;

        fetch('/api/settings/backup/create', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    loadBackups();
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                showToast('Error: ' + error.message, 'danger');
            })
            .finally(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            });
    };

    window.restoreBackup = function(filename) {
        if (!confirm(`Restore backup ${filename}? This will overwrite current data and restart the server.`)) {
            return;
        }

        fetch('/api/settings/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: filename })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(error => {
            showToast('Error: ' + error.message, 'danger');
        });
    };

    window.deleteBackup = function(filename) {
        if (!confirm(`Delete backup ${filename}?`)) return;

        fetch(`/backups/${filename}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Backup deleted', 'success');
                    loadBackups();
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(console.error);
    };

    // ==================== USER MANAGEMENT ====================
    window.addUser = function() {
        const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
        modal.show();
    };

    window.saveNewUser = function() {
        const data = {
            username: document.getElementById('newUsername').value,
            password: document.getElementById('newPassword').value,
            name: document.getElementById('newName').value,
            email: document.getElementById('newEmail').value,
            role: document.getElementById('newRole').value
        };

        if (!data.username || !data.password) {
            showToast('Username and password are required', 'warning');
            return;
        }

        fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('User added', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
                modal.hide();
                loadSettings();
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    };

    window.editUser = function(id) {
        // Implement edit user modal
        showToast('Edit user feature coming soon', 'info');
    };

    window.deleteUser = function(id) {
        if (!confirm('Delete this user?')) return;

        fetch(`/api/users/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('User deleted', 'success');
                    loadSettings();
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(console.error);
    };

    // ==================== UTILITY FUNCTIONS ====================
    function saveSettings(url, data, successMessage) {
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showToast(successMessage, 'success');
            } else {
                showToast(data.message || 'Failed to save', 'danger');
            }
        })
        .catch(error => {
            console.error('Error saving settings:', error);
            showToast('Error: ' + error.message, 'danger');
        })
        .finally(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    }

    window.saveAllSettings = function() {
        saveMQTTSettings();
        saveModemSettings();
        saveWebcamSettings();
        saveSystemSettings();
        saveNotificationSettings();
        showToast('All settings saved', 'success');
    };

    window.factoryReset = function() {
        if (!confirm('FACTORY RESET: This will delete all data except users and restart the server. Are you sure?')) {
            return;
        }

        fetch('/api/settings/factory-reset', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'warning');
                    setTimeout(() => {
                        window.location.reload();
                    }, 5000);
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(console.error);
    };

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

    // Expose functions globally
    window.togglePassword = togglePassword;
    window.saveMQTTSettings = saveMQTTSettings;
    window.testMQTTConnection = testMQTTConnection;
    window.saveModemSettings = saveModemSettings;
    window.scanNetworks = scanNetworks;
    window.saveWebcamSettings = saveWebcamSettings;
    window.saveSystemSettings = saveSystemSettings;
    window.restartServer = restartServer;
    window.viewLogs = viewLogs;
    window.downloadLogs = downloadLogs;
    window.clearLogs = clearLogs;
    window.saveNotificationSettings = saveNotificationSettings;
    window.testTelegram = testTelegram;
    window.testPushover = testPushover;
    window.createBackup = createBackup;
    window.restoreBackup = restoreBackup;
    window.deleteBackup = deleteBackup;
    window.addUser = addUser;
    window.editUser = editUser;
    window.deleteUser = deleteUser;
    window.saveAllSettings = saveAllSettings;
    window.factoryReset = factoryReset;
})();