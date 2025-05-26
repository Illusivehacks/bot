const { useMultiFileAuthState, makeInMemoryStore, Browsers, delay, getAggregateVotesInPollMessage, proto, makeWASocket } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const { randomBytes } = crypto;
const { bytesToCrockford } = require('@whiskeysockets/baileys/lib/Utils');

// Initialize logger
const logger = pino({ level: 'silent' });

// Session store
const store = makeInMemoryStore({ logger });
store?.readFromFile('./baileys_store_multi.json');
setInterval(() => {
    store?.writeToFile('./baileys_store_multi.json');
}, 10_000);

// Main bot function
async function startWhatsAppBot() {
    // Load authentication state
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // Initialize the WhatsApp client
    const sock = makeWASocket({
        logger,
        printQRInTerminal: false, // We'll use pairing code instead of QR
        auth: state,
        browser: Browsers.ubuntu('Chrome'), // Change as needed
        getMessage: async (key) => {
            return store.loadMessage(key.remoteJid, key.id) || {};
        }
    });

    // Handle pairing code generation
    async function requestPairingCode(phoneNumber, pairKey) {
        if (pairKey) {
            state.creds.pairingCode = pairKey.toUpperCase();
        } else {
            state.creds.pairingCode = bytesToCrockford(randomBytes(5));
        }

        state.creds.me = {
            id: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
            name: 'WhatsApp Bot'
        };

        await sock.ev.emit('creds.update', state.creds);

        await sock.sendNode({
            tag: 'iq',
            attrs: {
                to: '@s.whatsapp.net',
                type: 'set',
                id: sock.generateMessageTag(),
                xmlns: 'md'
            },
            content: [{
                tag: 'link_code_companion_reg',
                attrs: {
                    jid: state.creds.me.id,
                    stage: 'companion_hello',
                    should_show_push_notification: 'true'
                },
                content: [
                    {
                        tag: 'link_code_pairing_wrapped_companion_ephemeral_pub',
                        attrs: {},
                        content: await sock.generatePairingKey()
                    },
                    {
                        tag: 'companion_server_auth_key_pub',
                        attrs: {},
                        content: state.creds.noiseKey.public
                    },
                    {
                        tag: 'companion_platform_id',
                        attrs: {},
                        content: Buffer.from([sock.getPlatformId(sock.browser[1])])
                    },
                    {
                        tag: 'companion_platform_display',
                        attrs: {},
                        content: Buffer.from(`${sock.browser[1]} (${sock.browser[0]})`)
                    },
                    {
                        tag: 'link_code_pairing_nonce',
                        attrs: {},
                        content: Buffer.from([0])
                    }
                ]
            }]
        });
        
        return state.creds.pairingCode;
    }

    // Handle authentication updates
    sock.ev.on('creds.update', saveCreds);

    // Load messages to store
    store.bind(sock.ev);

    // Connection events
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update || {};
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== 401);
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            
            if (shouldReconnect) {
                startWhatsAppBot();
            }
        } else if (connection === 'open') {
            console.log('Successfully connected!');
        } else if (qr) {
            console.log('QR code generated, but we\'re using pairing codes instead');
        }
    });

    // Pairing events
    sock.ev.on('pairing.success', async (data) => {
        console.log(`Pairing successful with ${data.phone}`);
        console.log('You can now send and receive messages!');
    });

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || m.type !== 'notify') return;

        const messageType = Object.keys(msg.message)[0];
        const text = messageType === 'conversation' 
            ? msg.message.conversation 
            : messageType === 'extendedTextMessage' 
                ? msg.message.extendedTextMessage.text 
                : '';

        if (text) {
            const sender = msg.key.remoteJid;
            console.log(`Received message from ${sender}: ${text}`);

            // Simple echo bot
            if (text.toLowerCase() === 'ping') {
                await sock.sendMessage(sender, { text: 'Pong!' });
            }
            
            // Send pairing code if requested
            if (text.toLowerCase() === '!pair') {
                const pairingCode = await requestPairingCode(state.creds.me?.id || '1234567890@s.whatsapp.net');
                await sock.sendMessage(sender, { 
                    text: `Your pairing code is: ${pairingCode}\n\nEnter this in your WhatsApp app under Linked Devices to connect.`
                });
            }
        }
    });

    // Start the bot with pairing code
    try {
        const phoneNumber = process.env.PHONE_NUMBER || '254743844485@s.whatsapp.net'; // Replace with your number
        const pairingCode = await requestPairingCode(phoneNumber);
        
        console.log('==========================================');
        console.log(`Your pairing code is: ${pairingCode}`);
        console.log('Go to WhatsApp > Settings > Linked Devices > Link a Device');
        console.log('Enter this code to connect your bot');
        console.log('==========================================');
    } catch (error) {
        console.error('Error during pairing:', error);
    }
}

// Start the bot
startWhatsAppBot().catch(err => console.log('Unexpected error:', err));
