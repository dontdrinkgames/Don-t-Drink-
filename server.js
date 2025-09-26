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
    'hot': 'hot_takes',
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

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', rooms: rooms.size });
});

// Specific HTML routes (MUST be before /:roomCode)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
    const playFile = path.join(__dirname, 'public', 'play.html');
    const fs = require('fs');
    if (fs.existsSync(playFile)) {
        res.sendFile(playFile);
    } else {
        res.send('<h1>Game Screen - Coming Soon</h1>');
    }
});

// Room code routing - MUST be last route
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode;
    
    // Check if valid room code format (6 characters, alphanumeric)
    if (roomCode && roomCode.match(/^[A-Z0-9]{6}$/i)) {
        console.log(`📱 Mobile player accessing room: ${roomCode}`);
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.redirect('/');
    }
});

// Rooms storage
const rooms = new Map();

// Socket.IO handlers
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Create room handler
    socket.on('create-room', (data, callback) => {
        try {
            let roomCode;
            do {
                roomCode = Math.floor(100000 + Math.random() * 900000).toString();
            } while (rooms.has(roomCode));
            
            const room = {
                code: roomCode,
                host: socket.id,
                players: [],
                currentGame: null,
                currentMode: null,
                currentIntensity: null,
                questionNumber: 0,
                gameState: 'waiting',
                usedQuestions: []
            };
            
            rooms.set(roomCode, room);
            socket.join(roomCode);
            socket.roomCode = roomCode;
            
            console.log(`🏠 Room created: ${roomCode} by host ${socket.id}`);
            
            // Send response via callback if provided
            if (typeof callback === 'function') {
                callback({ success: true, roomCode: roomCode });
            }
            
            // Also emit for backwards compatibility
            socket.emit('room-created', { roomCode: roomCode });
            
        } catch (error) {
            console.error('❌ Error creating room:', error);
            if (typeof callback === 'function') {
                callback({ error: 'Failed to create room' });
            }
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    // Join room handler
    socket.on('join-room', (data, callback) => {
        try {
            const roomCode = data?.roomCode ? data.roomCode.toUpperCase() : '';
            const playerName = data?.playerName || 'Anonymous';
            const avatar = data?.avatar || '😎';
            
            console.log(`🎮 Join attempt - Room: ${roomCode}, Player: ${playerName}, Avatar: ${avatar}`);

            const room = rooms.get(roomCode);
            if (!room) {
                console.log(`❌ Room ${roomCode} not found`);
                const errorMsg = 'Room not found. Please check the code and try again.';
                
                if (typeof callback === 'function') {
                    callback({ error: errorMsg });
                }
                socket.emit('join-error', { message: errorMsg });
                return;
            }

            // Remove duplicate if exists
            const existingIndex = room.players.findIndex(p => p.name === playerName);
            if (existingIndex !== -1) {
                console.log(`♻️ Removing duplicate player: ${playerName}`);
                room.players.splice(existingIndex, 1);
            }

            const player = {
                id: socket.id,
                name: playerName,
                avatar: avatar,
                ready: false,
                connected: true,
                joinedAt: Date.now()
            };
            
            room.players.push(player);
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.playerName = playerName;

            console.log(`✅ ${playerName} joined room ${roomCode}. Total players: ${room.players.length}`);

            // CRITICAL: Always emit join-success to ensure waiting screen shows
            const successData = { 
                success: true,
                roomCode: roomCode, 
                playerId: socket.id, 
                playerName: playerName 
            };
            
            socket.emit('join-success', successData);
            
            if (typeof callback === 'function') {
                callback(null, successData);
            }

            // Update everyone
            io.to(roomCode).emit('players-updated', room.players);
            
            // Notify host
            if (room.host) {
                io.to(room.host).emit('player-joined', player);
            }
            
        } catch (error) {
            console.error('❌ Error joining room:', error);
            const errorMsg = 'Failed to join room. Please try again.';
            
            if (typeof callback === 'function') {
                callback({ error: errorMsg });
            }
            socket.emit('join-error', { message: errorMsg });
        }
    });

    // Start game handler
    socket.on('start-game', (config) => {
        try {
            const room = Array.from(rooms.values()).find(r => r.host === socket.id);
            
            if (!room) {
                console.log('❌ No room found for host:', socket.id);
                socket.emit('error', { message: 'You are not a host' });
                return;
            }

            const gameName = config?.game ? config.game.toLowerCase() : 'wyr';
            const dbGameName = gameNameMapping[gameName] || gameName;
            
            console.log(`🎮 Starting game in room ${room.code}:`);
            console.log(`  Game: ${gameName} -> ${dbGameName}`);
            console.log(`  Mode: ${config?.mode || 'offline'}`);
            console.log(`  Intensity: ${config?.intensity || 'medium'}`);
            
            room.currentGame = dbGameName;
            room.currentMode = config?.mode || 'offline';
            room.currentIntensity = config?.intensity || 'medium';
            room.questionNumber = 0;
            room.gameState = 'playing';

            const firstQuestion = getQuestion(dbGameName, room.currentIntensity);
            
            if (firstQuestion) {
                room.questionNumber = 1;
                
                io.to(room.code).emit('game-started', {
                    game: config?.game || gameName,
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
            console.error('❌ Error starting game:', error);
            socket.emit('error', { message: 'Failed to start game' });
        }
    });

    // Next question handler
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
                    question: question,
                    questionNumber: room.questionNumber
                });
                
                console.log(`📤 Question ${room.questionNumber} sent to room ${room.code}`);
            }
        } catch (error) {
            console.error('❌ Error getting next question:', error);
            socket.emit('error', { message: 'Failed to get next question' });
        }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
        
        for (const [code, room] of rooms.entries()) {
            if (room.host === socket.id) {
                console.log(`🏠 Room ${code} closed - host disconnected`);
                io.to(code).emit('host-disconnected');
                rooms.delete(code);
                return;
            }
        }
        
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);
                    
                    console.log(`👤 ${player.name} left room ${socket.roomCode}. Remaining: ${room.players.length}`);
                    
                    io.to(socket.roomCode).emit('player-disconnected', {
                        playerId: socket.id,
                        playerName: player.name
                    });
                    
                    io.to(socket.roomCode).emit('players-updated', room.players);
                }
            }
        }
    });
});

// Helper function to get questions
function getQuestion(game, intensity) {
    try {
        if (questionManager && typeof questionManager.getRandomQuestion === 'function') {
            const question = questionManager.getRandomQuestion(game, intensity, 'offline');
            if (question) return question;
        }
    } catch (error) {
        console.log(`⚠️ QuestionManager error, using fallback for ${game}/${intensity}`);
    }
    
    const gameQuestions = fallbackQuestions[game];
    if (!gameQuestions || !gameQuestions[intensity]) {
        return { 
            text: `Sample ${game} question for ${intensity} intensity`,
            type: 'text',
            game: game,
            intensity: intensity
        };
    }
    
    const questions = gameQuestions[intensity];
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start!`);
    console.log(`🏠 Host interface: http://localhost:${PORT}/host`);
});