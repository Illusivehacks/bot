const { useMultiFileAuthState, makeWASocket } = require('@adiwajshing/baileys')

async function startBot() {
    // Auth setup
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    
    // Create socket with pairing configuration
    const sock = makeWASocket({
        auth: state,
        // Enable pairing code
        mobile: false, // This is important for pairing code
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            return {
                conversation: "hello"
            }
        },
        // Pairing configuration
        linkPreviewApiToken: 'pairing-code', // This can be any string
        printQRInTerminal: false // We'll handle pairing code ourselves
    })
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds)
    
    // Handle pairing code event
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, isNewLogin, pairingCode } = update
        
        if (pairingCode) {
            console.log(`\nPAIRING CODE: ${pairingCode}\n`)
            console.log("To pair:")
            console.log("1. Open WhatsApp on your phone")
            console.log("2. Go to Linked Devices")
            console.log("3. Select 'Link a Device'")
            console.log("4. Enter this pairing code instead of scanning QR\n")
        }
        
        if (connection === 'close') {
            console.log("Connection closed, reconnecting...")
            startBot()
        }
    })
    
    // Message handler (same as before)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        
        const text = msg.message.conversation || ''
        const sender = msg.key.remoteJid
        
        if (text.toLowerCase() === '!ping') {
            await sock.sendMessage(sender, { text: 'Pong! 🏓' })
        }
    })
}

startBot().catch(err => console.log("Error:", err))