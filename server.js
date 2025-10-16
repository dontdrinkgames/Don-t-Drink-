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
    // Create fallback manager
    questionManager = {
        getRandomQuestion: () => ({
            id: 'fallback',
            text: 'Questions database not available. Please refresh the page.',
            isCustom: false
        }),
        addCustomQuestion: () => false,
        rateQuestion: () => false,
        getRemovedQuestions: () => []
    };
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
    res.status(200).json({ 
        status: 'ok', 
        rooms: Object.keys(rooms).length,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
    });
});

// Simple test endpoint
app.get('/test', (req, res) => {
    res.status(200).json({ 
        message: 'Server is running!',
        timestamp: new Date().toISOString()
    });
});

// Fallback route for debugging
app.get('/debug', (req, res) => {
    res.status(200).json({
        message: 'Debug info',
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        questionManager: questionManager ? 'loaded' : 'not loaded',
        rooms: Object.keys(rooms).length
    });
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
    
    // Host reconnect to existing room
    socket.on('host-reconnect', (data, callback) => {
        try {
            const { roomCode, hostId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                console.log(`❌ Room ${roomCode} not found for reconnect`);
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Room not found' });
                }
                return;
            }
            
            // Update host ID
            room.hostId = socket.id;
            
            // Join the room
            socket.join(roomCode);
            
            console.log(`🔄 Host reconnected to room ${roomCode} with ${room.players.length} players`);
            
            if (typeof callback === 'function') {
                callback({ 
                    success: true, 
                    roomCode,
                    players: room.players
                });
            }
            
            // Notify all players that host is back
            socket.to(roomCode).emit('host-reconnected', { message: 'Host is back!' });
            
        } catch (error) {
            console.error('Host reconnect error:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
        }
    });
    
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
            room.resultsRevealed = false;
            
            if (questionManager) {
                // Mixmaster support on server-side as well
                let resolvedGame = game;
                if (game === 'mixmaster' || (typeof game === 'string' && game.startsWith('mixmaster'))) {
                    const candidates = ['never_have_i_ever', 'would_you_rather', 'hot_takes', 'fmk'];
                    resolvedGame = candidates[(questionNumber - 1) % candidates.length];
                }

                // Fetch question; if none found, try a safe fallback intensity
                let question = questionManager.getRandomQuestion(resolvedGame, intensity, mode, questionNumber);
                if (question && question.id === 'fallback') {
                    const fallbackIntensities = ['medium', 'spicy', 'cancelled'];
                    for (const alt of fallbackIntensities) {
                        if (alt !== intensity) {
                            const tryQ = questionManager.getRandomQuestion(resolvedGame, alt, mode, questionNumber);
                            if (tryQ && tryQ.id !== 'fallback') { question = tryQ; break; }
                        }
                    }
                }
                
                console.log('✅ Question fetched:', question);
                
                // Store current question in room for spotlight mode
                room.currentQuestion = question;
                
                // Send to all clients in room - send the FULL question object
                io.to(roomCode).emit('new-question', {
                    ...question, // Spread all question properties (text, optionA, optionB, etc.)
                    questionNumber,
                    game: resolvedGame,
                    mode,
                    intensity
                });
                
                // ALSO send directly to the requester
                socket.emit('new-question', {
                    ...question, // Spread all question properties
                    questionNumber,
                    game: resolvedGame,
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
    
    // End game - return all players to lobby
    socket.on('end-game', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                console.error('❌ End game: Room not found:', roomCode);
                return;
            }
            
            // Reset room state but keep players and room structure
            room.gameState = 'waiting';
            room.currentVotes = {};
            room.voterDetails = {};
            room.resultsRevealed = false;
            room.gameConfig = null;
            
            console.log(`🏁 Game ended in room ${roomCode}. ${room.players.length} players returned to lobby.`);
            
            // Notify all players to return to waiting screen
            io.to(roomCode).emit('game-ended', { 
                message: 'Game ended. Return to lobby!',
                roomCode,
                playersCount: room.players.length
            });
            
        } catch (error) {
            console.error('End game error:', error);
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
                totalPlayers: room.players.length,
                revealed: room.resultsRevealed || false
            });
        } catch (error) {
            console.error('Request vote update error:', error);
        }
    });
    
    // Handle reveal results (broadcast to all players)
    socket.on('reveal-results', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) return;
            
            room.resultsRevealed = true;
            
            const voters = Object.keys(room.currentVotes || {});
            const voteCounts = Object.values(room.currentVotes).reduce((acc, vote) => {
                acc[vote] = (acc[vote] || 0) + 1;
                return acc;
            }, {});
            
            console.log(`🔍 Results revealed in room ${roomCode}:`);
            console.log('   - currentVotes:', room.currentVotes);
            console.log('   - voteCounts:', voteCounts);
            console.log('   - voterDetails:', room.voterDetails);
            console.log('   - totalVotes:', voters.length);
            console.log('   - totalPlayers:', room.players.length);
            
            // Send to ALL players in room
            io.to(roomCode).emit('vote-update', {
                votes: voteCounts,
                voters: room.voterDetails || {},
                totalVotes: voters.length,
                totalPlayers: room.players.length,
                revealed: true
            });
            
        } catch (error) {
            console.error('Reveal results error:', error);
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
            
            // Store answer privately and spotlight player
            room.spotlightAnswer = answer;
            room.spotlightPlayer = data.playerName;
            room.spotlightGuesses = {}; // Reset guesses
            
            // Update status to ready (but don't reveal answer yet)
            io.to(roomCode).emit('spotlight-status', {
                status: 'ready-to-reveal'
            });

            // Trigger spotlight guessing phase - show question to all
            // If only 1 player, skip guessing phase and go straight to reveal
            const nonSpotlightPlayers = room.players.filter(p => p.name !== data.playerName);
            if (nonSpotlightPlayers.length === 0) {
                // Only spotlight player, show reveal button immediately
                io.to(roomCode).emit('all-guessed-received', {
                    readyToReveal: true
                });
            } else {
                // Multiple players, show guessing phase
                socket.emit('spotlight-show-question', {
                    roomCode: roomCode,
                    questionData: {
                        text: room.currentQuestion?.text,
                        optionA: room.currentQuestion?.optionA,
                        optionB: room.currentQuestion?.optionB,
                        game: room.game,
                        spotlightPlayer: data.playerName
                    }
                });
            }
            
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
            
            // Calculate beer emoji scores
            const correctAnswer = room.spotlightAnswer;
            const guesses = room.spotlightGuesses || {};
            const beerScores = {};
            
            // Initialize beer scores for all players
            room.players.forEach(player => {
                if (!beerScores[player.name]) {
                    beerScores[player.name] = player.beerCount || 0;
                }
            });
            
            // Award beer emojis for wrong guesses
            // If only 1 player, they can't get beer emojis (no one to guess wrong)
            if (Object.keys(guesses).length > 0) {
                Object.entries(guesses).forEach(([socketId, guess]) => {
                    const player = room.players.find(p => p.socketId === socketId);
                    if (player && guess !== correctAnswer) {
                        beerScores[player.name] = (beerScores[player.name] || 0) + 1;
                        console.log(`🍺 ${player.name} gets a beer emoji for wrong guess: ${guess} (correct: ${correctAnswer})`);
                    }
                });
            }
            
            // Update player beer counts
            room.players.forEach(player => {
                player.beerCount = beerScores[player.name] || 0;
            });
            
            // Reveal the answer to everyone with beer scores
            io.to(roomCode).emit('answer-revealed', {
                answer: room.spotlightAnswer,
                beerScores: beerScores,
                correctAnswer: correctAnswer,
                guesses: guesses
            });
            
            console.log(`✨ Answer revealed in room ${roomCode} with beer scores:`, beerScores);
        } catch (error) {
            console.error('Reveal answer error:', error);
            socket.emit('error', { message: error.message });
        }
    });

    // Spotlight guessing phase - show question to all after spotlight answers
    socket.on('spotlight-show-question', (data) => {
        try {
            const { roomCode, questionData } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Show question and voting options to all players (except spotlight)
            io.to(roomCode).emit('spotlight-guessing-phase', {
                question: questionData,
                spotlightPlayer: room.spotlightPlayer
            });
            
            console.log(`🎯 Spotlight guessing phase started in room ${roomCode}`);
        } catch (error) {
            console.error('Spotlight show question error:', error);
        }
    });

    // Handle guessing votes in spotlight mode
    socket.on('spotlight-guess', (data) => {
        try {
            const { roomCode, guess } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Store the guess with socket ID
            if (!room.spotlightGuesses) {
                room.spotlightGuesses = {};
            }
            room.spotlightGuesses[socket.id] = guess;
            
            // Update player's socket ID if needed
            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                player.socketId = socket.id;
            }
            
            // Check if all non-spotlight players have guessed
            const nonSpotlightPlayers = room.players.filter(p => p.name !== room.spotlightPlayer);
            const guessesReceived = Object.keys(room.spotlightGuesses).length;
            
            // If only 1 player (spotlight player), show reveal button immediately
            if (nonSpotlightPlayers.length === 0) {
                io.to(roomCode).emit('all-guessed-received', {
                    readyToReveal: true
                });
            } else if (guessesReceived >= nonSpotlightPlayers.length) {
                // All players have guessed, show reveal button
                io.to(roomCode).emit('all-guessed-received', {
                    readyToReveal: true
                });
            }
            
            console.log(`🎯 Guess received from ${socket.id} in room ${roomCode}: ${guess}`);
        } catch (error) {
            console.error('Spotlight guess error:', error);
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

    // Rate question (downvote deletes it from DB)
    socket.on('rate-question', (data) => {
        try {
            const { questionId, upvote } = data;
            if (!questionManager || !questionId) return;
            questionManager.rateQuestion(questionId, !!upvote);
        } catch (error) {
            console.error('Rate question error:', error);
        }
    });

    // Get removed questions for review
    socket.on('get-removed-questions', (data) => {
        try {
            if (!questionManager) return;
            const removedQuestions = questionManager.getRemovedQuestions();
            socket.emit('removed-questions-list', { removedQuestions });
        } catch (error) {
            console.error('Get removed questions error:', error);
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
                
                // If host disconnects, DO NOT delete room; keep room alive and notify players
                if (room.hostId === socket.id) {
                    console.log(`⚠️ Host disconnected from room ${socket.roomCode} - keeping room alive for reconnect.`);
                    io.to(socket.roomCode).emit('host-disconnected');
                    room.hostDisconnectedAt = Date.now();
                }
            }
        }
    });
});

// Clean up very old rooms (disabled deletion for stability; only notify)
setInterval(() => {
    const now = Date.now();
    const MAX_ROOM_AGE = 12 * 60 * 60 * 1000; // 12 hours
    Object.keys(rooms).forEach(roomCode => {
        if (now - rooms[roomCode].createdAt > MAX_ROOM_AGE) {
            io.to(roomCode).emit('room-expired');
            console.log(`⚠️ Room ${roomCode} exceeded max age; keeping for now.`);
        }
    });
}, 60 * 60 * 1000);

// Start server with error handling
const PORT = process.env.PORT || 3000;

// Add process error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// Add timeout to prevent hanging
server.timeout = 30000;

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
    console.log(`✅ Process ID: ${process.pid}`);
    console.log(`✅ Node version: ${process.version}`);
});