// Este é um arquivo de servidor Node.js que simula o backend do Infinity Black usando Socket.IO.
// Para rodar, você precisará ter o Node.js e o pacote socket.io instalados.
// npm install express socket.io
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Permite que o Socket.IO aceite conexões de qualquer origem (necessário para o frontend rodar em um arquivo local)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// ===============================================
// Variáveis de Estado do Servidor
// ===============================================

let onlineDrivers = {}; // { driverId: { socketId, coords, status } }
let activeRides = {};   // { clientId: { driverId, status, rideData } }
let clientQueue = [];   // Fila de espera de requisições

const SIMULATED_DRIVERS = [
    { id: 'driver_0', name: 'Ricardo A.', carModel: 'Mercedes-Benz E-Class', plate: 'XYZ-9876', type: 'gold', coords: [-20.0050, -40.0070], photo: 'https://randomuser.me/api/portraits/men/32.jpg' },
    { id: 'driver_1', name: 'Ana P.', carModel: 'BMW X5', plate: 'ABC-1234', type: 'black', coords: [-20.0020, -40.0090], photo: 'https://randomuser.me/api/portraits/women/44.jpg' },
    { id: 'driver_2', name: 'Sérgio M.', carModel: 'Land Rover Defender Blindada', plate: 'DEF-5678', type: 'platinum', coords: [-20.0010, -40.0050], photo: 'https://randomuser.me/api/portraits/men/15.jpg' }
];

// ===============================================
// Lógica de Socket.IO
// ===============================================

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // [1] Login (Inicialização)
    socket.on('login', (data) => {
        console.log(`Login: ${data.email} como ${data.role}`);
    });

    // [2] Motorista Online/Offline
    socket.on('driver_online', (data) => {
        const driver = SIMULATED_DRIVERS.find(d => d.id === data.driverId) || SIMULATED_DRIVERS[0];
        onlineDrivers[driver.id] = { 
            socketId: socket.id, 
            ...driver, 
            status: 'available' 
        };
        console.log(`Motorista ${driver.id} agora ONLINE. Total: ${Object.keys(onlineDrivers).length}`);
    });

    socket.on('driver_offline', (data) => {
        delete onlineDrivers[data.driverId];
        console.log(`Motorista ${data.driverId} agora OFFLINE. Total: ${Object.keys(onlineDrivers).length}`);
    });

    // [3] Requisição de Corrida (Cliente)
    socket.on('request_ride', (data) => {
        console.log(`Nova Requisição: ${data.type} para ${data.dest}`);
        console.log(`   - Smooth Ride Pax: ${data.numPassengers}`);
        console.log(`   - Multimodal ID: ${data.multimodalID}`);
        console.log(`   - Biometria: ${data.biometricEnabled}`);
        
        clientQueue.push({ socketId: socket.id, rideData: data });
        attemptMatch();
    });

    // [4] Motorista Aceita Corrida
    socket.on('driver_accept', (data) => {
        const ride = activeRides[data.clientId];
        if (ride) {
            // Notifica o cliente
            io.to(ride.clientSocketId).emit('driver_found', {
                driverId: ride.driverId,
                driverName: ride.driverName,
                carModel: ride.carModel,
                plate: ride.plate,
                type: ride.rideData.type,
                driverPhoto: ride.driverPhoto
            });
            console.log(`MATCH CONFIRMADO: Cliente ${data.clientId} com Motorista ${data.driverId}`);
            ride.status = 'on_the_way';
            // Remove o motorista da lista de disponíveis
            if (onlineDrivers[data.driverId]) onlineDrivers[data.driverId].status = 'busy';
        }
    });

    // [5] Desconexão
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        // Remove o motorista desconectado
        for (const id in onlineDrivers) {
            if (onlineDrivers[id].socketId === socket.id) {
                delete onlineDrivers[id];
                console.log(`Motorista ${id} removido da lista online.`);
                break;
            }
        }
        // Remove o cliente desconectado da fila
        clientQueue = clientQueue.filter(q => q.socketId !== socket.id);
    });
});

// ===============================================
// Lógica de Matchmaking (Simulada)
// ===============================================

function attemptMatch() {
    if (clientQueue.length === 0) return;

    const request = clientQueue[0]; // Pega o primeiro da fila
    const drivers = Object.values(onlineDrivers).filter(d => d.status === 'available');

    if (drivers.length > 0) {
        // Lógica de Matchmaking Avançada (Simulada)
        // 1. Prioriza o nível de serviço (Platinum > Gold > Black)
        const matchedDriver = drivers.find(d => d.type === request.rideData.type) || drivers[0]; 

        if (matchedDriver) {
            // Envia a requisição para o motorista
            io.to(matchedDriver.socketId).emit('ride_request_to_driver', request.rideData);
            console.log(`REQUISIÇÃO ENVIADA: Cliente para Motorista ${matchedDriver.id}`);

            // Move o estado da corrida para 'pendente'
            const clientId = `client_${Math.floor(Math.random() * 100)}`; // ID simulado
            activeRides[clientId] = {
                clientSocketId: request.socketId,
                driverId: matchedDriver.id,
                driverName: matchedDriver.name,
                carModel: matchedDriver.carModel,
                plate: matchedDriver.plate,
                driverPhoto: matchedDriver.photo,
                status: 'pending',
                rideData: request.rideData
            };

            clientQueue.shift(); // Remove da fila após enviar a requisição
        }
    } else {
        console.log("Nenhum motorista disponível para match.");
    }
}


// Inicia o servidor na porta 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor Infinity Black rodando na porta ${PORT}`);
    console.log('Use o comando "node server.js" para manter ativo.');
});