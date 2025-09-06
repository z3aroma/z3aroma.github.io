// Admin Panel JavaScript - Simplified and Robust

// Configuration
const CONFIG = {
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    ENCRYPTED_TOKEN: 'U2FsdGVkX1/L+M1Ad+UWG3SngXEctgdRc3zUKEJuX9edd5DYlz5ulwvv0inDREzdekvfgSXKW9oLI01M9H4ivQ==',
    ENCRYPTED_REPO_OWNER: 'U2FsdGVkX18ng1Ff4E8dtj8ajLBOFNc++8saBqc/c88=',
    ENCRYPTED_REPO_NAME: 'U2FsdGVkX1/HB47l1wLYUcI9Rd+q4bEB3HUqOPXySAzu/5D96zRYp3Iuu5lGP49z',
    ENCRYPTED_CSV_PATH: 'U2FsdGVkX18ObJTo3ZJpVdoA0Kqp5e85kFRRwdRwIaLvVlGmU/Mu6IpokC2GghX0'
};

// Security Functions
function sanitizeInput(str) {
    // Remove dangerous characters for CSV and HTML
    return str
        .replace(/[<>\"'&]/g, '') // Remove HTML dangerous characters
        .replace(/[\n\r\t]/g, '')  // Remove newlines and tabs
        .replace(/;/g, '')         // Remove CSV delimiter
        .trim()
        .substring(0, 100);        // Limit length to prevent abuse
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Anti brute-force protection
const loginAttempts = {
    count: parseInt(localStorage.getItem('loginAttempts') || '0'),
    blockedUntil: parseInt(localStorage.getItem('blockedUntil') || '0'),
    lastAttempt: parseInt(localStorage.getItem('lastAttempt') || '0')
};

const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_RESET_TIME = 5 * 60 * 1000; // Reset counter after 5 minutes of inactivity

// Application State
const state = {
    github: {
        token: null,
        owner: null,
        repo: null,
        path: null,
        currentSHA: null
    },
    data: {
        current: [],
        original: [],
        undoStack: [],
        redoStack: [],
        displayOrder: []  // Array of indices for visual sorting
    },
    ui: {
        editingRow: null,
        deleteRowIndex: null,
        deletedRows: [], // Track indices of deleted rows
        hasUnsavedChanges: false,
        sortColumn: null,
        sortDirection: 'asc'
    },
    session: {
        isLoggedIn: false,
        loginTime: null,
        timer: null
    }
};

// DOM Elements Cache
const elements = {
    loginContainer: null,
    adminPanel: null,
    passwordInput: null,
    errorMessage: null,
    tableBody: null,
    searchInput: null,
    loading: null,
    unsavedIndicator: null,
    undoBtn: null,
    redoBtn: null,
    successMessage: null,
    errorMessagePanel: null,
    sessionInfo: null,
    lastCommitInfo: null,
    lastCommitText: null,
    // Modals
    deleteModal: null,
    saveModal: null,
    logoutModal: null,
    deleteRowInfo: null,
    confirmDeleteBtn: null,
    diffContainer: null,
    commitMessageInput: null,
    logoutWarning: null
};

// Initialize DOM elements
function initElements() {
    elements.loginContainer = document.getElementById('loginContainer');
    elements.adminPanel = document.getElementById('adminPanel');
    elements.passwordInput = document.getElementById('passwordInput');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.tableBody = document.getElementById('tableBody');
    elements.searchInput = document.getElementById('searchInput');
    elements.loading = document.getElementById('loading');
    elements.unsavedIndicator = document.getElementById('unsavedIndicator');
    elements.undoBtn = document.getElementById('undoBtn');
    elements.redoBtn = document.getElementById('redoBtn');
    elements.successMessage = document.getElementById('successMessage');
    elements.errorMessagePanel = document.getElementById('errorMessagePanel');
    elements.sessionInfo = document.getElementById('sessionInfo');
    elements.lastCommitInfo = document.getElementById('lastCommitInfo');
    elements.lastCommitText = document.getElementById('lastCommitText');
    elements.deleteModal = document.getElementById('deleteModal');
    elements.saveModal = document.getElementById('saveModal');
    elements.logoutModal = document.getElementById('logoutModal');
    elements.deleteRowInfo = document.getElementById('deleteRowInfo');
    elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    elements.diffContainer = document.getElementById('diffContainer');
    elements.commitMessageInput = document.getElementById('commitMessageInput');
    elements.logoutWarning = document.getElementById('logoutWarning');
}

// Authentication
function login() {
    // Check if blocked due to too many attempts
    if (loginAttempts.blockedUntil > Date.now()) {
        const minutesLeft = Math.ceil((loginAttempts.blockedUntil - Date.now()) / 60000);
        showError(`Troppi tentativi falliti. Riprova tra ${minutesLeft} minuti.`);
        elements.passwordInput.value = '';
        elements.passwordInput.disabled = true;
        setTimeout(() => {
            elements.passwordInput.disabled = false;
        }, 1000);
        return;
    }
    
    // Reset counter if enough time has passed since last attempt
    if (loginAttempts.lastAttempt && (Date.now() - loginAttempts.lastAttempt) > ATTEMPT_RESET_TIME) {
        loginAttempts.count = 0;
        localStorage.removeItem('loginAttempts');
    }
    
    const password = elements.passwordInput.value;
    
    // Add progressive delay based on attempt number
    const delay = Math.min(loginAttempts.count * 1000, 5000); // Max 5 seconds
    if (delay > 0) {
        elements.passwordInput.disabled = true;
        setTimeout(() => {
            elements.passwordInput.disabled = false;
        }, delay);
    }
    
    try {
        const decrypted = {
            token: CryptoJS.AES.decrypt(CONFIG.ENCRYPTED_TOKEN, password).toString(CryptoJS.enc.Utf8),
            owner: CryptoJS.AES.decrypt(CONFIG.ENCRYPTED_REPO_OWNER, password).toString(CryptoJS.enc.Utf8),
            repo: CryptoJS.AES.decrypt(CONFIG.ENCRYPTED_REPO_NAME, password).toString(CryptoJS.enc.Utf8),
            path: CryptoJS.AES.decrypt(CONFIG.ENCRYPTED_CSV_PATH, password).toString(CryptoJS.enc.Utf8)
        };
        
        if (decrypted.token && decrypted.token.startsWith('ghp_')) {
            // Login successful - reset attempts
            loginAttempts.count = 0;
            loginAttempts.blockedUntil = 0;
            localStorage.removeItem('loginAttempts');
            localStorage.removeItem('blockedUntil');
            localStorage.removeItem('lastAttempt');
            
            state.github = decrypted;
            state.session.isLoggedIn = true;
            state.session.loginTime = new Date();
            
            // Save session to sessionStorage
            sessionStorage.setItem('adminSession', JSON.stringify({
                github: decrypted,
                loginTime: state.session.loginTime.toISOString()
            }));
            
            startSessionTimer();
            showAdminPanel();
            loadData();
        } else {
            handleFailedLogin();
        }
    } catch (e) {
        handleFailedLogin();
    }
}

function handleFailedLogin() {
    loginAttempts.count++;
    loginAttempts.lastAttempt = Date.now();
    localStorage.setItem('loginAttempts', loginAttempts.count.toString());
    localStorage.setItem('lastAttempt', loginAttempts.lastAttempt.toString());
    
    if (loginAttempts.count >= MAX_LOGIN_ATTEMPTS) {
        loginAttempts.blockedUntil = Date.now() + BLOCK_DURATION;
        localStorage.setItem('blockedUntil', loginAttempts.blockedUntil.toString());
        showError(`Troppi tentativi falliti (${MAX_LOGIN_ATTEMPTS}). Account bloccato per 15 minuti.`);
    } else {
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - loginAttempts.count;
        showError(`Password errata! ${remainingAttempts} tentativi rimasti.`);
    }
    
    elements.passwordInput.value = '';
}

function logout() {
    state.session.isLoggedIn = false;
    state.github = { token: null, owner: null, repo: null, path: null, currentSHA: null };
    state.data = { current: [], original: [], undoStack: [], redoStack: [], displayOrder: [] };
    state.ui = { editingRow: null, deleteRowIndex: null, deletedRows: [], hasUnsavedChanges: false, sortColumn: null, sortDirection: 'asc' };
    clearTimeout(state.session.timer);
    
    // Clear session from sessionStorage
    sessionStorage.removeItem('adminSession');
    
    elements.loginContainer.style.display = 'block';
    elements.adminPanel.style.display = 'none';
    elements.passwordInput.value = '';
}

// Session Management
function startSessionTimer() {
    clearTimeout(state.session.timer);
    state.session.timer = setTimeout(() => {
        showError('Sessione scaduta');
        logout();
    }, CONFIG.SESSION_TIMEOUT);
}

function resetSessionTimer() {
    if (state.session.isLoggedIn) {
        startSessionTimer();
    }
}

function updateSessionInfo() {
    if (state.session.isLoggedIn && state.session.loginTime) {
        const elapsed = Math.floor((new Date() - state.session.loginTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        elements.sessionInfo.textContent = `Sessione: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// UI Helpers
function showAdminPanel() {
    elements.loginContainer.style.display = 'none';
    elements.adminPanel.style.display = 'block';
    updateSessionInfo();
}

function showError(message) {
    // Show error in login form if not logged in, otherwise in admin panel
    if (!state.session.isLoggedIn) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.style.display = 'block';
        setTimeout(() => elements.errorMessage.style.display = 'none', 5000);
    } else {
        elements.errorMessagePanel.textContent = message;
        elements.errorMessagePanel.style.display = 'block';
        setTimeout(() => elements.errorMessagePanel.style.display = 'none', 5000);
    }
}

function showSuccess(message) {
    elements.successMessage.textContent = message;
    elements.successMessage.style.display = 'block';
    setTimeout(() => elements.successMessage.style.display = 'none', 5000);
}

function showLoading(show) {
    elements.loading.style.display = show ? 'block' : 'none';
}

// Data Management
async function loadData() {
    showLoading(true);
    
    try {
        const url = `https://api.github.com/repos/${state.github.owner}/${state.github.repo}/contents/${state.github.path}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${state.github.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) throw new Error('Errore nel caricamento');
        
        const data = await response.json();
        // Store original base64 content for preserving exact format
        state.github.originalBase64 = data.content;
        
        // Decode base64 properly
        const decodedContent = atob(data.content.replace(/\s/g, ''));
        // Convert to UTF-8 string
        const bytes = new Uint8Array(decodedContent.length);
        for (let i = 0; i < decodedContent.length; i++) {
            bytes[i] = decodedContent.charCodeAt(i);
        }
        const content = new TextDecoder('utf-8').decode(bytes);
        
        state.github.currentSHA = data.sha;
        
        parseCSV(content);
        state.data.original = JSON.parse(JSON.stringify(state.data.current));
        state.data.displayOrder = []; // Reset display order to natural order
        
        await getLastCommitInfo();
        renderTable();
        
    } catch (error) {
        showError('Errore nel caricamento dei dati');
    } finally {
        showLoading(false);
    }
}

async function getLastCommitInfo() {
    try {
        const url = `https://api.github.com/repos/${state.github.owner}/${state.github.repo}/commits?path=${state.github.path}&per_page=1`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${state.github.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const commits = await response.json();
            if (commits.length > 0) {
                const lastCommit = commits[0];
                const date = new Date(lastCommit.commit.author.date).toLocaleString('it-IT');
                elements.lastCommitText.textContent = `${lastCommit.commit.message} - ${date}`;
                elements.lastCommitInfo.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error getting last commit:', error);
    }
}

function parseCSV(content) {
    const lines = content.trim().split('\n');
    state.data.current = [];
    
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        if (parts.length >= 2) {
            // Sanitize data when loading from CSV
            state.data.current.push({
                cognome: sanitizeInput(parts[0].trim()),
                citofono: parts[1].trim().replace(/[^0-9]/g, '').substring(0, 3)
            });
        }
    }
}

async function saveChanges(commitMessage) {
    showLoading(true);
    
    try {
        // Filter out deleted rows and sort by citofono number
        const filteredData = state.data.current.filter((row, index) => 
            !state.ui.deletedRows.includes(index)
        );
        
        const sortedData = [...filteredData].sort((a, b) => {
            const numA = parseInt(a.citofono) || 0;
            const numB = parseInt(b.citofono) || 0;
            return numA - numB;
        });
        
        // Build CSV content with LF line endings
        let csvContent = 'COGNOME;CITOFONO\n';
        sortedData.forEach(row => {
            csvContent += `${row.cognome};${row.citofono}\n`;
        });
        csvContent = csvContent.trim(); // Remove last newline
        
        // Encode to base64 properly without deprecated functions
        const encoder = new TextEncoder();
        const bytes = encoder.encode(csvContent);
        let binaryString = '';
        for (let i = 0; i < bytes.length; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        const encodedContent = btoa(binaryString);
        
        const url = `https://api.github.com/repos/${state.github.owner}/${state.github.repo}/contents/${state.github.path}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${state.github.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage || `Aggiornamento citofoni - ${new Date().toLocaleString('it-IT')}`,
                content: encodedContent,
                sha: state.github.currentSHA
            })
        });
        
        if (!response.ok) throw new Error('Errore nel salvataggio');
        
        const result = await response.json();
        state.github.currentSHA = result.content.sha;
        
        // Remove deleted rows from current data
        state.data.current = state.data.current.filter((row, index) => 
            !state.ui.deletedRows.includes(index)
        );
        
        state.data.original = JSON.parse(JSON.stringify(state.data.current));
        state.ui.hasUnsavedChanges = false;
        state.ui.deletedRows = []; // Reset deleted rows
        state.data.undoStack = [];
        state.data.redoStack = [];
        
        updateUnsavedIndicator();
        updateUndoRedoButtons();
        await getLastCommitInfo();
        showSuccess('Modifiche salvate con successo!');
        
    } catch (error) {
        showError('Errore nel salvataggio');
    } finally {
        showLoading(false);
    }
}

// Sorting Functions
function sortData(column) {
    // Toggle direction if same column
    if (state.ui.sortColumn === column) {
        state.ui.sortDirection = state.ui.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.ui.sortColumn = column;
        state.ui.sortDirection = 'asc';
    }
    
    // Create array of indices for display order
    const indices = state.data.current.map((_, index) => index);
    
    // Sort the indices based on data values
    indices.sort((a, b) => {
        let compareValue = 0;
        const itemA = state.data.current[a];
        const itemB = state.data.current[b];
        
        if (column === 'cognome') {
            compareValue = itemA.cognome.localeCompare(itemB.cognome, 'it');
        } else if (column === 'citofono') {
            // Numeric sort for citofono
            const numA = parseInt(itemA.citofono) || 0;
            const numB = parseInt(itemB.citofono) || 0;
            compareValue = numA - numB;
        }
        
        return state.ui.sortDirection === 'asc' ? compareValue : -compareValue;
    });
    
    // Store display order without modifying actual data
    state.data.displayOrder = indices;
    
    renderTable();
    updateSortIndicators();
}

function updateSortIndicators() {
    // Remove all sort classes
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Add current sort class
    if (state.ui.sortColumn) {
        const th = document.getElementById(`th-${state.ui.sortColumn}`);
        if (th) {
            th.classList.add(`sort-${state.ui.sortDirection}`);
        }
    }
}

// Check if a row has been modified
function checkIfRowModified(row) {
    // Find if this row exists in original data with same values
    return !state.data.original.some(origRow => 
        origRow.cognome === row.cognome && origRow.citofono === row.citofono
    );
}

// Table Rendering
function renderTable() {
    elements.tableBody.innerHTML = '';
    
    // Use display order if available, otherwise natural order
    const displayIndices = state.data.displayOrder.length > 0 
        ? state.data.displayOrder 
        : state.data.current.map((_, i) => i);
    
    displayIndices.forEach(dataIndex => {
        const row = state.data.current[dataIndex];
        const tr = document.createElement('tr');
        tr.id = `row-${dataIndex}`;
        
        // Check if row is marked for deletion
        const isDeleted = state.ui.deletedRows.includes(dataIndex);
        if (isDeleted) {
            tr.classList.add('deleted');
        }
        
        // Check if modified - compare with original data
        const isModified = checkIfRowModified(row);
        if (isModified && !isDeleted) {
            tr.classList.add('modified');
        }
        
        // Check if editing
        if (state.ui.editingRow === dataIndex && !isDeleted) {
            tr.classList.add('editing');
            tr.innerHTML = `
                <td><input class="editable-input" type="text" id="input-cognome-${dataIndex}" value="${escapeHtml(row.cognome)}" placeholder="COGNOME" oninput="this.value = this.value.toUpperCase()"></td>
                <td><input class="editable-input" type="text" id="input-citofono-${dataIndex}" value="${escapeHtml(row.citofono)}" placeholder="000" maxlength="3" oninput="this.value = this.value.replace(/[^0-9]/g, '')"></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-save-row" onclick="saveRowEdit(${dataIndex})">✓ Salva</button>
                        <button class="btn-small btn-cancel" onclick="cancelRowEdit()">✗ Annulla</button>
                    </div>
                </td>
            `;
        } else {
            // For deleted rows, show strikethrough text and restore button
            if (isDeleted) {
                tr.innerHTML = `
                    <td><s>${escapeHtml(row.cognome)}</s></td>
                    <td><s>${escapeHtml(row.citofono)}</s></td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-small btn-restore" onclick="restoreRow(${dataIndex})">↩️ Ripristina</button>
                        </div>
                    </td>
                `;
            } else {
                tr.innerHTML = `
                    <td>${escapeHtml(row.cognome)}</td>
                    <td>${escapeHtml(row.citofono)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-small btn-edit" onclick="startRowEdit(${dataIndex})">✏️ Modifica</button>
                            <button class="btn-small btn-delete" onclick="showDeleteModal(${dataIndex})">🗑️ Elimina</button>
                        </div>
                    </td>
                `;
            }
        }
        
        elements.tableBody.appendChild(tr);
    });
    
    updateUndoRedoButtons();
}

// Edit Functions
function startRowEdit(index) {
    // Cancel any other editing row
    if (state.ui.editingRow !== null && state.ui.editingRow !== index) {
        cancelRowEdit();
    }
    
    state.ui.editingRow = index;
    renderTable();
    
    // Focus first input
    setTimeout(() => {
        const input = document.getElementById(`input-cognome-${index}`);
        if (input) input.focus();
    }, 0);
}

function saveRowEdit(index) {
    const cognomeInput = document.getElementById(`input-cognome-${index}`);
    const citofonoInput = document.getElementById(`input-citofono-${index}`);
    
    if (!cognomeInput || !citofonoInput) return;
    
    // Sanitize inputs before processing
    const newCognome = sanitizeInput(cognomeInput.value.toUpperCase());
    const newCitofono = citofonoInput.value.trim().replace(/[^0-9]/g, '');
    
    if (!newCognome || !newCitofono) {
        showError('I campi non possono essere vuoti');
        return;
    }
    
    // Validate cognome has at least 3 characters
    if (newCognome.length < 3) {
        showError('Il cognome deve avere almeno 3 caratteri');
        return;
    }
    
    // Validate citofono is exactly 3 digits
    if (!/^\d{3}$/.test(newCitofono)) {
        showError('Il citofono deve essere esattamente 3 cifre');
        return;
    }
    
    saveUndoState();
    
    state.data.current[index].cognome = newCognome;
    state.data.current[index].citofono = newCitofono;
    
    state.ui.editingRow = null;
    markAsModified();
    renderTable();
    showSuccess('Modifica salvata localmente');
}

function cancelRowEdit() {
    // If canceling a new empty row, remove it
    if (state.ui.editingRow !== null) {
        const row = state.data.current[state.ui.editingRow];
        if (row && row.cognome === '' && row.citofono === '') {
            state.data.current.splice(state.ui.editingRow, 1);
            markAsModified();
        }
    }
    
    state.ui.editingRow = null;
    renderTable();
}

// Add/Delete Functions
function addRow() {
    // Don't save undo state here - wait until the row is actually saved
    
    const newIndex = state.data.current.length;
    
    state.data.current.push({
        cognome: '',
        citofono: ''
    });
    
    markAsModified();
    renderTable();
    
    // Auto-start editing
    startRowEdit(newIndex);
    
    // Scroll to new row
    setTimeout(() => {
        const newRow = document.getElementById(`row-${newIndex}`);
        if (newRow) newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
}

function deleteRow(index) {
    saveUndoState();
    
    // Mark row as deleted instead of removing it
    if (!state.ui.deletedRows.includes(index)) {
        state.ui.deletedRows.push(index);
    }
    
    markAsModified();
    renderTable();
    showSuccess('Riga marcata per eliminazione');
}

function restoreRow(index) {
    // Remove from deleted rows list
    const idx = state.ui.deletedRows.indexOf(index);
    if (idx > -1) {
        state.ui.deletedRows.splice(idx, 1);
    }
    
    markAsModified();
    renderTable();
    showSuccess('Riga ripristinata');
}

// Undo/Redo
function saveUndoState() {
    state.data.undoStack.push({
        data: JSON.parse(JSON.stringify(state.data.current)),
        deletedRows: [...state.ui.deletedRows]
    });
    state.data.redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (state.data.undoStack.length > 0) {
        // Cancel any editing in progress
        if (state.ui.editingRow !== null) {
            state.ui.editingRow = null;
        }
        
        state.data.redoStack.push({
            data: JSON.parse(JSON.stringify(state.data.current)),
            deletedRows: [...state.ui.deletedRows]
        });
        
        const previousState = state.data.undoStack.pop();
        state.data.current = previousState.data;
        state.ui.deletedRows = previousState.deletedRows || [];
        
        // Remove any empty rows that shouldn't be there
        state.data.current = state.data.current.filter(row => 
            !(row.cognome === '' && row.citofono === '')
        );
        
        renderTable();
        markAsModified();
    }
}

function redo() {
    if (state.data.redoStack.length > 0) {
        state.data.undoStack.push({
            data: JSON.parse(JSON.stringify(state.data.current)),
            deletedRows: [...state.ui.deletedRows]
        });
        
        const nextState = state.data.redoStack.pop();
        state.data.current = nextState.data;
        state.ui.deletedRows = nextState.deletedRows || [];
        
        renderTable();
        markAsModified();
    }
}

function updateUndoRedoButtons() {
    elements.undoBtn.disabled = state.data.undoStack.length === 0;
    elements.redoBtn.disabled = state.data.redoStack.length === 0;
}

// Modified State
function markAsModified() {
    // Check if data has changed OR if there are deleted rows
    const dataChanged = JSON.stringify(state.data.current) !== JSON.stringify(state.data.original);
    const hasDeletedRows = state.ui.deletedRows.length > 0;
    
    state.ui.hasUnsavedChanges = dataChanged || hasDeletedRows;
    updateUnsavedIndicator();
    // Reset display order when data is modified to avoid confusion
    state.data.displayOrder = [];
}

function updateUnsavedIndicator() {
    if (state.ui.hasUnsavedChanges) {
        elements.unsavedIndicator.classList.add('show');
    } else {
        elements.unsavedIndicator.classList.remove('show');
    }
}

// Search
function filterTable() {
    const filter = elements.searchInput.value.toUpperCase();
    const rows = elements.tableBody.getElementsByTagName('tr');
    
    for (let i = 0; i < rows.length; i++) {
        const cognome = state.data.current[i].cognome.toUpperCase();
        const citofono = state.data.current[i].citofono.toUpperCase();
        
        rows[i].style.display = (cognome.includes(filter) || citofono.includes(filter)) ? '' : 'none';
    }
}

// Modal Functions
function showDeleteModal(index) {
    state.ui.deleteRowIndex = index;
    const row = state.data.current[index];
    elements.deleteRowInfo.textContent = `${escapeHtml(row.cognome)} - Citofono ${escapeHtml(row.citofono)}`;
    elements.deleteModal.classList.add('show');
}

function closeDeleteModal() {
    elements.deleteModal.classList.remove('show');
    state.ui.deleteRowIndex = null;
}

function confirmDelete() {
    if (state.ui.deleteRowIndex !== null) {
        deleteRow(state.ui.deleteRowIndex);
        closeDeleteModal();
    }
}

function showSaveModal() {
    if (!state.ui.hasUnsavedChanges) {
        showError('Non ci sono modifiche da salvare');
        return;
    }
    
    generateDiff();
    
    // Generate detailed commit message
    const commitDetails = generateCommitMessage();
    elements.commitMessageInput.value = commitDetails;
    elements.saveModal.classList.add('show');
}

function closeSaveModal() {
    elements.saveModal.classList.remove('show');
}

async function confirmSave() {
    const commitMessage = elements.commitMessageInput.value;
    closeSaveModal();
    await saveChanges(commitMessage);
}

function showLogoutModal() {
    const warning = state.ui.hasUnsavedChanges 
        ? 'Hai modifiche non salvate. Sei sicuro di voler uscire?' 
        : 'Sei sicuro di voler uscire?';
    elements.logoutWarning.textContent = warning;
    elements.logoutModal.classList.add('show');
}

function closeLogoutModal() {
    elements.logoutModal.classList.remove('show');
}

function confirmLogout() {
    closeLogoutModal();
    logout();
}

function generateDiff() {
    elements.diffContainer.innerHTML = '';
    const changes = getChanges();
    
    // Display entries marked for deletion
    state.ui.deletedRows.forEach(index => {
        if (state.data.current[index]) {
            const entry = state.data.current[index];
            const div = document.createElement('div');
            div.className = 'diff-removed';
            div.textContent = `- ${entry.cognome};${entry.citofono}`;
            elements.diffContainer.appendChild(div);
        }
    });
    
    // Display removed entries (that were in original but not in current)
    changes.removed.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'diff-removed';
        div.textContent = `- ${entry.cognome};${entry.citofono}`;
        elements.diffContainer.appendChild(div);
    });
    
    // Display added entries
    changes.added.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'diff-added';
        div.textContent = `+ ${entry.cognome};${entry.citofono}`;
        elements.diffContainer.appendChild(div);
    });
    
    // Display modified entries
    changes.modified.forEach(change => {
        const divOld = document.createElement('div');
        divOld.className = 'diff-removed';
        divOld.textContent = `- ${change.old.cognome};${change.old.citofono}`;
        elements.diffContainer.appendChild(divOld);
        
        const divNew = document.createElement('div');
        divNew.className = 'diff-added';
        divNew.textContent = `+ ${change.new.cognome};${change.new.citofono}`;
        elements.diffContainer.appendChild(divNew);
    });
    
    // Check if there are any changes including deleted rows
    const hasDeletedRows = state.ui.deletedRows.length > 0;
    if (changes.removed.length === 0 && changes.added.length === 0 && 
        changes.modified.length === 0 && !hasDeletedRows) {
        elements.diffContainer.innerHTML = '<div>Nessuna modifica rilevata</div>';
    }
}

function getChanges() {
    const changes = {
        added: [],
        removed: [],
        modified: []
    };
    
    // Create a map of original records by cognome+citofono key
    const origMap = new Map();
    state.data.original.forEach(row => {
        const key = `${row.cognome}|${row.citofono}`;
        origMap.set(key, row);
    });
    
    // Create a map of current records by cognome+citofono key
    const currMap = new Map();
    state.data.current.forEach(row => {
        const key = `${row.cognome}|${row.citofono}`;
        currMap.set(key, row);
    });
    
    // Find removed entries (in original but not in current)
    state.data.original.forEach(row => {
        const key = `${row.cognome}|${row.citofono}`;
        if (!currMap.has(key)) {
            changes.removed.push(row);
        }
    });
    
    // Find added entries (in current but not in original)
    state.data.current.forEach(row => {
        const key = `${row.cognome}|${row.citofono}`;
        if (!origMap.has(key)) {
            changes.added.push(row);
        }
    });
    
    // Note: We don't track "modified" because if cognome OR citofono changes,
    // it's effectively a remove+add operation in our system
    
    return changes;
}

function generateCommitMessage() {
    const changes = getChanges();
    const parts = [];
    
    // Count deleted rows
    const deletedEntries = state.ui.deletedRows.map(index => state.data.current[index]).filter(Boolean);
    
    if (changes.added.length > 0) {
        if (changes.added.length === 1) {
            parts.push(`Aggiunto: ${changes.added[0].cognome} (int ${changes.added[0].citofono})`);
        } else {
            parts.push(`Aggiunti ${changes.added.length} citofoni`);
        }
    }
    
    // Combine removed + deleted rows
    const totalRemoved = changes.removed.length + deletedEntries.length;
    if (totalRemoved > 0) {
        if (totalRemoved === 1) {
            const removedEntry = deletedEntries[0] || changes.removed[0];
            parts.push(`Rimosso: ${removedEntry.cognome} (int ${removedEntry.citofono})`);
        } else {
            parts.push(`Rimossi ${totalRemoved} citofoni`);
        }
    }
    
    if (changes.modified.length > 0) {
        if (changes.modified.length === 1) {
            const mod = changes.modified[0];
            if (mod.old.citofono !== mod.new.citofono) {
                parts.push(`Posizione ${mod.position}: citofono ${mod.old.citofono} → ${mod.new.citofono}, ${mod.old.cognome} → ${mod.new.cognome}`);
            } else {
                parts.push(`Int ${mod.new.citofono}: ${mod.old.cognome} → ${mod.new.cognome}`);
            }
        } else {
            parts.push(`Modificate ${changes.modified.length} righe`);
        }
    }
    
    if (parts.length === 0) {
        return `Aggiornamento citofoni - ${new Date().toLocaleString('it-IT')}`;
    }
    
    return `Update citofoni_z3a.csv: ${parts.join('; ')}`;
}

// Event Listeners
function initEventListeners() {
    // Password enter key
    elements.passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    // Delete confirmation input - removed as it's no longer needed
    
    // Search input
    elements.searchInput.addEventListener('keyup', filterTable);
    
    // Activity tracking for session
    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keypress', resetSessionTimer);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (!state.session.isLoggedIn) return;
        
        if (e.ctrlKey) {
            switch(e.key) {
                case 's':
                    e.preventDefault();
                    if (state.ui.hasUnsavedChanges) showSaveModal();
                    break;
                case 'z':
                    e.preventDefault();
                    undo();
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
                case 'f':
                    e.preventDefault();
                    elements.searchInput.focus();
                    break;
            }
        } else if (e.key === 'Escape' && state.ui.editingRow !== null) {
            cancelRowEdit();
        }
    });
    
    // Prevent accidental page leave
    window.addEventListener('beforeunload', (e) => {
        if (state.ui.hasUnsavedChanges) {
            e.preventDefault();
            return ''; // Modern way without using deprecated returnValue
        }
    });
}

// Global functions (exposed for HTML onclick)
window.login = login;
window.logout = logout;
window.addRow = addRow;
window.startRowEdit = startRowEdit;
window.saveRowEdit = saveRowEdit;
window.cancelRowEdit = cancelRowEdit;
window.showDeleteModal = showDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.restoreRow = restoreRow;
window.showSaveModal = showSaveModal;
window.closeSaveModal = closeSaveModal;
window.confirmSave = confirmSave;
window.showLogoutModal = showLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.confirmLogout = confirmLogout;
window.undo = undo;
window.redo = redo;
window.filterTable = filterTable;
window.sortData = sortData;

// Check for existing session
function checkExistingSession() {
    const savedSession = sessionStorage.getItem('adminSession');
    
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            const loginTime = new Date(session.loginTime);
            const now = new Date();
            const elapsed = now - loginTime;
            
            // Check if session is still valid (within 30 minutes)
            if (elapsed < CONFIG.SESSION_TIMEOUT) {
                // Restore session
                state.github = session.github;
                state.session.isLoggedIn = true;
                state.session.loginTime = loginTime;
                
                startSessionTimer();
                showAdminPanel();
                loadData();
                
                return true;
            } else {
                // Session expired, clear it
                sessionStorage.removeItem('adminSession');
            }
        } catch (e) {
            // Invalid session data, clear it
            sessionStorage.removeItem('adminSession');
        }
    }
    
    return false;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initEventListeners();
    setInterval(updateSessionInfo, 1000);
    
    // Check for existing session
    checkExistingSession();
});