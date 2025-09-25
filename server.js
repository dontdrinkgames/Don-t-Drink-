const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { questionsDatabase, QuestionManager } = require('./questions-database.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const questionManager = new QuestionManager();
const rooms = new Map();

const gameNameMapping = {
    'wyr': 'would_you_rather',
    'fmk': 'fmk',
    'nhie': 'never_have_i_ever',
    'hottakes': 'hot_takes'
};

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getFallbackQuestion(game, intensity) {
    const fallbacks = {
        wyr: {
            medium: "Would you rather have the ability to fly or be invisible?",
            spicy: "Would you rather accidentally send a flirty text to your boss or your mom?",
            cancelled: "Would you rather have your browser history made public or your text messages?"
        },
        fmk: {
            medium: "Taylor Swift, Beyoncé, Ariana Grande",
            spicy: "Your attractive neighbor, your ex's best friend, your boss",
            cancelled: "Your best friend's parent, your teacher, your doctor"
        },
        nhie: {
            medium: "Never have I ever stayed up all night binge-watching a TV show.",
            spicy: "Never have I ever had a crush on a friend's significant other.",
            cancelled: "Never have I ever hooked up with someone I met online."
        },
        hottakes: {
            medium: "Pineapple belongs on pizza and anyone who disagrees has no taste.",
            spicy: "People who don't tip at restaurants are terrible humans.",
            cancelled: "Social media has completely ruined dating and relationships."
        }
    };
    return fallbacks[game]?.[intensity] || "Fallback question: Database issue.";
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Main routes - FIXED FILE PATHS
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// Room code routing - handles /ABC123 style URLs - FIXED FILE PATH
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    // Validate room code format (6 alphanumeric characters)
    if (roomCode.match(/^[A-Z0-9]{6}$/)) {
        // Serve the mobile player interface - FIXED PATH
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        // Invalid room code, redirect to home
        res.redirect('/');
    }
});

// API routes
app.get('/api/question/:game/:intensity', (req, res) => {
    try {
        const { game, intensity } = req.params;
        const dbGame = gameNameMapping[game] || game;
        if (!questionsDatabase[dbGame] || !questionsDatabase[dbGame][intensity]) {
            return res.status(400).json({ error: 'Invalid game or intensity' });
        }
        const questionData = questionManager.getRandomQuestion(dbGame, intensity);
        if (!questionData) {
            return res.status(404).json({ error: 'No questions available' });
        }
        res.json(questionData);
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('create-room', (callback) => {
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
        console.log(`Room ${roomCode} created by ${socket.id}`);
        
        // Send response both ways for compatibility
        if (typeof callback === 'function') {
            callback({ success: true, roomCode: roomCode });
        }
        socket.emit('room-created', { roomCode: roomCode });
    });

    // Player joins room (fixed rejoin without duplicates)
    socket.on('join-room', ({ roomCode, playerName, avatar }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        const normalizedName = playerName.toLowerCase();
        let existingPlayer = Array.from(room.players.values()).find(p => p.name.toLowerCase() === normalizedName);
        if (existingPlayer) {
            // Update for reconnect
            room.players.delete(existingPlayer.id);
            existingPlayer.id = socket.id;
            existingPlayer.avatar = avatar; // Update avatar if changed
            room.players.set(socket.id, existingPlayer);
            socket.join(roomCode);
            socket.emit('joined-room', { success: true, player: existingPlayer });
            console.log(`Player ${playerName} reconnected to room ${roomCode}`);
        } else {
            // New player
            const player = { 
                id: socket.id,
                name: playerName, 
                avatar: avatar, 
                score: 0
            };
            room.players.set(socket.id, player);
            socket.join(roomCode);
            socket.emit('joined-room', { success: true, player });
            console.log(`Player ${playerName} joined room ${roomCode}`);
        }
        // Broadcast updated player list
        const playerList = Array.from(room.players.values());
        io.to(roomCode).emit('player-joined', { 
            player: room.players.get(socket.id), 
            playerCount: room.players.size,
            players: playerList
        });
    });

    // Submit answer
    socket.on('submit-answer', ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (room) {
            room.answers.set(socket.id, answer);
            console.log(`Answer submitted in room ${roomCode}:`, answer);
            
            // Check if all players have answered
            if (room.answers.size === room.players.size) {
                const results = Array.from(room.answers.entries()).map(([playerId, answer]) => ({
                    playerId,
                    playerName: room.players.get(playerId)?.name,
                    answer
                }));
                io.to(roomCode).emit('vote-results', {
                    question: room.currentQuestion?.text || 'Question',
                    votes: results.reduce((acc, result) => {
                        acc[result.answer] = (acc[result.answer] || 0) + 1;
                        return acc;
                    }, {}),
                    voters: results.map(r => r.playerId)
                });
                room.answers.clear(); // Reset for next question
            }
        }
    });

    // Add lobby question
    socket.on('add-lobby-question', ({ question }) => {
        // Find which room this player is in
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                if (player.customQuestions.length < 10) {
                    player.customQuestions.push(question);
                    socket.emit('question-added-success', { question });
                    io.to(roomCode).emit('lobby-question-update', {
                        playerId: socket.id,
                        questionCount: player.customQuestions.length
                    });
                } else {
                    socket.emit('error', { message: 'Maximum 10 questions per player' });
                }
                break;
            }
        }
    });

    // Player ready toggle
    socket.on('player-ready', () => {
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                player.isReady = true;
                
                const allReady = Array.from(room.players.values()).every(p => p.isReady);
                io.to(roomCode).emit('player-ready-update', {
                    playerId: socket.id,
                    isReady: true,
                    allReady: allReady
                });
                break;
            }
        }
    });

    socket.on('player-unready', () => {
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                player.isReady = false;
                
                io.to(roomCode).emit('player-ready-update', {
                    playerId: socket.id,
                    isReady: false,
                    allReady: false
                });
                break;
            }
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove player from all rooms and notify others
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                room.players.delete(socket.id);
                
                const playerList = Array.from(room.players.values());
                io.to(code).emit('player-left', {
                    playerName: player.name,
                    playerCount: playerList.length,
                    players: playerList
                });
                console.log(`Player ${player.name} left room ${code}`);
            }
            
            // Close room if host disconnects
            if (room.host === socket.id) {
                io.to(code).emit('host-disconnected');
                rooms.delete(code);
                console.log(`Room ${code} closed - host disconnected`);
            }
        }
    });
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});