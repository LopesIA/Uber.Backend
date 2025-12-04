const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Rota de saúde para o Render não dormir
app.get('/', (req, res) => {
    res.send('OBSIDIAN SERVER: ONLINE & SECURE.');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Aceita conexão do seu index.html
        methods: ["GET", "POST"]
    }
});

// --- ARMAZENAMENTO EM MEMÓRIA (VOLÁTIL) ---
// Em produção, isso seria um Banco de Dados (MongoDB/Postgres)
let drivers = {}; // { socketId: { lat, lng, type, busy } }
let rides = {};   // { rideId: { passengerId, driverId, status } }

io.on('connection', (socket) => {
    console.log(`[CONEXÃO] ID: ${socket.id}`);

    // --- MOTORISTA ---
    
    // Motorista fica online
    socket.on('driver_login', (data) => {
        drivers[socket.id] = {
            id: socket.id,
            ...data, // name, car, type
            busy: false
        };
        console.log(`[DRIVER] ${data.name} está online.`);
        io.emit('update_drivers_map', Object.values(drivers)); // Atualiza mapa de todos
    });

    // Motorista aceita corrida
    socket.on('driver_accept', (payload) => {
        const ride = rides[payload.rideId];
        if (ride && ride.status === 'PENDING') {
            ride.status = 'ACCEPTED';
            ride.driverId = socket.id;
            drivers[socket.id].busy = true;

            // Avisa o passageiro específico
            io.to(ride.passengerId).emit('ride_accepted', {
                driver: drivers[socket.id],
                rideId: payload.rideId
            });

            // Avisa o motorista que deu certo
            socket.emit('ride_confirmed_driver', { passenger: ride.passengerData });
        }
    });

    // --- PASSAGEIRO ---

    // Passageiro pede corrida
    socket.on('request_ride', (data) => {
        const rideId = 'ride_' + Date.now();
        rides[rideId] = {
            id: rideId,
            passengerId: socket.id,
            passengerData: data,
            status: 'PENDING',
            driverId: null
        };

        console.log(`[RIDE] Nova solicitação de ${data.name}`);

        // Envia alerta para TODOS os motoristas disponíveis
        // (Aqui poderia ter filtro de raio/distância)
        const availableDrivers = Object.keys(drivers).filter(id => !drivers[id].busy);
        availableDrivers.forEach(driverId => {
            io.to(driverId).emit('new_ride_request', {
                rideId: rideId,
                from: data.from,
                to: data.to,
                price: data.price,
                passengerName: data.name
            });
        });
    });

    // Cancelamento
    socket.on('cancel_ride', () => {
        // Lógica de cancelamento simplificada
        // Notificaria o motorista se houvesse
    });

    // --- CHAT ---
    socket.on('send_message', (data) => {
        // Envia para a outra ponta (Room ou ID direto)
        socket.broadcast.emit('receive_message', data); 
    });

    // Desconexão
    socket.on('disconnect', () => {
        if (drivers[socket.id]) {
            delete drivers[socket.id];
            io.emit('update_drivers_map', Object.values(drivers));
        }
        console.log(`[DESCONECTADO] ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});