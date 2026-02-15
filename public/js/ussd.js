// USSD Services JavaScript
(function () {
    'use strict';

    console.log('USSD.js loaded - ' + new Date().toISOString());

    // State
    let currentPage = 1;
    let totalPages = 1;
    let currentSession = null;
    let updateInterval = null;
    let settings = [];
    let dragEnabled = false;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing USSD page...');

        loadHistory();
        loadRecentCodes();
        loadSettings();
        loadEnabledSettings();
        checkSession();
        attachEventListeners();
        startUpdates();
        attachSocketListeners();
    }

    // ==================== HISTORY FUNCTIONS ====================

    function loadHistory(page = 1) {
        currentPage = page;

        fetch(`/api/ussd/history?page=${page}&limit=10`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    displayHistory(data.data);
                    updatePagination(data.pagination);
                } else {
                    showToast(data.message || 'Failed to load history', 'danger');
                }
            })
            .catch(error => {
                console.error('Error loading history:', error);
                showToast('Error loading USSD history', 'danger');
            });
    }

    function displayHistory(history) {
        const tableBody = document.getElementById('historyTable');
        const mobileContainer = document.getElementById('historyMobile');

        if (!tableBody || !mobileContainer) return;

        if (!history || history.length === 0) {
            const emptyHtml = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <i class="bi bi-clock-history fs-1 d-block mb-3"></i>
                        <p class="text-muted">No USSD history found</p>
                    </td>
                </tr>
            `;
            tableBody.innerHTML = emptyHtml;
            mobileContainer.innerHTML = emptyHtml;
            return;
        }

        // Desktop table
        let tableHtml = '';

        // Mobile cards
        let mobileHtml = '';

        history.forEach(item => {
            const date = new Date(item.timestamp).toLocaleString();
            const statusBadge = item.status === 'success' ? 'bg-success' :
                item.status === 'pending' ? 'bg-warning' : 'bg-danger';

            // Table row
            tableHtml += `
                <tr>
                    <td><small>${date}</small></td>
                    <td><span class="badge bg-primary">${item.code}</span></td>
                    <td>${item.description || '-'}</td>
                    <td>
                        <span class="badge ${statusBadge} me-2">${item.status}</span>
                        <small class="text-truncate" style="max-width: 200px; display: block;">
                            ${item.response ? item.response.substring(0, 50) + (item.response.length > 50 ? '...' : '') : 'Waiting for response...'}
                        </small>
                    </td>
                    <td>
                        ${item.response ? `
                        <button class="btn btn-sm btn-outline-primary" onclick='viewResponse("${item.response.replace(/"/g, '&quot;')}")'>
                            <i class="bi bi-eye"></i>
                        </button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteHistory(${item.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;

            // Mobile card
            mobileHtml += `
                <div class="card mb-2">
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="badge bg-primary">${item.code}</span>
                            <span class="badge ${statusBadge}">${item.status}</span>
                        </div>
                        <p class="mb-1"><strong>${item.description || 'USSD Request'}</strong></p>
                        <p class="mb-2 small">${item.response ? item.response.substring(0, 80) + (item.response.length > 80 ? '...' : '') : 'Waiting for response...'}</p>
                        <div class="d-flex justify-content-end gap-2">
                            ${item.response ? `
                            <button class="btn btn-sm btn-outline-primary" onclick='viewResponse("${item.response.replace(/"/g, '&quot;')}")'>
                                <i class="bi bi-eye"></i> View
                            </button>
                            ` : ''}
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteHistory(${item.id})">
                                <i class="bi bi-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        tableBody.innerHTML = tableHtml;
        mobileContainer.innerHTML = mobileHtml;
    }

    function updatePagination(pagination) {
        currentPage = pagination.page;
        totalPages = pagination.pages;

        const container = document.getElementById('historyPagination');
        if (!container) return;

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';

        // Previous
        html += `
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="loadHistory(${currentPage - 1}); return false;">Previous</a>
            </li>
        `;

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="loadHistory(${i}); return false;">${i}</a>
                    </li>
                `;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // Next
        html += `
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="loadHistory(${currentPage + 1}); return false;">Next</a>
            </li>
        `;

        container.innerHTML = html;
    }

    function deleteHistory(id) {
        if (!confirm('Delete this USSD history entry?')) return;

        fetch(`/api/ussd/history/${id}`, {
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showToast('History deleted', 'success');
                    loadHistory(currentPage);
                } else {
                    showToast(data.message || 'Failed to delete', 'danger');
                }
            })
            .catch(error => {
                console.error('Error deleting history:', error);
                showToast('Error deleting history', 'danger');
            });
    }

    function clearHistory() {
        if (!confirm('Clear all USSD history? This cannot be undone.')) return;

        fetch('/api/ussd/history', {
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showToast('All history cleared', 'success');
                    loadHistory(1);
                } else {
                    showToast(data.message || 'Failed to clear', 'danger');
                }
            })
            .catch(error => {
                console.error('Error clearing history:', error);
                showToast('Error clearing history', 'danger');
            });
    }

    // ==================== USSD DIALER FUNCTIONS ====================

    function sendUSSD() {
        const code = document.getElementById('ussdCode').value.trim();

        if (!code) {
            showToast('Please enter a USSD code', 'warning');
            return;
        }

        if (!/^[*#0-9]+$/.test(code)) {
            showToast('Invalid USSD code format', 'warning');
            return;
        }

        const responseDiv = document.getElementById('ussdResponse');
        const menuNav = document.getElementById('menuNavigation');
        const sendBtn = document.querySelector('button[onclick="sendUSSD()"]');
        const originalHtml = sendBtn?.innerHTML;

        responseDiv.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Sending USSD request...</p>
            </div>
        `;
        menuNav.style.display = 'none';

        if (sendBtn) {
            sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Sending...';
            sendBtn.disabled = true;
        }

        fetch('/api/ussd/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showToast('USSD request sent', 'success');

                    responseDiv.innerHTML = `
                    <div class="text-center py-4">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="mt-2">Waiting for response...</p>
                        <p class="text-muted small">Request ID: ${data.data.id}</p>
                    </div>
                `;

                    loadHistory(1);
                    loadRecentCodes();
                } else {
                    responseDiv.innerHTML = `
                    <div class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                        <p>${data.message || 'Failed to send USSD request'}</p>
                    </div>
                `;
                    showToast(data.message || 'Failed to send USSD', 'danger');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                responseDiv.innerHTML = `
                <div class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                    <p>Connection error: ${error.message}</p>
                    <button class="btn btn-outline-primary mt-3" onclick="sendUSSD()">Try Again</button>
                </div>
            `;
                showToast('Error sending USSD: ' + error.message, 'danger');
            })
            .finally(() => {
                if (sendBtn) {
                    sendBtn.innerHTML = originalHtml;
                    sendBtn.disabled = false;
                }
            });
    }

    function loadRecentCodes() {
        const container = document.getElementById('recentCodes');
        if (!container) return;

        fetch('/api/ussd/history?limit=5')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success && data.data.length > 0) {
                    let html = '';
                    data.data.forEach(item => {
                        html += `
                            <div class="list-group-item list-group-item-action cursor-pointer" onclick="setCode('${item.code}')">
                                <div class="d-flex justify-content-between">
                                    <span><strong>${item.code}</strong></span>
                                    <small class="text-muted">${item.description || 'USSD'}</small>
                                </div>
                            </div>
                        `;
                    });
                    container.innerHTML = html;
                } else {
                    container.innerHTML = '<div class="list-group-item text-muted">No recent codes</div>';
                }
            })
            .catch(error => {
                console.error('Error loading recent codes:', error);
                container.innerHTML = '<div class="list-group-item text-danger">Error loading codes</div>';
            });
    }

    function setCode(code) {
        document.getElementById('ussdCode').value = code;
        document.getElementById('dial-tab').click();
    }

    function quickService(code) {
        document.getElementById('ussdCode').value = code;
        document.getElementById('dial-tab').click();
        sendUSSD();
    }

    function viewResponse(response) {
        const modalResponse = document.getElementById('modalResponse');
        // Format as plain text with line breaks
        modalResponse.innerHTML = response
            .replace(/\\n/g, '<br>')
            .replace(/\\r/g, '')
            .replace(/[\\]/g, '');

        const modal = new bootstrap.Modal(document.getElementById('ussdResponseModal'));
        modal.show();
    }

    function copyResponse() {
        const response = document.getElementById('modalResponse').innerText;
        navigator.clipboard.writeText(response).then(() => {
            showToast('Response copied to clipboard', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'danger');
        });
    }

    // ==================== SETTINGS FUNCTIONS ====================

    function loadSettings() {
        fetch('/api/ussd/settings')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    settings = data.data;
                    displaySettings(data.data);
                } else {
                    showToast(data.message || 'Failed to load settings', 'danger');
                }
            })
            .catch(error => {
                console.error('Error loading settings:', error);
                showToast('Error loading USSD settings', 'danger');
            });
    }

    function loadEnabledSettings() {
        fetch('/api/ussd/settings/enabled')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    displayQuickServices(data.data);
                    displayQuickCodeSuggestions(data.data);
                }
            })
            .catch(error => {
                console.error('Error loading enabled settings:', error);
            });
    }

    function displaySettings(settings) {
        const tbody = document.getElementById('servicesTable');
        if (!tbody) return;

        if (!settings || settings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <p class="text-muted">No services configured</p>
                        <button class="btn btn-primary btn-sm" onclick="showAddServiceModal()">
                            <i class="bi bi-plus"></i> Add your first service
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        settings.forEach((service, index) => {
            html += `
                <tr data-key="${service.service_key}" data-order="${service.sort_order}">
                    <td>
                        <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
                        ${index + 1}
                    </td>
                    <td>
                        <strong>${service.service_name}</strong>
                        <br>
                        <small class="text-muted">${service.service_key}</small>
                    </td>
                    <td><code>${service.ussd_code}</code></td>
                    <td><small>${service.description || '-'}</small></td>
                    <td>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" 
                                   ${service.enabled ? 'checked' : ''} 
                                   onchange="toggleService('${service.service_key}', ${!service.enabled})">
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="editService('${service.service_key}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteService('${service.service_key}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Enable drag and drop if not already enabled
        if (!dragEnabled) {
            enableDragAndDrop();
            dragEnabled = true;
        }
    }

    function displayQuickServices(services) {
        const grid = document.getElementById('quickServicesGrid');
        if (!grid) return;

        if (!services || services.length === 0) {
            grid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-grid-3x3-gap-fill fs-1 text-muted d-block mb-3"></i>
                    <p class="text-muted">No quick services configured</p>
                    <button class="btn btn-primary" onclick="document.getElementById('settings-tab').click()">
                        <i class="bi bi-gear"></i> Go to Settings
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        services.forEach(service => {
            const icon = getIconClass(service.icon);

            html += `
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="card service-card" onclick="quickService('${service.ussd_code}')">
                        <div class="card-body text-center">
                            <div class="display-1 mb-3 text-primary">
                                <i class="bi bi-${icon}"></i>
                            </div>
                            <h5>${service.service_name}</h5>
                            <p class="text-muted small">${service.description || 'USSD Service'}</p>
                            <span class="badge bg-primary">${service.ussd_code}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    function displayQuickCodeSuggestions(services) {
        const container = document.getElementById('quickCodeSuggestions');
        if (!container) return;

        if (!services || services.length === 0) {
            container.innerHTML = '<span class="text-muted">No quick codes available</span>';
            return;
        }

        let html = '';
        services.slice(0, 6).forEach(service => {
            html += `
                <span class="badge bg-light text-dark p-2 cursor-pointer" onclick="setCode('${service.ussd_code}')">
                    ${service.ussd_code}
                </span>
            `;
        });

        container.innerHTML = html;
    }

    function toggleService(key, enabled) {
        fetch(`/api/ussd/settings/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showToast(`Service ${enabled ? 'enabled' : 'disabled'}`, 'success');
                    loadSettings();
                    loadEnabledSettings();
                } else {
                    showToast(data.message || 'Failed to toggle service', 'danger');
                    // Revert checkbox
                    const checkbox = document.querySelector(`input[onchange*="toggleService('${key}'"]`);
                    if (checkbox) {
                        checkbox.checked = !enabled;
                    }
                }
            })
            .catch(error => {
                console.error('Error toggling service:', error);
                showToast('Error toggling service', 'danger');
                // Revert checkbox
                const checkbox = document.querySelector(`input[onchange*="toggleService('${key}'"]`);
                if (checkbox) {
                    checkbox.checked = !enabled;
                }
            });
    }

    function showAddServiceModal() {
        document.getElementById('serviceModalTitle').textContent = 'Add New Service';
        document.getElementById('serviceForm').reset();
        document.getElementById('serviceKey').value = '';
        document.getElementById('serviceKeyInput').value = '';
        document.getElementById('serviceKeyInput').readOnly = false;
        document.getElementById('deleteServiceBtn').style.display = 'none';
        document.getElementById('enabledInput').checked = true;

        const modal = new bootstrap.Modal(document.getElementById('serviceModal'));
        modal.show();
    }

    function editService(key) {
        const service = settings.find(s => s.service_key === key);
        if (!service) return;

        document.getElementById('serviceModalTitle').textContent = 'Edit Service';
        document.getElementById('serviceKey').value = service.service_key;
        document.getElementById('serviceKeyInput').value = service.service_key;
        document.getElementById('serviceKeyInput').readOnly = true;
        document.getElementById('serviceNameInput').value = service.service_name;
        document.getElementById('ussdCodeInput').value = service.ussd_code;
        document.getElementById('descriptionInput').value = service.description || '';
        document.getElementById('iconInput').value = service.icon || 'question';
        document.getElementById('enabledInput').checked = service.enabled === 1;
        document.getElementById('deleteServiceBtn').style.display = 'inline-block';

        const modal = new bootstrap.Modal(document.getElementById('serviceModal'));
        modal.show();
    }

    function saveService() {
        const key = document.getElementById('serviceKey').value;
        const data = {
            service_key: document.getElementById('serviceKeyInput').value.trim(),
            service_name: document.getElementById('serviceNameInput').value.trim(),
            ussd_code: document.getElementById('ussdCodeInput').value.trim(),
            description: document.getElementById('descriptionInput').value.trim(),
            icon: document.getElementById('iconInput').value,
            enabled: document.getElementById('enabledInput').checked
        };

        // Validate
        if (!data.service_key || !data.service_name || !data.ussd_code) {
            showToast('Please fill in all required fields', 'warning');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(data.service_key)) {
            showToast('Service key must be lowercase letters, numbers, and hyphens only', 'warning');
            return;
        }

        if (!/^[*#0-9]+$/.test(data.ussd_code)) {
            showToast('USSD code must contain only numbers, *, and #', 'warning');
            return;
        }

        const saveBtn = document.querySelector('button[onclick="saveService()"]');
        const originalHtml = saveBtn?.innerHTML;

        if (saveBtn) {
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Saving...';
            saveBtn.disabled = true;
        }

        const url = key ? `/api/ussd/settings/${key}` : '/api/ussd/settings';
        const method = key ? 'PUT' : 'POST';

        fetch(url, {
            method,
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
                    showToast(key ? 'Service updated' : 'Service created', 'success');

                    const modal = bootstrap.Modal.getInstance(document.getElementById('serviceModal'));
                    if (modal) modal.hide();

                    loadSettings();
                    loadEnabledSettings();
                } else {
                    showToast(data.message || 'Failed to save service', 'danger');
                }
            })
            .catch(error => {
                console.error('Error saving service:', error);
                showToast('Error saving service: ' + error.message, 'danger');
            })
            .finally(() => {
                if (saveBtn) {
                    saveBtn.innerHTML = originalHtml;
                    saveBtn.disabled = false;
                }
            });
    }

    function deleteService(key) {
        if (!confirm('Delete this service? This cannot be undone.')) return;

        fetch(`/api/ussd/settings/${key}`, {
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showToast('Service deleted', 'success');

                    const modal = bootstrap.Modal.getInstance(document.getElementById('serviceModal'));
                    if (modal) modal.hide();

                    loadSettings();
                    loadEnabledSettings();
                } else {
                    showToast(data.message || 'Failed to delete service', 'danger');
                }
            })
            .catch(error => {
                console.error('Error deleting service:', error);
                showToast('Error deleting service', 'danger');
            });
    }

    // ==================== SOCKET LISTENERS ====================

    function attachSocketListeners() {
        if (typeof socket === 'undefined') {
            console.warn('Socket not available');
            return;
        }

        socket.off('ussd:response');
        socket.off('ussd:settings-updated');
        socket.off('ussd:settings-created');
        socket.off('ussd:settings-deleted');
        socket.off('ussd:settings-reordered');

        socket.on('ussd:response', (data) => {
            console.log('USSD response received:', data);

            // Update response display
            const responseDiv = document.getElementById('ussdResponse');
            if (responseDiv) {
                const formattedResponse = data.response.replace(/\n/g, '<br>');
                responseDiv.innerHTML = `
                    <div class="border-start border-primary border-4 ps-3">
                        <small class="text-muted">${new Date().toLocaleString()}</small>
                        <div class="mt-2" style="font-family: monospace;">${formattedResponse}</div>
                    </div>
                `;
            }

            showToast('New USSD response received', 'info');
            loadHistory(1);
            loadRecentCodes();
        });

        socket.on('ussd:settings-updated', () => {
            loadSettings();
            loadEnabledSettings();
        });

        socket.on('ussd:settings-created', () => {
            loadSettings();
            loadEnabledSettings();
        });

        socket.on('ussd:settings-deleted', () => {
            loadSettings();
            loadEnabledSettings();
        });

        socket.on('ussd:settings-reordered', () => {
            loadSettings();
            loadEnabledSettings();
        });
    }

    function startUpdates() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(checkSession, 30000);
    }

    function checkSession() {
        fetch('/api/ussd/session')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data.active) {
                    currentSession = data.data;
                    document.getElementById('sessionStatus').textContent =
                        `Session Active (Level ${data.data.menuLevel})`;
                    document.getElementById('sessionStatus').className = 'badge bg-success';
                    document.getElementById('endSessionBtn').style.display = 'inline-block';

                    // Show menu if applicable
                    if (data.data.menuOptions && data.data.menuOptions.length > 0) {
                        showMenuOptions(data.data.menuOptions);
                    }
                } else {
                    document.getElementById('sessionStatus').textContent = 'No Active Session';
                    document.getElementById('sessionStatus').className = 'badge bg-info';
                    document.getElementById('endSessionBtn').style.display = 'none';
                    document.getElementById('menuNavigation').style.display = 'none';
                }
            })
            .catch(console.error);
    }

    function endSession() {
        fetch('/api/ussd/session/end', {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentSession = null;
                    document.getElementById('sessionStatus').textContent = 'No Active Session';
                    document.getElementById('sessionStatus').className = 'badge bg-info';
                    document.getElementById('endSessionBtn').style.display = 'none';
                    document.getElementById('menuNavigation').style.display = 'none';
                    showToast('Session ended', 'success');
                }
            })
            .catch(console.error);
    }

    function refreshUssdData() {
        loadHistory(currentPage);
        loadRecentCodes();
        loadSettings();
        loadEnabledSettings();
        checkSession();
        showToast('USSD data refreshed', 'success');
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // Helper functions
    function getIconClass(icon) {
        const icons = {
            'cash-stack': 'cash-stack',
            'wifi': 'wifi',
            'telephone': 'telephone',
            'chat-dots': 'chat-dots',
            'gift': 'gift',
            'box': 'box',
            'headset': 'headset',
            'phone': 'phone',
            'star': 'star',
            'arrow-left-right': 'arrow-left-right',
            'question': 'question-circle'
        };
        return icons[icon] || 'question-circle';
    }

    function attachEventListeners() {
        // Enter key in USSD input
        const ussdInput = document.getElementById('ussdCode');
        if (ussdInput) {
            ussdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendUSSD();
                }
            });
        }

        // Tab change events
        const settingsTab = document.getElementById('settings-tab');
        if (settingsTab) {
            settingsTab.addEventListener('shown.bs.tab', () => {
                loadSettings();
            });
        }

        const quickTab = document.getElementById('quick-tab');
        if (quickTab) {
            quickTab.addEventListener('shown.bs.tab', () => {
                loadEnabledSettings();
            });
        }
    }

    function enableDragAndDrop() {
        const tbody = document.getElementById('servicesTable');
        if (!tbody) return;

        let draggingRow = null;

        tbody.querySelectorAll('tr').forEach(row => {
            row.setAttribute('draggable', 'true');

            row.addEventListener('dragstart', (e) => {
                draggingRow = row;
                e.dataTransfer.setData('text/plain', row.dataset.key);
                row.classList.add('bg-light', 'opacity-50');
                e.stopPropagation();
            });

            row.addEventListener('dragend', (e) => {
                if (draggingRow) {
                    draggingRow.classList.remove('bg-light', 'opacity-50');
                }
                draggingRow = null;
                e.stopPropagation();
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                row.classList.add('bg-info', 'bg-opacity-10');
            });

            row.addEventListener('dragleave', (e) => {
                row.classList.remove('bg-info', 'bg-opacity-10');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                row.classList.remove('bg-info', 'bg-opacity-10');

                if (!draggingRow || draggingRow === row) return;

                const keys = Array.from(tbody.querySelectorAll('tr')).map(r => r.dataset.key);
                const draggedKey = draggingRow.dataset.key;
                const targetKey = row.dataset.key;

                const draggedIndex = keys.indexOf(draggedKey);
                const targetIndex = keys.indexOf(targetKey);

                // Reorder array
                keys.splice(draggedIndex, 1);
                keys.splice(targetIndex, 0, draggedKey);

                // Send new order to server
                const saveIndicator = document.getElementById('orderSaveIndicator');
                if (saveIndicator) saveIndicator.style.display = 'block';

                fetch('/api/ussd/settings/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order: keys })
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.success) {
                            showToast('Services reordered', 'success');
                            loadSettings();
                            loadEnabledSettings();
                        } else {
                            showToast(data.message || 'Failed to save order', 'danger');
                        }
                    })
                    .catch(error => {
                        console.error('Error saving order:', error);
                        showToast('Error saving order', 'danger');
                    })
                    .finally(() => {
                        if (saveIndicator) saveIndicator.style.display = 'none';
                    });
            });
        });
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
        if (updateInterval) clearInterval(updateInterval);
    });

    // ==================== EXPORT ALL FUNCTIONS TO WINDOW ====================

    window.loadHistory = loadHistory;
    window.deleteHistory = deleteHistory;
    window.clearHistory = clearHistory;
    window.sendUSSD = sendUSSD;
    window.endSession = endSession;
    window.setCode = setCode;
    window.quickService = quickService;
    window.viewResponse = viewResponse;
    window.copyResponse = copyResponse;
    window.toggleService = toggleService;
    window.showAddServiceModal = showAddServiceModal;
    window.editService = editService;
    window.saveService = saveService;
    window.deleteService = deleteService;
    window.refreshUssdData = refreshUssdData;

    console.log('All USSD functions exported to window');
})();