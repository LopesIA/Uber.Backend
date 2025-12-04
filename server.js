/**
 * OBSIDIAN SERVER | TITANIUM ENGINE v4.0
 * Backend Real-Time para aplicação de Mobilidade.
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Configuração CORS (Permite qualquer origem para facilitar MVP)
app.use(cors());

// Proteção com exceções para imagens externas
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json());

// Servir Arquivos Estáticos (Frontend)
app.use(express.static(path.join(__dirname, '/')));

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Aceita conexão de qualquer lugar
        methods: ["GET", "POST"]
    }
});

let activeDrivers = [];
let rideRequests = [];

io.on('connection', (socket) => {
    console.log(`🔌 Nova Conexão: ${socket.id}`);

    // Identificação
    socket.on('join_network', (data) => {
        socket.userData = data; 
        if (data.type === 'driver') {
            activeDrivers.push({ id: socket.id, ...data });
            console.log(`🚕 Motorista Online: ${socket.id}`);
        } else {
            console.log(`🧍 Passageiro Conectado: ${socket.id}`);
        }
    });

    // Pedido de Corrida
    socket.on('request_ride', (rideData) => {
        console.log("📍 Novo Pedido:", rideData);
        
        const rideId = Date.now().toString();
        const request = { ...rideData, rideId, passengerSocketId: socket.id, status: 'pending' };
        
        rideRequests.push(request);
        io.emit('new_ride_alert', request); 
    });

    // Aceite de Corrida
    socket.on('accept_ride', (data) => {
        console.log(`✅ Aceite por ${socket.id}`);
        
        const rideIndex = rideRequests.findIndex(r => r.rideId === data.rideId);
        if (rideIndex !== -1) {
            const ride = rideRequests[rideIndex];
            ride.status = 'accepted';
            
            io.to(ride.passengerSocketId).emit('ride_accepted', {
                driverId: socket.id,
                car: "BMW X6 Black",
                plate: "OBS-9988",
                eta: "4 MIN"
            });

            rideRequests.splice(rideIndex, 1);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Desconectado: ${socket.id}`);
        activeDrivers = activeDrivers.filter(d => d.id !== socket.id);
    });
});

// Rotas de Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`💎 OBSIDIAN SERVER RODANDO NA PORTA ${PORT}`);
});