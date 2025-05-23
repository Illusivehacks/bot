const baileys = require("@whiskeysockets/baileys");
const { Boom } = require('@hapi/boom');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let sock; // Declare sock variable outside to access it in the input handler

async function startBot() {
    // Auth setup
    const { state, saveCreds } = await baileys.useMultiFileAuthState('./auth_info');
    
    // Create socket with pairing configuration
    sock = baileys.makeWASocket({
        auth: state,
        printQRInTerminal: false,
        mobile: false, // Important for pairing code
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle pairing code event
    sock.ev.on('connection.update', async (update) => {
        const { connection, pairingCode, qr } = update;
        
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
            
            // Ask for WhatsApp number after showing pairing code
            askForWhatsAppNumber();
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

function askForWhatsAppNumber() {
    rl.question('\nEnter the WhatsApp account number (with country code, e.g. 911234567890) to which the bot is linked: ', async (number) => {
        // Validate the number format (simple validation)
        if (!number.match(/^\d+$/)) {
            console.log('Invalid number format. Please enter only digits including country code.');
            askForWhatsAppNumber();
            return;
        }
        
        const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        
        try {
            // Verify the number is valid by attempting to get its profile
            const profile = await sock.profilePictureUrl(jid, 'image');
            console.log(`\nSuccessfully verified bot is linked to: ${jid}`);
            console.log(`Profile picture URL: ${profile || 'No profile picture'}`);
        } catch (error) {
            console.log(`\nFailed to verify number ${jid}. The bot might not be properly linked or the number is invalid.`);
            console.log('Error details:', error.message);
        }
        
        rl.close();
    });
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (sock) {
        sock.end();
    }
    rl.close();
    process.exit();
});

startBot().catch(err => console.log("Error:", err));