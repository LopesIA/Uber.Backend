const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// --- CONFIGURAÇÃO DO SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexão de qualquer lugar (Front e Back podem estar em domínios diferentes)
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'] // Força suporte a ambos os métodos
});

// --- CONFIGURAÇÃO DE ARQUIVOS ESTÁTICOS (ROBUSTA) ---
// Tenta servir arquivos da pasta atual (__dirname) E da pasta ../public
// Isso evita o erro de "não achar o index.html" se a estrutura de pastas mudar.
app.use(express.static(__dirname)); 
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, 'public')));

console.log(`📂 Servidor iniciado. Diretório base: ${__dirname}`);

// Rota principal: Garante que o index.html seja entregue
app.get('*', (req, res) => {
    // Tenta achar o arquivo na pasta atual primeiro
    const localIndex = path.join(__dirname, 'index.html');
    
    // Se não estiver na raiz, tenta na pasta public (ajuste comum)
    res.sendFile(localIndex, (err) => {
        if (err) {
            // Se der erro, tenta subir um nível (caso o server esteja dentro de /backend)
            res.sendFile(path.join(__dirname, '../public', 'index.html'));
        }
    });
});

// --- BANCO DE DADOS EM MEMÓRIA ---
let drivers = {};       
let activeRides = {};   

// --- LÓGICA DO "UBER" (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log(`🔌 Nova Conexão Detectada: ${socket.id}`);

    // 1. JOIN NETWORK
    socket.on('join_network', (user) => {
        console.log(`👤 Login: ${user.type} (${socket.id})`);

        if (user.type === 'driver') {
            drivers[socket.id] = user;
            socket.join('drivers'); 
            console.log(`🚕 Motorista ${socket.id} entrou na fila.`);
        } 
        else if (user.type === 'passenger') {
            socket.join('passengers');
        }
    });

    // 2. PEDIDO DE CORRIDA
    socket.on('request_ride', (rideData) => {
        console.log(`🔔 Solicitação de: ${rideData.passengerName}`);
        
        const rideId = Date.now().toString();
        
        activeRides[rideId] = {
            ...rideData,
            rideId: rideId,
            passengerSocketId: socket.id,
            status: 'pending'
        };

        // Envia para TODOS os motoristas conectados
        io.to('drivers').emit('new_ride_alert', activeRides[rideId]);
    });

    // 3. ACEITE DE CORRIDA
    socket.on('accept_ride', (data) => {
        const ride = activeRides[data.rideId];

        if (ride && ride.status === 'pending') {
            ride.status = 'accepted';
            ride.driverSocketId = socket.id;

            console.log(`✅ Corrida ${data.rideId} ACEITA por ${socket.id}`);

            // Avisa o Passageiro
            io.to(ride.passengerSocketId).emit('ride_accepted', {
                driverId: socket.id,
                driverName: "Motorista Obsidian",
                carModel: "Tesla Model S (Black)",
                plate: "OBS-2025"
            });
        }
    });

    // 4. DESCONEXÃO
    socket.on('disconnect', () => {
        console.log(`❌ Saiu: ${socket.id}`);
        if (drivers[socket.id]) {
            delete drivers[socket.id];
        }
    });
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`💎 SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`🔗 Acesso Local: http://localhost:${PORT}`);
});