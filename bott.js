const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require('qrcode-terminal');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startBot() {
    // Ask user for preferred authentication method
    const authMethod = await new Promise(resolve => {
        rl.question('Choose authentication method:\n1. QR Code\n2. Pairing Code\nEnter choice (1 or 2): ', answer => {
            resolve(answer.trim());
        });
    });

    // Auth setup
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    // Create socket with config based on user choice
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR display ourselves
        mobile: authMethod === '2', // True for pairing code, false for QR
        syncFullHistory: false,
        logger: { level: 'warn' }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, pairingCode } = update;
        
        // QR Code Handling
        if (qr && authMethod === '1') {
            console.log('\nScan this QR code with your phone:');
            qrcode.generate(qr, { small: true });
            console.log('\nOn your phone: WhatsApp > Linked Devices > Link a Device');
        }
        
        // Pairing Code Handling
        if (pairingCode && authMethod === '2') {
            console.log(`\n╔══════════════════════════╗`);
            console.log(`║    PAIRING CODE: ${pairingCode}    ║`);
            console.log(`╚══════════════════════════╝`);
            console.log("\nOn your phone:");
            console.log("1. Open WhatsApp");
            console.log("2. Go to Linked Devices");
            console.log("3. Select 'Link a Device'");
            console.log("4. Choose 'Pair with code instead'");
            console.log("5. Enter the code above");
        }
        
        if (connection === 'open') {
            console.log("\nSuccessfully connected to WhatsApp!");
            rl.close();
            
            // Send welcome message to the owner
            const ownerNumber = await new Promise(resolve => {
                if (authMethod === '2') {
                    rl.question('Enter your WhatsApp number for notifications (optional, press enter to skip): ', answer => {
                        resolve(answer.trim());
                    });
                } else {
                    resolve(null);
                }
            });
            
            if (ownerNumber) {
                try {
                    const formattedNumber = ownerNumber.replace(/[^0-9]/g, '');
                    const recipient = `${formattedNumber}@s.whatsapp.net`;
                    await sock.sendMessage(recipient, { 
                        text: 'Your WhatsApp bot is now connected and ready!'
                    });
                } catch (error) {
                    console.error('Could not send notification:', error.message);
                }
            }
        }
        
        if (connection === 'close') {
            console.log("\nConnection closed, reconnecting...");
            setTimeout(startBot, 5000);
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
        
        // Add more commands here
    });
}

startBot().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});