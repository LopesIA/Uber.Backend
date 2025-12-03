/*
 * ======================================================================================
 * INFINITY BLACK | CORE ENGINE v5.1 (Production)
 * ======================================================================================
 * Architecture: SPA (Single Page Application)
 * Features: Realtime Telemetry, Admin God Mode, Data-Driven UI, Leaflet Maps
 * Backend: Render Cloud Deployment
 * ======================================================================================
 */

const AppConfig = {
    // CONEXÃO DE PRODUÇÃO (RENDER)
    apiBase: 'https://uber-backend-3lzg.onrender.com', 
    
    // Estilo do Mapa (Dark Mode)
    mapStyle: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    
    // Credenciais Admin
    adminEmail: 'josiel70c@gmail.com', 
    
    // Modo de Simulação (False = Tenta conectar no Backend Real)
    simulationMode: false 
};

const app = {
    state: {
        currentUser: null,
        role: 'guest', // guest, client, driver, admin
        location: { lat: -20.2709, lng: -40.3015 }, // Default: Vitória/ES
        activeTrip: null,
        historyStack: [],
        driverOnline: false,
        socket: null
    },

    // =================================================================
    // 1. SYSTEM BOOT & INIT
    // =================================================================
    init: function() {
        console.log("🚀 INFINITY KERNEL: Initializing...");
        
        // 1. Inicia Mapa Base
        this.map.init();
        
        // 2. Inicia Telemetria Real
        this.geo.startTracking();
        
        // 3. Conecta ao Backend (Socket.io)
        this.comms.connect();
        
        // 4. Executa Sequência de Boot Cinematográfica
        this.ui.runBootSequence();

        // 5. Listeners Globais
        this.setupListeners();
    },

    setupListeners: function() {
        document.querySelectorAll('.sidebar-backdrop').forEach(el => {
            el.addEventListener('click', () => this.ui.toggleSidebar(false));
        });
        document.querySelectorAll('.modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target === el) el.classList.add('hidden');
            });
        });
    },

    // =================================================================
    // 2. AUTHENTICATION & SECURITY
    // =================================================================
    auth: {
        submitLogin: function(role) {
            app.ui.loader(true);
            
            let email, pass;

            if (role === 'client') {
                const phone = document.getElementById('auth-client-phone').value;
                const passInput = document.getElementById('auth-client-pass').value;
                // Lógica simples para detectar Admin via login de cliente
                if(phone.includes('70') || passInput === 'admin') email = AppConfig.adminEmail; 
                pass = passInput;
            } else {
                email = document.getElementById('auth-driver-cpf').value;
                pass = document.getElementById('auth-driver-pass').value;
            }

            // --- GOD MODE DETECTION (JOSIEL) ---
            if (pass === 'Ja997640401' || email === AppConfig.adminEmail) {
                setTimeout(() => {
                    app.ui.loader(false);
                    app.ui.toast("Identidade Mestre Confirmada.", "gold");
                    document.getElementById('auth-layer').classList.add('hidden');
                    document.getElementById('admin-selector-modal').classList.remove('hidden');
                    
                    // Avisa o servidor que o ADMIN logou
                    app.comms.emit('auth_handshake', { 
                        role: 'admin', 
                        name: 'Josiel (Owner)', 
                        userId: 'admin_josiel' 
                    });
                }, 1000);
                return;
            }

            // --- LOGIN NORMAL (Simulação de Firebase Auth) ---
            setTimeout(() => {
                app.ui.loader(false);
                const userName = role === 'client' ? "Arlan G." : "Partner Driver";
                const userId = "usr_" + Math.floor(Math.random() * 1000);
                
                this.finishLogin(role, { 
                    name: userName,
                    tier: "Gold",
                    id: userId
                });

                // Avisa o servidor que um usuário logou
                app.comms.emit('auth_handshake', { 
                    role: role, 
                    name: userName, 
                    userId: userId 
                });

            }, 1500);
        },

        biometricAuth: function() {
            app.ui.toast("Escaneando FaceID...", "info");
            setTimeout(() => {
                app.ui.toast("Biometria Aprovada.", "success");
                this.finishLogin('client', { name: "Arlan G. (Bio)", tier: "Platinum", id: "bio_user" });
            }, 2000);
        },

        finishLogin: function(role, userData) {
            app.state.currentUser = userData;
            app.state.role = role;
            
            document.getElementById('auth-layer').classList.add('hidden');
            
            if (role === 'client') {
                app.nav.transitionTo('client-layer');
                app.client.loadUserData();
            } else {
                app.nav.transitionTo('driver-layer');
                app.driver.initDashboard();
            }
        },

        logout: function() {
            app.ui.loader(true);
            setTimeout(() => {
                window.location.reload(); 
            }, 1000);
        }
    },

    // =================================================================
    // 3. ADMIN GOD MODE (JOSIEL)
    // =================================================================
    admin: {
        mapInstance: null,

        enterMode: function(mode) {
            document.getElementById('admin-selector-modal').classList.add('hidden');
            
            if (mode === 'admin') {
                document.getElementById('admin-layer').classList.remove('hidden');
                this.nav('dashboard'); 
            } else {
                app.auth.finishLogin('client', { name: "Josiel (Owner)", tier: "Black Diamond" });
            }
        },

        nav: function(viewId) {
            const main = document.getElementById('admin-main-view');
            main.innerHTML = '<div class="skeleton-loader-admin"></div>';
            
            setTimeout(() => {
                if (viewId === 'dashboard') this.renderDashboard(main);
                if (viewId === 'god-map') this.renderGodMap(main);
                if (viewId === 'drivers') this.renderDriversList(main);
                if (viewId === 'finance') this.renderFinance(main);
            }, 500);
        },

        renderDashboard: function(container) {
            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card"><div class="icon green"><i class="fas fa-dollar-sign"></i></div><div class="info"><h3>R$ 145.2k</h3><p>Receita Mês</p></div></div>
                    <div class="stat-card"><div class="icon gold"><i class="fas fa-car"></i></div><div class="info"><h3>1,240</h3><p>Corridas Hoje</p></div></div>
                    <div class="stat-card"><div class="icon blue"><i class="fas fa-users"></i></div><div class="info"><h3>850</h3><p>Novos Usuários</p></div></div>
                </div>
                <div class="glass-panel" style="padding:20px; margin-top:20px;">
                    <h3>Logs do Sistema (Realtime)</h3>
                    <div id="admin-logs-console" style="font-family:monospace; color:#0f0; height:150px; overflow-y:auto; margin-top:10px;">
                        > Conectado ao servidor...
                    </div>
                </div>
            `;
        },

        renderGodMap: function(container) {
            container.innerHTML = `<div id="god-map-engine" style="width:100%; height:80vh; border-radius:12px;"></div>`;
            setTimeout(() => {
                const map = L.map('god-map-engine').setView([app.state.location.lat, app.state.location.lng], 13);
                L.tileLayer(AppConfig.mapStyle).addTo(map);
                app.admin.mapInstance = map;
                // O socket 'god_map_update' vai popular isso
            }, 100);
        },

        updateGodMap: function(data) {
            if (!this.mapInstance) return;
            // Plota ou atualiza marcador no mapa do admin
            const color = data.status === 'online' ? '#00FF00' : (data.status === 'busy' ? '#FF0000' : '#FFFF00');
            L.circleMarker([data.lat, data.lng], {
                color: color,
                radius: 5
            }).addTo(this.mapInstance).bindPopup(`${data.role}: ${data.id}`);
        },

        log: function(msg) {
            const consoleEl = document.getElementById('admin-logs-console');
            if(consoleEl) {
                consoleEl.innerHTML += `<div>> ${msg}</div>`;
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
        }
    },

    // =================================================================
    // 4. CLIENT LOGIC
    // =================================================================
    client: {
        loadUserData: function() {
            const user = app.state.currentUser;
            this.injectText('sidebar-user-name', user.name);
            this.injectText('sidebar-user-tier', `${user.tier} Member`);
            this.injectText('wallet-balance-display', 'R$ 1,450.00');
            this.injectText('sidebar-balance', 'R$ 1.4k');
            this.injectText('sidebar-rides-count', '42');
            this.injectText('sidebar-rating', '5.0');
            
            const avatars = document.querySelectorAll('.skeleton-img');
            avatars.forEach(img => {
                img.src = 'https://ui-avatars.com/api/?name=' + user.name.replace(' ', '+') + '&background=D4AF37&color=000';
                img.classList.remove('skeleton-img');
            });
            
            this.loadSuggestions();
        },

        injectText: function(id, text) {
            const el = document.getElementById(id);
            if(el) { el.textContent = text; el.classList.remove('skeleton-text'); }
        },

        loadSuggestions: function() {
            const container = document.getElementById('suggestions-container');
            const favs = ["Aeroporto VIX", "Shopping Vitória", "Casa"];
            container.innerHTML = ''; 
            favs.forEach(place => {
                const chip = document.createElement('div');
                chip.className = 'chip animate__animated animate__fadeIn';
                chip.textContent = place;
                chip.onclick = () => app.ride.setDestination(place);
                container.appendChild(chip);
            });
        }
    },

    // =================================================================
    // 5. RIDE FLOW
    // =================================================================
    ride: {
        openSearch: function() {
            app.nav.toView('search-view');
            setTimeout(() => document.getElementById('search-query').focus(), 300);
        },

        closeSearch: function() { app.nav.back(); },

        setDestination: function(address) {
            document.getElementById('input-dest').value = address;
            app.ui.openBottomSheet('vehicle-sheet');
            this.loadVehicles(address);
        },

        loadVehicles: function(dest) {
            const list = document.getElementById('vehicle-list-container');
            list.innerHTML = '';
            const tiers = [
                { id: 'black', name: 'INFINITY BLACK', price: 45.90, time: 3, img: 'assets/img/car_black.png' },
                { id: 'platinum', name: 'PLATINUM', price: 89.00, time: 8, img: 'assets/img/car_plat.png' },
                { id: 'armored', name: 'GUARD (Blindado)', price: 150.00, time: 15, img: 'assets/img/car_armored.png' }
            ];

            tiers.forEach(tier => {
                const item = document.createElement('div');
                item.className = 'vehicle-item';
                item.onclick = () => this.selectVehicle(tier.id, item);
                item.innerHTML = `
                    <div class="veh-img"><img src="${tier.img}" onerror="this.src='https://via.placeholder.com/100x50?text=Car'"></div>
                    <div class="veh-info">
                        <div class="veh-top"><span class="veh-name">${tier.name}</span> <i class="fas fa-user"></i> 4</div>
                        <span class="veh-desc">Chegada em ${tier.time} min</span>
                    </div>
                    <div class="veh-price"><span class="amount">R$ ${tier.price.toFixed(2)}</span></div>
                `;
                list.appendChild(item);
            });
            document.getElementById('route-dist').textContent = '12.4 km';
            document.getElementById('route-time').textContent = '22 min';
        },

        selectVehicle: function(id, el) {
            document.querySelectorAll('.vehicle-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            document.getElementById('btn-request-ride').disabled = false;
        },

        request: function() {
            app.ui.closeBottomSheet('vehicle-sheet');
            app.ui.toast("Buscando motorista VIP...", "gold");
            
            // Envia pedido para o servidor
            app.comms.emit('request_ride', {
                origin: app.state.location,
                dest: document.getElementById('input-dest').value,
                tier: 'black',
                price: 45.90
            });
        },

        // Chamado pelo socket quando encontra motorista
        onMatchFound: function(data) {
            app.ui.playSound('success');
            app.ui.openBottomSheet('trip-panel');
            
            document.getElementById('trip-driver-name').textContent = data.driverName;
            document.getElementById('trip-driver-name').classList.remove('skeleton-text');
            document.getElementById('trip-car-name').textContent = `${data.carModel} • Preto`;
            document.getElementById('trip-plate').textContent = data.plate;
            document.getElementById('trip-eta').textContent = `${data.eta} min`;
            
            const island = document.getElementById('dynamic-island');
            island.classList.remove('hidden');
            island.classList.add('active');
        },

        cancel: function() {
            app.ui.closeBottomSheet('trip-panel');
            document.getElementById('dynamic-island').classList.add('hidden');
            app.ui.toast("Viagem Cancelada.");
        }
    },

    // =================================================================
    // 6. DRIVER LOGIC
    // =================================================================
    driver: {
        initDashboard: function() {
            document.getElementById('driver-earn-val').textContent = "245.50";
        },

        toggleOnline: function() {
            const status = document.getElementById('driver-status-check').checked;
            const lbl = document.getElementById('driver-status-lbl');
            
            app.state.driverOnline = status;
            app.comms.emit('driver_toggle_status', status);

            if (status) {
                lbl.textContent = "ONLINE";
                lbl.style.color = "#00FF00";
                app.ui.toast("Você está visível na rede.", "success");
            } else {
                lbl.textContent = "OFFLINE";
                lbl.style.color = "#666";
            }
        },

        // Chamado pelo socket quando recebe oferta
        onOfferReceived: function(data) {
            if(!app.state.driverOnline) return;
            app.ui.playSound('alert');
            
            // Popula modal com dados reais da oferta
            // (Assumindo que os elementos tenham IDs corretos, se não tiverem, usaríamos classes)
            document.querySelector('.offer-price').textContent = `R$ ${data.price.toFixed(2)}`;
            document.querySelector('.offer-type span').textContent = data.tier.toUpperCase();
            
            document.getElementById('ride-offer-modal').classList.remove('hidden');
            
            // Guarda ID para aceitar
            app.state.pendingRideId = data.rideId;
        },

        acceptRide: function() {
            document.getElementById('ride-offer-modal').classList.add('hidden');
            app.ui.toast("Corrida Aceita! Iniciando Navegação.", "success");
            
            app.comms.emit('driver_accept_ride', app.state.pendingRideId);
        },

        declineRide: function() {
            document.getElementById('ride-offer-modal').classList.add('hidden');
        }
    },

    // =================================================================
    // 7. COMMUNICATIONS & NETWORK (Socket.IO Real)
    // =================================================================
    comms: {
        socket: null,

        connect: function() {
            if (typeof io !== 'undefined') {
                this.socket = io(AppConfig.apiBase);

                this.socket.on('connect', () => {
                    document.getElementById('net-stat').textContent = "ONLINE";
                    document.getElementById('net-stat').style.color = "#00FF00";
                    app.ui.toast("Conectado à Rede Infinity.", "success");
                });

                this.socket.on('disconnect', () => {
                    document.getElementById('net-stat').textContent = "OFFLINE";
                    document.getElementById('net-stat').style.color = "red";
                });

                // Listeners de Eventos do Servidor
                this.socket.on('ride_offer', (data) => app.driver.onOfferReceived(data));
                this.socket.on('ride_matched', (data) => app.ride.onMatchFound(data));
                this.socket.on('god_map_update', (data) => app.admin.updateGodMap(data));
                this.socket.on('admin_log', (data) => app.admin.log(data.msg));
                this.socket.on('ride_error', (data) => app.ui.toast(data.msg, 'error'));

            } else {
                console.error("Socket.io lib not loaded");
            }
        },

        emit: function(event, data) {
            if (this.socket && this.socket.connected) {
                this.socket.emit(event, data);
            }
        },

        call: function() { window.location.href = "tel:+5500000000"; },
        chat: function() { app.ui.toast("Abrindo chat seguro..."); }
    },

    // =================================================================
    // 8. UTILITIES: MAP, GEO, UI
    // =================================================================
    map: {
        instance: null,
        marker: null,

        init: function() {
            this.instance = L.map('map-engine', { zoomControl: false, attributionControl: false }).setView([-20.2709, -40.3015], 15);
            L.tileLayer(AppConfig.mapStyle).addTo(this.instance);
            
            const icon = L.divIcon({ className: 'user-marker-pulse', html: '<div class="core"></div><div class="pulse"></div>' });
            this.marker = L.marker([-20.2709, -40.3015], { icon: icon }).addTo(this.instance);
        },

        centerUser: function() {
            this.instance.flyTo([app.state.location.lat, app.state.location.lng], 16);
        }
    },

    geo: {
        startTracking: function() {
            if(navigator.geolocation) {
                navigator.geolocation.watchPosition(pos => {
                    const { latitude, longitude, speed, accuracy } = pos.coords;
                    app.state.location = { lat: latitude, lng: longitude };
                    
                    // Atualiza Telemetria
                    document.getElementById('tel-accuracy').textContent = Math.round(accuracy) + 'm';
                    document.getElementById('tel-speed').textContent = Math.round((speed || 0) * 3.6) + ' km/h';
                    
                    // Atualiza Mapa Local
                    if(app.map.instance) {
                        const latLng = new L.LatLng(latitude, longitude);
                        app.map.marker.setLatLng(latLng);
                    }

                    // Envia para o Servidor (Para Admin e Matchmaking)
                    app.comms.emit('telemetry_update', { 
                        lat: latitude, 
                        lng: longitude, 
                        speed: speed 
                    });

                }, err => console.warn(err), { enableHighAccuracy: true });
            }
        }
    },

    ui: {
        runBootSequence: function() {
            const bar = document.getElementById('boot-progress-fill');
            bar.style.width = "100%";
            
            setTimeout(() => document.querySelector('#log-gps .status').textContent = "OK", 500);
            setTimeout(() => document.querySelector('#log-net .status').textContent = "OK", 1000);
            setTimeout(() => document.querySelector('#log-auth .status').textContent = "SECURE", 1500);

            setTimeout(() => {
                document.getElementById('boot-layer').classList.add('hidden');
                document.getElementById('auth-layer').classList.remove('hidden');
                document.getElementById('auth-layer').classList.add('active');
            }, 2500);
        },

        switchAuthRole: function(role) {
            document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
            document.querySelector(`.role-tab[data-role="${role}"]`).classList.add('active');
            
            if(role === 'client') {
                document.getElementById('auth-form-client').classList.remove('hidden');
                document.getElementById('auth-form-client').classList.add('active');
                document.getElementById('auth-form-driver').classList.add('hidden');
            } else {
                document.getElementById('auth-form-client').classList.add('hidden');
                document.getElementById('auth-form-driver').classList.remove('hidden');
                document.getElementById('auth-form-driver').classList.add('active');
            }
        },

        toggleSidebar: function(forceState) {
            const sidebar = app.state.role === 'client' ? document.getElementById('client-sidebar') : null;
            if(!sidebar) return;

            const isHidden = sidebar.classList.contains('hidden');
            const shouldShow = forceState !== undefined ? forceState : isHidden;

            if(shouldShow) {
                sidebar.classList.remove('hidden');
                requestAnimationFrame(() => sidebar.classList.add('active'));
            } else {
                sidebar.classList.remove('active');
                setTimeout(() => sidebar.classList.add('hidden'), 300);
            }
        },

        openBottomSheet: function(id) {
            const el = document.getElementById(id);
            el.classList.remove('hidden');
            requestAnimationFrame(() => el.style.transform = "translateY(0)");
        },

        closeBottomSheet: function(id) {
            const el = document.getElementById(id);
            el.style.transform = "translateY(100%)";
            setTimeout(() => el.classList.add('hidden'), 300);
        },

        toast: function(msg, type = 'info') {
            const container = document.getElementById('toast-container');
            const el = document.createElement('div');
            el.className = `toast-msg ${type}`;
            el.innerHTML = `<span>${msg}</span>`;
            container.appendChild(el);
            
            requestAnimationFrame(() => el.classList.add('visible'));
            setTimeout(() => {
                el.classList.remove('visible');
                setTimeout(() => el.remove(), 300);
            }, 3000);
        },

        loader: function(show) {
            const btns = document.querySelectorAll('.btn-submit');
            btns.forEach(btn => {
                if(show) {
                    btn.querySelector('.txt').classList.add('hidden');
                    btn.querySelector('.loader').classList.remove('hidden');
                } else {
                    btn.querySelector('.txt').classList.remove('hidden');
                    btn.querySelector('.loader').classList.add('hidden');
                }
            });
        },
        
        playSound: function(id) {
            const audio = document.getElementById('snd-' + id);
            if(audio) audio.play().catch(e => {});
        },

        togglePassVisibility: function(id) {
            const input = document.getElementById(id);
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    },

    nav: {
        to: function(target) {
            app.ui.toggleSidebar(false); 
            
            if (target === 'wallet') this.toView('wallet-view');
            if (target === 'settings') app.ui.toast("Configurações em desenvolvimento");
            if (target === 'history') app.ui.toast("Histórico carregado da nuvem");
            if (target === 'register') app.ui.toast("Módulo de registro abrindo...");
        },

        toView: function(viewId) {
            const target = document.getElementById(viewId);
            if(target) {
                target.classList.remove('hidden');
                app.state.historyStack.push(viewId);
            }
        },

        back: function() {
            const current = app.state.historyStack.pop();
            if(current) {
                document.getElementById(current).classList.add('hidden');
            }
        },

        openModal: function(id) { document.getElementById(id).classList.remove('hidden'); },
        closeModal: function(id) { document.getElementById(id).classList.add('hidden'); }
    },

    safety: {
        triggerSOS: function() { app.nav.openModal('safety-modal'); },
        police: function() { window.location.href = "tel:190"; },
        share: function() {
            if(navigator.share) navigator.share({ title: 'Infinity SOS', text: 'Minha localização', url: 'http://maps.google.com' });
            else app.ui.toast("Link copiado.");
        }
    },

    wallet: {
        addFunds: function() { app.ui.toast("Gateway de Pagamento: Iniciando..."); }
    }
};

// =================================================================
// 9. ENTRY POINT
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});