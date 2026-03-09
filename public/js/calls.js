// Calls page specific functionality
(function () {
    'use strict';

    console.log('Calls.js loaded - ' + new Date().toISOString());

    // State
    let currentPage = 1;
    let totalPages = 1;
    let contacts = [];
    let filteredContacts = [];
    let isDeviceConnected = false;
    let callStatusInterval = null;
    let companies = [];

    // DOM Elements
    const elements = {
        totalCalls: document.getElementById('totalCalls'),
        outgoingCalls: document.getElementById('outgoingCalls'),
        incomingCalls: document.getElementById('incomingCalls'),
        missedCalls: document.getElementById('missedCalls'),
        callsTableBody: document.getElementById('callsTableBody'),
        callsMobileList: document.getElementById('callsMobileList'),
        callsPagination: document.getElementById('callsPagination'),
        searchCalls: document.getElementById('searchCalls'),
        filterCallType: document.getElementById('filterCallType'),
        sortCalls: document.getElementById('sortCalls'),
        contactsList: document.getElementById('contactsList'),
        modalContactsList: document.getElementById('modalContactsList'),
        contactSearch: document.getElementById('contactSearch'),
        modalContactSearch: document.getElementById('modalContactSearch'),
        modalContactCompany: document.getElementById('modalContactCompany'),
        contactCompanyFilters: document.getElementById('contactCompanyFilters'),
        speedDialGrid: document.getElementById('speedDialGrid'),
        favoritesList: document.getElementById('favoritesList'),
        quickContacts: document.getElementById('quickContacts'),
        contactCount: document.getElementById('contactCount'),
        totalContacts: document.getElementById('totalContacts'),
        favoriteContacts: document.getElementById('favoriteContacts'),
        dialerNumber: document.getElementById('dialerNumber'),
        numberHint: document.getElementById('numberHint'),
        contactName: document.getElementById('contactName'),
        clearNumber: document.getElementById('clearNumber'),
        makeCall: document.getElementById('makeCall'),
        activeCallBanner: document.getElementById('activeCallBanner'),
        activeCallStatus: document.getElementById('activeCallStatus'),
        activeCallNumber: document.getElementById('activeCallNumber'),
        activeCallDuration: document.getElementById('activeCallDuration'),
        deviceOfflineWarning: document.getElementById('deviceOfflineWarning'),
        dialerOfflineWarning: document.getElementById('dialerOfflineWarning')
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing Calls page...');

        // Check device connection
        checkDeviceConnection();

        // Load initial data
        loadCallLogs();
        loadCallStats();
        loadContacts();
        
        // Start call status check
        startCallStatusCheck();

        // Attach event listeners
        attachDialerListeners();
        attachSearchAndFilter();
        attachModalListeners();
    }

    // ==================== DEVICE CONNECTION ====================
    function checkDeviceConnection() {
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                isDeviceConnected = data.success && data.data.online;
                
                if (elements.deviceOfflineWarning) {
                    if (!isDeviceConnected) {
                        elements.deviceOfflineWarning.classList.remove('d-none');
                        elements.deviceOfflineWarning.classList.add('d-flex');
                    } else {
                        elements.deviceOfflineWarning.classList.add('d-none');
                        elements.deviceOfflineWarning.classList.remove('d-flex');
                    }
                }
                
                if (elements.dialerOfflineWarning) {
                    elements.dialerOfflineWarning.classList.toggle('d-none', isDeviceConnected);
                }
                
                if (elements.makeCall) {
                    elements.makeCall.disabled = !isDeviceConnected;
                }
            })
            .catch(error => {
                console.error('Error checking device connection:', error);
                isDeviceConnected = false;
            });
    }

    // ==================== CALL LOGS ====================
    function loadCallLogs(page = 1) {
        currentPage = page;

        fetch(`/api/calls/logs?page=${page}&limit=10`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayCallLogs(data.data);
                    updatePagination(data.pagination);
                }
            })
            .catch(error => {
                console.error('Error loading call logs:', error);
                showError('Failed to load call logs');
            });
    }

    function displayCallLogs(calls) {
        if (!elements.callsTableBody || !elements.callsMobileList) return;

        if (!calls || calls.length === 0) {
            const emptyHtml = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <i class="bi bi-telephone-x fs-1 text-muted d-block mb-3"></i>
                        <p class="text-muted mb-0">No call logs found</p>
                        <button class="btn btn-primary mt-3" onclick="openDialerModal()">
                            <i class="bi bi-telephone-plus me-2"></i>Make a Call
                        </button>
                    </td>
                </tr>
            `;
            elements.callsTableBody.innerHTML = emptyHtml;
            elements.callsMobileList.innerHTML = emptyHtml;
            return;
        }

        // Desktop table view
        let tableHtml = '';

        // Mobile cards view
        let mobileHtml = '';

        calls.forEach(call => {
            const contactName = call.contact_name || formatDisplayNumber(call.phone_number);
            const icon = getCallIcon(call.type, call.status);
            const statusClass = getStatusClass(call.status);
            const statusBadge = getStatusBadge(call.status);
            const statusText = getStatusText(call.status);

            // Table row
            tableHtml += `
                <tr data-call-id="${call.id}">
                    <td>
                        <div class="avatar-circle ${statusClass}">
                            <i class="bi ${icon}"></i>
                        </div>
                    </td>
                    <td>
                        <div class="fw-bold">${escapeHtml(contactName)}</div>
                        ${call.contact_company ? `<small class="text-muted">${escapeHtml(call.contact_company)}</small>` : ''}
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
                                <div class="avatar-circle ${statusClass}">
                                    <i class="bi ${icon}"></i>
                                </div>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between mb-1">
                                    <h6 class="mb-0">${escapeHtml(contactName)}</h6>
                                    <small class="text-muted">${formatDate(call.start_time)}</small>
                                </div>
                                <p class="mb-1 small">${call.phone_number}</p>
                                ${call.contact_company ? `<small class="text-muted d-block mb-1">${escapeHtml(call.contact_company)}</small>` : ''}
                                <div class="d-flex justify-content-between align-items-center mt-2">
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

        elements.callsTableBody.innerHTML = tableHtml;
        elements.callsMobileList.innerHTML = mobileHtml;
    }

    // ==================== CALL STATS ====================
    function loadCallStats() {
        fetch('/api/calls/stats')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (elements.totalCalls) elements.totalCalls.textContent = data.data.total;
                    if (elements.outgoingCalls) elements.outgoingCalls.textContent = data.data.outgoing;
                    if (elements.incomingCalls) elements.incomingCalls.textContent = data.data.incoming;
                    if (elements.missedCalls) elements.missedCalls.textContent = data.data.missed;
                }
            })
            .catch(console.error);
    }

    // ==================== CONTACTS ====================
    function loadContacts() {
        fetch('/api/contacts?limit=100')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    contacts = data.data;
                    filteredContacts = contacts;
                    
                    // Extract unique companies
                    companies = [...new Set(contacts.filter(c => c.company).map(c => c.company))];
                    
                    displayContacts();
                    displaySpeedDial();
                    displayFavorites();
                    displayQuickContacts();
                    updateContactCount();
                    updateContactFilters();
                }
            })
            .catch(error => console.error('Error loading contacts:', error));
    }

    function displayContacts() {
        if (!elements.contactsList) return;

        if (filteredContacts.length === 0) {
            elements.contactsList.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-person-lines-fill fs-1 text-muted d-block mb-3"></i>
                    <p class="text-muted mb-0">No contacts found</p>
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
                            <div class="avatar-circle bg-primary bg-opacity-10">
                                <i class="bi bi-person-circle fs-4 text-primary"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between">
                                <h6 class="mb-1">${escapeHtml(contact.name)} ${favorite}</h6>
                                ${contact.company ? `<small class="text-muted">${escapeHtml(contact.company)}</small>` : ''}
                            </div>
                            <p class="mb-1 small">${contact.phone_number}</p>
                            ${contact.email ? `<small class="text-muted">${escapeHtml(contact.email)}</small>` : ''}
                        </div>
                        <div class="btn-group btn-group-sm ms-2">
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

        elements.contactsList.innerHTML = html;
    }

    function displayModalContacts(contactsList) {
        if (!elements.modalContactsList) return;

        if (contactsList.length === 0) {
            elements.modalContactsList.innerHTML = '<div class="text-center py-4">No contacts found</div>';
            return;
        }

        let html = '';
        contactsList.forEach(contact => {
            html += `
                <div class="list-group-item list-group-item-action" data-contact-id="${contact.id}" 
                     data-phone="${contact.phone_number}" data-name="${contact.name}">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 me-3">
                            <div class="avatar-circle bg-primary bg-opacity-10">
                                <i class="bi bi-person-circle fs-4 text-primary"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${escapeHtml(contact.name)}</h6>
                            <p class="mb-0 small">${contact.phone_number}</p>
                        </div>
                        <div class="btn-group btn-group-sm ms-2">
                            <button class="btn btn-outline-success" onclick="selectContact('${contact.phone_number}', '${contact.name}')">
                                <i class="bi bi-check-lg"></i> Select
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        elements.modalContactsList.innerHTML = html;
    }

    function displaySpeedDial() {
        if (!elements.speedDialGrid) return;

        const topContacts = contacts.filter(c => c.favorite).slice(0, 8);

        if (topContacts.length === 0) {
            elements.speedDialGrid.innerHTML = `
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
                        <div class="fw-bold text-truncate">${escapeHtml(contact.name)}</div>
                        <small class="text-muted text-truncate d-block">${contact.phone_number}</small>
                    </div>
                </div>
            `;
        });

        elements.speedDialGrid.innerHTML = html;
    }

    function displayFavorites() {
        if (!elements.favoritesList) return;

        const favorites = contacts.filter(c => c.favorite);

        if (favorites.length === 0) {
            elements.favoritesList.innerHTML = `
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
                            <div class="fw-bold">${escapeHtml(contact.name)}</div>
                            <small class="text-muted">${contact.phone_number}</small>
                        </div>
                        <i class="bi bi-telephone text-success"></i>
                    </div>
                </div>
            `;
        });

        elements.favoritesList.innerHTML = html;
    }

    function displayQuickContacts() {
        if (!elements.quickContacts) return;

        const quickList = contacts.slice(0, 5);

        if (quickList.length === 0) {
            elements.quickContacts.innerHTML = '<small class="text-muted">No contacts available</small>';
            return;
        }

        let html = '';
        quickList.forEach(contact => {
            html += `
                <span class="contact-chip" onclick="selectContact('${contact.phone_number}', '${escapeHtml(contact.name)}')" 
                      style="${!isDeviceConnected ? 'cursor: not-allowed; opacity: 0.5;' : ''}">
                    <i class="bi bi-person-circle"></i>
                    <span>${escapeHtml(contact.name)}</span>
                </span>
            `;
        });

        elements.quickContacts.innerHTML = html;
    }

    function updateContactCount() {
        if (elements.contactCount) {
            elements.contactCount.textContent = contacts.length;
        }
        if (elements.totalContacts) {
            elements.totalContacts.textContent = `Total: ${contacts.length}`;
        }
        if (elements.favoriteContacts) {
            elements.favoriteContacts.textContent = `Favorites: ${contacts.filter(c => c.favorite).length}`;
        }
    }

    function updateContactFilters() {
        if (!elements.contactCompanyFilters) return;

        let html = '<span class="badge bg-primary cursor-pointer" onclick="filterContactsByCompany(\'\')">All</span>';
        
        companies.forEach(company => {
            html += `<span class="badge bg-secondary cursor-pointer" onclick="filterContactsByCompany('${company}')">${escapeHtml(company)}</span>`;
        });

        elements.contactCompanyFilters.innerHTML = html;

        // Update modal company filter
        if (elements.modalContactCompany) {
            let options = '<option value="">All Companies</option>';
            companies.forEach(company => {
                options += `<option value="${company}">${escapeHtml(company)}</option>`;
            });
            elements.modalContactCompany.innerHTML = options;
        }
    }

    // ==================== CONTACT FILTERS ====================
    function filterContacts() {
        const searchTerm = elements.contactSearch?.value.toLowerCase() || '';

        filteredContacts = contacts.filter(c => {
            return c.name.toLowerCase().includes(searchTerm) ||
                c.phone_number.includes(searchTerm);
        });

        displayContacts();
    }

    function filterModalContacts() {
        const searchTerm = elements.modalContactSearch?.value.toLowerCase() || '';
        const company = elements.modalContactCompany?.value || '';

        const filtered = contacts.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm) ||
                c.phone_number.includes(searchTerm);
            const matchesCompany = !company || c.company === company;
            return matchesSearch && matchesCompany;
        });

        displayModalContacts(filtered);
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

        if (company) {
            const activeBadge = Array.from(document.querySelectorAll('#contactCompanyFilters .badge'))
                .find(b => b.textContent === company);
            if (activeBadge) {
                activeBadge.classList.remove('bg-secondary');
                activeBadge.classList.add('bg-primary');
            }
        } else {
            const allBadge = document.querySelector('#contactCompanyFilters .badge:first-child');
            if (allBadge) {
                allBadge.classList.remove('bg-secondary');
                allBadge.classList.add('bg-primary');
            }
        }
    };

    // ==================== CONTACT LOOKUP ====================
    function findContactByNumber(number) {
        if (!number || !contacts || contacts.length === 0) return null;
        
        const cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber) return null;
        
        return contacts.find(c => {
            const cleanContact = c.phone_number.replace(/\D/g, '');
            if (!cleanContact) return false;
            
            return cleanContact === cleanNumber ||
                cleanContact.slice(-10) === cleanNumber.slice(-10) ||
                cleanContact.includes(cleanNumber) ||
                cleanNumber.includes(cleanContact);
        });
    }

    // ==================== DIALER ====================
    function attachDialerListeners() {
        // Dialer buttons
        document.querySelectorAll('.dialer-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const number = this.dataset.number;
                appendToDialer(number);
            });
        });

        // Clear button
        if (elements.clearNumber) {
            elements.clearNumber.addEventListener('click', function () {
                if (elements.dialerNumber) elements.dialerNumber.value = '';
                if (elements.contactName) elements.contactName.textContent = '';
                if (elements.numberHint) {
                    elements.numberHint.innerHTML = '<i class="bi bi-info-circle"></i> Enter 10-digit number';
                }
            });
        }

        // Make call button
        if (elements.makeCall) {
            elements.makeCall.addEventListener('click', function () {
                const number = elements.dialerNumber?.value;
                if (number) {
                    makeCall(number);
                } else {
                    showToast('Please enter a number', 'warning');
                }
            });
        }
    }

    function appendToDialer(digit) {
        if (!elements.dialerNumber) return;
        
        elements.dialerNumber.value += digit;

        const number = elements.dialerNumber.value;
        const contact = findContactByNumber(number);

        if (elements.contactName) {
            if (contact) {
                elements.contactName.textContent = contact.name;
                elements.contactName.classList.add('text-success');
            } else {
                elements.contactName.textContent = '';
            }
        }

        updateNumberHint(number);
    }

    function updateNumberHint(number) {
        if (!elements.numberHint) return;
        
        const digits = number.replace(/\D/g, '');

        if (digits.length === 10) {
            elements.numberHint.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> Valid number';
        } else if (digits.length > 10) {
            elements.numberHint.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-warning"></i> Number too long';
        } else {
            elements.numberHint.innerHTML = '<i class="bi bi-info-circle"></i> Enter 10-digit number';
        }
    }

    // ==================== CALL ACTIONS ====================
    function makeCall(number) {
        if (!isDeviceConnected) {
            showToast('Device is offline. Cannot make call.', 'warning');
            return;
        }

        const formattedNumber = formatNumber(number);

        fetch('/api/calls/dial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: formattedNumber })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call initiated', 'success');
                    
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('dialerModal'));
                    if (modal) modal.hide();
                    
                    // Clear dialer
                    if (elements.dialerNumber) elements.dialerNumber.value = '';
                    if (elements.contactName) elements.contactName.textContent = '';
                } else {
                    showToast(data.message || 'Failed to make call', 'danger');
                }
            })
            .catch(error => {
                console.error('Error making call:', error);
                showToast('Error making call', 'danger');
            });
    }

    function endCall() {
        if (!isDeviceConnected) {
            showToast('Device is offline.', 'warning');
            return;
        }

        fetch('/api/calls/end', { method: 'POST' })
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

    window.muteCall = function () {
        if (!isDeviceConnected) return;

        const muteBtn = document.querySelector('button[onclick="muteCall()"]');
        const isMuted = muteBtn?.classList.contains('active') || false;

        fetch('/api/calls/mute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mute: !isMuted })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (!isMuted) {
                    muteBtn?.classList.add('active', 'btn-success');
                    muteBtn?.classList.remove('btn-outline-success');
                    muteBtn.innerHTML = '<i class="bi bi-mic-mute"></i> Unmute';
                    showToast('Microphone muted', 'warning');
                } else {
                    muteBtn?.classList.remove('active', 'btn-success');
                    muteBtn?.classList.add('btn-outline-success');
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

    window.holdCall = function () {
        if (!isDeviceConnected) return;

        const holdBtn = document.querySelector('button[onclick="holdCall()"]');
        const isOnHold = holdBtn?.classList.contains('active') || false;

        fetch('/api/calls/hold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hold: !isOnHold })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (!isOnHold) {
                    holdBtn?.classList.add('active', 'btn-warning');
                    holdBtn?.classList.remove('btn-outline-primary');
                    holdBtn.innerHTML = '<i class="bi bi-pause"></i> Resume';
                    showToast('Call on hold', 'info');
                } else {
                    holdBtn?.classList.remove('active', 'btn-warning');
                    holdBtn?.classList.add('btn-outline-primary');
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

    window.quickCall = function (number) {
        if (!number) return;
        
        if (!isDeviceConnected) {
            showToast('Device is offline. Cannot make call.', 'warning');
            return;
        }

        if (confirm(`Call ${formatDisplayNumber(number)}?`)) {
            makeCall(number);
        }
    };

    window.quickSms = function (number) {
        if (!number) return;
        window.location.href = `/sms?to=${encodeURIComponent(number)}`;
    };

    // ==================== ACTIVE CALL BANNER ====================
    function showActiveCallBanner(number, status, duration = 0) {
        if (!elements.activeCallBanner) return;

        elements.activeCallBanner.classList.remove('d-none');
        if (elements.activeCallNumber) elements.activeCallNumber.textContent = number;
        if (elements.activeCallStatus) elements.activeCallStatus.textContent = getStatusText(status);
        if (elements.activeCallDuration) elements.activeCallDuration.textContent = formatDuration(duration);
    }

    function hideActiveCallBanner() {
        if (elements.activeCallBanner) {
            elements.activeCallBanner.classList.add('d-none');
        }
    }

    // ==================== CALL STATUS ====================
    function startCallStatusCheck() {
        if (callStatusInterval) {
            clearInterval(callStatusInterval);
        }
        callStatusInterval = setInterval(checkCallStatus, 2000);
    }

    function checkCallStatus() {
        if (!isDeviceConnected) {
            hideActiveCallBanner();
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

    // ==================== CALL LOG MANAGEMENT ====================
    function deleteCallLog(id) {
        if (!confirm('Delete this call record?')) return;

        fetch(`/api/calls/logs/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Call log deleted', 'success');
                    loadCallLogs(currentPage);
                    loadCallStats();
                } else {
                    showToast(data.message || 'Failed to delete', 'danger');
                }
            })
            .catch(console.error);
    }

    function clearAllCalls() {
        if (!confirm('Delete all call logs? This cannot be undone.')) return;
        showToast('Feature coming soon', 'info');
    }

    function refreshCalls() {
        loadCallLogs(currentPage);
        loadCallStats();
        showToast('Call logs refreshed', 'success');
    }

    // ==================== SEARCH AND FILTER ====================
    function attachSearchAndFilter() {
        if (elements.searchCalls) {
            elements.searchCalls.addEventListener('input', debounce(filterCalls, 300));
        }

        if (elements.filterCallType) {
            elements.filterCallType.addEventListener('change', filterCalls);
        }

        if (elements.sortCalls) {
            elements.sortCalls.addEventListener('change', sortCalls);
        }

        if (elements.contactSearch) {
            elements.contactSearch.addEventListener('input', debounce(filterContacts, 300));
        }

        if (elements.modalContactSearch) {
            elements.modalContactSearch.addEventListener('input', debounce(filterModalContacts, 300));
        }

        if (elements.modalContactCompany) {
            elements.modalContactCompany.addEventListener('change', filterModalContacts);
        }
    }

    function filterCalls() {
        const searchTerm = elements.searchCalls?.value.toLowerCase() || '';
        const filterType = elements.filterCallType?.value || 'all';

        document.querySelectorAll('#callsTableBody tr, #callsMobileList .card').forEach(item => {
            const text = item.textContent.toLowerCase();
            const matchesSearch = text.includes(searchTerm);
            const matchesFilter = filterType === 'all' || text.includes(filterType);

            item.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
        });
    }

    function sortCalls() {
        // Implementation depends on your data structure
        showToast('Sorting feature coming soon', 'info');
    }

    // ==================== MODAL HANDLING ====================
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

        // Add contact modal reset
        const addContactModal = document.getElementById('addContactModal');
        if (addContactModal) {
            addContactModal.addEventListener('hidden.bs.modal', function() {
                document.getElementById('contactForm')?.reset();
                document.getElementById('contactId').value = '';
                document.getElementById('deleteContactBtn')?.classList.add('d-none');
            });
        }

        // Contacts modal
        const contactsModal = document.getElementById('contactsModal');
        if (contactsModal) {
            contactsModal.addEventListener('show.bs.modal', function() {
                displayModalContacts(contacts);
            });
        }
    }

    window.openContactsModal = function() {
        const dialerModal = bootstrap.Modal.getInstance(document.getElementById('dialerModal'));
        if (dialerModal) {
            dialerModal.hide();
        }
        
        setTimeout(() => {
            const contactsModal = new bootstrap.Modal(document.getElementById('contactsModal'));
            contactsModal.show();
            displayModalContacts(contacts);
        }, 300);
    };

    window.openDialerModal = function() {
        const modal = new bootstrap.Modal(document.getElementById('dialerModal'));
        modal.show();
    };

    window.selectContact = function(phone, name) {
        if (elements.dialerNumber) {
            elements.dialerNumber.value = phone;
        }
        if (elements.contactName) {
            elements.contactName.textContent = name;
            elements.contactName.classList.add('text-success');
        }

        const contactsModal = bootstrap.Modal.getInstance(document.getElementById('contactsModal'));
        if (contactsModal) contactsModal.hide();

        setTimeout(() => {
            const dialerModal = new bootstrap.Modal(document.getElementById('dialerModal'));
            dialerModal.show();
        }, 300);

        showToast(`Selected: ${name}`, 'success');
    };

    // ==================== CONTACT CRUD ====================
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

    function editContactFromNumber(number) {
        const contact = findContactByNumber(number);
        if (contact) {
            editContact(contact.id);
        } else {
            document.getElementById('contactPhone').value = number;
            showAddContactModal();
        }
    }

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

        const saveBtn = document.getElementById('saveContactBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        saveBtn.disabled = true;

        const url = id ? `/api/contacts/${id}` : '/api/contacts';
        const method = id ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(id ? 'Contact updated' : 'Contact created', 'success');

                    const modal = bootstrap.Modal.getInstance(document.getElementById('addContactModal'));
                    if (modal) modal.hide();

                    loadContacts();
                } else {
                    showToast('Failed to save contact', 'danger');
                }
            })
            .catch(console.error)
            .finally(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            });
    }

    function deleteContact() {
        const id = document.getElementById('contactId').value;
        if (!id || !confirm('Delete this contact?')) return;

        fetch(`/api/contacts/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Contact deleted', 'success');

                    const modal = bootstrap.Modal.getInstance(document.getElementById('addContactModal'));
                    if (modal) modal.hide();

                    loadContacts();
                } else {
                    showToast(data.message || 'Failed to delete', 'danger');
                }
            })
            .catch(console.error);
    }

    // ==================== PAGINATION ====================
    function updatePagination(pagination) {
        if (!elements.callsPagination) return;

        currentPage = pagination.page;
        totalPages = pagination.pages;

        if (totalPages <= 1) {
            elements.callsPagination.innerHTML = '';
            return;
        }

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
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
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
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="loadCallLogs(${currentPage + 1}); return false;">
                    <span aria-hidden="true">&raquo;</span>
                </a>
            </li>
        `;

        elements.callsPagination.innerHTML = html;
    }

    // ==================== HELPER FUNCTIONS ====================
    function formatNumber(number) {
        const cleaned = number.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return '+88' + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
            return '+88' + cleaned.substring(1);
        } else if (cleaned.length === 13 && cleaned.startsWith('88')) {
            return '+' + cleaned;
        }
        return number;
    }

    function formatDisplayNumber(number) {
        if (!number) return 'Unknown';
        const cleaned = number.replace(/\D/g, '');
        if (cleaned.length === 13 && cleaned.startsWith('88')) {
            return '+' + cleaned.slice(0,2) + ' ' + cleaned.slice(2,5) + ' ' + cleaned.slice(5,8) + ' ' + cleaned.slice(8);
        } else if (cleaned.length === 11) {
            return '+88 ' + cleaned.slice(1,4) + ' ' + cleaned.slice(4,7) + ' ' + cleaned.slice(7);
        } else if (cleaned.length === 10) {
            return '+88 ' + cleaned.slice(0,3) + ' ' + cleaned.slice(3,6) + ' ' + cleaned.slice(6);
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
        if (!dateString) return 'Unknown';
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

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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

    // ==================== CLEANUP ====================
    window.addEventListener('beforeunload', function () {
        if (callStatusInterval) {
            clearInterval(callStatusInterval);
        }
    });

    // ==================== EXPOSE GLOBALLY ====================
    window.loadCallLogs = loadCallLogs;
    window.refreshCalls = refreshCalls;
    window.quickCall = quickCall;
    window.quickSms = quickSms;
    window.endCall = endCall;
    window.muteCall = muteCall;
    window.holdCall = holdCall;
    window.deleteCallLog = deleteCallLog;
    window.clearAllCalls = clearAllCalls;
    window.filterContactsByCompany = filterContactsByCompany;
    window.editContact = editContact;
    window.editContactFromNumber = editContactFromNumber;
    window.showAddContactModal = showAddContactModal;
    window.selectContact = selectContact;
    window.openContactsModal = openContactsModal;
    window.openDialerModal = openDialerModal;
    window.formatNumber = formatNumber;

    console.log('Calls.js initialized');
})();