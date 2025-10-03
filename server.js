const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Import questions database
let questionManager = null;
try {
    const QuestionManager = require('./public/questions-database.js');
    questionManager = new QuestionManager();
    console.log('✅ Questions database loaded successfully');
} catch (error) {
    console.warn('⚠️ Questions database not loaded:', error.message);
}

// Store active rooms and players
const rooms = {};

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Generate room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// IMPORTANT: Room code route must be LAST
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    // Validate room code format (6 alphanumeric characters)
    if (/^[A-Z0-9]{6}$/.test(roomCode)) {
        // Serve mobile.html for room codes
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.status(404).send('Invalid room code');
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);
    
    // Create room (from host)
    socket.on('create-room', (data, callback) => {
        try {
            const roomCode = generateRoomCode();
            
            rooms[roomCode] = {
                hostId: socket.id,
                players: [],
                gameState: 'waiting',
                createdAt: Date.now()
            };
            
            socket.join(roomCode);
            console.log(`🏠 Room created: ${roomCode} by host ${socket.id}`);
            
            // Support BOTH callback and emit patterns
            if (typeof callback === 'function') {
                // New pattern - using callback
                callback({ success: true, roomCode: roomCode });
            }
            
            // ALWAYS emit room-created for backward compatibility
            socket.emit('room-created', { roomCode: roomCode });
            
        } catch (error) {
            console.error('Error creating room:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
            socket.emit('error', { message: 'Failed to create room' });
        }
    });
    
    // Join room (from mobile/player)
    socket.on('join-room', (data, callback) => {
        try {
            const { roomCode, playerName, avatar } = data;
            
            console.log(`👤 Player ${playerName} trying to join room ${roomCode}`);
            
            if (!rooms[roomCode]) {
                const error = { message: 'Room not found' };
                
                if (typeof callback === 'function') {
                    callback({ success: false, error: error.message });
                }
                socket.emit('join-error', error);
                return;
            }
            
            const player = {
                id: socket.id,
                name: playerName,
                avatar: avatar || '🎮',
                score: 0
            };
            
            // Remove duplicates (same player rejoining)
            rooms[roomCode].players = rooms[roomCode].players.filter(p => p.name !== playerName);
            rooms[roomCode].players.push(player);
            
            socket.join(roomCode);
            socket.roomCode = roomCode; // Store room code for disconnect handling
            
            console.log(`✅ ${playerName} joined room ${roomCode}`);
            
            // Notify host that player joined
            io.to(rooms[roomCode].hostId).emit('player-joined', player);
            
            // Notify all in room of updated player list
            io.to(roomCode).emit('players-updated', rooms[roomCode].players);
            
            // Send success to joining player - CRITICAL!
            if (typeof callback === 'function') {
                callback({ 
                    success: true, 
                    roomCode: roomCode,
                    players: rooms[roomCode].players 
                });
            }
            
            // ALWAYS emit join-success for mobile.html compatibility
            socket.emit('join-success', {
                roomCode: roomCode,
                players: rooms[roomCode].players
            });
            
        } catch (error) {
            console.error('Error joining room:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
            socket.emit('join-error', { message: error.message });
        }
    });
    
    // Start game
    socket.on('start-game', (data) => {
        const { roomCode, gameConfig } = data;
        
        if (rooms[roomCode] && rooms[roomCode].hostId === socket.id) {
            rooms[roomCode].gameState = 'playing';
            rooms[roomCode].gameConfig = gameConfig;
            
            io.to(roomCode).emit('game-started', {
                game: gameConfig.game,
                mode: gameConfig.mode,
                intensity: gameConfig.intensity
            });
            
            console.log(`🎮 Game started in room ${roomCode}`);
        }
    });
    
    // Get question
    socket.on('get-question', (data, callback) => {
        const { game, intensity } = data;
        
        if (questionManager) {
            const question = questionManager.getRandomQuestion(game, intensity);
            if (typeof callback === 'function') {
                callback(question);
            }
        } else {
            if (typeof callback === 'function') {
                callback({ 
                    text: "Question database not loaded", 
                    game: game,
                    intensity: intensity 
                });
            }
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        
        // Remove player from their room
        if (socket.roomCode) {
            const room = rooms[socket.roomCode];
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                io.to(socket.roomCode).emit('players-updated', room.players);
            }
        }
        
        // Clean up empty rooms
        for (const [code, room] of Object.entries(rooms)) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-disconnected');
                delete rooms[code];
                console.log(`🗑️ Room ${code} deleted (host left)`);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║         DON'T DRINK! SERVER RUNNING    ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                              ║
║  URL: http://localhost:${PORT}              ║
╠════════════════════════════════════════╣
║  Pages:                                ║
║  • / → Landing page                    ║
║  • /host → Host control panel          ║  
║  • /mobile → Player mobile interface   ║
║  • /player → Alternative player page   ║
╠════════════════════════════════════════╣
║  Status: ✅ Questions loaded            ║
╚════════════════════════════════════════╝
    `);
});	