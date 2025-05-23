const baileys = require("@whiskeysockets/baileys");
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startBot() {
    // First, ask for the WhatsApp number
    rl.question('Enter the WhatsApp account number (with country code, e.g., 911234567890) to link the bot: ', async (number) => {
        if (!number.match(/^\d+$/)) {
            console.log('❌ Invalid format! Please enter digits only (including country code). Example: 911234567890');
            rl.close();
            process.exit(1);
        }

        const jid = `${number}@s.whatsapp.net`;
        console.log(`\n🔗 Preparing to link bot to: ${jid}\n`);

        // Auth setup
        const { state, saveCreds } = await baileys.useMultiFileAuthState('./auth_info');
        
        // Create socket with pairing configuration
        const sock = baileys.makeWASocket({
            auth: state,
            printQRInTerminal: false,
            mobile: false, // Important for pairing code
            shouldSyncHistoryMessage: () => true,
        });
        
        // Save credentials
        sock.ev.on('creds.update', saveCreds);
        
        // Handle pairing code event
        sock.ev.on('connection.update', async (update) => {
            const { connection, pairingCode } = update;
            
            if (pairingCode) {
                console.log(`╔══════════════════════════╗`);
                console.log(`║    PAIRING CODE: ${pairingCode}    ║`);
                console.log(`╚══════════════════════════╝`);
                console.log("\n📱 Link this bot to your WhatsApp account:");
                console.log("1. Open WhatsApp > Settings > Linked Devices");
                console.log("2. Tap 'Link a Device' > 'Pair with code'");
                console.log("3. Enter the code above");
                console.log(`\n⏳ Waiting for ${jid} to link...`);
            }
            
            if (connection === 'open') {
                console.log('\n✅ Successfully linked! Bot is ready.');
                rl.close();
            }
            
            if (connection === 'close') {
                console.log("❌ Connection closed, reconnecting...");
                startBot();
            }
        });
        
        // Message handler
        sock.ev.on('messages.upsert', ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;
            
            const text = msg.message.conversation || '';
            const sender = msg.key.remoteJid;
            
            if (text.toLowerCase() === '!ping') {
                sock.sendMessage(sender, { text: 'Pong! 🏓' });
            }
        });

        // Cleanup on exit
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down...');
            sock.end();
            rl.close();
            process.exit();
        });
    });
}

startBot().catch(err => console.log("🔥 Error:", err));
