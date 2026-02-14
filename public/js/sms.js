// SMS page specific functionality with contacts integration
(function () {
    'use strict';

    console.log('SMS.js loaded - ' + new Date().toISOString());

    // State
    let contacts = [];
    let selectedContact = null;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing SMS page with contacts...');

        // Attach event listeners
        attachDeleteListeners();
        attachMarkReadListeners();
        attachModalListeners();
        attachCharCounter();
        attachQuickActions();
        attachSearchAndFilter();
        attachTemplateButtons();

        // Load contacts for quick pick
        loadContacts();
    }

    // Load contacts from API
    function loadContacts() {
        fetch('/api/contacts?limit=100')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    contacts = data.data;
                    updateContactStats(data);
                    displayQuickContacts();
                }
            })
            .catch(error => console.error('Error loading contacts:', error));
    }

    // Update contact stats
    function updateContactStats(data) {
        const total = document.getElementById('totalContacts');
        const favorites = document.getElementById('favoriteContacts');

        if (total) total.textContent = `Total: ${data.pagination.total}`;
        if (favorites) favorites.textContent = `Favorites: ${data.data.filter(c => c.favorite).length}`;
    }

    function displayQuickContacts() {
        const container = document.getElementById('quickContacts');
        if (!container) return;

        if (!contacts || contacts.length === 0) {
            container.innerHTML = '<p class="text-muted small">No contacts. Add some in Contacts page.</p>';
            return;
        }

        let html = '';
        contacts.slice(0, 5).forEach(contact => {
            html += `
            <div class="contact-card" onclick="selectContact('${contact.phone_number}', '${contact.name}')">
                <div class="d-flex align-items-center gap-2">
                    <div class="avatar-sm bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" 
                         style="width: 32px; height: 32px;">
                        ${contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-grow-1">
                        <div class="small fw-bold">${contact.name}</div>
                        <div class="small text-muted">${contact.phone_number}</div>
                    </div>
                    <i class="bi bi-check2-circle text-success"></i>
                </div>
            </div>
        `;
        });

        container.innerHTML = html;
    }

    // Attach delete button listeners
    function attachDeleteListeners() {
        const deleteButtons = document.querySelectorAll('.delete-sms-btn');
        console.log('Found ' + deleteButtons.length + ' delete buttons');

        deleteButtons.forEach(button => {
            button.removeEventListener('click', handleDelete);
            button.addEventListener('click', handleDelete);
        });
    }

    // Handle delete button click
    function handleDelete(e) {
        e.preventDefault();
        e.stopPropagation();

        const smsItem = this.closest('[data-sms-id]');
        if (!smsItem) {
            console.error('No SMS item found');
            return;
        }

        const smsId = smsItem.dataset.smsId;
        console.log('Delete clicked for SMS ID:', smsId);

        if (confirm('Are you sure you want to delete this message?')) {
            deleteSms(smsId, smsItem);
        }
    }

    // Delete SMS function
    function deleteSms(smsId, element) {
        // Show loading state
        const originalContent = element.innerHTML;
        element.style.opacity = '0.5';
        element.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> Deleting...</div>';

        fetch('/api/sms/' + smsId, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                console.log('Delete response:', data);

                if (data.success) {
                    // Remove element with animation
                    element.style.transition = 'all 0.3s ease';
                    element.style.transform = 'translateX(100%)';
                    element.style.opacity = '0';

                    setTimeout(() => {
                        element.remove();
                        showToast('SMS deleted successfully', 'success');

                        // Check if container is empty
                        const container = element.closest('#inboxMessages, #sentMessages, #allMessages');
                        if (container && container.children.length === 0) {
                            container.innerHTML = getEmptyStateHTML(container.id);
                        }

                        // Update unread badge
                        updateUnreadBadge();
                    }, 300);
                } else {
                    element.style.opacity = '1';
                    element.innerHTML = originalContent;
                    showToast('Failed to delete SMS', 'danger');
                    attachDeleteListeners(); // Reattach listeners
                }
            })
            .catch(error => {
                console.error('Error deleting SMS:', error);
                element.style.opacity = '1';
                element.innerHTML = originalContent;
                showToast('Error deleting SMS', 'danger');
                attachDeleteListeners(); // Reattach listeners
            });
    }

    // Attach mark as read listeners
    function attachMarkReadListeners() {
        const markReadButtons = document.querySelectorAll('.mark-read-btn');
        console.log('Found ' + markReadButtons.length + ' mark read buttons');

        markReadButtons.forEach(button => {
            button.removeEventListener('click', handleMarkRead);
            button.addEventListener('click', handleMarkRead);
        });
    }

    // Handle mark as read click
    function handleMarkRead(e) {
        e.preventDefault();
        e.stopPropagation();

        const smsItem = this.closest('[data-sms-id]');
        if (!smsItem) {
            console.error('No SMS item found');
            return;
        }

        const smsId = smsItem.dataset.smsId;
        console.log('Mark read clicked for SMS ID:', smsId);

        markAsRead(smsId, smsItem, this);
    }

    // Mark SMS as read
    function markAsRead(smsId, element, button) {
        fetch('/api/sms/' + smsId + '/read', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .then(response => response.json())
            .then(data => {
                console.log('Mark read response:', data);

                if (data.success) {
                    // Remove badge
                    const badge = element.querySelector('.badge.bg-danger');
                    if (badge) {
                        badge.remove();
                    }

                    // Remove button
                    button.remove();

                    // Update unread class
                    element.classList.remove('unread');

                    // Update avatar
                    const avatar = element.querySelector('.avatar-circle');
                    if (avatar) {
                        avatar.classList.remove('bg-primary');
                        avatar.classList.add('bg-light');
                        const icon = avatar.querySelector('i');
                        if (icon) {
                            icon.classList.remove('text-white');
                            icon.classList.add('text-secondary');
                        }
                    }

                    showToast('Message marked as read', 'success');
                    updateUnreadBadge();
                }
            })
            .catch(error => {
                console.error('Error marking SMS as read:', error);
                showToast('Error marking SMS as read', 'danger');
            });
    }

    // Attach quick action buttons (call, reply)
    function attachQuickActions() {
        // Quick call buttons
        document.querySelectorAll('.quick-call-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const number = this.dataset.number;
                if (number) {
                    if (confirm(`Call ${number}?`)) {
                        window.location.href = '/calls';
                    }
                }
            });
        });

        // Quick reply buttons
        document.querySelectorAll('.quick-sms-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const number = this.dataset.number;
                if (number) {
                    document.getElementById('modalTo').value = number;
                    const modal = new bootstrap.Modal(document.getElementById('composeSmsModal'));
                    modal.show();
                }
            });
        });
    }

    // Attach search and filter
    function attachSearchAndFilter() {
        const searchInput = document.getElementById('searchSms');
        const filterSelect = document.getElementById('filterType');
        const sortSelect = document.getElementById('sortOrder');

        if (searchInput) {
            searchInput.addEventListener('input', debounce(filterMessages, 300));
        }

        if (filterSelect) {
            filterSelect.addEventListener('change', filterMessages);
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', sortMessages);
        }
    }

    // Filter messages
    function filterMessages() {
        const searchTerm = document.getElementById('searchSms')?.value.toLowerCase() || '';
        const filterType = document.getElementById('filterType')?.value || 'all';

        document.querySelectorAll('.message-item').forEach(item => {
            const text = item.querySelector('.message-text')?.textContent.toLowerCase() || '';
            const sender = item.querySelector('.sender-name')?.textContent.toLowerCase() || '';
            const recipient = item.querySelector('.recipient-number')?.textContent.toLowerCase() || '';
            const type = item.dataset.smsType;
            const isUnread = item.classList.contains('unread');

            let matchesSearch = text.includes(searchTerm) ||
                sender.includes(searchTerm) ||
                recipient.includes(searchTerm);

            let matchesFilter = true;
            if (filterType === 'inbox') matchesFilter = type === 'inbox';
            else if (filterType === 'sent') matchesFilter = type === 'sent';
            else if (filterType === 'unread') matchesFilter = isUnread;

            if (matchesSearch && matchesFilter) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Sort messages
    function sortMessages() {
        const sortOrder = document.getElementById('sortOrder')?.value || 'newest';
        const containers = ['inboxMessages', 'sentMessages', 'allMessages'];

        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (!container) return;

            const items = Array.from(container.children);

            items.sort((a, b) => {
                const timeA = a.querySelector('.text-muted i.bi-clock')?.parentElement.textContent || '';
                const timeB = b.querySelector('.text-muted i.bi-clock')?.parentElement.textContent || '';

                // This is a simple sort - in production, use timestamps from data attributes
                if (sortOrder === 'newest') {
                    return timeB.localeCompare(timeA);
                } else {
                    return timeA.localeCompare(timeB);
                }
            });

            // Reappend in sorted order
            items.forEach(item => container.appendChild(item));
        });
    }

    function attachTemplateButtons() {
        document.querySelectorAll('.template-btn').forEach(btn => {
            // Remove old listeners to prevent duplicates
            btn.removeEventListener('click', handleTemplateClick);
            btn.addEventListener('click', handleTemplateClick);
        });
    }

    function handleTemplateClick(e) {
        e.preventDefault();
        const template = this.dataset.template;
        const messageInput = document.getElementById('modalMessage');
        const toInput = document.getElementById('modalTo');

        const templates = {
            balance: {
                message: 'Check my account balance',
                to: '121' // Robi balance check number
            },
            offer: {
                message: 'Please send me current offers and packages',
                to: '121'
            },
            help: {
                message: 'I need assistance with my account. Please call me back.',
                to: '121'
            },
            hello: {
                message: 'Hello, this is a test message from my ESP32 dashboard.',
                to: ''
            }
        };

        if (messageInput && templates[template]) {
            messageInput.value = templates[template].message;
            messageInput.dispatchEvent(new Event('input'));

            // Optionally set the recipient
            if (toInput && templates[template].to && !toInput.value) {
                toInput.value = templates[template].to;
            }

            showToast('Template applied', 'success');
        }
    }

    // Attach modal listeners
    function attachModalListeners() {
        const sendBtn = document.getElementById('modalSendBtn');
        if (sendBtn) {
            console.log('Send button found, attaching listener');
            sendBtn.removeEventListener('click', handleSendSms);
            sendBtn.addEventListener('click', handleSendSms);
        }

        const pickContactBtn = document.getElementById('pickContactBtn');
        if (pickContactBtn) {
            pickContactBtn.addEventListener('click', function () {
                const quickPick = document.getElementById('contactQuickPick');
                quickPick.classList.toggle('d-none');
                loadContactsForPick();
            });
        }

        // Reset modal on close
        const modal = document.getElementById('composeSmsModal');
        if (modal) {
            modal.addEventListener('hidden.bs.modal', function () {
                const form = document.getElementById('composeSmsForm');
                if (form) form.reset();
                const charCount = document.getElementById('modalCharCount');
                if (charCount) charCount.textContent = '0';
                document.getElementById('contactQuickPick')?.classList.add('d-none');
            });
        }

        // Contacts modal
        const contactsModal = document.getElementById('contactsModal');
        if (contactsModal) {
            contactsModal.addEventListener('show.bs.modal', loadFullContacts);
        }
    }

    // Load contacts for quick pick
    function loadContactsForPick() {
        fetch('/api/contacts?limit=20')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayContactsForPick(data.data);
                }
            })
            .catch(console.error);
    }

    // Display contacts for quick pick
    function displayContactsForPick(contacts) {
        const container = document.getElementById('quickContacts');
        if (!container) return;

        if (contacts.length === 0) {
            container.innerHTML = '<p class="text-muted">No contacts found</p>';
            return;
        }

        let html = '';
        contacts.forEach(contact => {
            html += `
                <div class="contact-card" onclick="selectQuickContact('${contact.phone_number}', '${contact.name}')">
                    <div class="text-center">
                        <i class="bi bi-person-circle fs-4"></i>
                        <div class="small fw-bold text-truncate">${contact.name}</div>
                        <div class="small text-muted text-truncate">${contact.phone_number}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Load full contacts list
    function loadFullContacts() {
        const container = document.getElementById('contactsList');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

        fetch('/api/contacts?limit=100')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayFullContacts(data.data);
                }
            })
            .catch(error => {
                console.error('Error loading contacts:', error);
                container.innerHTML = '<div class="text-center py-4 text-danger">Error loading contacts</div>';
            });
    }

    // Display full contacts list
    function displayFullContacts(contacts) {
        const container = document.getElementById('contactsList');
        if (!container) return;

        if (contacts.length === 0) {
            container.innerHTML = '<div class="text-center py-4">No contacts found</div>';
            return;
        }

        let html = '';
        contacts.forEach(contact => {
            const favorite = contact.favorite ? '<i class="bi bi-star-fill text-warning ms-2"></i>' : '';
            html += `
                <div class="list-group-item list-group-item-action" data-contact-id="${contact.id}">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 me-3">
                            <div class="bg-light rounded-circle p-2">
                                <i class="bi bi-person-circle fs-4"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between">
                                <h6 class="mb-1">${contact.name} ${favorite}</h6>
                                ${contact.company ? `<small class="text-muted">${contact.company}</small>` : ''}
                            </div>
                            <p class="mb-0 small">${contact.phone_number}</p>
                            ${contact.email ? `<small class="text-muted">${contact.email}</small>` : ''}
                        </div>
                        <div class="btn-group btn-group-sm ms-2">
                            <button class="btn btn-outline-success" onclick="selectContact('${contact.phone_number}', '${contact.name}')">
                                <i class="bi bi-check-lg"></i>
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

        // Add search functionality
        const searchInput = document.getElementById('contactSearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(filterContacts, 300));
        }

        const companyFilter = document.getElementById('contactCompanyFilter');
        if (companyFilter) {
            companyFilter.addEventListener('change', filterContacts);
        }
    }

    // Filter contacts
    function filterContacts() {
        const searchTerm = document.getElementById('contactSearch')?.value.toLowerCase() || '';
        const company = document.getElementById('contactCompanyFilter')?.value || '';

        document.querySelectorAll('#contactsList .list-group-item').forEach(item => {
            const name = item.querySelector('h6')?.textContent.toLowerCase() || '';
            const phone = item.querySelector('p')?.textContent.toLowerCase() || '';
            const email = item.querySelector('small.text-muted:last-child')?.textContent.toLowerCase() || '';
            const itemCompany = item.querySelector('small.text-muted:first-child')?.textContent || '';

            const matchesSearch = name.includes(searchTerm) ||
                phone.includes(searchTerm) ||
                email.includes(searchTerm);
            const matchesCompany = !company || itemCompany === company;

            if (matchesSearch && matchesCompany) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    function attachCharCounter() {
        const messageInput = document.getElementById('modalMessage');
        const charCount = document.getElementById('modalCharCount');
        const smsParts = document.getElementById('smsParts');

        if (messageInput && charCount) {
            messageInput.addEventListener('input', function () {
                const count = this.value.length;
                charCount.textContent = count;

                // Check if message contains non-GSM characters
                const gsmChars = '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
                let isGsm = true;
                for (let i = 0; i < this.value.length; i++) {
                    if (!gsmChars.includes(this.value[i])) {
                        isGsm = false;
                        break;
                    }
                }

                // Calculate SMS parts (GSM 7-bit: 160 chars, Unicode: 70 chars)
                const maxChars = isGsm ? 160 : 70;
                const parts = Math.ceil(count / maxChars);

                if (smsParts) {
                    smsParts.innerHTML = `
                    <span class="badge bg-${parts > 1 ? 'warning' : 'secondary'}">
                        ${parts} SMS${parts > 1 ? 'es' : ''}
                        ${!isGsm ? ' (Unicode)' : ''}
                    </span>
                `;
                }

                // Visual feedback
                charCount.className = '';
                if (count > maxChars - 20) {
                    charCount.classList.add('text-warning');
                }
                if (count >= maxChars) {
                    charCount.classList.add('text-danger');
                }
            });
        }
    }

    // Handle send SMS
    function handleSendSms(e) {
        e.preventDefault();

        const to = document.getElementById('modalTo')?.value.trim();
        const message = document.getElementById('modalMessage')?.value.trim();
        const button = this;

        console.log('Send SMS - To:', to, 'Message:', message);

        // Validate
        if (!to || !message) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        // Validate phone number
        const digitsOnly = to.replace(/\D/g, '');
        if (digitsOnly.length < 10) {
            showToast('Please enter a valid phone number', 'warning');
            return;
        }

        // Show loading
        const spinner = button.querySelector('.spinner-border');
        if (spinner) spinner.classList.remove('d-none');
        button.disabled = true;

        // Send request
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
                console.log('Send response:', data);

                if (data.success) {
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('composeSmsModal'));
                    if (modal) modal.hide();

                    showToast('SMS sent successfully!', 'success');

                    // Reload after delay
                    setTimeout(() => {
                        window.location.reload();
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
                // Hide loading
                if (spinner) spinner.classList.add('d-none');
                button.disabled = false;
            });
    }

    // Mark all as read
    function markAllAsRead() {
        if (!confirm('Mark all messages as read?')) return;

        const unreadIds = [];
        document.querySelectorAll('#inboxMessages .message-item.unread').forEach(item => {
            unreadIds.push(item.dataset.smsId);
        });

        if (unreadIds.length === 0) {
            showToast('No unread messages', 'info');
            return;
        }

        fetch('/api/sms/bulk-read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: unreadIds })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(`Marked ${data.marked} messages as read`, 'success');
                    location.reload();
                }
            })
            .catch(console.error);
    }

    // Delete all inbox messages
    function deleteAllInbox() {
        if (!confirm('Delete all inbox messages? This cannot be undone.')) return;

        const inboxIds = [];
        document.querySelectorAll('#inboxMessages [data-sms-id]').forEach(item => {
            inboxIds.push(item.dataset.smsId);
        });

        if (inboxIds.length === 0) {
            showToast('No messages to delete', 'info');
            return;
        }

        fetch('/api/sms/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: inboxIds })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(`Deleted ${data.deleted} messages`, 'success');
                    location.reload();
                }
            })
            .catch(console.error);
    }

    // Delete all sent messages
    function deleteAllSent() {
        if (!confirm('Delete all sent messages? This cannot be undone.')) return;

        const sentIds = [];
        document.querySelectorAll('#sentMessages [data-sms-id]').forEach(item => {
            sentIds.push(item.dataset.smsId);
        });

        if (sentIds.length === 0) {
            showToast('No messages to delete', 'info');
            return;
        }

        fetch('/api/sms/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: sentIds })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(`Deleted ${data.deleted} messages`, 'success');
                    location.reload();
                }
            })
            .catch(console.error);
    }

    // Get empty state HTML
    function getEmptyStateHTML(containerId) {
        if (containerId === 'inboxMessages') {
            return `
                <div class="text-center py-5">
                    <i class="bi bi-inbox fs-1 text-muted"></i>
                    <p class="text-muted mt-3 mb-0">No messages in inbox</p>
                    <button class="btn btn-primary mt-3" data-bs-toggle="modal" data-bs-target="#composeSmsModal">
                        <i class="bi bi-plus-circle me-2"></i>Compose New SMS
                    </button>
                </div>
            `;
        } else if (containerId === 'sentMessages') {
            return `
                <div class="text-center py-5">
                    <i class="bi bi-send fs-1 text-muted"></i>
                    <p class="text-muted mt-3 mb-0">No sent messages</p>
                </div>
            `;
        } else {
            return `
                <div class="text-center py-5">
                    <i class="bi bi-chat-dots fs-1 text-muted"></i>
                    <p class="text-muted mt-3 mb-0">No messages yet</p>
                </div>
            `;
        }
    }

    function selectContact(phone, name) {
        document.getElementById('modalTo').value = phone;

        // Close contacts modal if open
        const contactsModal = bootstrap.Modal.getInstance(document.getElementById('contactsModal'));
        if (contactsModal) contactsModal.hide();

        // Show compose modal
        const composeModal = new bootstrap.Modal(document.getElementById('composeSmsModal'));
        composeModal.show();

        showToast(`Selected: ${name}`, 'success');
    }

    function loadContactsForQuickPick() {
        fetch('/api/contacts?limit=20&favorites=true')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayQuickContacts(data.data);
                }
            })
            .catch(console.error);
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            // Fallback toast
            const toast = document.getElementById('liveToast');
            if (toast) {
                const toastInstance = new bootstrap.Toast(toast);
                document.getElementById('toastMessage').textContent = message;

                // Set icon based on type
                const icon = toast.querySelector('.toast-header i');
                if (icon) {
                    icon.className = type === 'success' ? 'bi-check-circle-fill text-success' :
                        type === 'danger' ? 'bi-exclamation-circle-fill text-danger' :
                            type === 'warning' ? 'bi-exclamation-triangle-fill text-warning' :
                                'bi-info-circle-fill text-info';
                }

                toastInstance.show();
            } else {
                alert(message);
            }
        }
    }

    // Update unread badge
    function updateUnreadBadge() {
        if (typeof window.updateUnreadBadge === 'function') {
            window.updateUnreadBadge();
        } else {
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
                    } else {
                        if (badge) badge.style.display = 'none';
                        if (inboxBadge) inboxBadge.classList.add('d-none');
                    }
                })
                .catch(console.error);
        }
    }

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Reattach listeners after dynamic content changes
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.addedNodes.length) {
                attachDeleteListeners();
                attachMarkReadListeners();
                attachQuickActions();
            }
        });
    });

    // Start observing
    const containers = ['inboxMessages', 'sentMessages', 'allMessages'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) observer.observe(container, { childList: true, subtree: true });
    });

    // Expose functions globally
    window.deleteSms = deleteSms;
    window.markAsRead = markAsRead;
    window.markAllAsRead = markAllAsRead;
    window.deleteAllInbox = deleteAllInbox;
    window.deleteAllSent = deleteAllSent;
    window.selectQuickContact = function (phone, name) {
        document.getElementById('modalTo').value = phone;
        document.getElementById('contactQuickPick').classList.add('d-none');
        showToast(`Selected: ${name}`, 'success');
    };
    window.selectContact = function (phone, name) {
        document.getElementById('modalTo').value = phone;
        const modal = bootstrap.Modal.getInstance(document.getElementById('contactsModal'));
        if (modal) modal.hide();
        showToast(`Selected: ${name}`, 'success');
    };
    window.editContact = function (id) {
        fetch('/api/contacts/' + id)
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
    };
})();