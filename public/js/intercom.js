// Intercom JavaScript - P2P WebRTC Client
(function () {
    'use strict';

    console.log('Intercom.js loaded - ' + new Date().toISOString());

    // State
    let peerConnection = null;
    let localStream = null;
    let remoteStream = null;
    let dataChannel = null;
    let iceServers = [];
    let currentCallId = null;
    let callActive = false;
    let callType = null; // 'video' or 'audio'
    let deviceId = 'esp32-s3-1';
    let settings = {};
    let isDeviceOnline = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // DOM Elements
    const elements = {
        // Video elements
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        remoteAudio: document.getElementById('remoteAudio'),
        
        // Buttons
        startVideoCall: document.getElementById('startVideoCall'),
        startAudioCall: document.getElementById('startAudioCall'),
        endCall: document.getElementById('endCall'),
        muteMic: document.getElementById('muteMic'),
        muteSpeaker: document.getElementById('muteSpeaker'),
        snapshot: document.getElementById('snapshot'),
        fullscreen: document.getElementById('fullscreen'),
        
        // Settings
        videoEnabled: document.getElementById('videoEnabled'),
        videoResolution: document.getElementById('videoResolution'),
        videoFps: document.getElementById('videoFps'),
        videoQuality: document.getElementById('videoQuality'),
        audioEnabled: document.getElementById('audioEnabled'),
        audioBitrate: document.getElementById('audioBitrate'),
        echoCancellation: document.getElementById('echoCancellation'),
        noiseSuppression: document.getElementById('noiseSuppression'),
        autoGainControl: document.getElementById('autoGainControl'),
        micSensitivity: document.getElementById('micSensitivity'),
        speakerVolume: document.getElementById('speakerVolume'),
        stunServer: document.getElementById('stunServer'),
        turnServer: document.getElementById('turnServer'),
        turnUsername: document.getElementById('turnUsername'),
        turnPassword: document.getElementById('turnPassword'),
        
        // Status
        callStatus: document.getElementById('callStatus'),
        callTimer: document.getElementById('callTimer'),
        deviceStatus: document.getElementById('deviceStatus'),
        audioLevel: document.getElementById('audioLevel'),
        
        // Tabs
        videoTab: document.getElementById('video-tab'),
        audioTab: document.getElementById('audio-tab'),
        settingsTab: document.getElementById('settings-tab'),
        
        // History
        callHistory: document.getElementById('callHistory'),
        
        // Values display
        fpsValue: document.getElementById('fpsValue'),
        qualityValue: document.getElementById('qualityValue'),
        sensitivityValue: document.getElementById('sensitivityValue'),
        volumeValue: document.getElementById('volumeValue')
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Intercom page...');

        loadStatus();
        loadIceServers();
        attachEventListeners();
        attachSocketListeners();
        requestMediaPermissions();
    }

    // ==================== DATA LOADING ====================

    function loadStatus() {
        fetch(`/api/intercom/status?deviceId=${deviceId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    settings = data.data.settings;
                    isDeviceOnline = data.data.online;
                    
                    updateSettingsUI();
                    updateDeviceStatus();
                    
                    if (data.data.state.inCall) {
                        callActive = true;
                        callType = data.data.state.callType;
                        updateCallStatus('In call', 'success');
                    }
                }
            })
            .catch(error => {
                console.error('Error loading status:', error);
                showToast('Failed to load intercom status', 'danger');
            });
    }

    function loadIceServers() {
        fetch(`/api/intercom/ice-servers?deviceId=${deviceId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    iceServers = data.data;
                }
            })
            .catch(console.error);
    }

    function loadCallHistory() {
        fetch(`/api/intercom/history?deviceId=${deviceId}&limit=20`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayCallHistory(data.data);
                }
            })
            .catch(console.error);
    }

    function updateSettingsUI() {
        // Video settings
        if (elements.videoEnabled) elements.videoEnabled.checked = settings.videoEnabled || false;
        if (elements.videoResolution) elements.videoResolution.value = settings.resolution || '640x480';
        if (elements.videoFps) {
            elements.videoFps.value = settings.fps || 15;
            if (elements.fpsValue) elements.fpsValue.textContent = settings.fps || 15;
        }
        if (elements.videoQuality) {
            elements.videoQuality.value = settings.quality || 80;
            if (elements.qualityValue) elements.qualityValue.textContent = (settings.quality || 80) + '%';
        }

        // Audio settings
        if (elements.audioEnabled) elements.audioEnabled.checked = settings.audioEnabled || false;
        if (elements.audioBitrate) elements.audioBitrate.value = settings.audioBitrate || 64000;
        if (elements.echoCancellation) elements.echoCancellation.checked = settings.echoCancellation !== false;
        if (elements.noiseSuppression) elements.noiseSuppression.checked = settings.noiseSuppression !== false;
        if (elements.autoGainControl) elements.autoGainControl.checked = settings.autoGainControl !== false;
        if (elements.micSensitivity) {
            elements.micSensitivity.value = settings.micSensitivity || 50;
            if (elements.sensitivityValue) elements.sensitivityValue.textContent = (settings.micSensitivity || 50) + '%';
        }
        if (elements.speakerVolume) {
            elements.speakerVolume.value = settings.speakerVolume || 80;
            if (elements.volumeValue) elements.volumeValue.textContent = (settings.speakerVolume || 80) + '%';
        }

        // STUN/TURN
        if (elements.stunServer) elements.stunServer.value = settings.stunServer || 'stun.l.google.com:19302';
        if (elements.turnServer) elements.turnServer.value = settings.turnServer || '';
        if (elements.turnUsername) elements.turnUsername.value = settings.turnUsername || '';
        if (elements.turnPassword) elements.turnPassword.value = settings.turnPassword || '';
    }

    function updateDeviceStatus() {
        if (elements.deviceStatus) {
            if (isDeviceOnline) {
                elements.deviceStatus.innerHTML = '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Online</span>';
            } else {
                elements.deviceStatus.innerHTML = '<span class="badge bg-secondary"><i class="bi bi-power"></i> Offline</span>';
            }
        }
    }

    function displayCallHistory(history) {
        if (!elements.callHistory) return;

        if (!history || history.length === 0) {
            elements.callHistory.innerHTML = '<div class="text-center py-4 text-muted">No call history</div>';
            return;
        }

        let html = '';
        history.forEach(call => {
            const date = new Date(call.start_time).toLocaleString();
            const duration = formatDuration(call.duration);
            const type = call.type === 'video' ? '📹 Video' : '🎤 Audio';
            
            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                        <span>${type}</span>
                        <small class="text-muted">${duration}</small>
                    </div>
                    <small class="text-muted">${date}</small>
                </div>
            `;
        });

        elements.callHistory.innerHTML = html;
    }

    // ==================== MEDIA PERMISSIONS ====================

    async function requestMediaPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            // Stop tracks immediately, we just wanted permissions
            stream.getTracks().forEach(track => track.stop());
            console.log('Media permissions granted');
        } catch (error) {
            console.error('Media permissions denied:', error);
            showToast('Please allow camera and microphone access', 'warning');
        }
    }

    // ==================== WEBRTC ====================

    async function startCall(type) {
        if (!isDeviceOnline) {
            showToast('Device is offline', 'warning');
            return;
        }

        if (callActive) {
            showToast('Call already active', 'warning');
            return;
        }

        try {
            showToast(`Initiating ${type} call...`, 'info');

            // Get local media stream
            const constraints = {
                audio: {
                    echoCancellation: settings.echoCancellation,
                    noiseSuppression: settings.noiseSuppression,
                    autoGainControl: settings.autoGainControl
                },
                video: type === 'video' ? {
                    width: { ideal: parseInt(settings.resolution.split('x')[0]) },
                    height: { ideal: parseInt(settings.resolution.split('x')[1]) },
                    frameRate: { ideal: settings.fps }
                } : false
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (elements.localVideo && type === 'video') {
                elements.localVideo.srcObject = localStream;
                elements.localVideo.style.display = 'block';
            }

            // Create peer connection
            peerConnection = new RTCPeerConnection({ iceServers });

            // Add local tracks
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            // Handle ICE candidates
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendSignal('candidate', event.candidate);
                }
            };

            // Handle remote stream
            peerConnection.ontrack = event => {
                remoteStream = event.streams[0];
                if (elements.remoteVideo && type === 'video') {
                    elements.remoteVideo.srcObject = remoteStream;
                    elements.remoteVideo.style.display = 'block';
                }
                if (elements.remoteAudio) {
                    elements.remoteAudio.srcObject = remoteStream;
                }
            };

            // Create data channel for control messages
            dataChannel = peerConnection.createDataChannel('intercom');
            dataChannel.onmessage = event => {
                handleDataChannelMessage(JSON.parse(event.data));
            };

            // Create offer
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });
            await peerConnection.setLocalDescription(offer);

            // Initiate call via API
            const response = await fetch('/api/intercom/call/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, deviceId })
            });

            const data = await response.json();
            if (data.success) {
                currentCallId = data.data.callId;
                callActive = true;
                callType = type;
                
                // Send offer to device
                sendSignal('offer', peerConnection.localDescription);
                
                updateCallStatus('Connecting...', 'info');
                startCallTimer();
            } else {
                throw new Error(data.message);
            }

        } catch (error) {
            console.error('Error starting call:', error);
            showToast('Failed to start call: ' + error.message, 'danger');
            endCall();
        }
    }

    async function sendSignal(type, data) {
        if (!currentCallId) return;

        try {
            await fetch('/api/intercom/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callId: currentCallId,
                    type,
                    data,
                    deviceId
                })
            });
        } catch (error) {
            console.error('Error sending signal:', error);
        }
    }

    async function handleRemoteSignal(type, data) {
        if (!peerConnection) return;

        try {
            if (type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
                updateCallStatus('Connected', 'success');
            } else if (type === 'candidate') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data));
            }
        } catch (error) {
            console.error('Error handling remote signal:', error);
        }
    }

    function handleDataChannelMessage(data) {
        console.log('Data channel message:', data);
        
        if (data.type === 'ping') {
            dataChannel.send(JSON.stringify({ type: 'pong' }));
        } else if (data.type === 'audio-level') {
            if (elements.audioLevel) {
                elements.audioLevel.style.width = data.level + '%';
            }
        }
    }

    async function endCall() {
        try {
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }

            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            if (elements.localVideo) {
                elements.localVideo.srcObject = null;
                elements.localVideo.style.display = 'none';
            }

            if (elements.remoteVideo) {
                elements.remoteVideo.srcObject = null;
                elements.remoteVideo.style.display = 'none';
            }

            if (elements.remoteAudio) {
                elements.remoteAudio.srcObject = null;
            }

            if (currentCallId) {
                await fetch('/api/intercom/call/end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId })
                });
            }

            callActive = false;
            currentCallId = null;
            
            updateCallStatus('No active call', 'secondary');
            stopCallTimer();
            
            showToast('Call ended', 'info');
            
            // Reload history
            loadCallHistory();

        } catch (error) {
            console.error('Error ending call:', error);
        }
    }

    // ==================== CALL TIMER ====================

    let timerInterval = null;
    let callStartTime = null;

    function startCallTimer() {
        callStartTime = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        
        timerInterval = setInterval(() => {
            if (callActive && callStartTime) {
                const duration = Math.floor((Date.now() - callStartTime) / 1000);
                if (elements.callTimer) {
                    elements.callTimer.textContent = formatDuration(duration);
                }
            }
        }, 1000);
    }

    function stopCallTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (elements.callTimer) {
            elements.callTimer.textContent = '00:00';
        }
    }

    // ==================== AUDIO CONTROL ====================

    function toggleMuteMic() {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const isMuted = !audioTrack.enabled;
                
                if (elements.muteMic) {
                    elements.muteMic.innerHTML = isMuted ? 
                        '<i class="bi bi-mic-mute"></i> Unmute' : 
                        '<i class="bi bi-mic"></i> Mute';
                    elements.muteMic.classList.toggle('btn-danger', isMuted);
                    elements.muteMic.classList.toggle('btn-outline-danger', !isMuted);
                }
                
                showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
            }
        }
    }

    function toggleMuteSpeaker() {
        if (elements.remoteAudio) {
            elements.remoteAudio.muted = !elements.remoteAudio.muted;
            const isMuted = elements.remoteAudio.muted;
            
            if (elements.muteSpeaker) {
                elements.muteSpeaker.innerHTML = isMuted ? 
                    '<i class="bi bi-volume-mute"></i> Unmute' : 
                    '<i class="bi bi-volume-up"></i> Mute';
                elements.muteSpeaker.classList.toggle('btn-warning', isMuted);
                elements.muteSpeaker.classList.toggle('btn-outline-warning', !isMuted);
            }
        }
    }

    function setSpeakerVolume(volume) {
        if (elements.remoteAudio) {
            elements.remoteAudio.volume = volume / 100;
        }
    }

    // ==================== SNAPSHOT ====================

    async function takeSnapshot() {
        if (!callActive || callType !== 'video') {
            showToast('No active video call', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/intercom/snapshot?deviceId=${deviceId}`, {
                method: 'POST'
            });

            const data = await response.json();
            if (data.success) {
                showToast('Snapshot captured', 'success');
                
                // Open in new tab
                window.open(data.data.url, '_blank');
            } else {
                showToast(data.message, 'danger');
            }
        } catch (error) {
            console.error('Error taking snapshot:', error);
            showToast('Failed to take snapshot', 'danger');
        }
    }

    // ==================== FULLSCREEN ====================

    function toggleFullscreen() {
        if (!elements.remoteVideo) return;

        if (!document.fullscreenElement) {
            if (elements.remoteVideo.requestFullscreen) {
                elements.remoteVideo.requestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // ==================== SETTINGS SAVE ====================

    function saveVideoSettings() {
        const data = {
            enabled: elements.videoEnabled?.checked || false,
            resolution: elements.videoResolution?.value || '640x480',
            fps: parseInt(elements.videoFps?.value) || 15,
            quality: parseInt(elements.videoQuality?.value) || 80,
            deviceId
        };

        fetch('/api/intercom/video/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Video settings saved', 'success');
                settings = { ...settings, ...data.data };
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    function saveAudioSettings() {
        const data = {
            enabled: elements.audioEnabled?.checked || false,
            bitrate: parseInt(elements.audioBitrate?.value) || 64000,
            echoCancellation: elements.echoCancellation?.checked || false,
            noiseSuppression: elements.noiseSuppression?.checked || false,
            autoGainControl: elements.autoGainControl?.checked || false,
            micSensitivity: parseInt(elements.micSensitivity?.value) || 50,
            speakerVolume: parseInt(elements.speakerVolume?.value) || 80,
            deviceId
        };

        fetch('/api/intercom/audio/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Audio settings saved', 'success');
                settings = { ...settings, ...data.data };
                
                // Apply speaker volume
                setSpeakerVolume(data.data.speakerVolume);
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    function saveServerSettings() {
        const data = {
            stunServer: elements.stunServer?.value || 'stun.l.google.com:19302',
            turnServer: elements.turnServer?.value || '',
            turnUsername: elements.turnUsername?.value || '',
            turnPassword: elements.turnPassword?.value || '',
            deviceId
        };

        fetch('/api/intercom/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('STUN/TURN servers saved', 'success');
                loadIceServers(); // Reload ICE servers
            } else {
                showToast(data.message, 'danger');
            }
        })
        .catch(console.error);
    }

    // ==================== UI UPDATES ====================

    function updateCallStatus(message, type) {
        if (elements.callStatus) {
            elements.callStatus.innerHTML = `<span class="badge bg-${type}">${message}</span>`;
        }
    }

    // ==================== EVENT LISTENERS ====================

    function attachEventListeners() {
        // Call buttons
        if (elements.startVideoCall) {
            elements.startVideoCall.addEventListener('click', () => startCall('video'));
        }
        if (elements.startAudioCall) {
            elements.startAudioCall.addEventListener('click', () => startCall('audio'));
        }
        if (elements.endCall) {
            elements.endCall.addEventListener('click', endCall);
        }

        // Audio controls
        if (elements.muteMic) {
            elements.muteMic.addEventListener('click', toggleMuteMic);
        }
        if (elements.muteSpeaker) {
            elements.muteSpeaker.addEventListener('click', toggleMuteSpeaker);
        }

        // Video controls
        if (elements.snapshot) {
            elements.snapshot.addEventListener('click', takeSnapshot);
        }
        if (elements.fullscreen) {
            elements.fullscreen.addEventListener('click', toggleFullscreen);
        }

        // Range inputs
        if (elements.videoFps) {
            elements.videoFps.addEventListener('input', (e) => {
                if (elements.fpsValue) elements.fpsValue.textContent = e.target.value;
            });
        }
        if (elements.videoQuality) {
            elements.videoQuality.addEventListener('input', (e) => {
                if (elements.qualityValue) elements.qualityValue.textContent = e.target.value + '%';
            });
        }
        if (elements.micSensitivity) {
            elements.micSensitivity.addEventListener('input', (e) => {
                if (elements.sensitivityValue) elements.sensitivityValue.textContent = e.target.value + '%';
            });
        }
        if (elements.speakerVolume) {
            elements.speakerVolume.addEventListener('input', (e) => {
                if (elements.volumeValue) elements.volumeValue.textContent = e.target.value + '%';
                setSpeakerVolume(e.target.value);
            });
        }

        // Save buttons
        document.getElementById('saveVideoSettings')?.addEventListener('click', saveVideoSettings);
        document.getElementById('saveAudioSettings')?.addEventListener('click', saveAudioSettings);
        document.getElementById('saveServerSettings')?.addEventListener('click', saveServerSettings);

        // Tab change
        if (elements.videoTab) {
            elements.videoTab.addEventListener('shown.bs.tab', loadCallHistory);
        }
    }

    function attachSocketListeners() {
        if (typeof socket === 'undefined') return;

        socket.off('intercom:signal');
        socket.on('intercom:signal', (data) => {
            if (data.deviceId === deviceId && data.callId === currentCallId) {
                handleRemoteSignal(data.type, data.data);
            }
        });

        socket.off('intercom:status');
        socket.on('intercom:status', (data) => {
            if (data.deviceId === deviceId) {
                if (!data.inCall && callActive) {
                    // Call ended by device
                    endCall();
                }
            }
        });

        socket.off('device:status');
        socket.on('device:status', (data) => {
            if (data.deviceId === deviceId) {
                isDeviceOnline = data.online;
                updateDeviceStatus();
            }
        });
    }

    // ==================== HELPER FUNCTIONS ====================

    function formatDuration(seconds) {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`${type}: ${message}`);
        }
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (callActive) {
            endCall();
        }
    });

    // Expose functions
    window.startCall = startCall;
    window.endCall = endCall;
    window.takeSnapshot = takeSnapshot;
    window.toggleFullscreen = toggleFullscreen;
    window.saveVideoSettings = saveVideoSettings;
    window.saveAudioSettings = saveAudioSettings;
    window.saveServerSettings = saveServerSettings;

    console.log('Intercom.js initialized');
})();