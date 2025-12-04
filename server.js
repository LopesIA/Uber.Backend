/* OBSIDIAN BACKEND v9.0 (Production Release) */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Segurança e Otimização
app.use(helmet());
app.use(compression());
app.use(cors({ origin: "*" })); // Em produção, restrinja ao seu domínio

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000, // Evita desconexões falsas em 4G
    pingInterval: 25000
});

// Estado em Memória (Para produção real, migrar para Redis/Database)
let users = {};     // { socketId: { ...data, coords } }
let drivers = {};   // { socketId: { ...data, status: 'online'|'busy'|'offline' } }
let activeRides = {}; 

io.on('connection', (socket) => {
    console.log(`[NET] Nova Conexão: ${socket.id}`);

    // Autenticação e Registro na Rede
    socket.on('auth_handshake', (data) => {
        try {
            users[socket.id] = { 
                ...data, 
                socketId: socket.id, 
                lat: data.lat || 0, 
                lng: data.lng || 0,
                lastSeen: Date.now()
            };

            if (data.role === 'driver') {
                drivers[socket.id] = users[socket.id];
                drivers[socket.id].status = 'offline'; // Começa offline por segurança
            }

            if (data.role === 'admin') {
                socket.join('admin_room');
                // Envia estado atual da frota para o admin
                const fleet = Object.values(drivers).map(d => ({
                    id: d.socketId, 
                    name: d.name, 
                    lat: d.lat, 
                    lng: d.lng, 
                    status: d.status
                }));
                socket.emit('admin_fleet_sync', fleet);
            }
            
            console.log(`[AUTH] ${data.role.toUpperCase()} autenticado: ${data.name}`);
        } catch (e) {
            console.error("[ERR] Handshake falhou:", e);
        }
    });

    // Telemetria em Tempo Real (GPS)
    socket.on('telemetry_update', (coords) => {
        if (users[socket.id]) {
            users[socket.id].location = coords;
            users[socket.id].lat = coords.lat;
            users[socket.id].lng = coords.lng;
            users[socket.id].lastSeen = Date.now();

            if (drivers[socket.id]) {
                drivers[socket.id].location = coords;
                drivers[socket.id].lat = coords.lat;
                drivers[socket.id].lng = coords.lng;
            }

            // Atualiza God Mode
            io.to('admin_room').emit('god_map_update', {
                id: socket.id,
                role: users[socket.id].role,
                lat: coords.lat,
                lng: coords.lng,
                status: drivers[socket.id]?.status || 'active'
            });
        }
    });

    // Gestão de Status do Motorista
    socket.on('driver_toggle_status', (isOnline) => {
        if (drivers[socket.id]) {
            drivers[socket.id].status = isOnline ? 'online' : 'offline';
            io.to('admin_room').emit('admin_log', {
                time: new Date().toLocaleTimeString(),
                msg: `Motorista ${drivers[socket.id].name} agora está ${drivers[socket.id].status}`,
                type: isOnline ? 'success' : 'warn'
            });
        }
    });

    // Solicitação de Corrida (Algoritmo de Matching Simplificado)
    socket.on('request_ride', (req) => {
        console.log(`[RIDE] Solicitação de ${socket.id} para ${req.destination}`);
        
        // Busca motoristas online e livres
        const availableDrivers = Object.values(drivers).filter(d => d.status === 'online');

        if (availableDrivers.length > 0) {
            // Pega o primeiro (Futuramente: implementar cálculo de distância)
            const driver = availableDrivers[0];
            const rideId = uuidv4();
            
            activeRides[rideId] = {
                id: rideId,
                client: socket.id,
                driver: driver.socketId,
                status: 'pending',
                reqData: req,
                created: Date.now()
            };

            // Notifica o motorista
            io.to(driver.socketId).emit('ride_offer', {
                rideId: rideId,
                clientName: users[socket.id]?.name || 'Cliente Obsidian',
                ...req
            });
            
            // Avisa o admin
            io.to('admin_room').emit('admin_log', { msg: `Match Potencial: ${users[socket.id]?.name} -> ${driver.name}`, type: 'info' });

        } else {
            socket.emit('ride_error', { code: 'NO_DRIVERS', msg: "Todos os carros Obsidian estão ocupados. Tente novamente em instantes." });
        }
    });

    // Aceite de Corrida
    socket.on('driver_accept_ride', (rideId) => {
        const ride = activeRides[rideId];
        if (ride && ride.status === 'pending') {
            ride.status = 'active';
            
            // Atualiza status do motorista
            if(drivers[socket.id]) {
                drivers[socket.id].status = 'busy';
            }

            // Notifica Cliente
            io.to(ride.client).emit('ride_matched', {
                rideId: rideId,
                driverName: drivers[socket.id].name,
                carModel: "BMW 320i M Sport", // Hardcoded para MVP, depois puxar do perfil
                plate: "OBS-9999",
                eta: Math.floor(Math.random() * 5) + 2, // Simulação de tempo
                driverLocation: drivers[socket.id].location
            });
            
            // Inicia monitoramento de viagem
            io.to('admin_room').emit('admin_log', { msg: `Corrida INICIADA: ID ${rideId.split('-')[0]}`, type: 'success' });
        }
    });

    // Segurança: Botão de Pânico
    socket.on('sos_alert', (data) => {
        console.error(`[SOS] ALERTA CRÍTICO DE ${socket.id}`);
        io.to('admin_room').emit('admin_log', { msg: `!!! SOS ACIONADO !!! Usuário: ${data.user?.name}`, type: 'error' });
        // Aqui entraria integração com SMS/Twilio
    });

    socket.on('disconnect', () => {
        console.log(`[NET] Desconectado: ${socket.id}`);
        if (drivers[socket.id]) delete drivers[socket.id];
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`>>> OBSIDIAN CORE ONLINE | PORT ${PORT}`));