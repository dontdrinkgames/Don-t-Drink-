const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import questions database
const { questionsDatabase, QuestionManager } = require('./questions-database.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize question manager
const questionManager = new QuestionManager();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game name mapping
const gameNameMapping = {
    'wyr': 'would_you_rather',
    'fmk': 'fmk',
    'nhie': 'never_have_i_ever',
    'hottakes': 'hot_takes'
};

// Store active rooms
const rooms = new Map();

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        rooms: rooms.size,
        timestamp: new Date().toISOString()
    });
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
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.redirect('/');
    }
});

// Fallback questions
function getFallbackQuestion(game, intensity) {
    const fallbacks = {
        would_you_rather: {
            medium: "Would you rather have the ability to fly or be invisible?",
            spicy: "Would you rather know when you're going to die or how you're going to die?",
            cancelled: "Would you rather accidentally send a dirty text to your mom or your boss?"
        },
        fmk: {
            medium: "Ryan Reynolds, Chris Hemsworth, Michael B. Jordan",
            spicy: "Your ex, your boss, your best friend's partner",
            cancelled: "Your therapist, your Uber driver, your dentist"
        },
        never_have_i_ever: {
            medium: "Never have I ever pretended to be sick to skip work/school.",
            spicy: "Never have I ever had a crush on a friend's significant other.",
            cancelled: "Never have I ever hooked up with someone I met online."
        },
        hot_takes: {
            medium: "Pineapple belongs on pizza and anyone who disagrees has no taste.",
            spicy: "People who don't tip at restaurants are terrible humans.",
            cancelled: "Social media has completely ruined dating and relationships."
        }
    };
    return fallbacks[game]?.[intensity] || "Fallback question: Database issue.";
}

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('create-room', (data, callback) => {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { 
            host: socket.id, 
            players: new Map(),
            gameSettings: null,
            gameStarted: false,
            currentQuestion: null,
            questionNumber: 0,
            answers: new Map()
        });
        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by host: ${socket.id}`);
        
        // Send response both ways for compatibility
        if (callback && typeof callback === 'function') {
            callback({ success: true, roomCode: roomCode });
        }
        socket.emit('room-created', { roomCode: roomCode });
    });

    // Join room
    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        const room = rooms.get(roomCode);
        
        if (room) {
            const playerId = socket.id;
            room.players.set(playerId, {
                id: playerId,
                name: playerName,
                avatar: avatar,
                connected: true,
                ready: false
            });
            
            socket.join(roomCode);
            
            // Send to host
            io.to(room.host).emit('player-joined', {
                playerId: playerId,
                playerName: playerName,
                avatar: avatar
            });
            
            // Send confirmation to player
            socket.emit('joined-room', { success: true, roomCode });
            
            console.log(`Player ${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error', { message: 'Room not found' });
        }
    });

    // Start game
    socket.on('start-game', (data) => {
        const { roomCode, gameSettings } = data;
        console.log(`🎮 Received start-game event for room ${roomCode}`);
        
        const room = rooms.get(roomCode);
        if (!room) {
            console.log(`Room ${roomCode} not found`);
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (room.host !== socket.id) {
            socket.emit('error', { message: 'Only host can start game' });
            return;
        }

        // Store game settings
        room.gameSettings = gameSettings;
        room.gameStarted = true;
        room.questionNumber = 1;
        
        console.log(`Game: ${gameSettings.game}, Mode: ${gameSettings.mode}, Category: ${gameSettings.intensity}`);
        console.log(`Starting game: ${gameSettings.game} - ${gameSettings.mode} - ${gameSettings.intensity}`);
        
        // Generate first question
        generateAndSendQuestion(roomCode, gameSettings);
    });

    // Next question
    socket.on('next-question', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        
        if (room && room.gameSettings) {
            room.questionNumber++;
            generateAndSendQuestion(roomCode, room.gameSettings);
        }
    });

    // Player disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find and clean up rooms
        for (const [code, room] of rooms.entries()) {
            if (room.host === socket.id) {
                // Host disconnected - close room
                io.to(code).emit('host-disconnected');
                rooms.delete(code);
                console.log(`Host disconnected, cleaning up room: ${code}`);
            } else if (room.players.has(socket.id)) {
                // Player disconnected
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

function generateAndSendQuestion(roomCode, gameSettings) {
    console.log(`Generating question for ${gameSettings.game} - ${gameSettings.intensity}`);
    
    try {
        const dbGame = gameNameMapping[gameSettings.game] || gameSettings.game;
        const questionData = questionManager.getRandomQuestion(dbGame, gameSettings.intensity);
        
        let question;
        if (questionData && questionData.question) {
            question = {
                id: questionData.id,
                text: questionData.question,
                type: gameSettings.game,
                intensity: gameSettings.intensity,
                options: questionData.options || null,
                source: questionData.source || 'database'
            };
            console.log(`✅ Question generated from database: ${question.text.substring(0, 50)}...`);
        } else {
            // Fallback question
            const fallbackText = getFallbackQuestion(dbGame, gameSettings.intensity);
            question = {
                id: `fallback_${Date.now()}`,
                text: fallbackText,
                type: gameSettings.game,
                intensity: gameSettings.intensity,
                options: null,
                source: 'fallback'
            };
            console.log(`⚠️ Using fallback question: ${question.text.substring(0, 50)}...`);
        }
        
        // Store current question
        const room = rooms.get(roomCode);
        if (room) {
            room.currentQuestion = question;
        }
        
        // Send to all clients in room
        io.to(roomCode).emit('question-generated', question);
        console.log(`Question sent successfully to room: ${roomCode}`);
        
    } catch (error) {
        console.error('Error generating question:', error);
        
        // Send fallback question on error
        const fallbackText = getFallbackQuestion(gameSettings.game, gameSettings.intensity);
        const fallbackQuestion = {
            id: `error_fallback_${Date.now()}`,
            text: fallbackText,
            type: gameSettings.game,
            intensity: gameSettings.intensity,
            options: null,
            source: 'error_fallback'
        };
        
        io.to(roomCode).emit('question-generated', fallbackQuestion);
        console.log(`Sent error fallback question to room: ${roomCode}`);
    }
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

// Start server - IMPORTANT: Use process.env.PORT for Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});