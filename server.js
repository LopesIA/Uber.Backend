const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Rota de saúde (Keep-Alive) para o Render
app.get('/', (req, res) => {
    res.send('OBSIDIAN SERVER: RUNNING (v2.0 Secure Mode)');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- ARMAZENAMENTO VOLÁTIL (RAM) ---
let drivers = {}; // { socketId: { id, name, lat, lng, type, busy } }
let users = {};   // { userId: socketId } (Mapeamento para reconexão)
let rides = {};   // { rideId: { passengerId, driverId, status, room } }

io.on('connection', (socket) => {
    console.log(`[CONEXÃO] Nova sessão: ${socket.id}`);

    // 1. LOGIN & REGISTRO (VINCULAÇÃO DE SESSÃO)
    socket.on('login', (userData) => {
        users[userData.id] = socket.id;
        socket.userData = userData;     
        
        console.log(`[LOGIN] ${userData.name} (${userData.role})`);
        
        if (userData.role === 'driver') {
            drivers[socket.id] = {
                ...userData,
                socketId: socket.id,
                busy: false
            };
            io.emit('update_drivers_map', Object.values(drivers));
        }
    });

    // 2. PEDIDO DE CORRIDA
    socket.on('request_ride', (data) => {
        const rideId = 'ride_' + Date.now();
        socket.join(rideId); 

        rides[rideId] = {
            id: rideId,
            passengerId: socket.id,
            passengerData: data,
            status: 'PENDING',
            driverId: null,
            room: rideId
        };

        console.log(`[RIDE] Solicitação ${rideId} de ${data.name} para ${data.to}`);

        const availableDrivers = Object.values(drivers).filter(d => !d.busy);
        availableDrivers.forEach(d => {
            io.to(d.socketId).emit('new_ride_request', {
                rideId: rideId,
                from: data.from,
                to: data.to,
                price: data.price,
                passengerName: data.name
            });
        });
    });

    // 3. ACEITE DE CORRIDA (MATCHMAKING)
    socket.on('driver_accept', (payload) => {
        const ride = rides[payload.rideId];
        
        if (ride && ride.status === 'PENDING') {
            ride.status = 'ACCEPTED';
            ride.driverId = socket.id;
            
            if (drivers[socket.id]) {
                drivers[socket.id].busy = true;
            }

            socket.join(ride.room);

            io.to(ride.room).emit('ride_accepted', {
                driver: drivers[socket.id],
                rideId: payload.rideId,
                room: ride.room
            });

            socket.emit('ride_confirmed_driver', { 
                passenger: ride.passengerData,
                room: ride.room 
            });

            console.log(`[MATCH] Corrida iniciada na sala segura: ${ride.room}`);
        }
    });

    // 4. CHAT PRIVADO (SEGURANÇA DE DADOS)
    socket.on('send_message', (data) => {
        if (data.room) {
            socket.broadcast.to(data.room).emit('receive_message', data);
            console.log(`[CHAT] Sala ${data.room}: ${data.text.substring(0, 20)}...`);
        }
    });

    // 5. ATUALIZAÇÃO DE LOCALIZAÇÃO (GPS REAL-TIME)
    socket.on('driver_location_update', (data) => {
        if (data.room) {
            socket.broadcast.to(data.room).emit('update_car_position', {
                lat: data.lat,
                lng: data.lng
            });
        }
    });
    
    // 6. FINALIZAÇÃO DA CORRIDA
    socket.on('finish_ride', (data) => {
        if (data.room) {
            io.to(data.room).emit('ride_finished', data); 
            
            const ride = rides[data.rideId];
            if(ride && drivers[ride.driverId]) {
                drivers[ride.driverId].busy = false; 
            }
        }
    });

    // 7. DESCONEXÃO
    socket.on('disconnect', () => {
        if (drivers[socket.id]) {
            delete drivers[socket.id];
            io.emit('update_drivers_map', Object.values(drivers));
        }
        console.log(`[SAIDA] Socket ${socket.id} desconectou.`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`OBSIDIAN SERVER v2.0 rodando na porta ${PORT}`);
});