const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Rota de saúde para o Render manter o serviço ativo
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
// Em produção real, isso iria para um Redis ou Banco de Dados
let drivers = {}; // { socketId: { id, name, lat, lng, type, busy } }
let users = {};   // { userId: socketId } (Mapeamento para reconexão)
let rides = {};   // { rideId: { passengerId, driverId, status, room } }

io.on('connection', (socket) => {
    console.log(`[CONEXÃO] Nova sessão: ${socket.id}`);

    // 1. LOGIN & REGISTRO (VINCULAÇÃO DE SESSÃO)
    socket.on('login', (userData) => {
        users[userData.id] = socket.id; // Vincula ID do usuário ao Socket atual
        socket.userData = userData;     // Salva dados na sessão do socket
        
        console.log(`[LOGIN] ${userData.name} (${userData.role})`);
        
        if (userData.role === 'driver') {
            drivers[socket.id] = {
                ...userData,
                socketId: socket.id,
                busy: false
            };
            // Atualiza mapa para todos os conectados
            io.emit('update_drivers_map', Object.values(drivers));
        }
    });

    // 2. PEDIDO DE CORRIDA
    socket.on('request_ride', (data) => {
        const rideId = 'ride_' + Date.now();
        
        // Cria a sala segura da corrida (apenas para quem tiver o ID)
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

        // Envia apenas para motoristas livres
        const availableDrivers = Object.values(drivers).filter(d => !d.busy);
        availableDrivers.forEach(d => {
            io.to(d.socketId).emit('new_ride_request', {
                rideId: rideId,
                from: data.from,
                to: data.to,
                price: data.price, // Preço estimado inicial
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

            // Coloca o motorista na mesma sala segura do passageiro
            socket.join(ride.room);

            // Avisa o passageiro (que já está na sala)
            io.to(ride.room).emit('ride_accepted', {
                driver: drivers[socket.id],
                rideId: payload.rideId,
                room: ride.room
            });

            // Confirma para o motorista
            socket.emit('ride_confirmed_driver', { 
                passenger: ride.passengerData,
                room: ride.room 
            });

            console.log(`[MATCH] Corrida iniciada na sala segura: ${ride.room}`);
        }
    });

    // 4. CHAT PRIVADO (SEGURANÇA DE DADOS)
    socket.on('send_message', (data) => {
        // data deve conter { room, text, sender }
        if (data.room) {
            // .broadcast.to(room) envia para todos na sala MENOS quem mandou
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
            io.to(data.room).emit('ride_finished', data); // Avisa ambos os lados
            
            // Limpeza e liberação do motorista
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