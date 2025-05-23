const baileys = require("@whiskeysockets/baileys");
const { Boom } = require('@hapi/boom');

async function startBot() {
    // Auth setup
    const { state, saveCreds } = await baileys.useMultiFileAuthState('./auth_info');
    
    // Create socket with pairing configuration
    const sock = baileys.makeWASocket({
        auth: state,
        printQRInTerminal: false,
        mobile: false, // Important for pairing code
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle pairing code event
    sock.ev.on('connection.update', async (update) => {
        const { connection, pairingCode } = update;
        
        if (pairingCode) {
            console.log(`\n╔══════════════════════════╗`);
            console.log(`║    PAIRING CODE: ${pairingCode}    ║`);
            console.log(`╚══════════════════════════╝`);
            console.log("\nTo pair:");
            console.log("1. Open WhatsApp on your phone");
            console.log("2. Go to Linked Devices");
            console.log("3. Select 'Link a Device'");
            console.log("4. Choose 'Pair with code instead'");
            console.log("5. Enter the code above\n");
        }
        
        if (connection === 'close') {
            console.log("Connection closed, reconnecting...");
            startBot();
        }
    });
    
    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        
        const text = msg.message.conversation || '';
        const sender = msg.key.remoteJid;
        
        if (text.toLowerCase() === '!ping') {
            await sock.sendMessage(sender, { text: 'Pong! 🏓' });
        }
    });
}

startBot().catch(err => console.log("Error:", err));