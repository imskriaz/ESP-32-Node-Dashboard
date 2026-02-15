// Calls page specific functionality with contacts integration
(function () {
    'use strict';

    console.log('Calls.js loaded - ' + new Date().toISOString());

    // State
    let currentPage = 1;
    let totalPages = 1;
    let totalCalls = 0;
    let callStatusInterval = null;
    let contacts = [];
    let filteredContacts = [];
    let isDeviceConnected = <%= isDeviceConnected %>; // Pass from server

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Calls page...');
        console.log('Device connected:', isDeviceConnected);

        // Load initial data
        loadCallLogs();
        loadContacts();
        loadStats();
        
        // Only start call status check if device is connected
        if (isDeviceConnected) {
            startCallStatusCheck();
        }

        // Attach event listeners
        attachDialerListeners();
        attachSearchAndFilter();
        attachModalListeners();
    }

    // ==================== CONNECTION CHECK ====================
    function checkDeviceConnection() {
        if (!isDeviceConnected) {
            showToast('Device is offline. Call functions are disabled.', 'warning');
            return false;
        }
        return true;
    }

    // Load call logs
    function loadCallLogs(page = 1) {
        currentPage = page;

        fetch(`/api/calls/logs?page=${page}&limit=10`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayCallLogs(data.data);
                    updatePagination(data.pagination);
                    updateStats(data.data);
                }
            })
            .catch(error => {
                console.error('Error loading call logs:', error);
                showError('Failed to load call logs');
            });
    }

    // Display call logs
    function displayCallLogs(calls) {
        const tableBody = document.getElementById('callsTableBody');
        const mobileList = document.getElementById('callsMobileList');

        if (!tableBody || !mobileList) return;

        if (!calls || calls.length === 0) {
            const emptyHtml = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <i class="bi bi-telephone-x fs-1 text-muted d-block mb-3"></i>
                        <p class="text-muted mb-0">No call logs found</p>
                        <button class="btn btn-primary mt-3" data-bs-toggle="modal" data-bs-target="#dialerModal" 
                                ${!isDeviceConnected ? 'disabled' : ''}>
                            <i class="bi bi-telephone-plus me-2"></i>Make a Call
                        </button>
                    </td>
                </tr>
            `;
            tableBody.innerHTML = emptyHtml;
            mobileList.innerHTML = emptyHtml;
            return;
        }

        // Desktop table view
        let tableHtml = '';

        // Mobile cards view
        let mobileHtml = '';

        calls.forEach(call => {
            const contact = findContactByNumber(call.phone_number);
            const contactName = contact ? contact.name : 'Unknown';
            const icon = getCallIcon(call.type, call.status);
            const statusClass = getStatusClass(call.status);
            const statusBadge = getStatusBadge(call.status);
            const statusText = getStatusText(call.status);

            // Table row
            tableHtml += `
                <tr data-call-id="${call.id}">
                    <td>
                        <i class="bi ${icon} fs-5 ${statusClass}"></i>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="bg-light rounded-circle p-2 me-2">
                                <i class="bi bi-person-circle"></i>
                            </div>
                            <div>
                                <div class="fw-bold">${contactName}</div>
                                ${contact && contact.company ? `<small class="text-muted">${contact.company}</small>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>${call.phone_number}</td>
                    <td>${formatDate(call.start_time)}</td>
                    <td>${formatDuration(call.duration)}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-success" onclick="quickCall('${call.phone_number}')" 
                                    ${!isDeviceConnected ? 'disabled' : ''}>
                                <i class="bi bi-telephone"></i>
                            </button>
                            <button class="btn btn-outline-info" onclick="quickSms('${call.phone_number}')">
                                <i class="bi bi-chat-dots"></i>
                            </button>
                            <button class="btn btn-outline-primary" onclick="editContactFromNumber('${call.phone_number}')">
                                <i class="bi bi-person-plus"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="deleteCallLog(${call.id})">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;

            // Mobile card
            mobileHtml += `
                <div class="card mb-2" data-call-id="${call.id}">
                    <div class="card-body">
                        <div class="d-flex align-items-start gap-3">
                            <div class="flex-shrink-0">
                                <div class="bg-light rounded-circle p-2">
                                    <i class="bi ${icon} fs-4 ${statusClass}"></i>
                                </div>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between mb-1">
                                    <h6 class="mb-0">${contactName}</h6>
                                    <small class="text-muted">${formatDate(call.start_time)}</small>
                                </div>
                                <p class="mb-1 small">${call.phone_number}</p>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <span class="badge ${statusBadge} me-2">${statusText}</span>
                                        <small class="text-muted">${formatDuration(call.duration)}</small>
                                    </div>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-success" onclick="quickCall('${call.phone_number}')" 
                                                ${!isDeviceConnected ? 'disabled' : ''}>
                                            <i class="bi bi-telephone"></i>
                                        </button>
                                        <button class="btn btn-outline-danger" onclick="deleteCallLog(${call.id})">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        tableBody.innerHTML = tableHtml;
        mobileList.innerHTML = mobileHtml;
    }

    // Load contacts
    function loadContacts() {
        fetch('/api/contacts?limit=100')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    contacts = data.data;
                    filteredContacts = contacts;
                    displayContacts();
                    displaySpeedDial();
                    displayFavorites();
                    displayQuickContacts();
                    updateContactCount();
                }
            })
            .catch(error => console.error('Error loading contacts:', error));
    }

    // Display contacts in contacts tab
    function displayContacts() {
        const container = document.getElementById('contactsList');
        if (!container) return;

        if (filteredContacts.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-person-lines-fill fs-1 text-muted"></i>
                    <p class="text-muted mt-3 mb-0">No contacts found</p>
                    <button class="btn btn-primary mt-3" onclick="showAddContactModal()">
                        <i class="bi bi-person-plus me-2"></i>Add Contact
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        filteredContacts.forEach(contact => {
            const favorite = contact.favorite ? '<i class="bi bi-star-fill text-warning ms-2"></i>' : '';
            html += `
                <div class="list-group-item list-group-item-action" data-contact-id="${contact.id}">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 me-3">
                            <div class="bg-light rounded-circle p-3">
                                <i class="bi bi-person-circle fs-4"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between">
                                <h6 class="mb-1">${contact.name} ${favorite}</h6>
                                ${contact.company ? `<small class="text-muted">${contact.company}</small>` : ''}
                            </div>
                            <p class="mb-1 small">${contact.phone_number}</p>
                            ${contact.email ? `<small class="text-muted">${contact.email}</small>` : ''}
                        </div>
                        <div class="btn-group btn-group-sm ms-2">
                            <button class="btn btn-outline-success" onclick="quickCall('${contact.phone_number}')" 
                                    ${!isDeviceConnected ? 'disabled' : ''} title="Call">
                                <i class="bi bi-telephone"></i>
                            </button>
                            <button class="btn btn-outline-primary" onclick="editContact(${contact.id})" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Add search listener
        const searchInput = document.getElementById('contactSearch');
        if (searchInput) {
            searchInput.removeEventListener('input', filterContacts);
            searchInput.addEventListener('input', filterContacts);
        }
    }

    // Display speed dial (top contacts)
    function displaySpeedDial() {
        const container = document.getElementById('speedDialGrid');
        if (!container) return;

        const topContacts = contacts.filter(c => c.favorite).slice(0, 8);

        if (topContacts.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-4">
                    <p class="text-muted">No speed dial contacts. Add favorites first.</p>
                </div>
            `;
            return;
        }

        let html = '';
        topContacts.forEach(contact => {
            html += `
                <div class="col-6 col-md-3">
                    <div class="speed-dial-card" onclick="quickCall('${contact.phone_number}')" 
                         style="${!isDeviceConnected ? 'cursor: not-allowed; opacity: 0.5;' : ''}">
                        <i class="bi bi-person-circle text-primary"></i>
                        <div class="fw-bold text-truncate">${contact.name}</div>
                        <small class="text-muted text-truncate d-block">${contact.phone_number}</small>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Display favorites
    function displayFavorites() {
        const container = document.getElementById('favoritesList');
        if (!container) return;

        const favorites = contacts.filter(c => c.favorite);

        if (favorites.length === 0) {
            container.innerHTML = `
                <div class="list-group-item text-center py-4">
                    <p class="text-muted mb-0">No favorites yet</p>
                </div>
            `;
            return;
        }

        let html = '';
        favorites.slice(0, 5).forEach(contact => {
            html += `
                <div class="list-group-item list-group-item-action" onclick="quickCall('${contact.phone_number}')" 
                     style="${!isDeviceConnected ? 'cursor: not-allowed; opacity: 0.5;' : ''}">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 me-2">
                            <i class="bi bi-star-fill text-warning"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="fw-bold">${contact.name}</div>
                            <small class="text-muted">${contact.phone_number}</small>
                        </div>
                        <i class="bi bi-telephone text-success"></i>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Display quick contacts in dialer modal
    function displayQuickContacts() {
        const container = document.getElementById('quickContacts');
        if (!container) return;

        const quickList = contacts.slice(0, 5);

        if (quickList.length === 0) {
            container.innerHTML = '<small class="text-muted">No contacts available</small>';
            return;
        }

        let html = '';
        quickList.forEach(contact => {
            html += `
                <span class="contact-chip" onclick="selectContact('${contact.phone_number}')" 
                      style="${!isDeviceConnected ? 'cursor: not-allowed; opacity: 0.5;' : ''}">
                    <i class="bi bi-person-circle"></i>
                    <span>${contact.name}</span>
                </span>
            `;
        });

        container.innerHTML = html;
    }

    // Update contact count badge
    function updateContactCount() {
        const badge = document.getElementById('contactCount');
        if (badge) {
            badge.textContent = contacts.length;
        }
    }

    // Load stats
    function loadStats() {
        fetch('/api/calls/logs?limit=1')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.pagination) {
                    totalCalls = data.pagination.total;
                }
            })
            .catch(console.error);
    }

    // Update stats based on calls
    function updateStats(calls) {
        const outgoing = calls.filter(c => c.type === 'outgoing').length;
        const incoming = calls.filter(c => c.type === 'incoming').length;
        const missed = calls.filter(c => c.status === 'missed').length;

        document.getElementById('totalCalls').textContent = totalCalls;
        document.getElementById('outgoingCalls').textContent = outgoing;
        document.getElementById('incomingCalls').textContent = incoming;
        document.getElementById('missedCalls').textContent = missed;
    }

    // Find contact by phone number
    function findContactByNumber(number) {
        const cleanNumber = number.replace(/\D/g, '');
        return contacts.find(c => {
            const cleanContact = c.phone_number.replace(/\D/g, '');
            return cleanContact.includes(cleanNumber) || cleanNumber.includes(cleanContact);
        });
    }

    // Attach dialer listeners
    function attachDialerListeners() {
        // Dialer buttons
        document.querySelectorAll('.dialer-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const number = this.dataset.number;
                appendToDialer(number);
            });
        });

        // Clear button
        const clearBtn = document.getElementById('clearNumber');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                document.getElementById('dialerNumber').value = '';
                document.getElementById('contactName').textContent = '';
            });
        }

        // Make call button
        const makeCallBtn = document.getElementById('makeCall');
        if (makeCallBtn) {
            makeCallBtn.addEventListener('click', function () {
                const number = document.getElementById('dialerNumber').value;
                if (number) {
                    makeCall(number);
                } else {
                    showToast('Please enter a number', 'warning');
                }
            });
        }
    }

    // Append digit to dialer
    function appendToDialer(digit) {
        const input = document.getElementById('dialerNumber');
        input.value += digit;

        // Try to find matching contact
        const number = input.value;
        const contact = findContactByNumber(number);
        const contactNameEl = document.getElementById('contactName');

        if (contact) {
            contactNameEl.textContent = contact.name;
            contactNameEl.classList.add('text-success');
        } else {
            contactNameEl.textContent = '';
        }

        updateNumberHint(number);
    }

    // Update number hint
    function updateNumberHint(number) {
        const hint = document.getElementById('numberHint');
        const digits = number.replace(/\D/g, '');

        if (digits.length === 10) {
            hint.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> Valid number';
        } else if (digits.length > 10) {
            hint.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-warning"></i> Number too long';
        } else {
            hint.innerHTML = '<i class="bi bi-info-circle"></i> Enter 10-digit number';
        }
    }

    // ==================== FIXED: Make a call with connection check ====================
    function makeCall(number) {
        // Check device connection first
        if (!checkDeviceConnection()) {
            return;
        }

        const formattedNumber = formatNumber(number);

        fetch('/api/calls/dial', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ number: formattedNumber })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call initiated', 'success');
                    showActiveCallBanner(formattedNumber, 'dialing');

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('dialerModal'));
                    if (modal) modal.hide();
                } else {
                    showToast(data.message || 'Failed to make call', 'danger');
                }
            })
            .catch(error => {
                console.error('Error making call:', error);
                showToast('Error making call', 'danger');
            });
    }

    // ==================== FIXED: End call with connection check ====================
    function endCall() {
        // Check device connection first
        if (!checkDeviceConnection()) {
            return;
        }

        fetch('/api/calls/end', {
            method: 'POST'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call ended', 'info');
                    hideActiveCallBanner();
                    loadCallLogs(currentPage);
                } else {
                    showToast(data.message || 'Failed to end call', 'danger');
                }
            })
            .catch(error => {
                console.error('Error ending call:', error);
                showToast('Error ending call', 'danger');
            });
    }

    // ==================== FIXED: Mute call with connection check ====================
    window.muteCall = function () {
        if (!checkDeviceConnection()) return;

        const muteBtn = document.querySelector('button[onclick="muteCall()"]');
        const isMuted = muteBtn.classList.contains('active');

        fetch('/api/calls/mute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mute: !isMuted })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (!isMuted) {
                    muteBtn.classList.add('active', 'btn-success');
                    muteBtn.classList.remove('btn-outline-success');
                    muteBtn.innerHTML = '<i class="bi bi-mic-mute"></i> Unmute';
                    showToast('Microphone muted', 'warning');
                } else {
                    muteBtn.classList.remove('active', 'btn-success');
                    muteBtn.classList.add('btn-outline-success');
                    muteBtn.innerHTML = '<i class="bi bi-mic-mute"></i> Mute';
                    showToast('Microphone unmuted', 'info');
                }
            } else {
                showToast(data.message || 'Failed to toggle mute', 'danger');
            }
        })
        .catch(error => {
            console.error('Error toggling mute:', error);
            showToast('Error toggling mute', 'danger');
        });
    };

    // ==================== FIXED: Hold call with connection check ====================
    window.holdCall = function () {
        if (!checkDeviceConnection()) return;

        const holdBtn = document.querySelector('button[onclick="holdCall()"]');
        const isOnHold = holdBtn.classList.contains('active');

        fetch('/api/calls/hold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hold: !isOnHold })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (!isOnHold) {
                    holdBtn.classList.add('active', 'btn-warning');
                    holdBtn.classList.remove('btn-outline-primary');
                    holdBtn.innerHTML = '<i class="bi bi-pause"></i> Resume';
                    showToast('Call on hold', 'info');
                } else {
                    holdBtn.classList.remove('active', 'btn-warning');
                    holdBtn.classList.add('btn-outline-primary');
                    holdBtn.innerHTML = '<i class="bi bi-pause"></i> Hold';
                    showToast('Call resumed', 'info');
                }
            } else {
                showToast(data.message || 'Failed to toggle hold', 'danger');
            }
        })
        .catch(error => {
            console.error('Error toggling hold:', error);
            showToast('Error toggling hold', 'danger');
        });
    };

    // ==================== FIXED: Quick call with connection check ====================
    window.quickCall = function (number) {
        if (!number) return;
        
        if (!checkDeviceConnection()) {
            return;
        }

        // Use SweetAlert2 or Bootstrap modal for better UX
        if (confirm(`Call ${number}?`)) {
            const callBtn = event?.target?.closest('button');
            const originalHtml = callBtn?.innerHTML;
            
            if (callBtn) {
                callBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
                callBtn.disabled = true;
            }

            fetch('/api/calls/dial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: number })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call initiated', 'success');
                    // Close any open modals
                    const dialerModal = bootstrap.Modal.getInstance(document.getElementById('dialerModal'));
                    if (dialerModal) dialerModal.hide();
                    
                    // Start checking call status
                    startCallStatusCheck();
                } else {
                    showToast(data.message || 'Failed to make call', 'danger');
                }
            })
            .catch(error => {
                console.error('Error making call:', error);
                showToast('Error making call', 'danger');
            })
            .finally(() => {
                if (callBtn) {
                    callBtn.innerHTML = originalHtml;
                    callBtn.disabled = false;
                }
            });
        }
    };

    window.quickSms = function (number) {
        if (!number) return;

        // Open compose modal with number pre-filled
        document.getElementById('modalTo').value = number;
        const modal = new bootstrap.Modal(document.getElementById('composeSmsModal'));
        modal.show();
    };

    // Show active call banner
    function showActiveCallBanner(number, status, duration = 0) {
        const banner = document.getElementById('activeCallBanner');
        if (!banner) return;

        banner.classList.remove('d-none');
        document.getElementById('activeCallNumber').textContent = number;
        document.getElementById('activeCallStatus').textContent = getStatusText(status);
        document.getElementById('activeCallDuration').textContent = formatDuration(duration);
    }

    // Hide active call banner
    function hideActiveCallBanner() {
        const banner = document.getElementById('activeCallBanner');
        if (banner) {
            banner.classList.add('d-none');
        }
    }

    // Start call status check
    function startCallStatusCheck() {
        if (callStatusInterval) {
            clearInterval(callStatusInterval);
        }
        callStatusInterval = setInterval(checkCallStatus, 2000);
    }

    // Check call status
    function checkCallStatus() {
        if (!isDeviceConnected) {
            // If device goes offline during call, hide banner
            hideActiveCallBanner();
            if (callStatusInterval) {
                clearInterval(callStatusInterval);
                callStatusInterval = null;
            }
            return;
        }

        fetch('/api/calls/status')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data.active) {
                    showActiveCallBanner(data.data.number, data.data.status, data.data.duration);
                } else {
                    hideActiveCallBanner();
                }
            })
            .catch(console.error);
    }

    // Delete call log
    function deleteCallLog(id) {
        if (!confirm('Delete this call record?')) return;

        fetch(`/api/calls/logs/${id}`, {
            method: 'DELETE'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call log deleted', 'success');
                    loadCallLogs(currentPage);
                }
            })
            .catch(console.error);
    }

    // Clear all calls
    function clearAllCalls() {
        if (!confirm('Delete all call logs? This cannot be undone.')) return;

        // This would need a bulk delete endpoint
        showToast('Feature coming soon', 'info');
    }

    // Refresh calls
    function refreshCalls() {
        loadCallLogs(currentPage);
    }

    // Attach search and filter
    function attachSearchAndFilter() {
        const searchInput = document.getElementById('searchCalls');
        const filterSelect = document.getElementById('filterCallType');
        const sortSelect = document.getElementById('sortCalls');

        if (searchInput) {
            searchInput.addEventListener('input', debounce(filterCalls, 300));
        }

        if (filterSelect) {
            filterSelect.addEventListener('change', filterCalls);
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', sortCalls);
        }
    }

    // Filter calls
    function filterCalls() {
        const searchTerm = document.getElementById('searchCalls')?.value.toLowerCase() || '';
        const filterType = document.getElementById('filterCallType')?.value || 'all';

        document.querySelectorAll('#callsTableBody tr, #callsMobileList .card').forEach(item => {
            const text = item.textContent.toLowerCase();
            const type = item.querySelector('.call-type')?.dataset.type || '';

            const matchesSearch = text.includes(searchTerm);
            const matchesFilter = filterType === 'all' || text.includes(filterType);

            if (matchesSearch && matchesFilter) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Sort calls
    function sortCalls() {
        const sortOrder = document.getElementById('sortCalls')?.value || 'newest';
        // Implementation depends on your data structure
    }

    window.filterContactsByCompany = function (company) {
        if (!company) {
            filteredContacts = contacts;
        } else {
            filteredContacts = contacts.filter(c => c.company === company);
        }
        displayContacts();

        // Update active badge
        document.querySelectorAll('#contactCompanyFilters .badge').forEach(badge => {
            badge.classList.remove('bg-primary');
            badge.classList.add('bg-secondary');
        });

        const activeBadge = event?.target;
        if (activeBadge) {
            activeBadge.classList.remove('bg-secondary');
            activeBadge.classList.add('bg-primary');
        }
    };

    // Filter contacts by search
    function filterContacts() {
        const searchTerm = document.getElementById('contactSearch')?.value.toLowerCase() || '';
        const company = document.getElementById('modalContactCompany')?.value || '';

        filteredContacts = contacts.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm) ||
                c.phone_number.includes(searchTerm);
            const matchesCompany = !company || c.company === company;
            return matchesSearch && matchesCompany;
        });

        displayContacts();
    }

    // Attach modal listeners
    function attachModalListeners() {
        // Save contact button
        const saveBtn = document.getElementById('saveContactBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveContact);
        }

        // Delete contact button
        const deleteBtn = document.getElementById('deleteContactBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', deleteContact);
        }

        // Contacts modal search
        const modalSearch = document.getElementById('modalContactSearch');
        if (modalSearch) {
            modalSearch.addEventListener('input', debounce(filterModalContacts, 300));
        }

        // Contacts modal company filter
        const modalCompany = document.getElementById('modalContactCompany');
        if (modalCompany) {
            modalCompany.addEventListener('change', filterModalContacts);
        }
    }

    // Filter modal contacts
    function filterModalContacts() {
        const searchTerm = document.getElementById('modalContactSearch')?.value.toLowerCase() || '';
        const company = document.getElementById('modalContactCompany')?.value || '';

        const filtered = contacts.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm) ||
                c.phone_number.includes(searchTerm);
            const matchesCompany = !company || c.company === company;
            return matchesSearch && matchesCompany;
        });

        displayModalContacts(filtered);
    }

    // Display contacts in modal
    function displayModalContacts(contactsList) {
        const container = document.getElementById('modalContactsList');
        if (!container) return;

        if (contactsList.length === 0) {
            container.innerHTML = '<div class="text-center py-4">No contacts found</div>';
            return;
        }

        let html = '';
        contactsList.forEach(contact => {
            html += `
                <div class="list-group-item list-group-item-action" data-contact-id="${contact.id}">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 me-3">
                            <i class="bi bi-person-circle fs-3"></i>
                        </div>
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${contact.name}</h6>
                            <p class="mb-0 small">${contact.phone_number}</p>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-success" onclick="quickCall('${contact.phone_number}')" 
                                    ${!isDeviceConnected ? 'disabled' : ''}>
                                <i class="bi bi-telephone"></i>
                            </button>
                            <button class="btn btn-outline-primary" onclick="editContact(${contact.id})">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    window.showAddContactModal = function (phoneNumber = '') {
        document.getElementById('contactModalTitle').textContent = 'Add New Contact';
        document.getElementById('contactId').value = '';
        document.getElementById('contactForm').reset();
        document.getElementById('deleteContactBtn').classList.add('d-none');

        if (phoneNumber) {
            document.getElementById('contactPhone').value = phoneNumber;
        }

        const modal = new bootstrap.Modal(document.getElementById('addContactModal'));
        modal.show();
    };

    // Edit contact
    function editContact(id) {
        fetch(`/api/contacts/${id}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const contact = data.data;
                    document.getElementById('contactId').value = contact.id;
                    document.getElementById('contactName').value = contact.name;
                    document.getElementById('contactPhone').value = contact.phone_number;
                    document.getElementById('contactEmail').value = contact.email || '';
                    document.getElementById('contactCompany').value = contact.company || '';
                    document.getElementById('contactFavorite').checked = contact.favorite === 1;
                    document.getElementById('contactNotes').value = contact.notes || '';

                    document.getElementById('contactModalTitle').textContent = 'Edit Contact';
                    document.getElementById('deleteContactBtn').classList.remove('d-none');

                    const modal = new bootstrap.Modal(document.getElementById('addContactModal'));
                    modal.show();
                }
            })
            .catch(console.error);
    }

    // Edit contact from number
    function editContactFromNumber(number) {
        const contact = findContactByNumber(number);
        if (contact) {
            editContact(contact.id);
        } else {
            document.getElementById('contactPhone').value = number;
            showAddContactModal();
        }
    }

    // Save contact
    function saveContact() {
        const id = document.getElementById('contactId').value;
        const data = {
            name: document.getElementById('contactName').value,
            phone_number: document.getElementById('contactPhone').value,
            email: document.getElementById('contactEmail').value,
            company: document.getElementById('contactCompany').value,
            favorite: document.getElementById('contactFavorite').checked,
            notes: document.getElementById('contactNotes').value
        };

        if (!data.name || !data.phone_number) {
            showToast('Name and phone number are required', 'warning');
            return;
        }

        const url = id ? `/api/contacts/${id}` : '/api/contacts';
        const method = id ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(id ? 'Contact updated' : 'Contact created', 'success');

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addContactModal'));
                    if (modal) modal.hide();

                    // Reload contacts
                    loadContacts();
                } else {
                    showToast('Failed to save contact', 'danger');
                }
            })
            .catch(console.error);
    }

    // Delete contact
    function deleteContact() {
        const id = document.getElementById('contactId').value;
        if (!id || !confirm('Delete this contact?')) return;

        fetch(`/api/contacts/${id}`, {
            method: 'DELETE'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Contact deleted', 'success');

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addContactModal'));
                    if (modal) modal.hide();

                    // Reload contacts
                    loadContacts();
                }
            })
            .catch(console.error);
    }

    // Select contact for dialer
    function selectContact(number) {
        document.getElementById('dialerNumber').value = number;
        const contact = findContactByNumber(number);
        if (contact) {
            document.getElementById('contactName').textContent = contact.name;
        }
    }

    // Load more contacts
    function loadMoreContacts() {
        const modal = new bootstrap.Modal(document.getElementById('contactsModal'));
        modal.show();
        loadContacts(); // Refresh contacts
    }

    // Update pagination
    function updatePagination(pagination) {
        currentPage = pagination.page;
        totalPages = pagination.pages;

        const container = document.getElementById('callsPagination');
        if (!container) return;

        let html = '';

        // Previous
        html += `
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="loadCallLogs(${currentPage - 1}); return false;">
                    <span aria-hidden="true">&laquo;</span>
                </a>
            </li>
        `;

        // Pages
        for (let i = 1; i <= pagination.pages; i++) {
            if (i === 1 || i === pagination.pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="loadCallLogs(${i}); return false;">${i}</a>
                    </li>
                `;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // Next
        html += `
            <li class="page-item ${currentPage === pagination.pages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="loadCallLogs(${currentPage + 1}); return false;">
                    <span aria-hidden="true">&raquo;</span>
                </a>
            </li>
        `;

        container.innerHTML = html;
    }

    // Helper functions
    function formatNumber(number) {
        let cleaned = number.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return '+88' + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
            return '+88' + cleaned.substring(1);
        } else if (cleaned.length === 13 && cleaned.startsWith('88')) {
            return '+' + cleaned;
        }
        return number;
    }

    function getCallIcon(type, status) {
        if (status === 'missed') return 'bi-telephone-x';
        if (type === 'incoming') return 'bi-telephone-inbound';
        if (type === 'outgoing') return 'bi-telephone-outbound';
        return 'bi-telephone';
    }

    function getStatusClass(status) {
        switch (status) {
            case 'missed': return 'text-danger';
            case 'answered': return 'text-success';
            case 'rejected': return 'text-warning';
            default: return 'text-primary';
        }
    }

    function getStatusBadge(status) {
        switch (status) {
            case 'missed': return 'bg-danger';
            case 'answered': return 'bg-success';
            case 'rejected': return 'bg-warning';
            case 'dialing': return 'bg-primary';
            case 'ringing': return 'bg-info';
            default: return 'bg-secondary';
        }
    }

    function getStatusText(status) {
        const map = {
            'dialing': 'Dialing',
            'ringing': 'Ringing',
            'answered': 'Answered',
            'connected': 'Connected',
            'missed': 'Missed',
            'rejected': 'Rejected',
            'ended': 'Ended'
        };
        return map[status] || status;
    }

    function formatDuration(seconds) {
        if (!seconds || seconds === 0) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
            return `Today, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
            return `Yesterday, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }

        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    function showError(message) {
        showToast(message, 'danger');
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Clean up
    window.addEventListener('beforeunload', function () {
        if (callStatusInterval) {
            clearInterval(callStatusInterval);
        }
    });

    // Expose functions globally
    window.loadCallLogs = loadCallLogs;
    window.quickCall = quickCall;
    window.quickSms = quickSms;
    window.endCall = endCall;
    window.muteCall = muteCall;
    window.holdCall = holdCall;
    window.deleteCallLog = deleteCallLog;
    window.clearAllCalls = clearAllCalls;
    window.refreshCalls = refreshCalls;
    window.filterContactsByCompany = filterContactsByCompany;
    window.editContact = editContact;
    window.editContactFromNumber = editContactFromNumber;
    window.showAddContactModal = showAddContactModal;
    window.selectContact = selectContact;
    window.loadMoreContacts = loadMoreContacts;
    window.formatNumber = formatNumber;
})();