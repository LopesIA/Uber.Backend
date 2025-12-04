const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const cors = require('cors');

// --- 1. INICIALIZAÇÃO DO FIREBASE (HÍBRIDO: RENDER + LOCAL) ---
// Isso permite que o código funcione no seu PC (com arquivo) e no Render (com variável segura)
let serviceAccount;

try {
    // TENTATIVA 1: Tenta ler da Variável de Ambiente (Modo Render/Produção)
    if (process.env.FIREBASE_CREDENTIALS) {
        // O Render envia a chave como texto, precisamos transformar em JSON
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        console.log("🔥 Modo: PRODUÇÃO (Variável de Ambiente detectada)");
    } 
    // TENTATIVA 2: Tenta ler o arquivo local (Modo Desenvolvimento/PC)
    else {
        serviceAccount = require("./serviceAccountKey.json");
        console.log("💻 Modo: DESENVOLVIMENTO (Arquivo local detectado)");
    }

    // Inicializa o Admin do Firebase
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Conectado com Sucesso!");

} catch (error) {
    console.error("❌ ERRO CRÍTICO NO FIREBASE:", error.message);
    console.error("👉 Dica: Se estiver no Render, adicione a variável 'FIREBASE_CREDENTIALS'.");
    console.error("👉 Dica: Se estiver no PC, verifique se 'serviceAccountKey.json' existe.");
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
// Garante que o servidor ache os arquivos html/css/js
app.use(express.static(__dirname)); 
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal (SPA - Single Page Application)
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
            try {
                await db.collection('drivers').doc(user.id).set({
                    socketId: socket.id,
                    status: 'online',
                    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                    // Mantém a localização antiga se já existir, senão cria null
                }, { merge: true });
            } catch (err) {
                console.error("Erro ao salvar motorista:", err);
            }
        } 
        else if (user.type === 'passenger') {
            socket.join('passengers');
            // Salva usuário online
            try {
                await db.collection('users').doc(user.id).set({
                    socketId: socket.id,
                    status: 'active',
                    lastSeen: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.error("Erro ao salvar passageiro:", err);
            }
        }
    });

    // 2. ATUALIZAÇÃO DE GPS (O motorista se mexe na vida real)
    socket.on('update_location', async (data) => {
        // Data deve conter { lat, lng, driverId }
        if(data.driverId) {
            try {
                // Atualiza no banco
                await db.collection('drivers').doc(data.driverId).update({
                    location: { 
                        lat: data.lat, 
                        lng: data.lng,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }
                });
                // Dica: Aqui poderíamos emitir para o passageiro ver o carro andando
            } catch (err) {
                // Silencia erros menores de update para não poluir o log
            }
        }
    });

    // 3. PEDIDO DE CORRIDA
    socket.on('request_ride', async (rideData) => {
        console.log(`🔔 Solicitação: ${rideData.passengerName}`);
        
        try {
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
        } catch (err) {
            console.error("Erro ao criar corrida:", err);
        }
    });

    // 4. ACEITE DE CORRIDA (Com Transação para evitar duplicidade)
    socket.on('accept_ride', async (data) => {
        try {
            const rideRef = db.collection('rides').doc(data.rideId);

            // Transação: Garante que dois motoristas não aceitem a mesma corrida ao mesmo tempo
            await db.runTransaction(async (t) => {
                const doc = await t.get(rideRef);
                
                if (!doc.exists) {
                    throw "Corrida não existe!";
                }

                const rideData = doc.data();

                if (rideData.status === 'pending') {
                    // Se ainda estiver pendente, este motorista ganha a corrida
                    t.update(rideRef, {
                        status: 'accepted',
                        driverSocketId: socket.id,
                        driverId: data.driverId || 'unknown',
                        acceptedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Retorna dados para usar fora da transação
                    return rideData; 
                } else {
                    throw "Corrida já aceita por outro motorista!";
                }
            }).then((rideData) => {
                // Sucesso: Avisa todo mundo
                console.log(`✅ Corrida ${data.rideId} ACEITA por ${socket.id}`);

                // Avisa o Passageiro Específico
                io.to(rideData.passengerSocketId).emit('ride_accepted', {
                    rideId: rideData.rideId,
                    driverId: socket.id,
                    driverName: "Motorista Parceiro", 
                    plate: "OBS-REAL"
                });
            }).catch((err) => {
                console.log("⚠️ Tentativa de aceite falhou:", err);
            });

        } catch (err) {
            console.error("Erro no processo de aceite:", err);
        }
    });

    // 5. DESCONEXÃO
    socket.on('disconnect', async () => {
        console.log(`❌ Saiu: ${socket.id}`);
        // Futuramente: Podemos marcar o motorista como 'offline' no banco aqui
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`💎 SERVIDOR OBSIDIAN (PRODUÇÃO) RODANDO NA PORTA ${PORT}`);
});