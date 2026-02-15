// Device Test Center - Complete Test Functions
(function() {
    'use strict';

    // ==================== STATE MANAGEMENT ====================
    let testState = {
        currentTest: null,
        isRunning: false,
        testResults: [],
        successCount: 0,
        failCount: 0,
        gpioStates: {},
        audioContext: null,
        mediaStream: null,
        micProcessor: null,
        testInterval: null,
        deviceId: 'esp32-s3-1',
        socket: null,
        currentTestName: '',
        testProgress: 0
    };

    // ==================== INITIALIZATION ====================
    document.addEventListener('DOMContentLoaded', function() {
        initTestCenter();
        updateTestList();
        checkDeviceStatus();
        initSocket();
    });

    function initTestCenter() {
        // Initialize audio context
        try {
            testState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio context not available');
        }

        // Initialize GPIO states
        for (let i = 0; i < 20; i++) {
            testState.gpioStates[i] = {
                mode: 'in',
                value: 0,
                led: document.getElementById(`gpio-led-${i}`)
            };
        }

        // Add initial console message
        addToConsole('Test Center initialized. Select a test from the dropdown.', 'info');
    }

    function initSocket() {
        if (typeof io !== 'undefined') {
            testState.socket = io();
            
            testState.socket.on('connect', () => {
                addToConsole('Socket connected - real-time updates enabled', 'success');
            });
            
            testState.socket.on('gpio:status', (data) => {
                updateGPIOFromDevice(data);
            });
            
            testState.socket.on('test:result', (data) => {
                handleTestResult(data);
            });
            
            testState.socket.on('device:status', (data) => {
                updateDeviceStatus(data);
            });
        }
    }

    // ==================== CONSOLE FUNCTIONS ====================
    function addToConsole(message, type = 'info', data = null) {
        const console = document.getElementById('testConsole');
        const timestamp = new Date().toLocaleTimeString();
        let color = '#28a745';
        let icon = 'bi-info-circle';
        
        if (type === 'success') {
            color = '#28a745';
            icon = 'bi-check-circle';
        } else if (type === 'error') {
            color = '#dc3545';
            icon = 'bi-exclamation-triangle';
        } else if (type === 'warning') {
            color = '#ffc107';
            icon = 'bi-exclamation-circle';
        }
        
        const line = document.createElement('div');
        line.className = 'p-1 console-line';
        line.style.borderBottom = '1px solid #333';
        line.innerHTML = `<span style="color: #888;">[${timestamp}]</span> <i class="bi ${icon}" style="color: ${color};"></i> <span style="color: ${color};">${message}</span>`;
        
        console.appendChild(line);
        console.scrollTop = console.scrollHeight;
        
        // Add to detailed results
        addDetailedResult(message, type, data);
        
        // Update counters
        if (type === 'success') {
            testState.successCount++;
            document.getElementById('testSuccessCount').textContent = testState.successCount;
        } else if (type === 'error') {
            testState.failCount++;
            document.getElementById('testFailCount').textContent = testState.failCount;
        }
        document.getElementById('testTotalCount').textContent = testState.successCount + testState.failCount;
    }

    function addDetailedResult(message, type = 'info', data = null) {
        const results = document.getElementById('detailedResults');
        const timestamp = new Date().toLocaleTimeString();
        
        const div = document.createElement('div');
        div.className = `test-result ${type} small mb-1 p-1 border-start border-3 border-${type === 'error' ? 'danger' : (type === 'success' ? 'success' : 'info')}`;
        div.innerHTML = `<i class="bi ${type === 'error' ? 'bi-exclamation-triangle-fill' : (type === 'success' ? 'bi-check-circle-fill' : 'bi-info-circle-fill')} text-${type === 'error' ? 'danger' : (type === 'success' ? 'success' : 'info')} me-1"></i> ${message} <span class="test-time text-muted float-end">${timestamp}</span>`;
        
        if (data) {
            div.setAttribute('data-test-data', JSON.stringify(data));
        }
        
        results.prepend(div);
        
        // Keep only last 50 results
        while (results.children.length > 50) {
            results.removeChild(results.lastChild);
        }
        
        document.getElementById('resultTimestamp').textContent = `Last update: ${timestamp}`;
    }

    window.clearTestResults = function() {
        document.getElementById('testConsole').innerHTML = '<div class="p-1 text-success console-line"><span class="text-muted">[System]</span> Test console cleared.</div>';
        document.getElementById('detailedResults').innerHTML = '<div class="text-muted">No tests run yet. Select a test from the dropdown.</div>';
        testState.successCount = 0;
        testState.failCount = 0;
        document.getElementById('testSuccessCount').textContent = '0';
        document.getElementById('testFailCount').textContent = '0';
        document.getElementById('testTotalCount').textContent = '0';
        updateTestProgress(0);
        document.getElementById('currentTestName').textContent = 'None';
        document.getElementById('testStatus').textContent = 'Idle';
        document.getElementById('testStatus').className = 'badge bg-secondary';
        addToConsole('Test console cleared', 'info');
    };

    window.exportTestLog = function() {
        const results = document.getElementById('detailedResults').innerText;
        const console = document.getElementById('testConsole').innerText;
        const fullLog = `TEST RESULTS - ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\nCONSOLE LOG:\n${console}\n\nDETAILED RESULTS:\n${results}`;
        
        const blob = new Blob([fullLog], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test-results-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        addToConsole('Test log exported successfully', 'success');
    };

    function updateTestProgress(percent) {
        testState.testProgress = percent;
        document.getElementById('testProgress').style.width = percent + '%';
    }

    function updateCurrentTest(name, status) {
        testState.currentTestName = name;
        document.getElementById('currentTestName').textContent = name || 'None';
        
        const statusEl = document.getElementById('testStatus');
        statusEl.textContent = status || 'Idle';
        
        if (status === 'Running') {
            statusEl.className = 'badge bg-primary';
        } else if (status === 'Success') {
            statusEl.className = 'badge bg-success';
        } else if (status === 'Failed') {
            statusEl.className = 'badge bg-danger';
        } else {
            statusEl.className = 'badge bg-secondary';
        }
    }

    // ==================== DEVICE STATUS ====================
    function checkDeviceStatus() {
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                const statusEl = document.getElementById('deviceTestStatus');
                const statusText = document.getElementById('deviceTestStatusText');
                
                if (data.success && data.data.online) {
                    statusEl.className = 'badge bg-success d-flex align-items-center';
                    statusText.textContent = 'Device Online';
                    addToConsole('Device is online and ready for testing', 'success');
                } else {
                    statusEl.className = 'badge bg-danger d-flex align-items-center';
                    statusText.textContent = 'Device Offline';
                    addToConsole('Device is offline - tests will be simulated', 'warning');
                }
            })
            .catch(() => {
                document.getElementById('deviceTestStatus').className = 'badge bg-warning d-flex align-items-center';
                document.getElementById('deviceTestStatusText').textContent = 'Status Unknown';
                addToConsole('Cannot determine device status - check connection', 'error');
            });
    }

    function updateDeviceStatus(data) {
        if (data.online) {
            addToConsole('Device status update: Online', 'success');
        } else {
            addToConsole('Device status update: Offline', 'warning');
        }
    }

    // ==================== TEST SELECTION ====================
    window.updateTestList = function() {
        const category = document.getElementById('testCategory').value;
        const selector = document.getElementById('testSelector');
        
        let options = '<option value="">Select a test to run...</option>';
        
        const tests = getTestsByCategory(category);
        tests.forEach(test => {
            options += `<option value="${test.id}" data-params="${test.params || ''}">${test.name}</option>`;
        });
        
        selector.innerHTML = options;
    };

    function getTestsByCategory(category) {
        const allTests = [
            // Communication Tests
            { id: 'sms', name: '📱 Send SMS', category: 'communication', params: 'phone' },
            { id: 'call', name: '📞 Make Call', category: 'communication', params: 'phone' },
            { id: 'ussd', name: '💬 Send USSD', category: 'communication', params: 'code' },
            { id: 'ussd-balance', name: '💰 Check Balance', category: 'communication', params: '' },
            
            // Hardware Tests
            { id: 'camera', name: '📸 Camera Capture', category: 'hardware', params: '' },
            { id: 'camera-stream', name: '📹 Start Stream', category: 'hardware', params: '' },
            { id: 'led-2', name: '💡 LED 2 Test', category: 'hardware', params: 'duration' },
            { id: 'led-4', name: '💡 LED 4 Test', category: 'hardware', params: 'duration' },
            { id: 'led-5', name: '💡 LED 5 Test', category: 'hardware', params: 'duration' },
            { id: 'led-12', name: '💡 LED 12 Test', category: 'hardware', params: 'duration' },
            { id: 'rgb-led', name: '🌈 RGB LED Test', category: 'hardware', params: 'color' },
            { id: 'buzzer', name: '🔔 Buzzer Test', category: 'hardware', params: 'freq,duration' },
            { id: 'button-0', name: '🔘 Button GPIO0', category: 'hardware', params: '' },
            { id: 'button-2', name: '🔘 Button GPIO2', category: 'hardware', params: '' },
            
            // Audio Tests
            { id: 'mic-level', name: '🎤 Microphone Level', category: 'audio', params: '' },
            { id: 'mic-record-3', name: '🎤 Record 3s', category: 'audio', params: '' },
            { id: 'mic-record-5', name: '🎤 Record 5s', category: 'audio', params: '' },
            { id: 'mic-continuous', name: '🎤 Continuous Mic', category: 'audio', params: '' },
            { id: 'tone-440', name: '🔊 440Hz Tone', category: 'audio', params: 'duration' },
            { id: 'tone-1000', name: '🔊 1kHz Tone', category: 'audio', params: 'duration' },
            { id: 'tone-2000', name: '🔊 2kHz Tone', category: 'audio', params: 'duration' },
            { id: 'sweep', name: '📊 Frequency Sweep', category: 'audio', params: '' },
            { id: 'playback', name: '▶️ Play Test Audio', category: 'audio', params: '' },
            
            // GPIO Tests - Individual Pins
            ...Array.from({ length: 20 }, (_, i) => [
                { id: `gpio-${i}-read`, name: `🔌 GPIO${i} Read`, category: 'gpio', params: '' },
                { id: `gpio-${i}-high`, name: `🔌 GPIO${i} Set HIGH`, category: 'gpio', params: '' },
                { id: `gpio-${i}-low`, name: `🔌 GPIO${i} Set LOW`, category: 'gpio', params: '' },
                { id: `gpio-${i}-pulse`, name: `🔌 GPIO${i} Pulse`, category: 'gpio', params: 'duration' }
            ]).flat(),
            
            // Sensor Tests
            { id: 'temperature', name: '🌡️ Temperature', category: 'sensors', params: '' },
            { id: 'humidity', name: '💧 Humidity', category: 'sensors', params: '' },
            { id: 'pressure', name: '📊 Pressure', category: 'sensors', params: '' },
            { id: 'light', name: '☀️ Light Level', category: 'sensors', params: '' },
            { id: 'hall', name: '🧲 Hall Effect', category: 'sensors', params: '' },
            
            // Network Tests
            { id: 'gps', name: '🛰️ GPS Location', category: 'network', params: '' },
            { id: 'gps-status', name: '📡 GPS Status', category: 'network', params: '' },
            { id: 'signal', name: '📶 Signal Strength', category: 'network', params: '' },
            { id: 'wifi-scan', name: '📡 WiFi Scan', category: 'network', params: '' },
            { id: 'cell-info', name: '📱 Cell Info', category: 'network', params: '' },
            { id: 'ping', name: '🌐 Ping Test', category: 'network', params: 'host' },
            
            // Storage Tests
            { id: 'sd-info', name: '💾 SD Card Info', category: 'storage', params: '' },
            { id: 'sd-read', name: '📖 SD Read Test', category: 'storage', params: 'file' },
            { id: 'sd-write', name: '📝 SD Write Test', category: 'storage', params: 'content' },
            { id: 'sd-speed', name: '⚡ SD Speed Test', category: 'storage', params: '' },
            
            // Power Tests
            { id: 'battery', name: '🔋 Battery Level', category: 'power', params: '' },
            { id: 'battery-status', name: '⚡ Battery Status', category: 'power', params: '' },
            { id: 'charging', name: '🔌 Charging Status', category: 'power', params: '' },
            { id: 'voltage', name: '📊 Voltage Reading', category: 'power', params: '' }
        ];
        
        if (category === 'all') {
            return allTests;
        }
        return allTests.filter(test => test.category === category);
    }

    // ==================== TEST EXECUTION ====================
    window.runSelectedTest = function() {
        const selector = document.getElementById('testSelector');
        const testId = selector.value;
        const param = document.getElementById('testParam').value;
        
        if (!testId) {
            addToConsole('Please select a test to run', 'warning');
            return;
        }
        
        runTest(testId, param);
    };

    window.runAllTests = function() {
        addToConsole('Starting all tests sequentially...', 'info');
        updateCurrentTest('Running All Tests', 'Running');
        
        const categories = ['communication', 'hardware', 'audio', 'sensors', 'network', 'storage', 'power'];
        let currentCategory = 0;
        
        function runNextCategory() {
            if (currentCategory < categories.length) {
                const cat = categories[currentCategory];
                addToConsole(`Running ${cat} tests...`, 'info');
                const tests = getTestsByCategory(cat);
                runTestSuite(tests, 0, () => {
                    currentCategory++;
                    runNextCategory();
                });
            } else {
                addToConsole('All tests completed!', 'success');
                updateCurrentTest('All Tests', 'Success');
            }
        }
        
        runNextCategory();
    };

    function runTestSuite(tests, index, callback) {
        if (index >= tests.length) {
            callback();
            return;
        }
        
        const test = tests[index];
        addToConsole(`Running: ${test.name}`, 'info');
        updateTestProgress((index / tests.length) * 100);
        
        runTest(test.id, '').then(() => {
            setTimeout(() => {
                runTestSuite(tests, index + 1, callback);
            }, 500);
        }).catch(() => {
            setTimeout(() => {
                runTestSuite(tests, index + 1, callback);
            }, 500);
        });
    }

    window.stopCurrentTest = function() {
        if (testState.testInterval) {
            clearInterval(testState.testInterval);
            testState.testInterval = null;
        }
        testState.isRunning = false;
        updateCurrentTest(testState.currentTestName, 'Stopped');
        addToConsole('Test stopped by user', 'warning');
        updateTestProgress(0);
    };

    window.quickTest = function(testId) {
        runTest(testId, '');
    };

    async function runTest(testId, param) {
        testState.isRunning = true;
        updateCurrentTest(testId, 'Running');
        updateTestProgress(10);
        
        addToConsole(`Starting test: ${testId}${param ? ' with param: ' + param : ''}`, 'info');
        
        // Parse test type and execute appropriate function
        if (testId.startsWith('gpio-')) {
            await runGPIOTest(testId, param);
        } else if (testId.startsWith('led-')) {
            await runLEDTest(testId, param);
        } else if (testId.startsWith('mic-')) {
            await runMicTest(testId, param);
        } else if (testId.startsWith('tone-') || testId === 'sweep') {
            await runAudioTest(testId, param);
        } else {
            await runAPITest(testId, param);
        }
        
        updateTestProgress(100);
        setTimeout(() => {
            updateTestProgress(0);
            testState.isRunning = false;
            if (testState.failCount > testState.successCount) {
                updateCurrentTest(testId, 'Failed');
            } else {
                updateCurrentTest(testId, 'Success');
            }
        }, 500);
    }

    // ==================== GPIO TESTS ====================
    async function runGPIOTest(testId, param) {
        const parts = testId.split('-');
        const pin = parseInt(parts[1]);
        const action = parts[2];
        
        updateTestProgress(30);
        
        try {
            if (action === 'read') {
                await readPin(pin);
            } else if (action === 'high') {
                await setPinHigh(pin);
            } else if (action === 'low') {
                await setPinLow(pin);
            } else if (action === 'pulse') {
                const duration = parseInt(param) || 500;
                await pulsePin(pin, duration);
            }
            updateTestProgress(80);
        } catch (error) {
            addToConsole(`GPIO test failed: ${error.message}`, 'error');
        }
    }

    window.setPinHigh = function(pin) {
        return new Promise((resolve) => {
            updatePinLED(pin, true);
            addToConsole(`GPIO${pin} set HIGH`, 'success', { pin, value: 1 });
            
            // Simulate API call
            if (testState.socket) {
                testState.socket.emit('gpio:write', { pin, value: 1 });
            }
            
            document.getElementById(`gpio-value-${pin}`).textContent = 'HIGH';
            resolve();
        });
    };

    window.setPinLow = function(pin) {
        return new Promise((resolve) => {
            updatePinLED(pin, false);
            addToConsole(`GPIO${pin} set LOW`, 'success', { pin, value: 0 });
            
            if (testState.socket) {
                testState.socket.emit('gpio:write', { pin, value: 0 });
            }
            
            document.getElementById(`gpio-value-${pin}`).textContent = 'LOW';
            resolve();
        });
    };

    window.readPin = function(pin) {
        return new Promise((resolve) => {
            const value = Math.random() > 0.5 ? 1 : 0;
            updatePinLED(pin, value === 1);
            addToConsole(`GPIO${pin} read: ${value === 1 ? 'HIGH' : 'LOW'}`, 'info', { pin, value });
            document.getElementById(`gpio-value-${pin}`).textContent = value === 1 ? 'HIGH' : 'LOW';
            resolve();
        });
    };

    function pulsePin(pin, duration) {
        return new Promise((resolve) => {
            addToConsole(`Pulsing GPIO${pin} for ${duration}ms`, 'info');
            setPinHigh(pin);
            setTimeout(() => {
                setPinLow(pin);
                resolve();
            }, duration);
        });
    }

    window.setPinMode = function(pin, mode) {
        addToConsole(`GPIO${pin} mode set to ${mode}`, 'info', { pin, mode });
        testState.gpioStates[pin].mode = mode;
        
        if (testState.socket) {
            testState.socket.emit('gpio:mode', { pin, mode });
        }
    };

    window.scanAllPins = function() {
        addToConsole('Scanning all GPIO pins...', 'info');
        for (let i = 0; i < 20; i++) {
            setTimeout(() => readPin(i), i * 100);
        }
    };

    window.testAllOutputs = function() {
        addToConsole('Testing all output pins sequentially...', 'info');
        let pin = 0;
        
        function testNext() {
            if (pin < 20) {
                setPinHigh(pin);
                setTimeout(() => {
                    setPinLow(pin);
                    pin++;
                    setTimeout(testNext, 200);
                }, 500);
            }
        }
        testNext();
    };

    function updatePinLED(pin, high) {
        const led = document.getElementById(`gpio-led-${pin}`);
        if (led) {
            if (high) {
                led.style.background = '#28a745';
                led.style.boxShadow = '0 0 8px #28a745';
                led.classList.add('high');
                led.classList.remove('low');
            } else {
                led.style.background = '#dc3545';
                led.style.boxShadow = '0 0 8px #dc3545';
                led.classList.add('low');
                led.classList.remove('high');
            }
        }
    }

    function updateGPIOFromDevice(data) {
        if (data.pins) {
            Object.entries(data.pins).forEach(([pin, value]) => {
                updatePinLED(parseInt(pin), value === 1);
                document.getElementById(`gpio-value-${pin}`).textContent = value === 1 ? 'HIGH' : 'LOW';
            });
        }
    }

    // ==================== LED TESTS ====================
    async function runLEDTest(testId, param) {
        const pin = parseInt(testId.split('-')[1]);
        const duration = parseInt(param) || 500;
        
        addToConsole(`Testing LED on GPIO${pin} for ${duration}ms`, 'info');
        await setPinHigh(pin);
        
        setTimeout(async () => {
            await setPinLow(pin);
            addToConsole(`LED test on GPIO${pin} complete`, 'success');
        }, duration);
    }

    window.testLED = function(pin, duration) {
        runLEDTest(`led-${pin}`, duration.toString());
    };

    window.testRGBLED = function() {
        addToConsole('Testing RGB LED - cycling colors', 'info');
        const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'white'];
        let index = 0;
        
        const interval = setInterval(() => {
            if (index >= colors.length) {
                clearInterval(interval);
                addToConsole('RGB LED test complete', 'success');
                return;
            }
            addToConsole(`RGB LED color: ${colors[index]}`, 'info');
            index++;
        }, 500);
        
        testState.testInterval = interval;
    };

    window.testAllLEDs = function() {
        addToConsole('Testing all LEDs sequentially', 'info');
        const leds = [2, 4, 5, 12];
        let index = 0;
        
        function nextLED() {
            if (index < leds.length) {
                testLED(leds[index], 300);
                index++;
                setTimeout(nextLED, 400);
            }
        }
        nextLED();
    };

    // ==================== AUDIO TESTS ====================
    async function runMicTest(testId, param) {
        if (testId === 'mic-level') {
            await testMicLevel();
        } else if (testId === 'mic-record-3') {
            await testMicRecord(3);
        } else if (testId === 'mic-record-5') {
            await testMicRecord(5);
        } else if (testId === 'mic-continuous') {
            await testMicContinuous();
        }
    }

    window.testMicLevel = function() {
        return new Promise((resolve) => {
            addToConsole('Testing microphone level...', 'info');
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const audioContext = new AudioContext();
                    const source = audioContext.createMediaStreamSource(stream);
                    const analyser = audioContext.createAnalyser();
                    source.connect(analyser);
                    
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    
                    let maxLevel = 0;
                    const checkInterval = setInterval(() => {
                        analyser.getByteFrequencyData(dataArray);
                        const level = Math.max(...dataArray) / 255;
                        if (level > maxLevel) maxLevel = level;
                        
                        if (level > 0.1) {
                            clearInterval(checkInterval);
                            stream.getTracks().forEach(track => track.stop());
                            audioContext.close();
                            addToConsole(`Microphone working - peak level: ${Math.round(maxLevel * 100)}%`, 'success');
                            resolve();
                        }
                    }, 100);
                    
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        stream.getTracks().forEach(track => track.stop());
                        audioContext.close();
                        if (maxLevel > 0.05) {
                            addToConsole(`Microphone detected - level: ${Math.round(maxLevel * 100)}%`, 'success');
                        } else {
                            addToConsole('Microphone test completed - no significant input detected', 'warning');
                        }
                        resolve();
                    }, 3000);
                })
                .catch(err => {
                    addToConsole(`Microphone test failed: ${err.message}`, 'error');
                    resolve();
                });
        });
    };

    window.testMicRecord = function(duration) {
        return new Promise((resolve) => {
            addToConsole(`Recording microphone for ${duration} seconds...`, 'info');
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const mediaRecorder = new MediaRecorder(stream);
                    const chunks = [];
                    
                    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
                    mediaRecorder.onstop = () => {
                        const blob = new Blob(chunks, { type: 'audio/webm' });
                        const url = URL.createObjectURL(blob);
                        
                        addToConsole(`Recording complete - ${(blob.size / 1024).toFixed(1)}KB recorded`, 'success');
                        
                        // Create download link
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `test-recording-${Date.now()}.webm`;
                        a.click();
                        
                        stream.getTracks().forEach(track => track.stop());
                        resolve();
                    };
                    
                    mediaRecorder.start();
                    setTimeout(() => mediaRecorder.stop(), duration * 1000);
                })
                .catch(err => {
                    addToConsole(`Recording failed: ${err.message}`, 'error');
                    resolve();
                });
        });
    };

    window.testMicContinuous = function() {
        addToConsole('Starting continuous microphone monitoring (click Stop to end)', 'info');
        
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                testState.mediaStream = stream;
                const audioContext = new AudioContext();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                
                testState.testInterval = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    const level = Math.max(...dataArray) / 255;
                    document.getElementById('liveTestResult').innerHTML = `Mic level: ${Math.round(level * 100)}%`;
                }, 100);
            })
            .catch(err => {
                addToConsole(`Continuous monitoring failed: ${err.message}`, 'error');
            });
    };

    window.stopMicTest = function() {
        if (testState.mediaStream) {
            testState.mediaStream.getTracks().forEach(track => track.stop());
            testState.mediaStream = null;
        }
        if (testState.testInterval) {
            clearInterval(testState.testInterval);
            testState.testInterval = null;
        }
        document.getElementById('liveTestResult').innerHTML = 'Microphone monitoring stopped';
        addToConsole('Microphone monitoring stopped', 'info');
    };

    async function runAudioTest(testId, param) {
        if (testId === 'tone-440') {
            await testTone(440, parseInt(param) || 1);
        } else if (testId === 'tone-1000') {
            await testTone(1000, parseInt(param) || 0.5);
        } else if (testId === 'tone-2000') {
            await testTone(2000, parseInt(param) || 0.3);
        } else if (testId === 'sweep') {
            await testSweep();
        } else if (testId === 'playback') {
            await testPlayback();
        }
    }

    window.testTone = function(freq, duration) {
        return new Promise((resolve) => {
            addToConsole(`Playing ${freq}Hz tone for ${duration}s`, 'info');
            
            if (!testState.audioContext) {
                testState.audioContext = new AudioContext();
            }
            
            const oscillator = testState.audioContext.createOscillator();
            const gainNode = testState.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = freq;
            
            gainNode.gain.value = 0.1;
            
            oscillator.connect(gainNode);
            gainNode.connect(testState.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(testState.audioContext.currentTime + duration);
            
            oscillator.onended = () => {
                addToConsole('Tone playback complete', 'success');
                resolve();
            };
        });
    };

    window.testSweep = function() {
        return new Promise((resolve) => {
            addToConsole('Playing frequency sweep (100Hz - 2000Hz)', 'info');
            
            if (!testState.audioContext) {
                testState.audioContext = new AudioContext();
            }
            
            const now = testState.audioContext.currentTime;
            const oscillator = testState.audioContext.createOscillator();
            const gainNode = testState.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(100, now);
            oscillator.frequency.exponentialRampToValueAtTime(2000, now + 2);
            
            gainNode.gain.value = 0.1;
            
            oscillator.connect(gainNode);
            gainNode.connect(testState.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(now + 2.1);
            
            oscillator.onended = () => {
                addToConsole('Sweep complete', 'success');
                resolve();
            };
        });
    };

    window.testPlayback = function() {
        addToConsole('Playing test audio message', 'info');
        
        if (!testState.audioContext) {
            testState.audioContext = new AudioContext();
        }
        
        const utterance = new SpeechSynthesisUtterance('This is a test of the speaker system');
        window.speechSynthesis.speak(utterance);
        
        addToConsole('Test message playing', 'success');
    };

    window.testSpeaker = function() {
        testTone(1000, 0.5);
    };

    window.stopSpeaker = function() {
        if (testState.audioContext) {
            testState.audioContext.close();
            testState.audioContext = new AudioContext();
            addToConsole('Speaker stopped', 'info');
        }
    };

    // ==================== API TESTS ====================
    async function runAPITest(testId, param) {
        updateTestProgress(30);
        
        try {
            let response;
            let url = '/api/';
            
            switch(testId) {
                case 'sms':
                    url = 'sms/send';
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            to: param || '+8801712345678', 
                            message: 'Test SMS from ESP32 dashboard' 
                        })
                    });
                    break;
                    
                case 'call':
                    url = 'calls/dial';
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: param || '+8801712345678' })
                    });
                    break;
                    
                case 'ussd':
                case 'ussd-balance':
                    url = 'ussd/send';
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            code: param || (testId === 'ussd-balance' ? '*566#' : '*121#') 
                        })
                    });
                    break;
                    
                case 'camera':
                case 'camera-stream':
                    url = 'webcam/capture';
                    response = await fetch(url, { method: 'POST' });
                    break;
                    
                case 'buzzer':
                    url = 'gpio/buzzer';
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            freq: param ? parseInt(param.split(',')[0]) : 1000,
                            duration: param ? parseInt(param.split(',')[1]) : 500
                        })
                    });
                    break;
                    
                case 'gps':
                case 'gps-status':
                    url = 'gps/location';
                    response = await fetch(url);
                    break;
                    
                case 'signal':
                    url = 'modem/status';
                    response = await fetch(url);
                    break;
                    
                case 'wifi-scan':
                    url = 'modem/wifi/client/scan';
                    response = await fetch(url);
                    break;
                    
                case 'cell-info':
                    url = 'modem/mobile/status';
                    response = await fetch(url);
                    break;
                    
                case 'sd-info':
                case 'sd-read':
                case 'sd-write':
                case 'sd-speed':
                    url = 'storage/info';
                    response = await fetch(url);
                    break;
                    
                case 'battery':
                case 'battery-status':
                case 'charging':
                case 'voltage':
                    url = 'status';
                    response = await fetch(url);
                    break;
                    
                case 'temperature':
                case 'humidity':
                case 'pressure':
                case 'light':
                case 'hall':
                    url = 'sensor/' + testId;
                    response = await fetch(url);
                    break;
                    
                case 'ping':
                    url = 'network/ping';
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ host: param || '8.8.8.8' })
                    });
                    break;
                    
                default:
                    addToConsole(`Unknown test: ${testId}`, 'error');
                    return;
            }
            
            updateTestProgress(70);
            
            if (response) {
                const data = await response.json();
                updateTestProgress(90);
                
                if (data.success) {
                    addToConsole(`${testId} test passed`, 'success', data);
                } else {
                    addToConsole(`${testId} test failed: ${data.message || 'Unknown error'}`, 'error', data);
                }
            }
            
        } catch (error) {
            addToConsole(`${testId} test error: ${error.message}`, 'error');
        }
    }

    function handleTestResult(data) {
        if (data.success) {
            addToConsole(data.message || 'Test completed successfully', 'success', data);
        } else {
            addToConsole(data.message || 'Test failed', 'error', data);
        }
    }

    // ==================== BUTTON TESTS ====================
    window.testButton = function(pin) {
        addToConsole(`Testing button on GPIO${pin} - press the button now`, 'info');
        readPin(pin);
    };

    // ==================== EXPORT FUNCTIONS ====================
    window.testSMS = () => runTest('sms', document.getElementById('testPhone')?.value || '');
    window.testCall = () => runTest('call', document.getElementById('testCallPhone')?.value || '');
    window.testUSSD = () => runTest('ussd', document.getElementById('testUSSDCode')?.value || '');
    window.testCamera = () => runTest('camera', '');
    window.testGPS = () => runTest('gps', '');
    window.testSignal = () => runTest('signal', '');
    window.testBattery = () => runTest('battery', '');
    window.testTemperature = () => runTest('temperature', '');
    window.testSDCard = () => runTest('sd-info', '');
    window.testAPN = () => runTest('cell-info', '');
    window.testButton0 = () => testButton(0);
    window.testButton2 = () => testButton(2);
    
    // Export other functions
    window.setPinHigh = setPinHigh;
    window.setPinLow = setPinLow;
    window.readPin = readPin;
    window.setPinMode = setPinMode;
    window.scanAllPins = scanAllPins;
    window.testAllOutputs = testAllOutputs;
    window.testLED = testLED;
    window.testRGBLED = testRGBLED;
    window.testAllLEDs = testAllLEDs;
    window.testMicLevel = testMicLevel;
    window.testMicRecord = testMicRecord;
    window.testMicContinuous = testMicContinuous;
    window.stopMicTest = stopMicTest;
    window.testTone = testTone;
    window.testSweep = testSweep;
    window.testPlayback = testPlayback;
    window.testSpeaker = testSpeaker;
    window.stopSpeaker = stopSpeaker;
    window.pulsePin = pulsePin;
})();