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

// Game name mapping
const gameNameMapping = {
    'wyr': 'would_you_rather',
    'WYR': 'would_you_rather',
    'fmk': 'fmk',
    'FMK': 'fmk',
    'nhie': 'never_have_i_ever',
    'NHIE': 'never_have_i_ever',
    'hottakes': 'hot_takes',
    'HOTTAKES': 'hot_takes',
    'hot_takes': 'hot_takes'
};

// Load questions database
let questionManager = null;
let questionsDatabase = {};

try {
    const questionsModule = require('./questions-database.js');
    questionsDatabase = questionsModule.questionsDatabase;
    const QuestionManagerClass = questionsModule.QuestionManager;
    
    if (QuestionManagerClass) {
        questionManager = new QuestionManagerClass(questionsDatabase);
        console.log('✅ Questions database loaded successfully');
        
        const stats = questionManager.getStats();
        console.log(`📊 Total questions loaded: ${stats.totalQuestions}`);
    }
} catch (error) {
    console.error('⚠️ Questions database error:', error.message);
    console.log('🔧 Running with fallback questions');
}

// Fallback questions
const fallbackQuestions = {
    never_have_i_ever: {
        medium: ["Never have I ever sang in the shower"],
        spicy: ["Never have I ever had a one night stand"],
        cancelled: ["Never have I ever cheated on someone"]
    },
    fmk: {
        medium: [{ text: "Ryan Gosling, Chris Hemsworth, Michael B. Jordan", type: "celebrity" }],
        spicy: [{ text: "Your boss, your ex, your best friend's partner", type: "spicy" }],
        cancelled: [{ text: "Your sibling's ex, your parent's friend, your professor", type: "cancelled" }]
    },
    would_you_rather: {
        medium: [{ optionA: "Never use social media again", optionB: "Never watch TV again" }],
        spicy: [{ optionA: "Have sex with lights on always", optionB: "Only in complete darkness" }],
        cancelled: [{ optionA: "Sleep with your boss for a promotion", optionB: "Stay in your dead-end job forever" }]
    },
    hot_takes: {
        medium: ["Pineapple belongs on pizza"],
        spicy: ["Open relationships are healthier than monogamy"],
        cancelled: ["Cheating can sometimes save a relationship"]
    }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Specific HTML routes
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// VIKTIG: Room code routing - MÅ være etter andre routes
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode;
    
    // Sjekk om det er en gyldig room code (6 tegn, alfanumerisk)
    if (roomCode && roomCode.match(/^[A-Z0-9]{6}$/i)) {
        console.log(`📱 Mobile player accessing room: ${roomCode}`);
        // Send til mobile.html, som vil håndtere room code via JavaScript
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        // Ikke en gyldig room code, redirect til forsiden
        res.redirect('/');
    }
});

// Rooms storage
const rooms = new Map();

