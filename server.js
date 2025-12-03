/*
 * ======================================================================================
 * OBSIDIAN | BACKEND CORE v6.1 (Stable Release)
 * ======================================================================================
 * Features: Admin God Mode, Realtime Geo-Fencing, SOS Dispatch, Native Math
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
// 1. STATE MEMORY
// =================================================================
let users = {};       
let drivers = {};     
let activeRides = {}; 

// =================================================================
// 2. HELPER FUNCTIONS (Math Nativo - Sem Dependências)
// =================================================================
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em KM
}

// =================================================================
// 3. SOCKET ENGINE
// =================================================================
io.on('connection', (socket) => {
    console.log(`[NET] New Connection: ${socket.id}`);

    // --- HANDSHAKE ---
    socket.on('auth_handshake', (data) => {
        users[socket.id] = { ...data, socketId: socket.id, lat: 0, lng: 0 };
        
        if (data.role === 'driver') {
            drivers[socket.id] = users[socket.id];
            drivers[socket.id].status = 'offline';
        }
        
        if (data.role === 'admin') {
            socket.join('admin_room');
            console.log(`[GOD MODE] Admin ${data.name} ativo.`);
            socket.emit('admin_fleet_sync', Object.values(drivers));
        }
    });

    // --- TELEMETRIA ---
    socket.on('telemetry_update', (coords) => {
        if (users[socket.id]) {
            users[socket.id].location = coords;
            
            if (drivers[socket.id]) {
                drivers[socket.id].location = coords;
                drivers[socket.id].lastUpdate = Date.now();
            }

            io.to('admin_room').emit('god_map_update', {
                id: socket.id,
                role: users[socket.id].role,
                lat: coords.lat,
                lng: coords.lng,
                status: drivers[socket.id] ? drivers[socket.id].status : 'client'
            });
        }
    });

    // --- STATUS MOTORISTA ---
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

    // --- REQUEST RIDE ---
    socket.on('request_ride', (reqData) => {
        console.log(`[RIDE] Request from ${socket.id}`);
        
        // Busca motoristas online (Raio infinito para teste, ou usar getDistance < 10)
        const candidates = Object.values(drivers).filter(d => d.status === 'online');

        if (candidates.length > 0) {
            // Pega o mais próximo (Lógica simplificada: pega o primeiro)
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

            io.to(ride.client).emit('ride_matched', {
                driverName: drivers[socket.id].name,
                carModel: "BMW 320i",
                plate: "OBS-2024",
                eta: 4
            });

            io.to('admin_room').emit('admin_log', {
                msg: `Corrida iniciada: Motorista ${drivers[socket.id].name}`,
                type: 'info'
            });
        }
    });

    // --- SOS ---
    socket.on('sos_alert', (data) => {
        console.log(`[EMERGENCY] SOS from ${socket.id}`);
        io.to('admin_room').emit('admin_log', {
            msg: `ALERTA DE PÂNICO: Usuário ${data.user ? data.user.name : 'Desconhecido'}`,
            type: 'error'
        });
    });

    socket.on('disconnect', () => {
        if (drivers[socket.id]) delete drivers[socket.id];
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> OBSIDIAN CORE SERVER ONLINE on Port ${PORT}`);
});