/**
 * OBSIDIAN SERVER | TITANIUM ENGINE v4.0
 * Backend Real-Time para aplicação de Mobilidade.
 */

const express = require('express');
const http = require('http'); // Necessário para WebSocket
const { Server } = require("socket.io"); // Biblioteca de Tempo Real
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Cria o servidor HTTP
const PORT = process.env.PORT || 3000;

// --- 1. CONFIGURAÇÃO DE SEGURANÇA E CORS ---
// Permite que seu frontend no Render se conecte ao backend
const allowedOrigins = [
    "https://uber-backend-3lzg.onrender.com", 
    "http://localhost:3000",
    "http://127.0.0.1:5500"
];

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
}));

// Proteção básica, mas permitindo imagens e scripts externos (Leaflet, Google Fonts, Unsplash)
app.use(helmet({
    contentSecurityPolicy: false, // Desativado para evitar bloqueio dos seus assets externos
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json());

// --- 2. SERVIR ARQUIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, '/')));

// --- 3. TITANIUM REAL-TIME ENGINE (SOCKET.IO) ---
// É aqui que a mágica de conectar Passageiro e Motorista acontece
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, restrinja para sua URL
        methods: ["GET", "POST"]
    }
});

let activeDrivers = []; // Lista de motoristas online (Memória Volátil)
let rideRequests = [];  // Lista de pedidos de corrida

io.on('connection', (socket) => {
    console.log(`🔌 Nova Conexão: ${socket.id}`);

    // --- ROTA: LOGIN (Identificação) ---
    socket.on('join_network', (data) => {
        socket.userData = data; // { type: 'driver' | 'passenger', id: '...' }
        
        if (data.type === 'driver') {
            activeDrivers.push({ id: socket.id, ...data });
            console.log(`🚕 Motorista Online: ${socket.id}`);
        } else {
            console.log(`🧍 Passageiro Conectado: ${socket.id}`);
        }
    });

    // --- ROTA: PASSAGEIRO PEDE CORRIDA ---
    socket.on('request_ride', (rideData) => {
        console.log("📍 Novo Pedido de Corrida:", rideData);
        
        const rideId = Date.now().toString(); // ID único simples
        const request = { ...rideData, rideId, passengerSocketId: socket.id, status: 'pending' };
        
        rideRequests.push(request);

        // Envia para TODOS os motoristas conectados
        io.emit('new_ride_alert', request); 
    });

    // --- ROTA: MOTORISTA ACEITA CORRIDA ---
    socket.on('accept_ride', (data) => {
        console.log(`✅ Corrida aceita por ${socket.id}`);
        
        // Encontra o pedido
        const rideIndex = rideRequests.findIndex(r => r.rideId === data.rideId);
        if (rideIndex !== -1) {
            const ride = rideRequests[rideIndex];
            ride.status = 'accepted';
            ride.driverId = socket.id;

            // Avisa o Passageiro específico que o motorista aceitou
            io.to(ride.passengerSocketId).emit('ride_accepted', {
                driverId: socket.id,
                car: "BMW X6 Black",
                plate: "OBS-9988",
                eta: "4 MIN"
            });

            // Remove da lista de pendentes
            rideRequests.splice(rideIndex, 1);
        }
    });

    // --- ROTA: ATUALIZAÇÃO DE LOCALIZAÇÃO (GPS) ---
    socket.on('update_position', (pos) => {
        // Se for motorista, envia a posição para o passageiro da corrida atual
        if(socket.userData && socket.userData.type === 'driver') {
            // Lógica para enviar apenas para o passageiro correto
            // Por enquanto, faz broadcast para demo
            socket.broadcast.emit('driver_moved', { id: socket.id, pos });
        }
    });

    // --- DESCONEXÃO ---
    socket.on('disconnect', () => {
        console.log(`❌ Desconectado: ${socket.id}`);
        activeDrivers = activeDrivers.filter(d => d.id !== socket.id);
    });
});

// --- 4. ROTAS HTTP TRADICIONAIS ---

// Rota Principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Healthcheck (Para o Render saber que está vivo)
app.get('/health', (req, res) => {
    res.status(200).send({ status: 'ONLINE', engine: 'Titanium v4.0' });
});

// Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 5. INICIALIZAÇÃO ---
// Nota: Use 'server.listen' em vez de 'app.listen' por causa do Socket.io
server.listen(PORT, () => {
    console.log(`💎 OBSIDIAN SERVER RODANDO NA PORTA ${PORT}`);
    console.log(`🔗 Acessível em: https://uber-backend-3lzg.onrender.com`);
});