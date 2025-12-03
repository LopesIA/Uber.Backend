/*
 * ======================================================================================
 * INFINITY BLACK | BACKEND CORE
 * Build: Production v3.0
 * Logic: WebSocket Realtime, Geo-Spatial Matching, Secure Chat
 * ======================================================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Configuração do Servidor
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, restrinja ao seu domínio Firebase
        methods: ["GET", "POST"]
    }
});

// =================================================================
// 1. STATE MANAGEMENT (MEMORY DB)
// =================================================================
// Armazena motoristas online: { socketId, userDat, location: {lat, lng}, status }
let drivers = {}; 

// Armazena viagens ativas: { rideId, clientSocket, driverSocket, status, route }
let activeRides = {};

// =================================================================
// 2. HELPER FUNCTIONS (MATH & LOGIC)
// =================================================================

// Fórmula de Haversine para calcular distância real em KM entre duas coordenadas GPS
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
    
    var R = 6371; // Raio da terra em km
    var dLat = deg2rad(lat2-lat1);  
    var dLon = deg2rad(lon2-lon1); 
    var a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distância em km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// =================================================================
// 3. SOCKET EVENT PIPELINE
// =================================================================

io.on('connection', (socket) => {
    console.log(`[NET] Nova Conexão: ${socket.id}`);

    // --- DRIVER EVENTS ---

    socket.on('driver_online', (userData) => {
        // Registra motorista como disponível
        drivers[socket.id] = {
            id: socket.id,
            profile: userData,
            location: { lat: 0, lng: 0 },
            status: 'available', // available, busy
            lastUpdate: Date.now()
        };
        console.log(`[DRIVER] ${userData.name} está ONLINE.`);
        socket.emit('sys_msg', { msg: "Você está conectado à rede Infinity." });
    });

    socket.on('driver_offline', () => {
        if (drivers[socket.id]) {
            console.log(`[DRIVER] ${drivers[socket.id].profile.name} ficou OFFLINE.`);
            delete drivers[socket.id];
        }
    });

    // O GPS do celular do motorista envia isso a cada movimento
    socket.on('driver_location', (coords) => {
        if (drivers[socket.id]) {
            drivers[socket.id].location = coords;
            drivers[socket.id].lastUpdate = Date.now();
            
            // Opcional: Logar apenas a cada X segundos para não sujar o console
            // console.log(`[GPS] Driver ${socket.id} update: ${coords.lat}, ${coords.lng}`);
        }
    });

    socket.on('driver_accept_ride', (rideId) => {
        const ride = activeRides[rideId];
        if (ride && ride.status === 'searching') {
            ride.status = 'accepted';
            ride.driverSocket = socket.id;
            ride.driverData = drivers[socket.id].profile;
            
            // Marca motorista como ocupado
            if(drivers[socket.id]) drivers[socket.id].status = 'busy';

            // Notifica Cliente
            io.to(ride.clientSocket).emit('ride_matched', {
                rideId: rideId,
                driver: drivers[socket.id].profile,
                location: drivers[socket.id].location,
                eta: 5 // Calcular ETA real baseado na distância depois
            });

            // Confirma para Motorista
            socket.emit('ride_start_nav', { rideId: rideId, clientLoc: ride.pickupLocation });
            
            console.log(`[RIDE] Match confirmado: ${rideId}`);
        }
    });

    // --- CLIENT EVENTS ---

    socket.on('request_ride', (requestData) => {
        console.log(`[REQ] Nova solicitação de ${socket.id} para ${requestData.type}`);
        
        const clientLat = requestData.loc.lat;
        const clientLng = requestData.loc.lng;
        
        // 1. Matchmaking Real: Encontrar motorista mais próximo
        let bestDriver = null;
        let minDistance = 99999; // Infinito

        Object.values(drivers).forEach(driver => {
            if (driver.status === 'available') {
                const dist = getDistanceFromLatLonInKm(clientLat, clientLng, driver.location.lat, driver.location.lng);
                
                // Lógica de "Radar": Aceita motoristas num raio de 10km
                if (dist < 10 && dist < minDistance) {
                    minDistance = dist;
                    bestDriver = driver;
                }
            }
        });

        if (bestDriver) {
            // Cria ID único para a corrida
            const rideId = uuidv4();
            
            activeRides[rideId] = {
                id: rideId,
                clientSocket: socket.id,
                pickupLocation: requestData.loc,
                destination: requestData.dest,
                type: requestData.type,
                status: 'searching',
                createdAt: Date.now()
            };

            // Envia convite APENAS para o motorista escolhido
            io.to(bestDriver.id).emit('ride_request', {
                rideId: rideId,
                pickup: "Localização Atual (GPS)", // Em produção, fazer geocoding reverso
                dest: requestData.dest,
                dist: minDistance.toFixed(1),
                price: (15 + (minDistance * 2.5)).toFixed(2) // Cálculo simples de preço
            });
            
            console.log(`[MATCH] Oferta enviada para Motorista ${bestDriver.id} (${minDistance.toFixed(1)}km)`);
            
        } else {
            // Nenhum motorista no raio
            socket.emit('ride_error', { msg: "Nenhum motorista disponível na sua área." });
        }
    });

    // --- CHAT & COMMS ---
    
    socket.on('chat_message', (data) => {
        // data: { targetSocketId, message }
        // Envia mensagem direta para o outro par
        io.to(data.targetId).emit('chat_receive', {
            msg: data.msg,
            sender: socket.id
        });
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        if (drivers[socket.id]) {
            console.log(`[NET] Driver Desconectado: ${socket.id}`);
            delete drivers[socket.id];
        } else {
            console.log(`[NET] Client Desconectado: ${socket.id}`);
        }
    });
});

// Inicia Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ==================================================
    INFINITY BLACK CORE | SERVIDOR ONLINE
    Porta: ${PORT}
    Status: PRONTO PARA CONEXÕES
    ==================================================
    `);
});