const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO with comprehensive CORS configuration
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowUpgrades: true
});

// Import questions database
let questionManager = null;
try {
    const QuestionManager = require('./questions-database.js');
    questionManager = new QuestionManager();
    console.log('✅ Questions database loaded');
} catch (error) {
    console.warn('⚠️ Questions database not loaded:', error.message);
}

// Store active rooms
const rooms = {};

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Generate unique room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar characters
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Ensure uniqueness
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
    res.status(200).json({ status: 'ok', rooms: Object.keys(rooms).length });
});

// Room code routing - MUST be last
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    if (/^[A-Z0-9]{6}$/.test(roomCode)) {
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.status(404).send('Invalid room code');
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);
    
    // Create room
    socket.on('create-room', (data, callback) => {
        try {
            const roomCode = generateRoomCode();
            
            rooms[roomCode] = {
                hostId: socket.id,
                players: [],
                gameState: 'waiting',
                gameConfig: null,
                createdAt: Date.now()
            };
            
            socket.join(roomCode);
            socket.roomCode = roomCode;
            
            console.log(`🏠 Room ${roomCode} created by ${socket.id}`);
            
            const response = { success: true, roomCode };
            
            // Support both callback and emit patterns
            if (typeof callback === 'function') {
                callback(response);
            }
            socket.emit('room-created', response);
            
        } catch (error) {
            console.error('Create room error:', error);
            const errorResponse = { success: false, error: error.message };
            if (typeof callback === 'function') {
                callback(errorResponse);
            }
            socket.emit('error', errorResponse);
        }
    });
    
    // Join room
    socket.on('join-room', (data, callback) => {
        try {
            const { roomCode, playerName, avatar } = data;
            
            if (!roomCode || !playerName) {
                throw new Error('Room code and player name required');
            }
            
            const room = rooms[roomCode.toUpperCase()];
            
            if (!room) {
                const error = { message: 'Room not found' };
                if (typeof callback === 'function') {
                    callback({ success: false, error: error.message });
                }
                socket.emit('join-error', error);
                return;
            }
            
            // Remove any existing player with same name (rejoin support)
            room.players = room.players.filter(p => 
                p.name !== playerName && p.id !== socket.id
            );
            
            const player = {
                id: socket.id,
                name: playerName,
                avatar: avatar || '🎮',
                score: 0,
                joinedAt: Date.now()
            };
            
            room.players.push(player);
            socket.join(roomCode.toUpperCase());
            socket.roomCode = roomCode.toUpperCase();
            
            console.log(`✅ ${playerName} joined room ${roomCode}`);
            
            // Notify everyone
            io.to(room.hostId).emit('player-joined', player);
            io.to(roomCode.toUpperCase()).emit('players-updated', {
                players: room.players,
                count: room.players.length
            });
            
            const response = {
                success: true,
                roomCode: roomCode.toUpperCase(),
                players: room.players,
                gameState: room.gameState
            };
            
            if (typeof callback === 'function') {
                callback(response);
            }
            socket.emit('join-success', response);
            
        } catch (error) {
            console.error('Join room error:', error);
            const errorResponse = { message: error.message };
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
            socket.emit('join-error', errorResponse);
        }
    });
    
    // Start game
    socket.on('start-game', (data) => {
        try {
            const { roomCode, gameConfig } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            if (room.hostId !== socket.id) {
                socket.emit('error', { message: 'Only host can start game' });
                return;
            }
            
            room.gameState = 'playing';
            room.gameConfig = gameConfig;
            
            io.to(roomCode).emit('game-started', {
                game: gameConfig.game,
                mode: gameConfig.mode,
                intensity: gameConfig.intensity,
                players: room.players
            });
            
            console.log(`🎮 Game started in room ${roomCode}`);
            
        } catch (error) {
            console.error('Start game error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Get question
    socket.on('get-question', (data, callback) => {
        try {
            const { game, intensity } = data;
            
            if (questionManager) {
                const question = questionManager.getRandomQuestion(game, intensity);
                if (typeof callback === 'function') {
                    callback({ success: true, question });
                }
                socket.emit('question', question);
            } else {
                const error = 'Question database not available';
                if (typeof callback === 'function') {
                    callback({ success: false, error });
                }
                socket.emit('error', { message: error });
            }
        } catch (error) {
            console.error('Get question error:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
        }
    });
    
    // Disconnect handling
    socket.on('disconnect', (reason) => {
        console.log('🔌 User disconnected:', socket.id, 'Reason:', reason);
        
        // Remove player from their room
        if (socket.roomCode) {
            const room = rooms[socket.roomCode];
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                io.to(socket.roomCode).emit('players-updated', {
                    players: room.players,
                    count: room.players.length
                });
                
                // If host disconnects, notify players and delete room
                if (room.hostId === socket.id) {
                    io.to(socket.roomCode).emit('host-disconnected');
                    delete rooms[socket.roomCode];
                    console.log(`🗑️ Room ${socket.roomCode} deleted (host left)`);
                }
            }
        }
    });
});

// Clean up old rooms periodically (every hour)
setInterval(() => {
    const now = Date.now();
    const MAX_ROOM_AGE = 6 * 60 * 60 * 1000; // 6 hours
    
    Object.keys(rooms).forEach(roomCode => {
        if (now - rooms[roomCode].createdAt > MAX_ROOM_AGE) {
            io.to(roomCode).emit('room-expired');
            delete rooms[roomCode];
            console.log(`🗑️ Room ${roomCode} expired and deleted`);
        }
    });
}, 60 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║       DON'T DRINK! SERVER RUNNING      ║
╠════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(33)}║
║  URL: http://localhost:${PORT}${' '.repeat(33 - PORT.toString().length - 24)}║
╠════════════════════════════════════════╣
║  Pages:                                ║
║  • / → Landing page                    ║
║  • /host → Host control panel          ║
║  • /mobile → Player mobile interface   ║
║  • /play → Play screen                 ║
╠════════════════════════════════════════╣
║  Status: ${questionManager ? '✅ Questions loaded' : '⚠️  No questions'}${' '.repeat(questionManager ? 9 : 15)}║
╚════════════════════════════════════════╝
    `);
});