const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexão de qualquer lugar (Front no Firebase)
        methods: ["GET", "POST"]
    }
});

// --- ESTADO DO MUNDO (SIMULAÇÃO NO SERVIDOR) ---
// Em um app real, isso viria do GPS dos motoristas conectados
let drivers = [];
const CENTER_LAT = -23.550520; // São Paulo
const CENTER_LNG = -46.633308;

// Inicializa motoristas
for (let i = 0; i < 20; i++) {
    drivers.push({
        id: `driver_${i}`,
        lat: CENTER_LAT + (Math.random() - 0.5) * 0.05,
        lng: CENTER_LNG + (Math.random() - 0.5) * 0.05,
        destLat: CENTER_LAT + (Math.random() - 0.5) * 0.05,
        destLng: CENTER_LNG + (Math.random() - 0.5) * 0.05,
        speed: 0.00005 + Math.random() * 0.00005,
        type: Math.random() > 0.7 ? 'LUXURY' : 'PREMIUM', // Categorias
        angle: 0
    });
}

// Loop de "Game" no Servidor (Atualiza posições a cada 100ms)
setInterval(() => {
    drivers.forEach(driver => {
        const dLat = driver.destLat - driver.lat;
        const dLng = driver.destLng - driver.lng;
        const dist = Math.sqrt(dLat*dLat + dLng*dLng);

        if (dist < 0.0005) {
            // Chegou no destino, define novo aleatório
            driver.destLat = driver.lat + (Math.random() - 0.5) * 0.02;
            driver.destLng = driver.lng + (Math.random() - 0.5) * 0.02;
        } else {
            // Move o carro
            driver.lat += (dLat / dist) * driver.speed;
            driver.lng += (dLng / dist) * driver.speed;
            // Calcula angulo para rotação do ícone
            driver.angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
        }
    });

    // Envia o estado atualizado para TODOS os clientes conectados
    io.emit('drivers_update', drivers);
}, 200);

// --- GERENCIAMENTO DE CONEXÕES ---
io.on('connection', (socket) => {
    console.log('Novo passageiro conectado:', socket.id);

    // Quando o passageiro pede uma corrida
    socket.on('request_ride', (data) => {
        console.log(`Corrida solicitada por ${socket.id} de ${data.pickup} para ${data.dest}`);
        
        // Simula encontrar um motorista após 3 segundos
        setTimeout(() => {
            // Pega o motorista mais próximo (simulado aqui pegando o primeiro)
            const driver = drivers[0];
            socket.emit('ride_accepted', {
                driverName: "Alessandro M.",
                carModel: "BMW Série 3 (Preto)",
                plate: "INF-9999",
                rating: 5.0,
                arrivalTime: "3 min"
            });
        }, 3000);
    });

    socket.on('disconnect', () => {
        console.log('Passageiro desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Infinity rodando na porta ${PORT}`);
});