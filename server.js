/*
 * ======================================================================================
 * OBSIDIAN | BACKEND CORE v6.0
 * ======================================================================================
 * Features: Admin God Mode Streams, Realtime Geo-Fencing, SOS Dispatch
 * ======================================================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// =================================================================
// 1. STATE MEMORY (Armazenamento em RAM para velocidade)
// =================================================================
let users = {};       // Todos os sockets conectados
let drivers = {};     // Apenas motoristas (Online/Offline)
let activeRides = {}; // Corridas em andamento

// =================================================================
// 2. SOCKET ENGINE
// =================================================================
io.on('connection', (socket) => {
    console.log(`[NET] New Connection: ${socket.id}`);

    // --- HANDSHAKE DE AUTENTICAÇÃO ---
    socket.on('auth_handshake', (data) => {
        // data: { role: 'client'|'driver'|'admin', userId: '...', name: '...' }
        users[socket.id] = { ...data, socketId: socket.id, lat: 0, lng: 0 };
        
        if (data.role === 'driver') {
            drivers[socket.id] = users[socket.id];
            drivers[socket.id].status = 'offline';
        }
        
        if (data.role === 'admin') {
            socket.join('admin_room'); // Sala VIP do Admin
            console.log(`[GOD MODE] Admin ${data.name} ativo.`);
            // Envia snapshot imediato da frota para o mapa do admin
            socket.emit('admin_fleet_sync', Object.values(drivers));
        }
    });

    // --- TELEMETRIA EM TEMPO REAL (GPS) ---
    socket.on('telemetry_update', (coords) => {
        // coords: { lat, lng, speed }
        if (users[socket.id]) {
            users[socket.id].location = coords;
            
            // Se for motorista, atualiza status da frota
            if (drivers[socket.id]) {
                drivers[socket.id].location = coords;
                drivers[socket.id].lastUpdate = Date.now();
            }

            // O GRANDE TRUQUE DO GOD MODE:
            // Reenvia a posição de TODO MUNDO apenas para a sala 'admin_room'
            io.to('admin_room').emit('god_map_update', {
                id: socket.id,
                role: users[socket.id].role,
                lat: coords.lat,
                lng: coords.lng,
                status: drivers[socket.id] ? drivers[socket.id].status : 'client'
            });
        }
    });

    // --- STATUS DO MOTORISTA ---
    socket.on('driver_toggle_status', (isOnline) => {
        if (drivers[socket.id]) {
            drivers[socket.id].status = isOnline ? 'online' : 'offline';
            
            // Notifica admins no log
            io.to('admin_room').emit('admin_log', {
                time: new Date().toLocaleTimeString(),
                msg: `Motorista ${drivers[socket.id].name} agora está ${drivers[socket.id].status}`,
                type: isOnline ? 'success' : 'warn'
            });
        }
    });

    // --- FLUXO DE CORRIDA (MATCHMAKING) ---
    socket.on('request_ride', (reqData) => {
        console.log(`[RIDE] Request from ${socket.id} (${reqData.tier})`);
        
        // 1. Busca motoristas online (Simulação de raio de busca)
        const candidates = Object.values(drivers).filter(d => d.status === 'online');

        if (candidates.length > 0) {
            // Pega o primeiro disponível (Lógica simplificada)
            const driver = candidates[0];
            const rideId = uuidv4();
            
            activeRides[rideId] = {
                id: rideId,
                client: socket.id,
                driver: driver.socketId,
                status: 'pending',
                tier: reqData.tier,
                price: reqData.price
            };

            // Envia oferta para o motorista
            io.to(driver.socketId).emit('ride_offer', {
                rideId: rideId,
                tier: reqData.tier,
                price: reqData.price,
                pickup: "Localização GPS",
                rating: '5.0'
            });

        } else {
            socket.emit('ride_error', { msg: "Nenhum motorista Obsidian disponível na área." });
        }
    });

    socket.on('driver_accept_ride', (rideId) => {
        const ride = activeRides[rideId];
        if (ride) {
            ride.status = 'active';
            if(drivers[socket.id]) drivers[socket.id].status = 'busy';

            // Avisa o cliente que achou motorista
            io.to(ride.client).emit('ride_matched', {
                driverName: drivers[socket.id].name,
                carModel: "BMW 320i", // Em produção, pegar do perfil do motorista
                plate: "OBS-2024",
                eta: 4
            });

            // Avisa o Admin
            io.to('admin_room').emit('admin_log', {
                msg: `Corrida iniciada: Motorista ${drivers[socket.id].name} -> Cliente.`,
                type: 'info'
            });
        }
    });

    // --- SEGURANÇA & SOS ---
    socket.on('sos_alert', (data) => {
        console.log(`[EMERGENCY] SOS from ${socket.id}`);
        // Alerta TODOS os admins imediatamente com prioridade máxima
        io.to('admin_room').emit('admin_log', {
            msg: `ALERTA DE PÂNICO: Usuário ${data.user ? data.user.name : 'Desconhecido'}`,
            type: 'error' // Vermelho no log
        });
    });

    // --- DESCONEXÃO ---
    socket.on('disconnect', () => {
        if (drivers[socket.id]) delete drivers[socket.id];
        delete users[socket.id];
    });
});

// Inicialização
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> OBSIDIAN CORE SERVER ONLINE on Port ${PORT}`);
});