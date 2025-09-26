const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Load questions database
let questionsDatabase = {};
let QuestionManager = null;

try {
    const questionsModule = require('./questions-database.js');
    questionsDatabase = questionsModule.questionsDatabase;
    QuestionManager = questionsModule.QuestionManager;
    console.log('✅ Questions database loaded successfully');
} catch (error) {
    console.error('❌ Error loading questions database:', error.message);
    console.log('📝 Server will run without questions database');
}

// Initialize Question Manager if available
const questionManager = QuestionManager ? new QuestionManager() : null;

// Static files
app.use(express.static('public'));
app.use(express.json());

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// Room code routing - MUST be last
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    if (roomCode.match(/^[A-Z0-9]{6}$/)) {
        console.log(`Serving mobile.html for room: ${roomCode}`);
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.redirect('/');
    }
});

// Game storage
const rooms = new Map();

// Generate room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Game name mapping
const gameNameMapping = {
    'wyr': 'would_you_rather',
    'fmk': 'fmk',
    'nhie': 'never_have_i_ever',
    'hot': 'hot_takes',
    'mixmaster': 'mixmaster'
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('👤 New connection:', socket.id);

    // Host creates room
    socket.on('create-room', (data, callback) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            host: socket.id,
            players: [],
            gameState: null,
            currentGame: null,
            currentMode: null,
            currentIntensity: null,
            questionNumber: 0
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        console.log(`🏠 Room ${roomCode} created by host`);
        
        // Send response
        if (callback && typeof callback === 'function') {
            callback({ success: true, roomCode });
        }
        socket.emit('room-created', { roomCode });
    });

    // Player joins room
    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        const code = roomCode ? roomCode.toUpperCase() : '';
        const room = rooms.get(code);

        console.log(`🎮 Join attempt - Room: ${code}, Player: ${playerName}`);

        if (!room) {
            console.log(`❌ Room ${code} not found`);
            socket.emit('join-error', { message: 'Room not found' });
            return;
        }

        // Check if player already exists
        const existingPlayerIndex = room.players.findIndex(p => p.name === playerName);
        if (existingPlayerIndex !== -1) {
            room.players[existingPlayerIndex] = {
                id: socket.id,
                name: playerName,
                avatar: avatar || '😎',
                ready: false,
                connected: true
            };
        } else {
            // Add new player
            room.players.push({
                id: socket.id,
                name: playerName,
                avatar: avatar || '😎',
                ready: false,
                connected: true
            });
        }

        socket.join(code);
        socket.roomCode = code;
        socket.playerName = playerName;

        console.log(`✅ ${playerName} joined room ${code}. Total: ${room.players.length} players`);

        // Send success to joining player
        socket.emit('join-success', { 
            roomCode: code,
            playerId: socket.id,
            playerName: playerName
        });
        
        // Update everyone
        io.to(code).emit('players-updated', room.players);
        
        // Notify host specifically
        io.to(room.host).emit('player-joined', {
            id: socket.id,
            name: playerName,
            avatar: avatar || '😎'
        });
    });

    // Start game
    socket.on('start-game', (config) => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (!room) {
            console.log('❌ No room found for host:', socket.id);
            return;
        }

        console.log(`🎮 Starting game in room ${room.code}:`, config);
        
        room.currentGame = config.game;
        room.currentMode = config.mode;
        room.currentIntensity = config.intensity;
        room.questionNumber = 0;
        room.gameState = 'playing';

        // Get first question if database is available
        let firstQuestion = null;
        if (questionManager && questionsDatabase) {
            const dbGameName = gameNameMapping[config.game] || config.game;
            try {
                firstQuestion = questionManager.getRandomQuestion(
                    dbGameName, 
                    config.intensity || 'medium',
                    config.mode || 'offline'
                );
                room.questionNumber = 1;
            } catch (error) {
                console.error('Error getting first question:', error);
                firstQuestion = {
                    text: "Welcome to Don't Drink! Get ready for some fun questions!",
                    type: 'text'
                };
            }
        }

        // Send to all clients in room
        io.to(room.code).emit('game-started', {
            ...config,
            question: firstQuestion,
            questionNumber: room.questionNumber
        });
    });

    // Next question
    socket.on('next-question', () => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (!room || !questionManager || !questionsDatabase) {
            socket.emit('question-error', { message: 'Cannot get next question' });
            return;
        }

        room.questionNumber++;
        
        const dbGameName = gameNameMapping[room.currentGame] || room.currentGame;
        try {
            const question = questionManager.getRandomQuestion(
                dbGameName,
                room.currentIntensity || 'medium',
                room.currentMode || 'offline'
            );
            
            io.to(room.code).emit('new-question', {
                question,
                questionNumber: room.questionNumber
            });
        } catch (error) {
            console.error('Error getting next question:', error);
            socket.emit('question-error', { message: 'Error loading question' });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
        
        // Check if host
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        if (room) {
            console.log(`🏠 Host left, closing room ${room.code}`);
            io.to(room.code).emit('host-disconnected');
            rooms.delete(room.code);
            return;
        }
        
        // Check if player
        for (const [code, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                player.connected = false;
                
                io.to(code).emit('player-disconnected', {
                    playerId: socket.id,
                    playerName: player.name
                });
                
                io.to(code).emit('players-updated', room.players);
                break;
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start!`);
    
    if (questionManager) {
        const stats = questionManager.getStats();
        console.log(`📊 Questions loaded: ${stats.totalQuestions} total`);
    } else {
        console.log('⚠️ Running without questions database');
    }
});