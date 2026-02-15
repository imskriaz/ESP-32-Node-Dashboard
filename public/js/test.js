// Test Module JavaScript
(function () {
    'use strict';

    console.log('Test.js loaded - ' + new Date().toISOString());

    // State
    let categories = {};
    let runningTests = new Map();
    let testHistory = [];
    let currentDeviceId = 'esp32-s3-1';
    let updateInterval = null;
    let selectedTest = null;
    let testParameters = {};

    // DOM Elements
    const elements = {
        testConsole: document.getElementById('testConsole'),
        testCategory: document.getElementById('testCategory'),
        testSelector: document.getElementById('testSelector'),
        testParam: document.getElementById('testParam'),
        runTestBtn: document.getElementById('runTestBtn'),
        stopTestBtn: document.getElementById('stopTestBtn'),
        runAllBtn: document.getElementById('runAllBtn'),
        clearResultsBtn: document.getElementById('clearResultsBtn'),
        testProgress: document.getElementById('testProgress'),
        testProgressBar: document.getElementById('testProgressBar'),
        testStatus: document.getElementById('testStatus'),
        currentTestName: document.getElementById('currentTestName'),
        liveTestResult: document.getElementById('liveTestResult'),
        testSuccessCount: document.getElementById('testSuccessCount'),
        testFailCount: document.getElementById('testFailCount'),
        testTotalCount: document.getElementById('testTotalCount'),
        deviceTestStatus: document.getElementById('deviceTestStatus'),
        deviceTestStatusText: document.getElementById('deviceTestStatusText'),
        detailedResults: document.getElementById('detailedResults'),
        resultTimestamp: document.getElementById('resultTimestamp'),
        parameterContainer: document.getElementById('testParameters')
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Test Center...');

        loadCategories();
        loadTestHistory();
        attachEventListeners();
        attachSocketListeners();
        startPeriodicUpdate();
        updateDeviceStatus();
    }

    // ==================== DATA LOADING ====================

    function loadCategories() {
        fetch('/api/test/categories')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    categories = data.data;
                    populateCategoryDropdown();
                }
            })
            .catch(error => {
                console.error('Error loading categories:', error);
                addToConsole('Failed to load test categories', 'error');
            });
    }

    function loadTestHistory() {
        fetch(`/api/test/results?deviceId=${currentDeviceId}&limit=50`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    testHistory = data.data;
                    updateHistoryStats();
                    displayTestHistory();
                }
            })
            .catch(console.error);
    }

    function populateCategoryDropdown() {
        if (!elements.testCategory) return;

        let options = '<option value="">Select Category</option>';
        
        Object.entries(categories).forEach(([key, category]) => {
            options += `<option value="${key}">${category.icon ? `<i class="bi ${category.icon}"></i>` : ''} ${category.name}</option>`;
        });

        elements.testCategory.innerHTML = options;
    }

    function updateTestList() {
        if (!elements.testCategory || !elements.testSelector) return;

        const category = elements.testCategory.value;
        elements.testSelector.innerHTML = '<option value="">Select a test...</option>';

        if (!category || !categories[category]) return;

        categories[category].tests.forEach(test => {
            const option = document.createElement('option');
            option.value = test.id;
            option.innerHTML = `<i class="bi ${test.icon}"></i> ${test.name}`;
            option.title = test.description;
            elements.testSelector.appendChild(option);
        });
    }

    function showTestParameters() {
        const testId = elements.testSelector?.value;
        if (!testId || !AVAILABLE_TESTS[testId]) {
            elements.parameterContainer.innerHTML = '';
            return;
        }

        const test = AVAILABLE_TESTS[testId];
        selectedTest = test;

        if (!test.parameters || test.parameters.length === 0) {
            elements.parameterContainer.innerHTML = '<div class="text-muted small">No parameters required</div>';
            return;
        }

        let html = '<div class="row g-2">';
        test.parameters.forEach(param => {
            html += '<div class="col-6">';
            html += `<label class="small text-muted">${param.name}</label>`;

            if (param.type === 'select') {
                html += `<select class="form-select form-select-sm test-param" data-param="${param.name}">`;
                param.options.forEach(opt => {
                    const selected = opt === param.default ? 'selected' : '';
                    html += `<option value="${opt}" ${selected}>${opt}</option>`;
                });
                html += '</select>';
            } else if (param.type === 'number') {
                html += `<input type="number" class="form-control form-control-sm test-param" 
                         data-param="${param.name}" value="${param.default}" 
                         min="${param.min}" max="${param.max}">`;
            } else if (param.type === 'password') {
                html += `<input type="password" class="form-control form-control-sm test-param" 
                         data-param="${param.name}" placeholder="${param.required ? 'Required' : 'Optional'}">`;
            } else {
                html += `<input type="text" class="form-control form-control-sm test-param" 
                         data-param="${param.name}" value="${param.default || ''}" 
                         placeholder="${param.required ? 'Required' : 'Optional'}">`;
            }

            html += '</div>';
        });
        html += '</div>';

        elements.parameterContainer.innerHTML = html;
    }

    // ==================== TEST EXECUTION ====================

    function runSelectedTest() {
        const testId = elements.testSelector?.value;
        if (!testId) {
            addToConsole('Please select a test to run', 'warning');
            return;
        }

        // Collect parameters
        const parameters = {};
        document.querySelectorAll('.test-param').forEach(el => {
            const paramName = el.dataset.param;
            let value = el.value;
            
            if (el.type === 'number') {
                value = parseFloat(value);
            } else if (el.type === 'checkbox') {
                value = el.checked;
            }
            
            parameters[paramName] = value;
        });

        runTest(testId, parameters);
    }

    function runTest(testId, parameters = {}) {
        const test = AVAILABLE_TESTS[testId];
        if (!test) return;

        addToConsole(`Starting test: ${test.name}...`, 'info');

        // Disable run button
        if (elements.runTestBtn) {
            elements.runTestBtn.disabled = true;
            elements.runTestBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Running...';
        }

        // Enable stop button
        if (elements.stopTestBtn) {
            elements.stopTestBtn.disabled = false;
        }

        fetch('/api/test/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                testId,
                parameters,
                deviceId: currentDeviceId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addToConsole(`Test started: ${data.message}`, 'success');
                
                // Start polling for status
                startPollingTestStatus(data.data.runId);
            } else {
                addToConsole(`Failed to start test: ${data.message}`, 'danger');
                resetTestButtons();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            addToConsole(`Error: ${error.message}`, 'danger');
            resetTestButtons();
        });
    }

    function runAllTests() {
        if (!confirm('Run all tests? This may take several minutes.')) return;

        addToConsole('Starting full system test...', 'info');
        runTest('fullSystem', {});
    }

    function stopCurrentTest() {
        if (!runningTests.size) return;

        const runId = Array.from(runningTests.keys())[0];
        
        fetch(`/api/test/stop/${runId}?deviceId=${currentDeviceId}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addToConsole('Test stopped', 'warning');
                resetTestButtons();
            }
        })
        .catch(console.error);
    }

    function quickTest(testId) {
        runTest(testId, {});
    }

    function startPollingTestStatus(runId) {
        const pollInterval = setInterval(() => {
            fetch(`/api/test/status/${runId}?deviceId=${currentDeviceId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateTestStatus(data.data);
                        
                        if (data.data.completed) {
                            clearInterval(pollInterval);
                            resetTestButtons();
                            loadTestHistory(); // Refresh history
                        }
                    }
                })
                .catch(error => {
                    console.error('Polling error:', error);
                    clearInterval(pollInterval);
                    resetTestButtons();
                });
        }, 1000);
    }

    function updateTestStatus(status) {
        // Update running tests map
        if (!status.completed) {
            runningTests.set(status.runId, status);
        } else {
            runningTests.delete(status.runId);
        }

        // Update UI
        if (elements.currentTestName) {
            elements.currentTestName.textContent = status.testId || 'Unknown';
        }

        if (elements.testProgressBar && status.progress !== undefined) {
            elements.testProgressBar.style.width = `${status.progress}%`;
            elements.testProgressBar.textContent = `${status.progress}%`;
        }

        if (elements.testStatus) {
            elements.testStatus.innerHTML = getStatusBadge(status.status);
        }

        if (elements.liveTestResult && status.message) {
            elements.liveTestResult.innerHTML = `<span class="text-muted">${status.message}</span>`;
        }

        // Add to console
        if (status.message && status.message !== 'Test completed successfully') {
            addToConsole(status.message, status.status === 'failed' ? 'danger' : 'info');
        }

        // Update detailed results
        if (status.details) {
            displayDetailedResults(status.details);
        }
    }

    function clearTestResults() {
        if (!confirm('Clear all test results?')) return;

        fetch('/api/test/history', {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                testHistory = [];
                updateHistoryStats();
                displayTestHistory();
                addToConsole('Test history cleared', 'success');
                
                if (elements.detailedResults) {
                    elements.detailedResults.innerHTML = '<div class="text-muted">No tests run yet.</div>';
                }
            }
        })
        .catch(console.error);
    }

    function resetTestButtons() {
        if (elements.runTestBtn) {
            elements.runTestBtn.disabled = false;
            elements.runTestBtn.innerHTML = '<i class="bi bi-play-fill"></i> Run';
        }
        
        if (elements.stopTestBtn) {
            elements.stopTestBtn.disabled = true;
        }

        if (elements.testProgressBar) {
            elements.testProgressBar.style.width = '0%';
            elements.testProgressBar.textContent = '';
        }
    }

    // ==================== UI UPDATES ====================

    function updateHistoryStats() {
        if (!elements.testSuccessCount || !elements.testFailCount || !elements.testTotalCount) return;

        const total = testHistory.length;
        const passed = testHistory.filter(t => t.result === 'pass').length;
        const failed = testHistory.filter(t => t.result === 'fail').length;

        elements.testTotalCount.textContent = total;
        elements.testSuccessCount.textContent = passed;
        elements.testFailCount.textContent = failed;
    }

    function displayTestHistory() {
        if (!elements.detailedResults) return;

        if (testHistory.length === 0) {
            elements.detailedResults.innerHTML = '<div class="text-muted">No tests run yet. Select a test from dropdown and click Run.</div>';
            return;
        }

        let html = '';
        testHistory.slice(0, 10).forEach(test => {
            const date = new Date(test.timestamp);
            const timeStr = date.toLocaleTimeString();
            const dateStr = date.toLocaleDateString();
            
            html += `
                <div class="test-result ${test.result} small mb-1 p-1 border-start border-3 border-${test.result === 'pass' ? 'success' : 'danger'}">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <i class="bi bi-${test.result === 'pass' ? 'check-circle-fill text-success' : 'exclamation-triangle-fill text-danger'} me-1"></i>
                            <span class="fw-bold">${test.name}</span>
                            <span class="text-muted ms-2">${timeStr}</span>
                        </div>
                        <div>
                            <span class="badge bg-${test.result === 'pass' ? 'success' : 'danger'}">${test.result}</span>
                            <button class="btn btn-sm btn-link p-0 ms-2" onclick="viewTestDetails('${test.runId}')">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 text-danger" onclick="deleteTestResult('${test.runId}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${test.error ? `<div class="small text-danger mt-1">${test.error}</div>` : ''}
                    ${test.details ? `<div class="small text-muted mt-1">${JSON.stringify(test.details).substring(0, 100)}...</div>` : ''}
                </div>
            `;
        });

        elements.detailedResults.innerHTML = html;

        if (elements.resultTimestamp) {
            elements.resultTimestamp.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    function displayDetailedResults(details) {
        // This would show detailed test results in a modal or expanded view
        console.log('Detailed results:', details);
    }

    function getStatusBadge(status) {
        const badges = {
            running: '<span class="badge bg-primary"><i class="bi bi-arrow-repeat"></i> Running</span>',
            completed: '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Completed</span>',
            failed: '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle"></i> Failed</span>',
            stopped: '<span class="badge bg-warning"><i class="bi bi-stop-circle"></i> Stopped</span>'
        };
        return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
    }

    function addToConsole(message, type = 'info') {
        if (!elements.testConsole) return;

        const time = new Date().toLocaleTimeString();
        const color = type === 'danger' ? 'text-danger' : 
                     type === 'success' ? 'text-success' : 
                     type === 'warning' ? 'text-warning' : 'text-info';

        const line = document.createElement('div');
        line.className = `console-line ${color} small p-1`;
        line.innerHTML = `<span class="text-muted">[${time}]</span> ${message}`;
        
        elements.testConsole.appendChild(line);
        elements.testConsole.scrollTop = elements.testConsole.scrollHeight;

        // Keep only last 100 lines
        while (elements.testConsole.children.length > 100) {
            elements.testConsole.removeChild(elements.testConsole.firstChild);
        }
    }

    function updateDeviceStatus() {
        if (!elements.deviceTestStatus || !elements.deviceTestStatusText) return;

        // Check device status via MQTT or API
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const online = data.data?.online || false;
                    
                    if (online) {
                        elements.deviceTestStatus.className = 'badge bg-success d-flex align-items-center';
                        elements.deviceTestStatusText.textContent = 'Online';
                    } else {
                        elements.deviceTestStatus.className = 'badge bg-danger d-flex align-items-center';
                        elements.deviceTestStatusText.textContent = 'Offline';
                    }
                }
            })
            .catch(() => {
                elements.deviceTestStatus.className = 'badge bg-secondary d-flex align-items-center';
                elements.deviceTestStatusText.textContent = 'Unknown';
            });
    }

    function viewTestDetails(runId) {
        const test = testHistory.find(t => t.runId === runId);
        if (!test) return;

        // Show details modal
        const modal = new bootstrap.Modal(document.getElementById('testDetailsModal'));
        
        document.getElementById('detailsTestName').textContent = test.name;
        document.getElementById('detailsTimestamp').textContent = new Date(test.timestamp).toLocaleString();
        document.getElementById('detailsResult').innerHTML = getStatusBadge(test.result);
        document.getElementById('detailsContent').innerHTML = 
            `<pre class="small">${JSON.stringify(test.details || test, null, 2)}</pre>`;
        
        modal.show();
    }

    function deleteTestResult(runId) {
        if (!confirm('Delete this test result?')) return;

        fetch(`/api/test/result/${runId}?deviceId=${currentDeviceId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                testHistory = testHistory.filter(t => t.runId !== runId);
                updateHistoryStats();
                displayTestHistory();
                addToConsole('Test result deleted', 'success');
            }
        })
        .catch(console.error);
    }

    function exportTestLog() {
        const log = [];
        Array.from(elements.testConsole.children).forEach(line => {
            log.push(line.textContent);
        });

        const dataStr = log.join('\n');
        const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `test-log-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        addToConsole('Test log exported', 'success');
    }

    // ==================== PERIODIC UPDATES ====================

    function startPeriodicUpdate() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            updateDeviceStatus();
        }, 5000);
    }

    function stopPeriodicUpdate() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }

    // ==================== EVENT LISTENERS ====================

    function attachEventListeners() {
        // Category change
        if (elements.testCategory) {
            elements.testCategory.addEventListener('change', updateTestList);
        }

        // Test selection change
        if (elements.testSelector) {
            elements.testSelector.addEventListener('change', showTestParameters);
        }

        // Run button
        if (elements.runTestBtn) {
            elements.runTestBtn.addEventListener('click', runSelectedTest);
        }

        // Stop button
        if (elements.stopTestBtn) {
            elements.stopTestBtn.addEventListener('click', stopCurrentTest);
        }

        // Run all button
        if (elements.runAllBtn) {
            elements.runAllBtn.addEventListener('click', runAllTests);
        }

        // Clear results button
        if (elements.clearResultsBtn) {
            elements.clearResultsBtn.addEventListener('click', clearTestResults);
        }

        // Quick test badges
        document.querySelectorAll('[onclick^="quickTest"]').forEach(el => {
            const testId = el.getAttribute('onclick').match(/'([^']+)'/)?.[1];
            if (testId) {
                el.addEventListener('click', () => quickTest(testId));
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter to run test
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                runSelectedTest();
            }
            
            // Ctrl+Shift+C to clear console
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                if (elements.testConsole) {
                    elements.testConsole.innerHTML = '';
                    addToConsole('Console cleared', 'info');
                }
            }
        });
    }

    function attachSocketListeners() {
        if (typeof socket === 'undefined') return;

        socket.off('test:progress');
        socket.on('test:progress', (data) => {
            if (data.deviceId === currentDeviceId) {
                if (elements.testProgressBar) {
                    elements.testProgressBar.style.width = `${data.progress}%`;
                    elements.testProgressBar.textContent = `${data.progress}%`;
                }
                
                if (data.message) {
                    addToConsole(data.message, 'info');
                }
            }
        });

        socket.off('test:status');
        socket.on('test:status', (data) => {
            if (data.deviceId === currentDeviceId) {
                updateTestStatus(data);
                
                if (data.status === 'completed' || data.status === 'failed') {
                    loadTestHistory();
                }
            }
        });
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        stopPeriodicUpdate();
    });

    // Expose functions globally
    window.runSelectedTest = runSelectedTest;
    window.stopCurrentTest = stopCurrentTest;
    window.runAllTests = runAllTests;
    window.clearTestResults = clearTestResults;
    window.quickTest = quickTest;
    window.exportTestLog = exportTestLog;
    window.viewTestDetails = viewTestDetails;
    window.deleteTestResult = deleteTestResult;

    console.log('Test.js initialized');
})();