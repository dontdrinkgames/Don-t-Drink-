const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import questions database
const { questionsDatabase, QuestionManager } = require('./questions-database.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize question manager
const questionManager = new QuestionManager();

// Game name mapping
const gameNameMapping = {
    'wyr': 'would_you_rather',
    'fmk': 'fmk', 
    'nhie': 'never_have_i_ever',
    'hottakes': 'hot_takes'
};

// Store active rooms
const rooms = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// RENDER FIX: Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Main routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Room code routing - handles /ABC123 style URLs
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    // Validate room code format (6 alphanumeric characters)
    if (roomCode.match(/^[A-Z0-9]{6}$/)) {
        // Serve the mobile player interface
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        // Invalid room code, redirect to home
        res.redirect('/');
    }
});

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', (data, callback) => {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { 
            host: socket.id, 
            players: new Map(),
            gameSettings: null,
            gameStarted: false,
            currentQuestion: null,
            questionNumber: 0
        });
        
        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by host: ${socket.id}`);
        
        // RENDER FIX: Handle both callback and emit for compatibility
        if (callback && typeof callback === 'function') {
            callback({ success: true, roomCode: roomCode });
        }
        socket.emit('room-created', { roomCode: roomCode });
    });

    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        const room = rooms.get(roomCode);
        
        if (room) {
            room.players.set(socket.id, {
                name: playerName,
                avatar: avatar,
                connected: true
            });
            
            socket.join(roomCode);
            
            // Notify host
            io.to(room.host).emit('player-joined', {
                playerId: socket.id,
                playerName: playerName,
                avatar: avatar
            });
            
            // Confirm to player
            socket.emit('player-joined', { success: true });
            
            console.log(`Player ${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error', { message: 'Room not found' });
        }
    });

    socket.on('start-game', (data) => {
        const { roomCode, gameSettings } = data;
        console.log(`🎮 Received start-game event for room ${roomCode}`);
        
        const room = rooms.get(roomCode);
        if (!room) {
            console.log(`Room ${roomCode} not found`);
            return;
        }

        room.gameSettings = gameSettings;
        room.gameStarted = true;
        
        console.log(`Game: ${gameSettings.game}, Mode: ${gameSettings.mode}, Category: ${gameSettings.intensity}`);
        
        // Get question from database
        try {
            const dbGame = gameNameMapping[gameSettings.game] || gameSettings.game;
            const questionData = questionManager.getRandomQuestion(dbGame, gameSettings.intensity);
            
            if (questionData) {
                io.to(roomCode).emit('question-generated', questionData);
                console.log(`Question sent to room ${roomCode}`);
            } else {
                // Fallback
                io.to(roomCode).emit('question-generated', {
                    question: 'Sample question - database connection issue',
                    type: gameSettings.game
                });
            }
        } catch (error) {
            console.error('Question generation error:', error);
            io.to(roomCode).emit('question-generated', {
                question: 'Sample fallback question',
                type: gameSettings.game
            });
        }
    });

    socket.on('next-question', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        
        if (room && room.gameSettings) {
            try {
                const dbGame = gameNameMapping[room.gameSettings.game] || room.gameSettings.game;
                const questionData = questionManager.getRandomQuestion(dbGame, room.gameSettings.intensity);
                
                if (questionData) {
                    io.to(roomCode).emit('question-generated', questionData);
                }
            } catch (error) {
                console.error('Next question error:', error);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Clean up rooms
        for (const [code, room] of rooms.entries()) {
            if (room.host === socket.id) {
                rooms.delete(code);
                console.log(`Host disconnected, cleaning up room: ${code}`);
            } else if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                room.players.delete(socket.id);
                io.to(room.host).emit('player-left', {
                    playerId: socket.id,
                    playerName: player.name
                });
                console.log(`Player ${player.name} left room ${code}`);
            }
        }
    });
});

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Startup logs
console.log('Don\'t Drink server running');
console.log('Question Database Loaded:');
let totalQuestions = 0;
for (const [game, intensities] of Object.entries(questionsDatabase)) {
    console.log(`${game}:`);
    for (const [intensity, questions] of Object.entries(intensities)) {
        console.log(`  ${intensity}: ${questions.length} questions`);
        totalQuestions += questions.length;
    }
}
console.log(`Total: ${totalQuestions} questions loaded!`);

// RENDER FIX: Listen on 0.0.0.0 and use process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});