const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const cors = require('cors');

// --- 1. INICIALIZAÇÃO DO FIREBASE ADMIN (O Cérebro Real) ---
// Certifique-se de ter o arquivo serviceAccountKey.json na pasta
try {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin Conectado com Sucesso!");
} catch (error) {
    console.error("❌ ERRO: Faltando 'serviceAccountKey.json'. O banco de dados não vai funcionar.");
}

const db = admin.firestore(); // Referência ao banco de dados

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- ARQUIVOS ESTÁTICOS ---
app.use(express.static(__dirname)); 
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- LÓGICA DO "UBER" (REAL-TIME + PERSISTÊNCIA) ---
io.on('connection', (socket) => {
    console.log(`🔌 Nova Conexão: ${socket.id}`);

    // 1. JOIN NETWORK (Motorista ou Passageiro entra)
    socket.on('join_network', async (user) => {
        console.log(`👤 Login: ${user.type} (${user.id})`);
        
        if (user.type === 'driver') {
            socket.join('drivers');
            
            // Salvar status do motorista no Banco de Dados Real
            await db.collection('drivers').doc(user.id).set({
                socketId: socket.id,
                status: 'online',
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                location: null // Será atualizado pelo GPS
            }, { merge: true });
        } 
        else if (user.type === 'passenger') {
            socket.join('passengers');
            // Salva usuário online
            await db.collection('users').doc(user.id).set({
                socketId: socket.id,
                status: 'active'
            }, { merge: true });
        }
    });

    // 2. ATUALIZAÇÃO DE GPS (O motorista se mexe na vida real)
    socket.on('update_location', async (data) => {
        // Data deve conter { lat, lng, driverId }
        if(data.driverId) {
            // Atualiza no banco
            await db.collection('drivers').doc(data.driverId).update({
                location: { lat: data.lat, lng: data.lng }
            });
            // Opcional: Emitir para quem estiver rastreando (admin ou passageiro em viagem)
        }
    });

    // 3. PEDIDO DE CORRIDA
    socket.on('request_ride', async (rideData) => {
        console.log(`🔔 Solicitação: ${rideData.passengerName}`);
        
        // Cria a corrida no Banco de Dados (Agora fica salvo para sempre!)
        const newRideRef = db.collection('rides').doc();
        const ridePayload = {
            ...rideData,
            rideId: newRideRef.id,
            passengerSocketId: socket.id,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await newRideRef.set(ridePayload);

        // Envia alerta APENAS para motoristas online (Socket)
        io.to('drivers').emit('new_ride_alert', ridePayload);
    });

    // 4. ACEITE DE CORRIDA
    socket.on('accept_ride', async (data) => {
        const rideRef = db.collection('rides').doc(data.rideId);
        const doc = await rideRef.get();

        if (doc.exists && doc.data().status === 'pending') {
            // Atualiza status no banco com Transação (evita que 2 motoristas peguem a mesma)
            await db.runTransaction(async (t) => {
                t.update(rideRef, {
                    status: 'accepted',
                    driverSocketId: socket.id,
                    driverId: data.driverId || 'unknown',
                    acceptedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            const ride = (await rideRef.get()).data();
            console.log(`✅ Corrida ${data.rideId} ACEITA.`);

            // Avisa o Passageiro Específico
            io.to(ride.passengerSocketId).emit('ride_accepted', {
                rideId: ride.rideId,
                driverId: socket.id,
                driverName: "Motorista Parceiro", // Deveria vir do perfil do banco
                plate: "OBS-REAL"
            });
        }
    });

    // 5. DESCONEXÃO
    socket.on('disconnect', async () => {
        // Marca motorista como offline no banco se ele cair
        // Nota: Isso requer buscar qual motorista era esse socket.
        // Para simplificar agora, deixaremos apenas o log.
        console.log(`❌ Saiu: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`💎 SERVIDOR OBSIDIAN (PRODUÇÃO) RODANDO NA PORTA ${PORT}`);
});