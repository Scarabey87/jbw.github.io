// Nordic SCADA - Modern Application Logic

class NordicSCADA {
    constructor() {
        this.currentUser = null;
        this.currentRole = null;
        this.devices = [];
        this.currentDevice = null;
        this.schemaElements = [];
        this.selectedElement = null;
        this.scale = 1;
        this.gridVisible = true;
        this.alarms = [];
        this.modules = [];
        this.secretFilePath = '/etc/nordic/scada/secret.json';
        this.adminPassword = '333';
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadFromStorage();
        this.setupRoleSelector();
    }
    
    setupRoleSelector() {
        const roleBtns = document.querySelectorAll('.role-btn');
        roleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                roleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const passwordGroup = document.getElementById('password-group');
                if (btn.dataset.role === 'admin') {
                    passwordGroup.style.display = 'block';
                } else {
                    passwordGroup.style.display = 'none';
                    document.getElementById('password-input').value = '';
                }
            });
        });
    }

    bindEvents() {
        // Login
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        
        // Allow Enter key for login
        document.getElementById('password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Menu navigation
        document.querySelectorAll('#main-menu li').forEach(item => {
            item.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                this.showModule(module);
            });
        });

        // Device management
        document.getElementById('add-device-btn').addEventListener('click', () => {
            document.getElementById('add-device-modal').classList.add('active');
        });
        document.getElementById('back-to-devices').addEventListener('click', () => this.showModule('devices'));

        // Schema controls
        document.getElementById('save-schema-btn').addEventListener('click', () => this.saveSchema());
        document.getElementById('toggle-library-btn').addEventListener('click', () => this.toggleLibrary());
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(0.1));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(-0.1));
        document.getElementById('toggle-grid').addEventListener('click', () => this.toggleGrid());

        // Library drag and drop
        document.querySelectorAll('.library-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', item.dataset.type);
            });
        });

        const canvas = document.getElementById('schema-canvas');
        canvas.addEventListener('dragover', (e) => e.preventDefault());
        canvas.addEventListener('drop', (e) => this.handleDrop(e));

        // Element properties
        document.getElementById('prop-name').addEventListener('input', (e) => this.updateElementProperty('name', e.target.value));
        document.getElementById('prop-variable').addEventListener('change', (e) => this.updateElementProperty('variable', e.target.value));
        document.getElementById('prop-rotation').addEventListener('change', (e) => this.updateElementProperty('rotation', parseInt(e.target.value)));
        document.getElementById('delete-element').addEventListener('click', () => this.deleteSelectedElement());

        // Settings
        document.getElementById('change-password-btn').addEventListener('click', () => this.changePassword());
        document.getElementById('add-module-btn').addEventListener('click', () => this.addModule());

        // Alarms
        document.getElementById('show-only-active').addEventListener('change', () => this.renderAlarms());
        document.getElementById('alarm-device-filter').addEventListener('change', () => this.renderAlarms());

        // I/O Monitor
        document.getElementById('io-device-filter').addEventListener('change', (e) => this.loadIOVariables(e.target.value));

        // Graphs
        document.getElementById('add-graph-btn').addEventListener('click', () => this.addGraph());

        // Canvas pan and zoom
        this.setupCanvasInteraction();
    }

    login() {
        const activeRoleBtn = document.querySelector('.role-btn.active');
        const role = activeRoleBtn ? activeRoleBtn.dataset.role : 'operator';
        const password = document.getElementById('password-input').value;
        const errorEl = document.getElementById('login-error');

        if (role === 'admin') {
            if (password !== this.adminPassword) {
                errorEl.textContent = 'Неверный пароль администратора';
                return;
            }
        }

        this.currentUser = role === 'admin' ? 'Администратор' : 'Оператор';
        this.currentRole = role;

        document.body.className = role === 'admin' ? 'role-admin' : 'role-operator';
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('main-interface').classList.add('active');
        document.getElementById('current-user').textContent = this.currentUser;
        document.getElementById('current-role-display').textContent = role === 'admin' ? 'Администратор' : 'Оператор';
        document.getElementById('user-avatar').textContent = role === 'admin' ? '🔧' : '👤';

        this.showModule('devices');
        this.renderDevices();
        this.renderAlarms();
    }

    logout() {
        this.currentUser = null;
        this.currentRole = null;
        document.body.className = '';
        document.getElementById('main-interface').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('password-input').value = '';
        document.getElementById('password-input').style.display = 'none';
        document.getElementById('login-error').textContent = '';
        
        // Reset role selector
        document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.role-btn[data-role="operator"]').classList.add('active');
    }

    showModule(moduleName) {
        // Hide all panels
        document.querySelectorAll('.module-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        // Remove active class from menu items
        document.querySelectorAll('#main-menu li').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected panel
        const panel = document.getElementById(`${moduleName}-panel`);
        if (panel) {
            panel.classList.add('active');
        }

        // Highlight menu item
        const menuItem = document.querySelector(`#main-menu li[data-module="${moduleName}"]`);
        if (menuItem) {
            menuItem.classList.add('active');
        }
        
        // Update page title
        const titles = {
            'devices': 'Устройства',
            'settings': 'Настройки',
            'alarms': 'Аварии',
            'io-monitor': 'I/O Монитор',
            'graphs': 'Графики',
            'schema': 'Мнемосхема'
        };
        document.getElementById('page-title').textContent = titles[moduleName] || moduleName;

        // Update device filter in alarms
        if (moduleName === 'alarms') {
            this.updateDeviceFilters();
        }
        
        // Update IO device filter
        if (moduleName === 'io-monitor') {
            this.updateIODeviceFilter();
        }
    }

    renderDevices() {
        const container = document.getElementById('devices-list');
        const emptyState = document.getElementById('empty-devices');
        container.innerHTML = '';

        if (this.devices.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';

        this.devices.forEach((device, index) => {
            const card = document.createElement('div');
            card.className = `device-card ${device.status}`;
            
            let connectionInfo = '';
            if (device.connectionType === 'tcpip') {
                connectionInfo = `${device.ip}:${device.port}`;
            } else if (device.connectionType === 'modbus') {
                connectionInfo = `${device.comPort} (${device.baudrate} бод)`;
            }
            
            card.innerHTML = `
                <div class="device-card-header">
                    <h3>${device.name}</h3>
                    <span class="status-badge status-${device.status}">${this.getStatusText(device.status)}</span>
                </div>
                <div class="device-card-body">
                    <div class="device-info-row">
                        <span class="info-label">Тип:</span>
                        <span class="info-value">${device.connectionType === 'tcpip' ? 'TCP/IP' : 'MODBUS RTU'}</span>
                    </div>
                    <div class="device-info-row">
                        <span class="info-label">Адрес:</span>
                        <span class="info-value">${connectionInfo}</span>
                    </div>
                    <div class="device-info-row">
                        <span class="info-label">Переменных:</span>
                        <span class="info-value">${device.variables ? Object.keys(device.variables).length : 0}</span>
                    </div>
                </div>
                <div class="device-card-footer">
                    <span class="double-click-hint">Дважды щелкните для открытия мнемосхемы</span>
                </div>
            `;
            card.addEventListener('dblclick', () => this.openDeviceSchema(index));
            container.appendChild(card);
        });
    }

    getStatusText(status) {
        switch(status) {
            case 'run': return 'РАБОТА';
            case 'stop': return 'СТОП';
            case 'alarm': return 'АВАРИЯ';
            default: return 'НЕИЗВЕСТНО';
        }
    }
}

// Global functions for HTML onclick handlers
function togglePasswordVisibility() {
    const input = document.getElementById('password-input');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function toggleConnectionSettings() {
    const deviceType = document.getElementById('device-type').value;
    const tcpipSettings = document.getElementById('tcpip-settings');
    const modbusSettings = document.getElementById('modbus-settings');
    
    if (deviceType === 'tcpip') {
        tcpipSettings.style.display = 'block';
        modbusSettings.style.display = 'none';
    } else {
        tcpipSettings.style.display = 'none';
        modbusSettings.style.display = 'block';
    }
}

function closeAddDeviceModal() {
    document.getElementById('add-device-modal').classList.remove('active');
    clearAddDeviceForm();
}

function clearAddDeviceForm() {
    document.getElementById('device-name').value = '';
    document.getElementById('device-ip').value = '';
    document.getElementById('device-port').value = '502';
    document.getElementById('device-slave-id').value = '1';
    document.getElementById('modbus-port').value = 'COM1';
    document.getElementById('modbus-baud').value = '9600';
    document.getElementById('modbus-databits').value = '8';
    document.getElementById('modbus-parity').value = 'none';
    document.getElementById('modbus-stopbits').value = '1';
    document.getElementById('modbus-slave-id').value = '1';
    document.getElementById('device-map-file').value = '';
    document.getElementById('device-type').value = 'tcpip';
    toggleConnectionSettings();
}

function downloadTemplate() {
    const csvContent = "Name,Address,Type,Description\nStart,40001,output,Команда пуска\nStop,40002,output,Команда остановки\nRunStatus,10001,input,Статус работы\nFault,10002,input,Сигнал аварии\nTemperature,30001,input,Температура";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'variables-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function confirmAddDevice() {
    if (!scadaApp) return;
    scadaApp.addDevice();
}

// Initialize app when DOM is ready
let scadaApp = null;
document.addEventListener('DOMContentLoaded', () => {
    scadaApp = new NordicSCADA();
});
