// Webcam JavaScript
(function () {
    'use strict';

    console.log('Webcam.js loaded - ' + new Date().toISOString());

    // State
    let webcamEnabled = false;
    let updateInterval = null;
    let motionDetectionEnabled = false;
    let recording = false;
    let currentSettings = {};

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Webcam page...');

        loadStatus();
        loadLatestCapture();
        loadCaptureHistory();
        attachEventListeners();
        attachSocketListeners();
        startUpdates();
    }

    // Load webcam status
    function loadStatus() {
        fetch('/api/webcam/status')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateStatus(data.data);
                }
            })
            .catch(error => console.error('Error loading webcam status:', error));
    }

    // Update UI with webcam status
    function updateStatus(data) {
        webcamEnabled = data.enabled;

        // Update toggle
        const toggle = document.getElementById('webcamToggle');
        const toggleLabel = document.getElementById('webcamToggleLabel');
        if (toggle) {
            toggle.checked = data.enabled;
            toggleLabel.textContent = data.enabled ? 'Disable Camera' : 'Enable Camera';
        }

        // Update status banner
        const statusText = document.getElementById('cameraStatusText');
        const statusBanner = document.getElementById('cameraStatusBanner');
        if (statusText) {
            if (data.enabled) {
                statusText.textContent = 'Camera is active';
                statusBanner.className = 'alert alert-success d-flex align-items-center mb-4';
            } else {
                statusText.textContent = 'Camera is disabled';
                statusBanner.className = 'alert alert-secondary d-flex align-items-center mb-4';
            }
        }

        // Update camera info
        document.getElementById('cameraResolution').textContent = data.settings?.resolution || '640x480';
        document.getElementById('cameraFPS').textContent = (data.settings?.fps || 15) + ' fps';
        document.getElementById('infoResolution').textContent = data.settings?.resolution || '640x480';
        document.getElementById('infoFPS').textContent = (data.settings?.fps || 15) + ' fps';
        document.getElementById('infoQuality').textContent = (data.settings?.quality || 80) + '%';
        document.getElementById('infoBrightness').textContent = data.settings?.brightness || 0;
        document.getElementById('infoContrast').textContent = data.settings?.contrast || 0;

        // Update settings form
        if (data.settings) {
            currentSettings = data.settings;
            updateSettingsForm(data.settings);
        }

        // Update live feed
        updateLiveFeed(data.enabled);
    }

    function updateLiveFeed(enabled) {
        const feedImg = document.getElementById('cameraFeed');
        const noFeedMsg = document.getElementById('noFeedMessage');
        const streamStatus = document.getElementById('streamStatus');

        if (enabled) {
            // Use actual MJPEG stream from server
            feedImg.src = '/api/webcam/stream?' + Date.now();
            feedImg.style.display = 'inline';
            noFeedMsg.style.display = 'none';
            streamStatus.textContent = 'Streaming';
            streamStatus.className = 'badge bg-success';

            // Refresh periodically to keep stream alive
            if (window.streamInterval) {
                clearInterval(window.streamInterval);
            }
            window.streamInterval = setInterval(() => {
                if (webcamEnabled) {
                    feedImg.src = '/api/webcam/stream?' + Date.now();
                }
            }, 1000 / (currentSettings.fps || 15));
        } else {
            if (window.streamInterval) {
                clearInterval(window.streamInterval);
            }
            feedImg.style.display = 'none';
            noFeedMsg.style.display = 'flex';
            streamStatus.textContent = 'Offline';
            streamStatus.className = 'badge bg-secondary';
        }
    }

    // Update settings form with current values
    function updateSettingsForm(settings) {
        // Resolution
        const resolutionSelect = document.getElementById('settingResolution');
        if (resolutionSelect && settings.resolution) {
            resolutionSelect.value = settings.resolution;
        }

        // FPS
        const fpsInput = document.getElementById('settingFPS');
        const fpsValue = document.getElementById('fpsValue');
        if (fpsInput && settings.fps) {
            fpsInput.value = settings.fps;
            fpsValue.textContent = settings.fps + ' fps';
        }

        // Quality
        const qualityInput = document.getElementById('settingQuality');
        const qualityValue = document.getElementById('qualityValue');
        if (qualityInput && settings.quality) {
            qualityInput.value = settings.quality;
            qualityValue.textContent = settings.quality + '%';
        }

        // Brightness
        const brightnessInput = document.getElementById('settingBrightness');
        const brightnessValue = document.getElementById('brightnessValue');
        if (brightnessInput && settings.brightness !== undefined) {
            brightnessInput.value = settings.brightness;
            brightnessValue.textContent = settings.brightness;
        }

        // Contrast
        const contrastInput = document.getElementById('settingContrast');
        const contrastValue = document.getElementById('contrastValue');
        if (contrastInput && settings.contrast !== undefined) {
            contrastInput.value = settings.contrast;
            contrastValue.textContent = settings.contrast;
        }

        // Saturation
        const saturationInput = document.getElementById('settingSaturation');
        const saturationValue = document.getElementById('saturationValue');
        if (saturationInput && settings.saturation !== undefined) {
            saturationInput.value = settings.saturation;
            saturationValue.textContent = settings.saturation;
        }

        // Sharpness
        const sharpnessInput = document.getElementById('settingSharpness');
        const sharpnessValue = document.getElementById('sharpnessValue');
        if (sharpnessInput && settings.sharpness !== undefined) {
            sharpnessInput.value = settings.sharpness;
            sharpnessValue.textContent = settings.sharpness;
        }

        // Flip settings
        const flipH = document.getElementById('settingFlipH');
        const flipV = document.getElementById('settingFlipV');
        if (flipH) flipH.checked = settings.flip_h || false;
        if (flipV) flipV.checked = settings.flip_v || false;

        // Motion detection
        const motionEnable = document.getElementById('motionEnable');
        if (motionEnable) motionEnable.checked = settings.motion_detection || false;

        const motionSensitivity = document.getElementById('motionSensitivity');
        const sensitivityValue = document.getElementById('sensitivityValue');
        if (motionSensitivity && settings.motion_sensitivity) {
            motionSensitivity.value = settings.motion_sensitivity;
            sensitivityValue.textContent = settings.motion_sensitivity + '%';
        }
    }

    // Toggle webcam
    function toggleWebcam(enabled) {
        fetch('/api/webcam/toggle', {
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
                    showToast(data.message || 'Failed to toggle webcam', 'danger');
                    document.getElementById('webcamToggle').checked = !enabled;
                }
            })
            .catch(error => {
                console.error('Error toggling webcam:', error);
                showToast('Error toggling webcam', 'danger');
            });
    }

    function captureImage() {
        if (!webcamEnabled) {
            showToast('Please enable the camera first', 'warning');
            return;
        }

        const captureBtn = document.querySelector('button[onclick="captureImage()"]');
        const originalHtml = captureBtn?.innerHTML;

        if (captureBtn) {
            captureBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Capturing...';
            captureBtn.disabled = true;
        }

        showToast('Capturing image...', 'info');

        fetch('/api/webcam/capture', {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Capture command sent', 'success');
                    // Image will come via WebSocket
                } else {
                    showToast(data.message || 'Failed to capture image', 'danger');
                }
            })
            .catch(error => {
                console.error('Error capturing image:', error);
                showToast('Error capturing image', 'danger');
            })
            .finally(() => {
                if (captureBtn) {
                    captureBtn.innerHTML = originalHtml;
                    captureBtn.disabled = false;
                }
            });
    }

    // Add WebSocket listener for new captures
    if (typeof socket !== 'undefined') {
        socket.on('webcam:capture', (data) => {
            showToast('New image captured', 'success');

            // Update latest capture
            const latestImg = document.getElementById('latestCapture');
            const noMsg = document.getElementById('noCaptureMessage');

            if (latestImg && noMsg) {
                latestImg.src = data.path + '?' + Date.now();
                latestImg.style.display = 'inline';
                noMsg.style.display = 'none';
            }

            // Reload history
            loadCaptureHistory();

            // Show in modal if open
            const modalCapture = document.getElementById('modalCapture');
            if (modalCapture) {
                modalCapture.src = data.path + '?' + Date.now();
            }
        });
    }
    // Load latest capture
    function loadLatestCapture() {
        fetch('/api/webcam/latest')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data) {
                    const latestImg = document.getElementById('latestCapture');
                    const noMsg = document.getElementById('noCaptureMessage');

                    if (latestImg && noMsg) {
                        latestImg.src = data.data.path;
                        latestImg.style.display = 'inline';
                        noMsg.style.display = 'none';
                    }
                }
            })
            .catch(console.error);
    }

    function loadCaptureHistory() {
        const container = document.getElementById('captureHistory');
        if (!container) return;

        fetch('/api/webcam/history?limit=12')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    displayCaptureHistory(data.data);
                } else {
                    container.innerHTML = `
                    <div class="col-12 text-center py-4 text-muted">
                        <i class="bi bi-images fs-1 d-block mb-3"></i>
                        <p>No captures yet</p>
                        <button class="btn btn-primary" onclick="captureImage()">
                            <i class="bi bi-camera"></i> Take First Photo
                        </button>
                    </div>
                `;
                }
            })
            .catch(error => {
                console.error('Error loading history:', error);
                container.innerHTML = `
                <div class="col-12 text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                    <p>Failed to load capture history</p>
                </div>
            `;
            });
    }

    function displayCaptureHistory(captures) {
        const container = document.getElementById('captureHistory');
        let html = '';

        captures.forEach(capture => {
            html += `
            <div class="col-6 col-md-4 col-lg-3">
                <div class="card capture-thumbnail cursor-pointer" onclick="viewCapture('${capture.path}')">
                    <img src="${capture.path}" class="card-img-top" alt="Capture" style="height: 150px; object-fit: cover;">
                    <div class="card-body p-2">
                        <small class="text-muted d-block text-truncate">
                            ${new Date(capture.timestamp).toLocaleString()}
                        </small>
                        <small class="text-muted">${formatBytes(capture.size)}</small>
                    </div>
                </div>
            </div>
        `;
        });

        container.innerHTML = html;
    }

    function initMotionZone() {
        const canvas = document.getElementById('motionZoneCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let startX, startY;
        let zones = [];

        // Load existing zones
        fetch('/api/webcam/motion/zones')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    zones = data.data || [];
                    drawZones();
                }
            })
            .catch(console.error);

        function drawZones() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

            zones.forEach(zone => {
                ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
                ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            });
        }

        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            isDrawing = true;
            startX = (e.clientX - rect.left) * scaleX;
            startY = (e.clientY - rect.top) * scaleY;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const currentX = (e.clientX - rect.left) * scaleX;
            const currentY = (e.clientY - rect.top) * scaleY;

            drawZones();

            // Draw preview
            ctx.strokeStyle = '#ff0000';
            ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const endX = (e.clientX - rect.left) * scaleX;
            const endY = (e.clientY - rect.top) * scaleY;

            const width = endX - startX;
            const height = endY - startY;

            if (Math.abs(width) > 10 && Math.abs(height) > 10) {
                const zone = {
                    x: Math.min(startX, endX),
                    y: Math.min(startY, endY),
                    width: Math.abs(width),
                    height: Math.abs(height)
                };

                zones.push(zone);

                // Save to server
                fetch('/api/webcam/motion/zones', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zones })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showToast('Motion zone added', 'success');
                        }
                    })
                    .catch(console.error);
            }

            drawZones();
        });
    }

    function saveSettings() {
        const settings = {
            resolution: document.getElementById('settingResolution').value,
            fps: parseInt(document.getElementById('settingFPS').value),
            quality: parseInt(document.getElementById('settingQuality').value),
            brightness: parseInt(document.getElementById('settingBrightness').value),
            contrast: parseInt(document.getElementById('settingContrast').value),
            saturation: parseInt(document.getElementById('settingSaturation').value),
            sharpness: parseInt(document.getElementById('settingSharpness').value),
            flip_h: document.getElementById('settingFlipH').checked,
            flip_v: document.getElementById('settingFlipV').checked
        };

        fetch('/api/webcam/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Settings saved', 'success');
                    loadStatus();
                } else {
                    showToast(data.message || 'Failed to save settings', 'danger');
                }
            })
            .catch(console.error);
    }

    // Reset settings to default
    function resetSettings() {
        if (confirm('Reset all settings to default?')) {
            document.getElementById('settingResolution').value = '640x480';
            document.getElementById('settingFPS').value = 15;
            document.getElementById('fpsValue').textContent = '15 fps';
            document.getElementById('settingQuality').value = 80;
            document.getElementById('qualityValue').textContent = '80%';
            document.getElementById('settingBrightness').value = 0;
            document.getElementById('brightnessValue').textContent = '0';
            document.getElementById('settingContrast').value = 0;
            document.getElementById('contrastValue').textContent = '0';
            document.getElementById('settingSaturation').value = 0;
            document.getElementById('saturationValue').textContent = '0';
            document.getElementById('settingSharpness').value = 0;
            document.getElementById('sharpnessValue').textContent = '0';
            document.getElementById('settingFlipH').checked = false;
            document.getElementById('settingFlipV').checked = false;

            saveSettings();
        }
    }

    // Test settings with capture
    function testSettings() {
        saveSettings();
        setTimeout(captureImage, 500);
    }

    // Toggle motion detection
    function toggleMotion() {
        const enabled = !motionDetectionEnabled;

        fetch('/api/webcam/motion/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    motionDetectionEnabled = enabled;
                    const btn = document.getElementById('motionBtn');
                    btn.innerHTML = enabled ?
                        '<i class="bi bi-activity"></i> Disable Motion Detection' :
                        '<i class="bi bi-activity"></i> Enable Motion Detection';
                    btn.className = enabled ? 'btn btn-outline-danger' : 'btn btn-outline-success';
                    showToast(data.message, 'success');
                }
            })
            .catch(console.error);
    }

    // Save motion settings
    function saveMotionSettings() {
        const enabled = document.getElementById('motionEnable').checked;
        const sensitivity = document.getElementById('motionSensitivity').value;

        fetch('/api/webcam/motion/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, sensitivity: parseInt(sensitivity) })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Motion settings saved', 'success');
                }
            })
            .catch(console.error);
    }

    // Start recording
    function startRecording() {
        const btn = document.getElementById('recordBtn');

        if (!recording) {
            fetch('/api/webcam/record/start', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        recording = true;
                        btn.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Recording';
                        btn.className = 'btn btn-sm btn-outline-danger';
                        showToast('Recording started', 'success');
                    }
                })
                .catch(console.error);
        } else {
            fetch('/api/webcam/record/stop', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        recording = false;
                        btn.innerHTML = '<i class="bi bi-record-circle"></i> Start Recording';
                        btn.className = 'btn btn-sm btn-outline-success';
                        showToast('Recording stopped', 'success');
                    }
                })
                .catch(console.error);
        }
    }

    // Toggle fullscreen
    function toggleFullscreen() {
        const feed = document.getElementById('liveFeed');
        if (!document.fullscreenElement) {
            feed.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    // Reset motion zone
    function resetMotionZone() {
        const canvas = document.getElementById('motionZoneCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    }

    // Refresh webcam data
    function refreshWebcamData() {
        loadStatus();
        loadLatestCapture();
        showToast('Webcam data refreshed', 'success');
    }

    // Attach event listeners
    function attachEventListeners() {
        // Webcam toggle
        const webcamToggle = document.getElementById('webcamToggle');
        if (webcamToggle) {
            webcamToggle.addEventListener('change', (e) => {
                toggleWebcam(e.target.checked);
            });
        }

        // Range inputs
        const fpsInput = document.getElementById('settingFPS');
        if (fpsInput) {
            fpsInput.addEventListener('input', (e) => {
                document.getElementById('fpsValue').textContent = e.target.value + ' fps';
            });
        }

        const qualityInput = document.getElementById('settingQuality');
        if (qualityInput) {
            qualityInput.addEventListener('input', (e) => {
                document.getElementById('qualityValue').textContent = e.target.value + '%';
            });
        }

        const brightnessInput = document.getElementById('settingBrightness');
        if (brightnessInput) {
            brightnessInput.addEventListener('input', (e) => {
                document.getElementById('brightnessValue').textContent = e.target.value;
            });
        }

        const contrastInput = document.getElementById('settingContrast');
        if (contrastInput) {
            contrastInput.addEventListener('input', (e) => {
                document.getElementById('contrastValue').textContent = e.target.value;
            });
        }

        const saturationInput = document.getElementById('settingSaturation');
        if (saturationInput) {
            saturationInput.addEventListener('input', (e) => {
                document.getElementById('saturationValue').textContent = e.target.value;
            });
        }

        const sharpnessInput = document.getElementById('settingSharpness');
        if (sharpnessInput) {
            sharpnessInput.addEventListener('input', (e) => {
                document.getElementById('sharpnessValue').textContent = e.target.value;
            });
        }

        const motionSensitivity = document.getElementById('motionSensitivity');
        if (motionSensitivity) {
            motionSensitivity.addEventListener('input', (e) => {
                document.getElementById('sensitivityValue').textContent = e.target.value + '%';
            });
        }
    }

    // Socket listeners
    function attachSocketListeners() {
        if (typeof socket === 'undefined') return;

        socket.off('webcam:status');
        socket.off('webcam:settings');
        socket.off('webcam:capture');
        socket.off('webcam:motion');

        socket.on('webcam:status', (data) => {
            showToast(`Webcam ${data.enabled ? 'enabled' : 'disabled'}`, 'info');
            loadStatus();
        });

        socket.on('webcam:capture', (data) => {
            showToast('New image captured', 'info');
            loadLatestCapture();
        });

        socket.on('webcam:motion', (data) => {
            const overlay = document.getElementById('motionOverlay');
            if (data.enabled) {
                overlay.style.display = 'block';
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 3000);
            }
        });
    }

    // Start periodic updates
    function startUpdates() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            if (webcamEnabled) {
                // In production, this would update the live feed
                // document.getElementById('cameraFeed').src = '/api/webcam/stream?' + new Date().getTime();
                document.getElementById('streamUpdateTime').textContent = 'Updated: ' + new Date().toLocaleTimeString();
            }
        }, 1000);
    }

    // Show toast
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (document.getElementById('motionZoneCanvas')) {
            initMotionZone();
        }
    });

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (updateInterval) clearInterval(updateInterval);
    });

    // Export functions
    window.toggleWebcam = toggleWebcam;
    window.captureImage = captureImage;
    window.saveSettings = saveSettings;
    window.resetSettings = resetSettings;
    window.testSettings = testSettings;
    window.toggleMotion = toggleMotion;
    window.saveMotionSettings = saveMotionSettings;
    window.startRecording = startRecording;
    window.toggleFullscreen = toggleFullscreen;
    window.resetMotionZone = resetMotionZone;
    window.refreshWebcamData = refreshWebcamData;
    window.downloadCapture = function () {
        const img = document.getElementById('modalCapture');
        if (img.src) {
            const a = document.createElement('a');
            a.href = img.src;
            a.download = 'capture-' + Date.now() + '.jpg';
            a.click();
        }
    };
})();