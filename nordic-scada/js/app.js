// Nordic SCADA Application Logic

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
        this.checkAdminVisibility();
    }

    bindEvents() {
        // Login
        document.getElementById('user-role').addEventListener('change', (e) => {
            const passwordInput = document.getElementById('password-input');
            passwordInput.style.display = e.target.value === 'admin' ? 'block' : 'none';
        });

        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

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
        document.getElementById('cancel-add-device').addEventListener('click', () => {
            document.getElementById('add-device-modal').classList.remove('active');
        });
        document.getElementById('confirm-add-device').addEventListener('click', () => this.addDevice());
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
        const role = document.getElementById('user-role').value;
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
        document.getElementById('user-role').value = 'operator';
        document.getElementById('login-error').textContent = '';
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

        // Update device filter in alarms
        if (moduleName === 'alarms') {
            this.updateDeviceFilters();
        }
    }

    renderDevices() {
        const container = document.getElementById('devices-list');
        container.innerHTML = '';

        this.devices.forEach((device, index) => {
            const card = document.createElement('div');
            card.className = `device-card ${device.status}`;
            card.innerHTML = `
                <h3>${device.name}</h3>
                <span class="status">${this.getStatusText(device.status)}</span>
                <div class="variables">
                    <div>Тип: ${device.type.toUpperCase()}</div>
                    <div>Адрес: ${device.address}</div>
                    <div>Переменных: ${device.variables ? Object.keys(device.variables).length : 0}</div>
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

    addDevice() {
        const name = document.getElementById('device-name').value;
        const type = document.getElementById('device-type').value;
        const address = document.getElementById('device-address').value;
        const fileInput = document.getElementById('device-map-file');

        if (!name || !address) {
            alert('Заполните название и адрес устройства');
            return;
        }

        const device = {
            id: Date.now(),
            name,
            type,
            address,
            status: 'stop',
            variables: {},
            schema: []
        };

        // Process variable map file if provided
        if (fileInput.files.length > 0) {
            this.processVariableMap(fileInput.files[0], (variables) => {
                device.variables = variables;
                this.devices.push(device);
                this.saveToStorage();
                this.renderDevices();
                document.getElementById('add-device-modal').classList.remove('active');
                this.clearAddDeviceForm();
            });
        } else {
            this.devices.push(device);
            this.saveToStorage();
            this.renderDevices();
            document.getElementById('add-device-modal').classList.remove('active');
            this.clearAddDeviceForm();
        }
    }

    processVariableMap(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const variables = {};
            
            // Simple CSV parsing
            const lines = content.split('\n');
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const varName = parts[0].trim();
                    const address = parts[1].trim();
                    const type = parts[2] ? parts[2].trim() : 'input';
                    variables[varName] = { address, type, value: 0 };
                }
            });
            
            callback(variables);
        };
        reader.readAsText(file);
    }

    clearAddDeviceForm() {
        document.getElementById('device-name').value = '';
        document.getElementById('device-address').value = '';
        document.getElementById('device-map-file').value = '';
    }

    openDeviceSchema(deviceIndex) {
        this.currentDevice = this.devices[deviceIndex];
        document.getElementById('schema-title').textContent = `Мнемосхема: ${this.currentDevice.name}`;
        
        // Render schema elements
        const canvas = document.getElementById('schema-canvas');
        canvas.innerHTML = '';
        this.schemaElements = this.currentDevice.schema || [];
        
        this.schemaElements.forEach(element => {
            this.renderSchemaElement(element);
        });

        // Populate variable dropdown
        this.populateVariableDropdown();
        
        this.showModule('schema');
    }

    renderSchemaElement(element) {
        const canvas = document.getElementById('schema-canvas');
        const el = document.createElement('div');
        el.className = 'schema-element';
        el.style.left = element.x + 'px';
        el.style.top = element.y + 'px';
        el.style.transform = `rotate(${element.rotation || 0}deg)`;
        el.dataset.id = element.id;

        // Get SVG based on type
        el.innerHTML = this.getSVGForType(element.type);
        
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectElement(element, el);
        });

        canvas.appendChild(el);
    }

    getSVGForType(type) {
        const svgs = {
            fan: `<svg width="80" height="80" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
                    <g class="fan-blades">
                        <ellipse cx="50" cy="25" rx="15" ry="35" fill="#3498db" opacity="0.8"/>
                        <ellipse cx="50" cy="75" rx="15" ry="35" fill="#3498db" opacity="0.8"/>
                        <ellipse cx="25" cy="50" rx="35" ry="15" fill="#3498db" opacity="0.8"/>
                        <ellipse cx="75" cy="50" rx="35" ry="15" fill="#3498db" opacity="0.8"/>
                    </g>
                    <circle cx="50" cy="50" r="10" fill="#2c3e50"/>
                  </svg>`,
            damper: `<svg width="80" height="80" viewBox="0 0 100 100">
                      <rect x="10" y="10" width="80" height="80" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
                      <g class="damper-blade">
                          <rect x="15" y="45" width="70" height="10" fill="#3498db"/>
                      </g>
                    </svg>`,
            heater: `<svg width="80" height="80" viewBox="0 0 100 100">
                      <rect x="10" y="10" width="80" height="80" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
                      <path class="heater-coil" d="M20 30 L80 30 M20 50 L80 50 M20 70 L80 70" stroke="#e74c3c" stroke-width="4" fill="none"/>
                    </svg>`,
            filter: `<svg width="80" height="80" viewBox="0 0 100 100">
                      <rect x="10" y="10" width="80" height="80" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
                      <pattern id="filterMesh" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          <circle cx="5" cy="5" r="2" fill="#95a5a6"/>
                      </pattern>
                      <rect x="15" y="15" width="70" height="70" fill="url(#filterMesh)" opacity="0.5"/>
                    </svg>`,
            sensor: `<svg width="60" height="60" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
                      <circle class="sensor-led" cx="50" cy="50" r="15" fill="#27ae60"/>
                    </svg>`,
            'button-start': `<svg width="60" height="60" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="#27ae60" stroke="#1e8449" stroke-width="2"/>
                              <text x="50" y="55" text-anchor="middle" fill="white" font-size="20" font-weight="bold">ПУСК</text>
                            </svg>`,
            'button-stop': `<svg width="60" height="60" viewBox="0 0 100 100">
                             <circle cx="50" cy="50" r="45" fill="#e74c3c" stroke="#c0392b" stroke-width="2"/>
                             <text x="50" y="55" text-anchor="middle" fill="white" font-size="20" font-weight="bold">СТОП</text>
                           </svg>`,
            'mode-switch': `<svg width="100" height="40" viewBox="0 0 100 40">
                             <rect x="5" y="5" width="90" height="30" fill="#3498db" rx="5"/>
                             <text x="50" y="25" text-anchor="middle" fill="white" font-size="12">ДИСТ/МЕСТ</text>
                           </svg>`,
            'season-switch': `<svg width="100" height="40" viewBox="0 0 100 40">
                               <rect x="5" y="5" width="90" height="30" fill="#9b59b6" rx="5"/>
                               <text x="50" y="25" text-anchor="middle" fill="white" font-size="12">ЗИМА/ЛЕТО</text>
                             </svg>`,
            setpoint: `<svg width="80" height="60" viewBox="0 0 100 60">
                        <rect x="5" y="5" width="90" height="50" fill="#f39c12" rx="5"/>
                        <text x="50" y="35" text-anchor="middle" fill="white" font-size="14">УСТАВКА</text>
                      </svg>`
        };
        return svgs[type] || '<div style="width:50px;height:50px;background:#ccc;">?</div>';
    }

    selectElement(element, domElement) {
        // Remove previous selection
        document.querySelectorAll('.schema-element.selected').forEach(el => {
            el.classList.remove('selected');
        });

        this.selectedElement = element;
        domElement.classList.add('selected');

        // Show properties panel
        const propertiesPanel = document.getElementById('element-properties');
        propertiesPanel.classList.add('visible');

        // Populate properties
        document.getElementById('prop-name').value = element.name || '';
        document.getElementById('prop-rotation').value = element.rotation || 0;
        
        // Select variable if exists
        if (element.variable) {
            document.getElementById('prop-variable').value = element.variable;
        }
    }

    populateVariableDropdown() {
        const select = document.getElementById('prop-variable');
        select.innerHTML = '<option value="">-- Выберите --</option>';
        
        if (this.currentDevice && this.currentDevice.variables) {
            Object.keys(this.currentDevice.variables).forEach(varName => {
                const option = document.createElement('option');
                option.value = varName;
                option.textContent = varName;
                select.appendChild(option);
            });
        }
    }

    updateElementProperty(property, value) {
        if (!this.selectedElement) return;

        this.selectedElement[property] = value;
        
        if (property === 'rotation') {
            const el = document.querySelector(`.schema-element[data-id="${this.selectedElement.id}"]`);
            if (el) {
                el.style.transform = `rotate(${value}deg)`;
            }
        }

        this.saveSchema();
    }

    deleteSelectedElement() {
        if (!this.selectedElement) return;

        const index = this.schemaElements.findIndex(e => e.id === this.selectedElement.id);
        if (index > -1) {
            this.schemaElements.splice(index, 1);
            const el = document.querySelector(`.schema-element[data-id="${this.selectedElement.id}"]`);
            if (el) el.remove();
            
            document.getElementById('element-properties').classList.remove('visible');
            this.selectedElement = null;
            this.saveSchema();
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.scale;
        const y = (e.clientY - rect.top) / this.scale;

        const element = {
            id: Date.now(),
            type,
            x,
            y,
            rotation: 0,
            name: '',
            variable: ''
        };

        this.schemaElements.push(element);
        this.renderSchemaElement(element);
        this.saveSchema();
    }

    saveSchema() {
        if (this.currentDevice) {
            this.currentDevice.schema = this.schemaElements;
            this.saveToStorage();
        }
    }

    toggleLibrary() {
        const library = document.getElementById('elements-library');
        library.classList.toggle('visible');
    }

    zoom(delta) {
        this.scale = Math.max(0.1, Math.min(3, this.scale + delta));
        const canvas = document.getElementById('schema-canvas');
        canvas.style.transform = `scale(${this.scale})`;
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        const canvas = document.getElementById('schema-canvas');
        canvas.classList.toggle('grid-hidden', !this.gridVisible);
    }

    setupCanvasInteraction() {
        const container = document.getElementById('schema-canvas-container');
        let isDragging = false;
        let startX, startY, scrollLeft, scrollTop;

        container.addEventListener('mousedown', (e) => {
            if (e.target === container || e.target.id === 'schema-canvas') {
                isDragging = true;
                startX = e.pageX - container.offsetLeft;
                startY = e.pageY - container.offsetTop;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
            }
        });

        container.addEventListener('mouseleave', () => isDragging = false);
        container.addEventListener('mouseup', () => isDragging = false);

        container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const y = e.pageY - container.offsetTop;
            const walkX = (x - startX) * 1.5;
            const walkY = (y - startY) * 1.5;
            container.scrollLeft = scrollLeft - walkX;
            container.scrollTop = scrollTop - walkY;
        });

        // Zoom with mouse wheel
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });
    }

    changePassword() {
        const newPassword = document.getElementById('new-admin-password').value;
        if (newPassword.length < 3) {
            alert('Пароль должен быть не менее 3 символов');
            return;
        }
        this.adminPassword = newPassword;
        this.saveToStorage();
        alert('Пароль администратора изменен');
        document.getElementById('new-admin-password').value = '';
    }

    addModule() {
        const moduleName = prompt('Название модуля:');
        if (!moduleName) return;

        const module = {
            id: Date.now(),
            name: moduleName,
            visibleForOperator: false
        };

        this.modules.push(module);
        this.renderModules();
        this.saveToStorage();
    }

    renderModules() {
        const container = document.getElementById('dynamic-modules');
        const settingsContainer = document.getElementById('modules-config');
        
        container.innerHTML = '';
        settingsContainer.innerHTML = '';

        this.modules.forEach((module, index) => {
            // Add to sidebar
            const li = document.createElement('li');
            li.className = this.currentRole === 'admin' || module.visibleForOperator ? '' : 'hidden';
            li.innerHTML = `<span class="icon">📦</span> ${module.name}`;
            li.addEventListener('click', () => alert(`Модуль ${module.name} будет реализован в следующей версии`));
            container.appendChild(li);

            // Add to settings
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.innerHTML = `
                <label style="display:inline;">
                    <input type="checkbox" ${module.visibleForOperator ? 'checked' : ''} 
                           onchange="app.toggleModuleVisibility(${index}, this.checked)">
                    Видно оператору
                </label>
                <span>${module.name}</span>
            `;
            settingsContainer.appendChild(div);
        });
    }

    toggleModuleVisibility(index, visible) {
        this.modules[index].visibleForOperator = visible;
        this.saveToStorage();
        this.renderModules();
    }

    renderAlarms() {
        const tbody = document.querySelector('#alarms-list tbody');
        const showOnlyActive = document.getElementById('show-only-active').checked;
        const deviceFilter = document.getElementById('alarm-device-filter').value;
        
        tbody.innerHTML = '';

        let filteredAlarms = this.alarms;
        if (showOnlyActive) {
            filteredAlarms = filteredAlarms.filter(a => a.active);
        }
        if (deviceFilter) {
            filteredAlarms = filteredAlarms.filter(a => a.deviceId == deviceFilter);
        }

        filteredAlarms.forEach(alarm => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(alarm.date).toLocaleString()}</td>
                <td>${alarm.deviceName}</td>
                <td>${alarm.description}</td>
                <td class="${alarm.active ? 'alarm-active' : 'alarm-resolved'}">
                    ${alarm.active ? 'Актуальна' : 'Устранена'}
                </td>
                <td>${alarm.recommendation}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    updateDeviceFilters() {
        const alarmSelect = document.getElementById('alarm-device-filter');
        const ioSelect = document.getElementById('io-device-filter');
        
        [alarmSelect, ioSelect].forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">Все устройства / Выберите устройство</option>';
            
            this.devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = device.name;
                select.appendChild(option);
            });

            if (currentValue) {
                select.value = currentValue;
            }
        });
    }

    loadIOVariables(deviceId) {
        const device = this.devices.find(d => d.id == deviceId);
        const tbody = document.querySelector('#io-variables-list tbody');
        tbody.innerHTML = '';

        if (!device || !device.variables) {
            return;
        }

        Object.entries(device.variables).forEach(([name, data]) => {
            const tr = document.createElement('tr');
            const isWritable = data.type === 'output' || data.type === 'rw';
            
            tr.innerHTML = `
                <td>${name}</td>
                <td>${data.address}</td>
                <td>${data.type}</td>
                <td>
                    ${isWritable 
                        ? `<input type="number" value="${data.value}" style="width:100px;" 
                                  onchange="app.updateVariable('${deviceId}', '${name}', this.value)">`
                        : `<span>${data.value}</span>`
                    }
                </td>
                <td>
                    ${isWritable 
                        ? `<button onclick="app.writeVariable('${deviceId}', '${name}')">Записать</button>` 
                        : '-'
                    }
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    updateVariable(deviceId, varName, value) {
        const device = this.devices.find(d => d.id == deviceId);
        if (device && device.variables[varName]) {
            device.variables[varName].value = parseFloat(value);
        }
    }

    writeVariable(deviceId, varName) {
        alert(`Значение переменной ${varName} отправлено на устройство`);
        // Здесь должна быть логика отправки значения на реальное устройство
    }

    addGraph() {
        const container = document.getElementById('graphs-container');
        const graphId = Date.now();
        
        const graphDiv = document.createElement('div');
        graphDiv.className = 'graph-container';
        graphDiv.innerHTML = `
            <div class="graph-header">
                <h4>График #${graphId.toString().slice(-4)}</h4>
                <button onclick="this.closest('.graph-container').remove()">✕</button>
            </div>
            <canvas id="graph-${graphId}" class="graph-canvas"></canvas>
        `;
        
        container.appendChild(graphDiv);
        this.initGraph(graphId);
    }

    initGraph(graphId) {
        const canvas = document.getElementById(`graph-${graphId}`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // Simple demo graph
        const data = [];
        for (let i = 0; i < 100; i++) {
            data.push(Math.random() * 100);
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw grid
            ctx.strokeStyle = '#ecf0f1';
            ctx.beginPath();
            for (let i = 0; i < canvas.width; i += 50) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i, canvas.height);
            }
            for (let i = 0; i < canvas.height; i += 50) {
                ctx.moveTo(0, i);
                ctx.lineTo(canvas.width, i);
            }
            ctx.stroke();

            // Draw line
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            data.forEach((value, index) => {
                const x = (index / data.length) * canvas.width;
                const y = canvas.height - (value / 100) * canvas.height;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();

            // Update data
            data.shift();
            data.push(Math.random() * 100);

            requestAnimationFrame(draw);
        };

        draw();
    }

    saveToStorage() {
        localStorage.setItem('nordicScadaData', JSON.stringify({
            devices: this.devices,
            modules: this.modules,
            adminPassword: this.adminPassword,
            secretFilePath: this.secretFilePath,
            alarms: this.alarms
        }));
    }

    loadFromStorage() {
        const data = localStorage.getItem('nordicScadaData');
        if (data) {
            const parsed = JSON.parse(data);
            this.devices = parsed.devices || [];
            this.modules = parsed.modules || [];
            this.adminPassword = parsed.adminPassword || '333';
            this.secretFilePath = parsed.secretFilePath || '/etc/nordic/scada/secret.json';
            this.alarms = parsed.alarms || [];
            this.renderModules();
        }
    }

    checkAdminVisibility() {
        // Check if user is admin based on stored session (if implemented)
    }
}

// Initialize app
const app = new NordicSCADA();
