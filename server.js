const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configuração do Socket.IO para aceitar conexão do seu site no Render
const io = new Server(server, {
    cors: {
        origin: "*", // Libera acesso geral (mais fácil para evitar erros de CORS em produção)
        methods: ["GET", "POST"]
    }
});

// --- CONFIGURAÇÃO DE PASTAS (CRUCIAL) ---
// O server está em /backend, então precisamos subir um nível (..) para achar a /public
const publicPath = path.join(__dirname, '../public');

console.log(`📂 Servindo arquivos estáticos de: ${publicPath}`);

// Serve a pasta public como estática
app.use(express.static(publicPath));

// Garante que qualquer rota acessada devolva o index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- BANCO DE DADOS EM MEMÓRIA (VOLÁTIL) ---
// Como não temos MySQL/MongoDB configurado, usaremos variáveis para guardar o estado enquanto o server roda
let drivers = {};       // Lista de motoristas online
let activeRides = {};   // Lista de corridas ativas

// --- LÓGICA DO "UBER" (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log(`🔌 Nova Conexão: ${socket.id}`);

    // 1. USUÁRIO ENTROU NA REDE (Evento 'join_network')
    socket.on('join_network', (user) => {
        // user = { type: 'driver' | 'passenger' | 'admin', id: ... }
        console.log(`👤 Usuário identificado: ${user.type} (${socket.id})`);

        // Se for motorista, adiciona na sala 'drivers'
        if (user.type === 'driver') {
            drivers[socket.id] = user;
            socket.join('drivers'); 
            console.log(`🚕 Motorista ${socket.id} está ONLINE e pronto.`);
        } 
        // Se for passageiro, adiciona na sala 'passengers'
        else if (user.type === 'passenger') {
            socket.join('passengers');
        }
    });

    // 2. PASSAGEIRO PEDIU CORRIDA (Evento 'request_ride')
    socket.on('request_ride', (rideData) => {
        console.log(`🔔 Nova solicitação de corrida de: ${rideData.passengerName}`);
        
        // Cria um ID único para a corrida
        const rideId = Date.now().toString();
        
        // Salva os dados da corrida
        activeRides[rideId] = {
            ...rideData,
            rideId: rideId,
            passengerSocketId: socket.id,
            status: 'pending'
        };

        // ENVIA O ALERTA APENAS PARA OS MOTORISTAS (Sala 'drivers')
        // O evento no front é 'new_ride_alert'
        io.to('drivers').emit('new_ride_alert', activeRides[rideId]);
    });

    // 3. MOTORISTA ACEITOU A CORRIDA (Evento 'accept_ride')
    socket.on('accept_ride', (data) => {
        const ride = activeRides[data.rideId];

        if (ride && ride.status === 'pending') {
            ride.status = 'accepted';
            ride.driverSocketId = socket.id;

            console.log(`✅ Corrida ${data.rideId} ACEITA pelo motorista ${socket.id}`);

            // AVISA O PASSAGEIRO ESPECÍFICO QUE O MOTORISTA ESTÁ INDO
            // O evento no front é 'ride_accepted'
            io.to(ride.passengerSocketId).emit('ride_accepted', {
                driverId: socket.id,
                driverName: "Motorista Parceiro", // Você pode puxar o nome real se tiver salvo
                carModel: "Veículo Obsidian",
                plate: "OBS-2025"
            });
        }
    });

    // 4. DESCONEXÃO
    socket.on('disconnect', () => {
        console.log(`❌ Desconectado: ${socket.id}`);
        // Se era motorista, remove da lista
        if (drivers[socket.id]) {
            delete drivers[socket.id];
        }
    });
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`💎 OBSIDIAN SERVER RODANDO NA URL: https://uber-backend-3lzg.onrender.com (Porta ${PORT})`);
});