// Socket.IO handlers
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Create room - FIXED to handle both callback and regular patterns
    socket.on('create-room', (data, callback) => {
        try {
            const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            rooms.set(roomCode, {
                code: roomCode,
                host: socket.id,
                players: [],
                currentGame: null,
                currentMode: null,
                currentIntensity: null,
                questionNumber: 0,
                gameState: 'waiting',
                usedQuestions: []
            });

            socket.join(roomCode);
            console.log(`🏠 Room created: ${roomCode} by host ${socket.id}`);
            
            // FIXED: Support both callback and emit patterns
            if (typeof callback === 'function') {
                callback({ success: true, roomCode: roomCode });
            }
            // Also emit for compatibility
            socket.emit('room-created', { roomCode: roomCode });
            
        } catch (error) {
            console.error('Error creating room:', error);
            if (typeof callback === 'function') {
                callback({ error: 'Failed to create room' });
            } else {
                socket.emit('error', { message: 'Failed to create room' });
            }
        }
    });

    // Join room - FIXED to properly send success response
    socket.on('join-room', (data, callback) => {
        try {
            const roomCode = data?.roomCode ? data.roomCode.toUpperCase() : '';
            const playerName = data?.playerName || 'Anonymous';
            const avatar = data?.avatar || '😎';
            
            const room = rooms.get(roomCode);

            console.log(`🎮 Join attempt - Room: ${roomCode}, Player: ${playerName}`);

            if (!room) {
                console.log(`❌ Room ${roomCode} not found`);
                const error = { message: 'Room not found' };
                if (typeof callback === 'function') {
                    callback(error);
                }
                socket.emit('join-error', error);
                return;
            }

            // Remove old connection if exists (for re-joins)
            const existingIndex = room.players.findIndex(p => p.name === playerName);
            if (existingIndex !== -1) {
                room.players.splice(existingIndex, 1);
            }

            // Add player
            const player = {
                id: socket.id,
                name: playerName,
                avatar: avatar,
                ready: false,
                connected: true
            };
            
            room.players.push(player);
            socket.join(roomCode);
            socket.roomCode = roomCode;

            console.log(`✅ ${playerName} joined room ${roomCode}. Total: ${room.players.length} players`);

            // FIXED: Always send join-success to the joining player
            socket.emit('join-success', { 
                roomCode, 
                playerId: socket.id, 
                playerName 
            });

            // Notify everyone about player update
            io.to(roomCode).emit('players-updated', room.players);
            
            // Notify host about new player
            io.to(room.host).emit('player-joined', player);
            
            // If callback exists, also call it
            if (typeof callback === 'function') {
                callback(null, { success: true, roomCode, playerId: socket.id, playerName });
            }
            
        } catch (error) {
            console.error('Error joining room:', error);
            if (typeof callback === 'function') {
                callback({ error: 'Failed to join room' });
            }
            socket.emit('join-error', { message: 'Failed to join room' });
        }
    });

    // Start game
    socket.on('start-game', (config) => {
        try {
            const room = Array.from(rooms.values()).find(r => r.host === socket.id);
            
            if (!room) {
                console.log('❌ No room found for host:', socket.id);
                socket.emit('error', { message: 'You are not a host' });
                return;
            }

            const gameName = config?.game ? config.game.toLowerCase() : '';
            const dbGameName = gameNameMapping[gameName] || gameName;
            
            console.log(`🎮 Starting game in room ${room.code}:`);
            console.log(`  Game: ${dbGameName}, Mode: ${config?.mode}, Intensity: ${config?.intensity}`);
            
            room.currentGame = dbGameName;
            room.currentMode = config?.mode || 'offline';
            room.currentIntensity = config?.intensity || 'medium';
            room.questionNumber = 0;
            room.gameState = 'playing';

            // Get first question
            let firstQuestion = getQuestion(dbGameName, room.currentIntensity);
            
            if (firstQuestion) {
                room.questionNumber = 1;
                
                // Send to all clients
                io.to(room.code).emit('game-started', {
                    game: config?.game,
                    mode: room.currentMode,
                    intensity: room.currentIntensity,
                    question: firstQuestion,
                    questionNumber: 1
                });
                
                console.log('✅ Game started successfully');
            } else {
                console.error('❌ Failed to get first question');
                socket.emit('error', { message: 'Failed to load questions' });
            }
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', { message: 'Failed to start game' });
        }
    });

    // Next question
    socket.on('next-question', () => {
        try {
            const room = Array.from(rooms.values()).find(r => r.host === socket.id);
            
            if (!room || room.gameState !== 'playing') {
                socket.emit('error', { message: 'No active game' });
                return;
            }

            room.questionNumber++;
            const question = getQuestion(room.currentGame, room.currentIntensity);
            
            if (question) {
                io.to(room.code).emit('new-question', {
                    question,
                    questionNumber: room.questionNumber
                });
                
                console.log(`📤 Question ${room.questionNumber} sent`);
            }
        } catch (error) {
            console.error('Error getting next question:', error);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
        
        // Check if host
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        if (room) {
            console.log(`🏠 Room ${room.code} closed - host disconnected`);
            io.to(room.code).emit('host-disconnected');
            rooms.delete(room.code);
            return;
        }
        
        // Check if player
        for (const [code, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                io.to(code).emit('player-disconnected', {
                    playerId: socket.id,
                    playerName: player.name
                });
                
                io.to(code).emit('players-updated', room.players);
                console.log(`👤 ${player.name} left room ${code}`);
                break;
            }
        }
    });
});

// Helper function for questions
function getQuestion(game, intensity) {
    try {
        if (questionManager && questionManager.getRandomQuestion) {
            return questionManager.getRandomQuestion(game, intensity, 'offline');
        }
    } catch (error) {
        console.log(`⚠️ Using fallback for ${game}/${intensity}`);
    }
    
    const gameQuestions = fallbackQuestions[game];
    if (!gameQuestions || !gameQuestions[intensity]) {
        return { text: `Sample ${game} question`, type: 'text' };
    }
    
    const questions = gameQuestions[intensity];
    return questions[Math.floor(Math.random() * questions.length)];
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start!`);
});