/**
 * OBSIDIAN BACKEND ELITE v2.0
 * Suporte total às funções administrativas e roleta.
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();

// --- CONFIGURAÇÃO ---
app.use(express.json());
app.use(cors({ origin: true })); // Permite requisições de qualquer origem (Seu App)

// --- INICIALIZAÇÃO FIREBASE ADMIN ---
// No Render, você deve criar uma Variável de Ambiente chamada FIREBASE_SERVICE_ACCOUNT
// e colar o conteúdo do seu arquivo JSON de chave privada lá.
// Se estiver rodando local para teste, pode descomentar a linha do arquivo.

let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Fallback para arquivo local (apenas dev)
        // serviceAccount = require('./serviceAccountKey.json');
        console.warn("⚠️ AVISO: Variável FIREBASE_SERVICE_ACCOUNT não encontrada.");
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔥 Firebase Admin conectado com sucesso.");
    }
} catch (error) {
    console.error("❌ Erro ao iniciar Firebase Admin:", error.message);
}

const db = admin.firestore();
const auth = admin.auth();
const messaging = admin.messaging(); // Para notificações

// --- MIDDLEWARE DE SEGURANÇA (ADMIN CHECK) ---
// Verifica se quem está chamando a API é realmente um admin no banco de dados
async function verifyAdmin(req, res, next) {
    const { adminUid } = req.body;
    
    if (!adminUid) return res.status(403).json({ message: "Admin UID não fornecido." });

    try {
        const userDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!userDoc.exists || userDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
        }
        next();
    } catch (error) {
        console.error("Erro na verificação de admin:", error);
        res.status(500).json({ message: "Erro interno na verificação." });
    }
}

// --- ROTAS DO SISTEMA OBSIDIAN ---

// 1. Rota de Teste
app.get('/', (req, res) => {
    res.send('💎 OBSIDIAN BACKEND ONLINE 💎');
});

// 2. Girar Roleta (Lógica Server-Side para segurança)
app.post('/api/girar-roleta', async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ success: false, message: "UID necessário" });

    try {
        const userRef = db.collection('usuarios').doc(uid);
        const doc = await userRef.get();
        
        if (!doc.exists) return res.status(404).json({ success: false, message: "Usuário não encontrado" });
        
        const userData = doc.data();
        let girosHoje = userData.girosRealizadosHoje || 0;
        
        // Verifica limite de giros baseado no Tier
        let limiteGiros = 1; // Padrão
        if (userData.proAtivo && userData.proTier) {
            if (userData.proTier === 'tier1') limiteGiros = 2;
            if (userData.proTier === 'tier2') limiteGiros = 3;
            if (userData.proTier === 'tier3') limiteGiros = 4;
            if (userData.proTier === 'tier4') limiteGiros = 5;
        }

        // Verifica se é um novo dia (Reset simples)
        const hojeString = new Date().toDateString();
        if (userData.ultimoGiroRoleta !== hojeString) {
            // Se for novo dia, zera o contador (a menos que seja negativo = crédito extra)
            if (girosHoje > 0) girosHoje = 0;
        }

        if (girosHoje >= limiteGiros) {
            return res.json({ success: false, message: "Você atingiu seu limite diário de giros." });
        }

        // LÓGICA DO SORTEIO (Probabilidades)
        const rand = Math.random() * 100;
        let targetIndex = 0;
        let msgRetorno = "";
        let tipoPr = "pontos"; // pontos, item, caixa
        let recompensa = {};

        // Configuração dos Prêmios (Indices baseados no seu array do front)
        // 0=1pt, 2=2pt, 4=3pt, 6=4pt, 8=5pt, 10=6pt, 12=7pt, 14=8pt, 16=9pt, 18=10pt
        // 1=Moldura Bronze, 3=Balao Bronze, 5=Moldura Prata, 7=Balao Prata
        // 9=CAIXA, 11=Moldura Ouro, 13=Balao Ouro, 15=Moldura Diamante, 17=Balao Diamante

        if (rand < 50) {
            // 50% Pontos Baixos (1-4)
            const options = [0, 2, 4, 6];
            targetIndex = options[Math.floor(Math.random() * options.length)];
            const pontos = [1, 2, 3, 4][options.indexOf(targetIndex)];
            msgRetorno = `Você ganhou ${pontos} Pontos de Fidelidade!`;
            recompensa = { pontosFidelidade: admin.firestore.FieldValue.increment(pontos) };
        } else if (rand < 80) {
            // 30% Pontos Médios (5-8)
            const options = [8, 10, 12, 14];
            targetIndex = options[Math.floor(Math.random() * options.length)];
            const pontos = [5, 6, 7, 8][options.indexOf(targetIndex)];
            msgRetorno = `Você ganhou ${pontos} Pontos de Fidelidade!`;
            recompensa = { pontosFidelidade: admin.firestore.FieldValue.increment(pontos) };
        } else if (rand < 90) {
            // 10% Itens Bronze/Prata (Temporário 24h)
            const options = [1, 3, 5, 7];
            targetIndex = options[Math.floor(Math.random() * options.length)];
            const itemMap = { 1: 'moldura_bronze', 3: 'balao_bronze', 5: 'moldura_prata', 7: 'balao_prata' };
            const itemKey = itemMap[targetIndex];
            
            msgRetorno = "Você ganhou um item visual por 24 horas!";
            tipoPr = "item";
            
            // Salva prêmio temporário
            const validade = new Date();
            validade.setDate(validade.getDate() + 1);
            recompensa[`premiosTemporarios.${itemKey}`] = admin.firestore.Timestamp.fromDate(validade);

        } else if (rand < 98) {
            // 8% Itens Ouro/Diamante (Temporário 24h)
            const options = [11, 13, 15, 17];
            targetIndex = options[Math.floor(Math.random() * options.length)];
            const itemMap = { 11: 'moldura_ouro', 13: 'balao_ouro', 15: 'moldura_diamante', 17: 'balao_diamante' };
            const itemKey = itemMap[targetIndex];
            
            msgRetorno = "INCRÍVEL! Item Raro por 24 horas!";
            tipoPr = "item";
            
            const validade = new Date();
            validade.setDate(validade.getDate() + 1);
            recompensa[`premiosTemporarios.${itemKey}`] = admin.firestore.Timestamp.fromDate(validade);

        } else {
            // 2% CAIXA MISTERIOSA (Index 9)
            targetIndex = 9;
            tipoPr = "caixa";
            
            if (userData.tipo === 'cliente') {
                msgRetorno = "JACKPOT! Você ganhou 5 DIAS DE VIP!";
                const validade = new Date();
                validade.setDate(validade.getDate() + 5);
                recompensa = { 
                    vip: true, 
                    vipExpirationDate: admin.firestore.Timestamp.fromDate(validade) 
                };
            } else {
                msgRetorno = "JACKPOT! Seu perfil foi TURBINADO por 24h!";
                const validade = new Date();
                validade.setDate(validade.getDate() + 1);
                recompensa = { 
                    boostExpiracao: admin.firestore.Timestamp.fromDate(validade) 
                };
            }
        }

        // Aplica atualizações
        recompensa.girosRealizadosHoje = admin.firestore.FieldValue.increment(1);
        recompensa.ultimoGiroRoleta = new Date().toDateString();

        await userRef.update(recompensa);

        res.json({ success: true, targetIndex, msgRetorno, tipoPr });

    } catch (error) {
        console.error("Erro na roleta:", error);
        res.status(500).json({ success: false, message: "Erro interno." });
    }
});

// 3. Admin: Resetar Senha de Usuário
app.post('/admin/reset-user-password', verifyAdmin, async (req, res) => {
    const { targetUid, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Senha deve ter 6 caracteres ou mais." });
    }

    try {
        await auth.updateUser(targetUid, { password: newPassword });
        console.log(`Senha de ${targetUid} alterada pelo admin.`);
        res.json({ success: true, message: "Senha atualizada com sucesso." });
    } catch (error) {
        console.error("Erro ao resetar senha:", error);
        res.status(500).json({ message: "Erro ao atualizar senha no Firebase Auth." });
    }
});

// 4. Admin: Pegar Detalhes Completos (Auth + Firestore)
app.post('/admin/get-user-details', verifyAdmin, async (req, res) => {
    const { targetUid } = req.body;
    try {
        // Pega dados do Auth (Email, Criação, Ultimo Login)
        const userRecord = await auth.getUser(targetUid);
        
        // Pega dados do Firestore
        const doc = await db.collection('usuarios').doc(targetUid).get();
        const firestoreData = doc.exists ? doc.data() : {};

        res.json({
            auth: {
                email: userRecord.email,
                creationTime: userRecord.metadata.creationTime,
                lastSignInTime: userRecord.metadata.lastSignInTime
            },
            firestore: firestoreData
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 5. Admin: Atualizar Firestore (Bypass regras de segurança do cliente)
app.post('/admin/update-user-firestore', verifyAdmin, async (req, res) => {
    const { targetUid, updates } = req.body;
    try {
        await db.collection('usuarios').doc(targetUid).update(updates);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 6. Admin: Habilitar/Desabilitar Conta
app.post('/admin/toggle-user-status', verifyAdmin, async (req, res) => {
    const { targetUid, disable } = req.body; // disable = true (banir), false (ativar)
    try {
        await auth.updateUser(targetUid, { disabled: disable });
        res.json({ success: true, message: `Usuário ${disable ? 'desabilitado' : 'reativado'}.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 7. Enviar Notificação Push Individual
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body; // Admin UID verification opcional aqui se quiser aberto para sistema

    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) return res.status(404).json({ message: "Usuário não encontrado" });

        const tokens = userDoc.data().fcmTokens || [];
        if (tokens.length === 0) return res.status(200).json({ message: "Usuário sem tokens FCM." });

        const messagePayload = {
            notification: { title, body },
            data: data || {},
            tokens: tokens
        };

        const response = await messaging.sendMulticast(messagePayload);
        
        // Limpeza de tokens inválidos
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                }
            });
            if (failedTokens.length > 0) {
                await db.collection('usuarios').doc(uid).update({
                    fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
                });
            }
        }

        res.json({ success: true, successCount: response.successCount, failureCount: response.failureCount });

    } catch (error) {
        console.error("Erro ao enviar notificação:", error);
        res.status(500).json({ message: error.message });
    }
});

// 8. Enviar Notificação em Massa (Marketing)
app.post('/enviar-notificacao-massa', verifyAdmin, async (req, res) => {
    const { title, body } = req.body;
    
    // Isso é pesado, idealmente usaria topics, mas vamos iterar tokens (limite 500 por lote)
    // Implementação simplificada para MVP
    try {
        const snapshot = await db.collection('usuarios').get();
        let allTokens = [];
        
        snapshot.forEach(doc => {
            const u = doc.data();
            if (u.fcmTokens && u.fcmTokens.length > 0) {
                allTokens.push(...u.fcmTokens);
            }
        });

        // Remove duplicados
        allTokens = [...new Set(allTokens)];

        if (allTokens.length === 0) return res.json({ message: "Nenhum dispositivo registrado." });

        // Envia em lotes de 500 (limite do FCM)
        let successCount = 0;
        let failureCount = 0;
        
        const chunkSize = 500;
        for (let i = 0; i < allTokens.length; i += chunkSize) {
            const chunk = allTokens.slice(i, i + chunkSize);
            const message = {
                notification: { title, body },
                tokens: chunk
            };
            const response = await messaging.sendMulticast(message);
            successCount += response.successCount;
            failureCount += response.failureCount;
        }

        res.json({ success: true, successCount, failureCount });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Obsidian rodando na porta ${PORT}`);
});