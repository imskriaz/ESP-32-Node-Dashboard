// Settings Management
(function () {
    'use strict';

    console.log('Settings.js loaded - ' + new Date().toISOString());

    let settings = {};
    let currentEditUserId = null;

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
            const mqttHost = document.getElementById('mqttHost');
            const mqttPort = document.getElementById('mqttPort');
            const mqttUsername = document.getElementById('mqttUsername');
            const mqttPassword = document.getElementById('mqttPassword');
            const mqttClientId = document.getElementById('mqttClientId');
            const statusEl = document.getElementById('mqttConnectionStatus');

            if (mqttHost) mqttHost.value = settings.mqtt.host || 'device.atebd.com';
            if (mqttPort) mqttPort.value = settings.mqtt.port || 1883;
            if (mqttUsername) mqttUsername.value = settings.mqtt.username || '';
            if (mqttPassword) mqttPassword.value = settings.mqtt.password || '';
            if (mqttClientId) mqttClientId.value = settings.mqtt.clientId || 'esp32-dashboard';

            if (statusEl) {
                if (settings.mqtt.connected) {
                    statusEl.textContent = 'Connected';
                    statusEl.className = 'badge bg-success';
                } else {
                    statusEl.textContent = 'Disconnected';
                    statusEl.className = 'badge bg-danger';
                }
            }
        }

        // Modem Settings
        if (settings.modem) {
            const modemApn = document.getElementById('modemApn');
            const modemApnUser = document.getElementById('modemApnUser');
            const modemApnPass = document.getElementById('modemApnPass');
            const modemAuth = document.getElementById('modemAuth');
            const modemNetworkMode = document.getElementById('modemNetworkMode');
            const modemPreferredNetwork = document.getElementById('modemPreferredNetwork');
            const modemAutoConnect = document.getElementById('modemAutoConnect');
            const modemPinCode = document.getElementById('modemPinCode');
            const modemBand = document.getElementById('modemBand');
            const modemRoaming = document.getElementById('modemRoaming');
            const dataLimit = document.getElementById('dataLimit');
            const dataWarning = document.getElementById('dataWarning');
            const dataResetDay = document.getElementById('dataResetDay');

            if (modemApn) modemApn.value = settings.modem.apn || 'internet';
            if (modemApnUser) modemApnUser.value = settings.modem.apnUser || '';
            if (modemApnPass) modemApnPass.value = settings.modem.apnPass || '';
            if (modemAuth) modemAuth.value = settings.modem.auth || 'none';
            if (modemNetworkMode) modemNetworkMode.value = settings.modem.networkMode || 'auto';
            if (modemPreferredNetwork) modemPreferredNetwork.value = settings.modem.preferredNetwork || 'AUTO';
            if (modemAutoConnect) modemAutoConnect.checked = settings.modem.autoConnect !== false;
            if (modemPinCode) modemPinCode.value = settings.modem.pinCode || '';
            if (modemBand) modemBand.value = settings.modem.band || 'ALL';
            if (modemRoaming) modemRoaming.checked = settings.modem.roaming || false;

            if (settings.modem.dataUsage) {
                if (dataLimit) dataLimit.value = settings.modem.dataUsage.limit || 0;
                if (dataWarning) dataWarning.value = settings.modem.dataUsage.warning || 80;
                if (dataResetDay) dataResetDay.value = settings.modem.dataUsage.resetDay || 1;
            }
        }

        // Webcam Settings
        if (settings.webcam) {
            const webcamEnabled = document.getElementById('webcamEnabled');
            const webcamResolution = document.getElementById('webcamResolution');
            const webcamFps = document.getElementById('webcamFps');
            const webcamFpsValue = document.getElementById('webcamFpsValue');
            const webcamQuality = document.getElementById('webcamQuality');
            const webcamQualityValue = document.getElementById('webcamQualityValue');
            const webcamBrightness = document.getElementById('webcamBrightness');
            const webcamBrightnessValue = document.getElementById('webcamBrightnessValue');
            const webcamContrast = document.getElementById('webcamContrast');
            const webcamContrastValue = document.getElementById('webcamContrastValue');
            const webcamSaturation = document.getElementById('webcamSaturation');
            const webcamSaturationValue = document.getElementById('webcamSaturationValue');
            const webcamSharpness = document.getElementById('webcamSharpness');
            const webcamSharpnessValue = document.getElementById('webcamSharpnessValue');
            const webcamFlipH = document.getElementById('webcamFlipH');
            const webcamFlipV = document.getElementById('webcamFlipV');
            const webcamMotionEnable = document.getElementById('webcamMotionEnable');
            const webcamMotionSensitivity = document.getElementById('webcamMotionSensitivity');
            const webcamSensitivityValue = document.getElementById('webcamSensitivityValue');

            if (webcamEnabled) webcamEnabled.checked = settings.webcam.enabled || false;
            if (webcamResolution) webcamResolution.value = settings.webcam.resolution || '640x480';
            if (webcamFps) webcamFps.value = settings.webcam.fps || 15;
            if (webcamFpsValue) webcamFpsValue.textContent = (settings.webcam.fps || 15) + ' fps';
            if (webcamQuality) webcamQuality.value = settings.webcam.quality || 80;
            if (webcamQualityValue) webcamQualityValue.textContent = (settings.webcam.quality || 80) + '%';
            if (webcamBrightness) webcamBrightness.value = settings.webcam.brightness || 0;
            if (webcamBrightnessValue) webcamBrightnessValue.textContent = settings.webcam.brightness || 0;
            if (webcamContrast) webcamContrast.value = settings.webcam.contrast || 0;
            if (webcamContrastValue) webcamContrastValue.textContent = settings.webcam.contrast || 0;
            if (webcamSaturation) webcamSaturation.value = settings.webcam.saturation || 0;
            if (webcamSaturationValue) webcamSaturationValue.textContent = settings.webcam.saturation || 0;
            if (webcamSharpness) webcamSharpness.value = settings.webcam.sharpness || 0;
            if (webcamSharpnessValue) webcamSharpnessValue.textContent = settings.webcam.sharpness || 0;
            if (webcamFlipH) webcamFlipH.checked = settings.webcam.flip_h || false;
            if (webcamFlipV) webcamFlipV.checked = settings.webcam.flip_v || false;
            if (webcamMotionEnable) webcamMotionEnable.checked = settings.webcam.motion_detection || false;
            if (webcamMotionSensitivity) webcamMotionSensitivity.value = settings.webcam.motion_sensitivity || 50;
            if (webcamSensitivityValue) webcamSensitivityValue.textContent = (settings.webcam.motion_sensitivity || 50) + '%';
        }

        // Firmware Settings
        if (settings.firmware) {
            const currentVersion = document.getElementById('currentVersion');
            const availableVersion = document.getElementById('availableVersion');
            const lastCheck = document.getElementById('lastCheck');
            const updateBtn = document.getElementById('updateBtn');
            const autoUpdate = document.getElementById('autoUpdate');
            const updateChannel = document.getElementById('updateChannel');
            const updateUrl = document.getElementById('updateUrl');
            const deviceModel = document.getElementById('deviceModel');
            const deviceId = document.getElementById('deviceId');
            const mcu = document.getElementById('mcu');
            const modemType = document.getElementById('modemType');
            const flashSize = document.getElementById('flashSize');
            const psram = document.getElementById('psram');

            if (currentVersion) currentVersion.textContent = settings.firmware.currentVersion || '1.0.0';
            if (availableVersion) availableVersion.textContent = settings.firmware.availableVersion || '---';
            if (lastCheck) lastCheck.textContent = settings.firmware.lastCheck ?
                'Last check: ' + new Date(settings.firmware.lastCheck).toLocaleString() : 'Last check: Never';

            if (updateBtn) {
                if (settings.firmware.availableVersion && settings.firmware.availableVersion > settings.firmware.currentVersion) {
                    updateBtn.style.display = 'inline-block';
                } else {
                    updateBtn.style.display = 'none';
                }
            }

            if (autoUpdate) autoUpdate.checked = settings.firmware.autoUpdate || false;
            if (updateChannel) updateChannel.value = settings.firmware.updateChannel || 'stable';
            if (updateUrl) updateUrl.value = settings.firmware.updateUrl || 'https://firmware.atebd.com/esp32-s3';
            if (deviceModel) deviceModel.textContent = settings.firmware.deviceModel || 'ESP32-S3 A7670E';
            if (deviceId) deviceId.textContent = settings.firmware.deviceId || 'esp32-s3-1';
            if (mcu) mcu.textContent = settings.firmware.mcu || 'ESP32-S3';
            if (modemType) modemType.textContent = settings.firmware.modem || 'A7670E';
            if (flashSize) flashSize.textContent = settings.firmware.flashSize || '16MB';
            if (psram) psram.textContent = settings.firmware.psram || '8MB';
        }

        // System Settings
        if (settings.system) {
            const systemDeviceName = document.getElementById('systemDeviceName');
            const hostname = document.getElementById('hostname');
            const systemTimezone = document.getElementById('systemTimezone');
            const systemLogLevel = document.getElementById('systemLogLevel');
            const systemAutoRestart = document.getElementById('systemAutoRestart');
            const systemRestartTime = document.getElementById('systemRestartTime');
            const systemBackupConfig = document.getElementById('systemBackupConfig');
            const platform = document.getElementById('platform');
            const nodeVersion = document.getElementById('nodeVersion');
            const cpuCores = document.getElementById('cpuCores');
            const memoryUsage = document.getElementById('memoryUsage');

            if (systemDeviceName) systemDeviceName.value = settings.system.deviceName || 'ESP32-S3 Gateway';
            if (hostname) hostname.textContent = settings.system.hostname || 'unknown';
            if (systemTimezone) systemTimezone.value = settings.system.timezone || 'Asia/Dhaka';
            if (systemLogLevel) systemLogLevel.value = settings.system.logLevel || 'info';
            if (systemAutoRestart) systemAutoRestart.checked = settings.system.autoRestart || false;
            if (systemRestartTime) systemRestartTime.value = settings.system.restartSchedule || '03:00';
            if (systemBackupConfig) systemBackupConfig.checked = settings.system.backupConfig !== false;

            // System info
            if (platform) platform.textContent = settings.system.platform || 'unknown';
            if (nodeVersion) nodeVersion.textContent = settings.system.nodeVersion || 'unknown';
            if (cpuCores) cpuCores.textContent = settings.system.cpu || 'unknown';
            if (memoryUsage && settings.system.memory) {
                const usedMem = Math.round(settings.system.memory.heapUsed / 1024 / 1024);
                const totalMem = Math.round(settings.system.memory.heapTotal / 1024 / 1024);
                memoryUsage.textContent = `${usedMem}MB / ${totalMem}MB`;
            }
        }

        // Notification Settings
        if (settings.notifications) {
            const notif = settings.notifications;

            // Email
            if (notif.email) {
                const notifyEmailEnable = document.getElementById('notifyEmailEnable');
                const notifySmtp = document.getElementById('notifySmtp');
                const notifySmtpPort = document.getElementById('notifySmtpPort');
                const notifySmtpSecure = document.getElementById('notifySmtpSecure');
                const notifyEmailUser = document.getElementById('notifyEmailUser');
                const notifyEmailPass = document.getElementById('notifyEmailPass');
                const notifyFrom = document.getElementById('notifyFrom');
                const notifyTo = document.getElementById('notifyTo');

                if (notifyEmailEnable) notifyEmailEnable.checked = notif.email.enabled || false;
                if (notifySmtp) notifySmtp.value = notif.email.smtp || '';
                if (notifySmtpPort) notifySmtpPort.value = notif.email.port || 587;
                if (notifySmtpSecure) notifySmtpSecure.checked = notif.email.secure || false;
                if (notifyEmailUser) notifyEmailUser.value = notif.email.user || '';
                if (notifyEmailPass) notifyEmailPass.value = notif.email.pass || '';
                if (notifyFrom) notifyFrom.value = notif.email.from || '';
                if (notifyTo) notifyTo.value = notif.email.to || '';
            }

            // Telegram
            if (notif.telegram) {
                const notifyTelegramEnable = document.getElementById('notifyTelegramEnable');
                const notifyBotToken = document.getElementById('notifyBotToken');
                const notifyChatId = document.getElementById('notifyChatId');

                if (notifyTelegramEnable) notifyTelegramEnable.checked = notif.telegram.enabled || false;
                if (notifyBotToken) notifyBotToken.value = notif.telegram.botToken || '';
                if (notifyChatId) notifyChatId.value = notif.telegram.chatId || '';
            }

            // Pushover
            if (notif.pushover) {
                const notifyPushoverEnable = document.getElementById('notifyPushoverEnable');
                const notifyAppToken = document.getElementById('notifyAppToken');
                const notifyUserKey = document.getElementById('notifyUserKey');

                if (notifyPushoverEnable) notifyPushoverEnable.checked = notif.pushover.enabled || false;
                if (notifyAppToken) notifyAppToken.value = notif.pushover.appToken || '';
                if (notifyUserKey) notifyUserKey.value = notif.pushover.userKey || '';
            }

            // Webhook
            if (notif.webhook) {
                const notifyWebhookEnable = document.getElementById('notifyWebhookEnable');
                const webhookUrl = document.getElementById('webhookUrl');
                const webhookMethod = document.getElementById('webhookMethod');

                if (notifyWebhookEnable) notifyWebhookEnable.checked = notif.webhook.enabled || false;
                if (webhookUrl) webhookUrl.value = notif.webhook.url || '';
                if (webhookMethod) webhookMethod.value = notif.webhook.method || 'POST';
            }
        }

        // Backup Settings
        if (settings.backup) {
            const backupAuto = document.getElementById('backupAuto');
            const backupInterval = document.getElementById('backupInterval');
            const backupTime = document.getElementById('backupTime');
            const backupKeepCount = document.getElementById('backupKeepCount');

            if (backupAuto) backupAuto.checked = settings.backup.autoBackup || false;
            if (backupInterval) backupInterval.value = settings.backup.backupInterval || 'daily';
            if (backupTime) backupTime.value = settings.backup.backupTime || '02:00';
            if (backupKeepCount) backupKeepCount.value = settings.backup.keepCount || 7;
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
        toggleWebhookSettings();
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
                                        <i class="bi bi-trash"></i> Delete
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
                const valueEl = document.getElementById('webcamFpsValue');
                if (valueEl) valueEl.textContent = e.target.value + ' fps';
            });
        }

        const qualityInput = document.getElementById('webcamQuality');
        if (qualityInput) {
            qualityInput.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamQualityValue');
                if (valueEl) valueEl.textContent = e.target.value + '%';
            });
        }

        const brightnessInput = document.getElementById('webcamBrightness');
        if (brightnessInput) {
            brightnessInput.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamBrightnessValue');
                if (valueEl) valueEl.textContent = e.target.value;
            });
        }

        const contrastInput = document.getElementById('webcamContrast');
        if (contrastInput) {
            contrastInput.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamContrastValue');
                if (valueEl) valueEl.textContent = e.target.value;
            });
        }

        const saturationInput = document.getElementById('webcamSaturation');
        if (saturationInput) {
            saturationInput.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamSaturationValue');
                if (valueEl) valueEl.textContent = e.target.value;
            });
        }

        const sharpnessInput = document.getElementById('webcamSharpness');
        if (sharpnessInput) {
            sharpnessInput.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamSharpnessValue');
                if (valueEl) valueEl.textContent = e.target.value;
            });
        }

        const motionSensitivity = document.getElementById('webcamMotionSensitivity');
        if (motionSensitivity) {
            motionSensitivity.addEventListener('input', (e) => {
                const valueEl = document.getElementById('webcamSensitivityValue');
                if (valueEl) valueEl.textContent = e.target.value + '%';
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

        const webhookToggle = document.getElementById('notifyWebhookEnable');
        if (webhookToggle) {
            webhookToggle.addEventListener('change', toggleWebhookSettings);
        }
    }

    // Toggle functions
    function toggleEmailSettings() {
        const enabled = document.getElementById('notifyEmailEnable')?.checked || false;
        const settingsDiv = document.getElementById('emailSettings');
        if (settingsDiv) settingsDiv.style.display = enabled ? 'block' : 'none';
    }

    function toggleTelegramSettings() {
        const enabled = document.getElementById('notifyTelegramEnable')?.checked || false;
        const settingsDiv = document.getElementById('telegramSettings');
        if (settingsDiv) settingsDiv.style.display = enabled ? 'block' : 'none';
    }

    function togglePushoverSettings() {
        const enabled = document.getElementById('notifyPushoverEnable')?.checked || false;
        const settingsDiv = document.getElementById('pushoverSettings');
        if (settingsDiv) settingsDiv.style.display = enabled ? 'block' : 'none';
    }

    function toggleWebhookSettings() {
        const enabled = document.getElementById('notifyWebhookEnable')?.checked || false;
        const settingsDiv = document.getElementById('webhookSettings');
        if (settingsDiv) settingsDiv.style.display = enabled ? 'block' : 'none';
    }

    function togglePassword(id) {
        const input = document.getElementById(id);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    }

    // ==================== MQTT SETTINGS ====================
    window.saveMQTTSettings = function () {
        const host = document.getElementById('mqttHost')?.value;
        const port = document.getElementById('mqttPort')?.value;
        const username = document.getElementById('mqttUsername')?.value;
        const password = document.getElementById('mqttPassword')?.value;
        const clientId = document.getElementById('mqttClientId')?.value;

        if (!host || !port) {
            showToast('Host and port are required', 'warning');
            return;
        }

        const data = {
            host: host,
            port: parseInt(port),
            username: username || '',
            password: password || '',
            clientId: clientId || 'esp32-dashboard'
        };

        saveSettings('/api/settings/mqtt', data, 'MQTT settings saved');
    };

    window.testMQTTConnection = function () {
        const host = document.getElementById('mqttHost')?.value;
        const port = document.getElementById('mqttPort')?.value;
        const username = document.getElementById('mqttUsername')?.value;
        const password = document.getElementById('mqttPassword')?.value;

        if (!host || !port) {
            showToast('Host and port are required', 'warning');
            return;
        }

        const data = {
            host: host,
            port: parseInt(port),
            username: username || '',
            password: password || ''
        };

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Testing...';
        btn.disabled = true;

        console.log('Testing MQTT connection with:', { host, port, username });

        fetch('/api/mqtt/test', {
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
                console.error('Test error:', error);
                showToast('Test failed: ' + error.message, 'danger');
            })
            .finally(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            });
    };

    window.saveModemSettings = function () {
        const data = {
            apn: document.getElementById('modemApn')?.value || 'internet',
            apnUser: document.getElementById('modemApnUser')?.value || '',
            apnPass: document.getElementById('modemApnPass')?.value || '',
            auth: document.getElementById('modemAuth')?.value || 'none',
            networkMode: document.getElementById('modemNetworkMode')?.value || 'auto',
            preferredNetwork: document.getElementById('modemPreferredNetwork')?.value || 'AUTO',
            autoConnect: document.getElementById('modemAutoConnect')?.checked || false,
            pinCode: document.getElementById('modemPinCode')?.value || '',
            band: document.getElementById('modemBand')?.value || 'ALL',
            roaming: document.getElementById('modemRoaming')?.checked || false,
            dataUsage: {
                limit: parseInt(document.getElementById('dataLimit')?.value) || 0,
                warning: parseInt(document.getElementById('dataWarning')?.value) || 80,
                resetDay: parseInt(document.getElementById('dataResetDay')?.value) || 1
            }
        };

        if (!data.apn) {
            showToast('APN is required', 'warning');
            return;
        }

        saveSettings('/api/settings/modem', data, 'Modem settings saved');
    };

    window.scanNetworks = function () {
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scanning...';
        btn.disabled = true;

        // Request scan from device via MQTT
        if (typeof socket !== 'undefined' && socket.connected) {
            socket.emit('modem:scan-networks');
        }

        // Show loading in results
        const scanResults = document.getElementById('networkScanResults');
        const networksList = document.getElementById('networksList');

        if (scanResults) scanResults.style.display = 'block';
        if (networksList) {
            networksList.innerHTML = `
                <div class="list-group-item text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                    <span class="ms-2">Scanning for networks...</span>
                </div>
            `;
        }

        // Simulate scan results for now (in production, these would come from WebSocket)
        setTimeout(() => {
            if (networksList) {
                networksList.innerHTML = `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi bi-broadcast text-primary me-2"></i>
                                <strong>Robi 4G</strong>
                            </div>
                            <div>
                                <span class="badge bg-success me-2">Available</span>
                                <small class="text-muted">Operator: 47001</small>
                            </div>
                        </div>
                    </div>
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi bi-broadcast text-primary me-2"></i>
                                <strong>Grameenphone</strong>
                            </div>
                            <div>
                                <span class="badge bg-success me-2">Available</span>
                                <small class="text-muted">Operator: 47002</small>
                            </div>
                        </div>
                    </div>
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi bi-broadcast text-primary me-2"></i>
                                <strong>Banglalink</strong>
                            </div>
                            <div>
                                <span class="badge bg-warning me-2">Restricted</span>
                                <small class="text-muted">Operator: 47003</small>
                            </div>
                        </div>
                    </div>
                `;
            }
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 3000);
    };

    // ==================== WEBCAM SETTINGS ====================
    window.saveWebcamSettings = function () {
        const data = {
            enabled: document.getElementById('webcamEnabled')?.checked || false,
            resolution: document.getElementById('webcamResolution')?.value || '640x480',
            fps: parseInt(document.getElementById('webcamFps')?.value) || 15,
            quality: parseInt(document.getElementById('webcamQuality')?.value) || 80,
            brightness: parseInt(document.getElementById('webcamBrightness')?.value) || 0,
            contrast: parseInt(document.getElementById('webcamContrast')?.value) || 0,
            saturation: parseInt(document.getElementById('webcamSaturation')?.value) || 0,
            sharpness: parseInt(document.getElementById('webcamSharpness')?.value) || 0,
            flip_h: document.getElementById('webcamFlipH')?.checked || false,
            flip_v: document.getElementById('webcamFlipV')?.checked || false,
            motion_detection: document.getElementById('webcamMotionEnable')?.checked || false,
            motion_sensitivity: parseInt(document.getElementById('webcamMotionSensitivity')?.value) || 50
        };

        saveSettings('/api/settings/webcam', data, 'Webcam settings saved');
    };

    // ==================== FIRMWARE SETTINGS ====================
    window.checkForUpdates = function () {
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Checking...';
        btn.disabled = true;

        fetch('/api/settings/firmware/check', {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    if (data.data) {
                        const availableVersion = document.getElementById('availableVersion');
                        const lastCheck = document.getElementById('lastCheck');
                        const updateBtn = document.getElementById('updateBtn');

                        if (availableVersion) availableVersion.textContent = data.data.available || '---';
                        if (lastCheck) lastCheck.textContent = 'Last check: just now';

                        if (updateBtn) {
                            updateBtn.style.display = data.data.updateAvailable ? 'inline-block' : 'none';
                        }
                    }
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(error => {
                showToast('Error checking for updates: ' + error.message, 'danger');
            })
            .finally(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            });
    };

    window.performUpdate = function () {
        if (!confirm('Are you sure you want to update the firmware? The device will restart and may be unavailable for a few minutes.')) {
            return;
        }

        const btn = document.getElementById('updateBtn');
        if (!btn) return;

        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Updating...';
        btn.disabled = true;

        fetch('/api/settings/firmware/update', {
            method: 'POST'
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
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }
            })
            .catch(error => {
                showToast('Error updating firmware: ' + error.message, 'danger');
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            });
    };

    window.saveFirmwareSettings = function () {
        const data = {
            autoUpdate: document.getElementById('autoUpdate')?.checked || false,
            updateChannel: document.getElementById('updateChannel')?.value || 'stable',
            updateUrl: document.getElementById('updateUrl')?.value || 'https://firmware.atebd.com/esp32-s3'
        };

        saveSettings('/api/settings/firmware', data, 'Firmware settings saved');
    };

    // ==================== SYSTEM SETTINGS ====================
    window.saveSystemSettings = function () {
        const data = {
            deviceName: document.getElementById('systemDeviceName')?.value || 'ESP32-S3 Gateway',
            timezone: document.getElementById('systemTimezone')?.value || 'Asia/Dhaka',
            logLevel: document.getElementById('systemLogLevel')?.value || 'info',
            autoRestart: document.getElementById('systemAutoRestart')?.checked || false,
            restartSchedule: document.getElementById('systemRestartTime')?.value || '03:00',
            backupConfig: document.getElementById('systemBackupConfig')?.checked || false
        };

        saveSettings('/api/settings/system', data, 'System settings saved');
    };

    window.restartServer = function () {
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

    window.viewLogs = function () {
        const modal = new bootstrap.Modal(document.getElementById('logsModal'));
        const logsContent = document.getElementById('logsContent');
        if (logsContent) logsContent.textContent = 'Loading logs...';
        modal.show();

        fetch('/api/settings/logs')
            .then(response => response.json())
            .then(data => {
                if (logsContent) {
                    if (data.success) {
                        logsContent.textContent = data.data || 'No logs found';
                    } else {
                        logsContent.textContent = 'Error loading logs: ' + data.message;
                    }
                }
            })
            .catch(error => {
                if (logsContent) logsContent.textContent = 'Error loading logs: ' + error.message;
            });
    };

    window.downloadLogs = function () {
        window.location.href = '/api/settings/logs/download';
    };

    window.clearLogs = function () {
        if (!confirm('Clear all logs?')) return;

        fetch('/api/settings/logs/clear', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Logs cleared', 'success');
                    const logsContent = document.getElementById('logsContent');
                    if (logsContent) logsContent.textContent = 'Logs cleared';
                } else {
                    showToast(data.message, 'danger');
                }
            })
            .catch(console.error);
    };

    // ==================== NOTIFICATION SETTINGS ====================
    window.saveNotificationSettings = function () {
        const data = {
            email: {
                enabled: document.getElementById('notifyEmailEnable')?.checked || false,
                smtp: document.getElementById('notifySmtp')?.value || '',
                port: parseInt(document.getElementById('notifySmtpPort')?.value) || 587,
                secure: document.getElementById('notifySmtpSecure')?.checked || false,
                user: document.getElementById('notifyEmailUser')?.value || '',
                pass: document.getElementById('notifyEmailPass')?.value || '',
                from: document.getElementById('notifyFrom')?.value || '',
                to: document.getElementById('notifyTo')?.value || ''
            },
            telegram: {
                enabled: document.getElementById('notifyTelegramEnable')?.checked || false,
                botToken: document.getElementById('notifyBotToken')?.value || '',
                chatId: document.getElementById('notifyChatId')?.value || ''
            },
            pushover: {
                enabled: document.getElementById('notifyPushoverEnable')?.checked || false,
                appToken: document.getElementById('notifyAppToken')?.value || '',
                userKey: document.getElementById('notifyUserKey')?.value || ''
            },
            webhook: {
                enabled: document.getElementById('notifyWebhookEnable')?.checked || false,
                url: document.getElementById('webhookUrl')?.value || '',
                method: document.getElementById('webhookMethod')?.value || 'POST',
                headers: {}
            }
        };

        saveSettings('/api/settings/notifications', data, 'Notification settings saved');
    };

    window.testEmail = function () {
        const data = {
            smtp: document.getElementById('notifySmtp')?.value,
            port: parseInt(document.getElementById('notifySmtpPort')?.value),
            secure: document.getElementById('notifySmtpSecure')?.checked,
            user: document.getElementById('notifyEmailUser')?.value,
            pass: document.getElementById('notifyEmailPass')?.value,
            from: document.getElementById('notifyFrom')?.value,
            to: document.getElementById('notifyTo')?.value
        };

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        btn.disabled = true;

        fetch('/api/settings/test/email', {
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

    window.testTelegram = function () {
        const data = {
            botToken: document.getElementById('notifyBotToken')?.value,
            chatId: document.getElementById('notifyChatId')?.value
        };

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        btn.disabled = true;

        fetch('/api/settings/test/telegram', {
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

    window.testPushover = function () {
        const data = {
            appToken: document.getElementById('notifyAppToken')?.value,
            userKey: document.getElementById('notifyUserKey')?.value
        };

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        btn.disabled = true;

        fetch('/api/settings/test/pushover', {
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

    // ==================== BACKUP FUNCTIONS ====================
    window.createBackup = function () {
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

    window.restoreBackup = function (filename) {
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

    window.deleteBackup = function (filename) {
        if (!confirm(`Delete backup ${filename}?`)) return;

        fetch(`/api/settings/backups/${filename}`, { method: 'DELETE' })
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
    window.addUser = function () {
        const form = document.getElementById('addUserForm');
        if (form) form.reset();
        const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
        modal.show();
    };

    window.saveNewUser = function () {
        const data = {
            username: document.getElementById('newUsername')?.value,
            password: document.getElementById('newPassword')?.value,
            name: document.getElementById('newName')?.value,
            email: document.getElementById('newEmail')?.value,
            role: document.getElementById('newRole')?.value || 'user'
        };

        if (!data.username || !data.password) {
            showToast('Username and password are required', 'warning');
            return;
        }

        if (data.password.length < 6) {
            showToast('Password must be at least 6 characters', 'warning');
            return;
        }

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        fetch('/api/settings/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('User added', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
                    if (modal) modal.hide();
                    loadSettings();
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

    window.editUser = function (id) {
        currentEditUserId = id;

        // Find user in settings
        const user = settings.users?.find(u => u.id === id);
        if (!user) return;

        const editUserId = document.getElementById('editUserId');
        const editUsername = document.getElementById('editUsername');
        const editName = document.getElementById('editName');
        const editEmail = document.getElementById('editEmail');
        const editRole = document.getElementById('editRole');
        const editPassword = document.getElementById('editPassword');

        if (editUserId) editUserId.value = user.id;
        if (editUsername) editUsername.value = user.username;
        if (editName) editName.value = user.name || '';
        if (editEmail) editEmail.value = user.email || '';
        if (editRole) editRole.value = user.role || 'user';
        if (editPassword) editPassword.value = '';

        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();
    };

    window.updateUser = function () {
        const data = {
            name: document.getElementById('editName')?.value,
            email: document.getElementById('editEmail')?.value,
            role: document.getElementById('editRole')?.value || 'user'
        };

        const password = document.getElementById('editPassword')?.value;
        if (password) {
            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'warning');
                return;
            }
            data.password = password;
        }

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        fetch(`/api/settings/users/${currentEditUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('User updated', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
                    if (modal) modal.hide();
                    loadSettings();
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

    window.deleteUser = function (id) {
        if (!confirm('Delete this user?')) return;

        fetch(`/api/settings/users/${id}`, { method: 'DELETE' })
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

    window.deleteUserFromEdit = function () {
        if (currentEditUserId) {
            deleteUser(currentEditUserId);
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            if (modal) modal.hide();
        }
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
                    // Reload settings to show updated values
                    setTimeout(loadSettings, 1000);
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

    window.saveAllSettings = function () {
        saveMQTTSettings();
        saveModemSettings();
        saveWebcamSettings();
        saveFirmwareSettings();
        saveSystemSettings();
        saveNotificationSettings();
        showToast('All settings saved', 'success');
    };

    window.factoryReset = function () {
        if (!confirm('FACTORY RESET: This will delete all data except users and restart the server. Are you sure?')) {
            return;
        }
        if (!confirm('This action cannot be undone. Type "RESET" to confirm.')) {
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
    window.checkForUpdates = checkForUpdates;
    window.performUpdate = performUpdate;
    window.saveFirmwareSettings = saveFirmwareSettings;
    window.saveSystemSettings = saveSystemSettings;
    window.restartServer = restartServer;
    window.viewLogs = viewLogs;
    window.downloadLogs = downloadLogs;
    window.clearLogs = clearLogs;
    window.saveNotificationSettings = saveNotificationSettings;
    window.testEmail = testEmail;
    window.testTelegram = testTelegram;
    window.testPushover = testPushover;
    window.createBackup = createBackup;
    window.restoreBackup = restoreBackup;
    window.deleteBackup = deleteBackup;
    window.addUser = addUser;
    window.editUser = editUser;
    window.deleteUser = deleteUser;
    window.deleteUserFromEdit = deleteUserFromEdit;
    window.saveAllSettings = saveAllSettings;
    window.factoryReset = factoryReset;
})();