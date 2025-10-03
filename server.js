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
    const { QuestionManager } = require('./questions-database.js');
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

// Anonymous question submission
app.get('/add-question/:roomCode', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'add-question.html'));
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
                console.error(`❌ Room ${roomCode} not found. Available:`, Object.keys(rooms));
                if (typeof callback === 'function') {
                    callback({ success: false, error: error.message });
                }
                socket.emit('join-error', error);
                return;
            }
            
            // If this is the host reconnecting (Host-Display), update the hostId and clear disconnect timer
            if (playerName === 'Host-Display' && room.hostDisconnectedAt) {
                console.log(`✅ Host reconnected to room ${roomCode} - cancelling deletion`);
                delete room.hostDisconnectedAt;
                room.hostId = socket.id; // Update to new socket ID
            }
            
            // Remove any existing player with same name (rejoin support)
            room.players = room.players.filter(p => 
                p.name !== playerName && p.id !== socket.id
            );
            
            // Only add to players list if not the host display
            if (playerName !== 'Host-Display') {
                const player = {
                    id: socket.id,
                    name: playerName,
                    avatar: avatar || '🎮',
                    score: 0,
                    joinedAt: Date.now()
                };
                
                room.players.push(player);
                console.log(`✅ ${playerName} joined room ${roomCode}`);
                
                // Notify everyone
                io.to(room.hostId).emit('player-joined', player);
                io.to(roomCode.toUpperCase()).emit('players-updated', {
                    players: room.players,
                    count: room.players.length
                });
            } else {
                console.log(`✅ Host-Display connected to room ${roomCode}`);
            }
            
            socket.join(roomCode.toUpperCase());
            socket.roomCode = roomCode.toUpperCase();
            
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
            const { game, intensity, mode, questionNumber } = data;
            
            if (questionManager) {
                const question = questionManager.getRandomQuestion(game, intensity, mode, questionNumber);
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
    
    // Next question (from host)
    socket.on('next-question', (data) => {
        try {
            const { roomCode, game, intensity, mode, questionNumber } = data;
            
            console.log('📥 next-question request:', {
                roomCode,
                game,
                intensity,
                mode,
                questionNumber,
                roomExists: !!rooms[roomCode],
                availableRooms: Object.keys(rooms)
            });
            
            const room = rooms[roomCode];
            
            if (!room) {
                console.error('❌ Room not found:', roomCode);
                console.error('Available rooms:', Object.keys(rooms));
                socket.emit('error', { message: `Room not found: ${roomCode}. Available rooms: ${Object.keys(rooms).join(', ')}` });
                return;
            }
            
            // Clear votes for new question
            room.currentVotes = {};
            room.voterDetails = {};
            
            if (questionManager) {
                const question = questionManager.getRandomQuestion(game, intensity, mode, questionNumber);
                
                console.log('✅ Question fetched:', question.text.substring(0, 50) + '...');
                
                // Send to all clients in room
                io.to(roomCode).emit('new-question', {
                    question: question.text,
                    questionId: question.id,
                    isCustom: question.isCustom,
                    questionNumber,
                    game,
                    mode,
                    intensity
                });
                
                // ALSO send directly to the requester
                socket.emit('new-question', {
                    question: question.text,
                    questionId: question.id,
                    isCustom: question.isCustom,
                    questionNumber,
                    game,
                    mode,
                    intensity
                });
                
                console.log(`📤 Question ${questionNumber} sent to room ${roomCode}`);
            }
        } catch (error) {
            console.error('Next question error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Mobile voting - player votes
    socket.on('vote', (data) => {
        try {
            const { roomCode, playerName, vote, questionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Initialize votes for this question if needed
            if (!room.currentVotes) {
                room.currentVotes = {};
            }
            if (!room.voterDetails) {
                room.voterDetails = {};
            }
            
            // Store vote with player details
            room.currentVotes[playerName] = vote;
            
            // Find player to get avatar
            const player = room.players.find(p => p.name === playerName);
            const displayName = player ? `${player.avatar} ${player.name}` : playerName;
            
            // Store voter details for reveal
            room.voterDetails[vote] = room.voterDetails[vote] || [];
            room.voterDetails[vote].push(displayName);
            
            // Count votes
            const voteCounts = {};
            const voters = [];
            
            for (const [player, playerVote] of Object.entries(room.currentVotes)) {
                voteCounts[playerVote] = (voteCounts[playerVote] || 0) + 1;
                voters.push(player);
            }
            
            // Send vote update to host
            io.to(room.hostId).emit('vote-update', {
                votes: voteCounts,
                voters: room.voterDetails,
                totalVotes: voters.length,
                totalPlayers: room.players.length
            });
            
            // Confirm to voter
            socket.emit('vote-confirmed', { success: true });
            
            console.log(`🗳️ Vote from ${displayName} in room ${roomCode}: ${vote}`);
        } catch (error) {
            console.error('Vote error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Handle request for vote update (for reveal button)
    socket.on('request-vote-update', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) return;
            
            const voters = Object.keys(room.currentVotes || {});
            
            socket.emit('vote-update', {
                votes: room.currentVotes ? Object.values(room.currentVotes).reduce((acc, vote) => {
                    acc[vote] = (acc[vote] || 0) + 1;
                    return acc;
                }, {}) : {},
                voters: room.voterDetails || {},
                totalVotes: voters.length,
                totalPlayers: room.players.length
            });
        } catch (error) {
            console.error('Request vote update error:', error);
        }
    });
    
    // Spotlight mode - set spotlight player
    socket.on('set-spotlight', (data) => {
        try {
            const { roomCode, playerName } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const player = room.players.find(p => p.name === playerName);
            
            if (!player) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }
            
            // Notify all clients who is in spotlight
            io.to(roomCode).emit('spotlight-active', {
                player: player.name,
                avatar: player.avatar,
                status: 'thinking'
            });
            
            console.log(`🎯 Spotlight on ${playerName} in room ${roomCode}`);
        } catch (error) {
            console.error('Set spotlight error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Spotlight player submits answer (private)
    socket.on('spotlight-answer', (data) => {
        try {
            const { roomCode, answer } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Store answer privately
            room.spotlightAnswer = answer;
            
            // Update status to ready (but don't reveal answer yet)
            io.to(roomCode).emit('spotlight-status', {
                status: 'ready-to-reveal'
            });
            
            console.log(`💭 Spotlight answer saved for room ${roomCode}`);
        } catch (error) {
            console.error('Spotlight answer error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Spotlight player reveals answer
    socket.on('reveal-answer', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Reveal the answer to everyone
            io.to(roomCode).emit('answer-revealed', {
                answer: room.spotlightAnswer
            });
            
            console.log(`✨ Answer revealed in room ${roomCode}`);
        } catch (error) {
            console.error('Reveal answer error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Add custom question
    socket.on('add-custom-question', (data) => {
        try {
            const { roomCode, question, game, intensity } = data;
            
            if (questionManager) {
                // Map game names
                const gameMap = {
                    'nhie': 'never_have_i_ever',
                    'wyr': 'would_you_rather',
                    'hot': 'hot_takes',
                    'hottakes': 'hot_takes'
                };
                
                const mappedGame = gameMap[game] || game;
                
                const success = questionManager.addCustomQuestion(mappedGame, intensity, question);
                
                if (success) {
                    socket.emit('custom-question-added', { success: true });
                    console.log(`➕ Custom question added to ${mappedGame}/${intensity}`);
                } else {
                    socket.emit('error', { message: 'Failed to add question' });
                }
            }
        } catch (error) {
            console.error('Add custom question error:', error);
            socket.emit('error', { message: error.message });
        }
    });
    
    // Clear votes for new question
    socket.on('clear-votes', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (room) {
                room.currentVotes = {};
                room.spotlightAnswer = null;
            }
        } catch (error) {
            console.error('Clear votes error:', error);
        }
    });
    
    // Disconnect handling
    socket.on('disconnect', (reason) => {
        console.log('🔌 User disconnected:', socket.id, 'Reason:', reason);
        
        // Remove player from their room
        if (socket.roomCode) {
            const room = rooms[socket.roomCode];
            if (room) {
                // Remove non-host players
                room.players = room.players.filter(p => p.id !== socket.id);
                io.to(socket.roomCode).emit('players-updated', {
                    players: room.players,
                    count: room.players.length
                });
                
                // If host disconnects, DON'T delete room immediately
                // Give them 30 seconds to reconnect (for page navigation)
                if (room.hostId === socket.id) {
                    console.log(`⚠️ Host disconnected from room ${socket.roomCode} - waiting for reconnect...`);
                    
                    room.hostDisconnectedAt = Date.now();
                    
                    // Only delete after 30 seconds if no reconnect
                    setTimeout(() => {
                        const currentRoom = rooms[socket.roomCode];
                        if (currentRoom && currentRoom.hostDisconnectedAt) {
                            io.to(socket.roomCode).emit('host-disconnected');
                            delete rooms[socket.roomCode];
                            console.log(`🗑️ Room ${socket.roomCode} deleted (host didn't reconnect)`);
                        }
                    }, 30000); // 30 seconds grace period
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

// Start server with error handling
const PORT = process.env.PORT || 3000;

server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
    }
});

server.listen(PORT, '0.0.0.0', () => {
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
    
    console.log(`✅ Server ready at port ${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});