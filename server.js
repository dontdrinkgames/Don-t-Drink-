const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",  // Allow all origins for now (or replace "*" with your domain, e.g., "https://dontdrinkgames.com")
    methods: ["GET", "POST"],
    credentials: true
  }
});
// Import questions database
let questionsDatabase = {};
let QuestionManager = null;

// Try to load questions database
try {
    const questionsModule = require('./questions-database.js');
    questionsDatabase = questionsModule.questionsDatabase || {};
    QuestionManager = questionsModule.QuestionManager;
    
    // Initialize QuestionManager if class exists
    if (QuestionManager && typeof QuestionManager === 'function') {
        QuestionManager = new QuestionManager();
    }
    
    console.log('Questions database loaded successfully');
    console.log('Question Manager initialized');
} catch (error) {
    console.error('Could not load questions database:', error.message);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Room storage
const rooms = {};

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

// API endpoint for questions (for offline mode)
app.get('/api/question/:game/:intensity', (req, res) => {
    const { game, intensity } = req.params;
   
    console.log(`API Request: ${game}/${intensity}`);
   
    try {
        // Game name mapping
        const gameMapping = {
            'wyr': 'would_you_rather',
            'fmk': 'fmk',
            'nhie': 'never_have_i_ever',
            'hottakes': 'hot_takes',
            'hot': 'hot_takes',
            'hot_takes': 'hot_takes',
            'would_you_rather': 'would_you_rather',
            'never_have_i_ever': 'never_have_i_ever'
        };
        const mappedGame = gameMapping[game] || game;
       
        // HANDLE MIXMASTER - choose random intensity
        let actualIntensity = intensity;
        if (intensity === 'mixmaster') {
            const intensities = ['medium', 'spicy', 'cancelled'];
            actualIntensity = intensities[Math.floor(Math.random() * intensities.length)];
            console.log(`Mixmaster: Random intensity selected: ${actualIntensity}`);
        }
       
        console.log(`Game mapping: ${game} → ${mappedGame}, Intensity: ${actualIntensity}`);
       
        let question = null;
       
        // Try QuestionManager first
        if (QuestionManager && QuestionManager.getRandomQuestion) {
            console.log(`Using QuestionManager for ${mappedGame}/${actualIntensity}`);
            question = QuestionManager.getRandomQuestion(mappedGame, actualIntensity, 'offline');
        }
       
        // Fallback to direct database access
        if (!question && questionsDatabase[mappedGame] && questionsDatabase[mappedGame][actualIntensity]) {
            const questions = questionsDatabase[mappedGame][actualIntensity];
            if (questions && questions.length > 0) {
                const randomIndex = Math.floor(Math.random() * questions.length);
                question = questions[randomIndex];
                console.log(`Got question from database: ${mappedGame}/${actualIntensity}`);
            }
        }
       
        // Last resort fallback
        if (!question) {
            console.warn(`No questions found for ${mappedGame}/${actualIntensity}`);
            question = null;
        }
       
        // Generate unique question ID if needed
        const questionId = question ? `${mappedGame}_${actualIntensity}_${Date.now()}` : null;
       
        res.json({
            success: !!question,
            question: question,
            questionId: questionId,
            game: mappedGame,
            intensity: actualIntensity,
            originalIntensity: intensity // So frontend knows if mixmaster was used
        });
       
    } catch (error) {
        console.error('Error getting question:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get question',
            details: error.message
        });
    }
});
// Rating endpoint - add this new endpoint to server.js
app.post('/api/question/rate', express.json(), (req, res) => {
    const { questionId, rating, game, intensity, questionText } = req.body;
   
    console.log(`Rating received: ${rating} for question ${questionId}`);
   
    // Store rating (you can implement database storage later)
    if (!global.questionRatings) {
        global.questionRatings = {};
    }
   
    if (!global.questionRatings[questionId]) {
        global.questionRatings[questionId] = {
            questionText: questionText,
            game: game,
            intensity: intensity,
            thumbsUp: 0,
            thumbsDown: 0,
            totalScore: 0
        };
    }
   
    if (rating === 'up') {
        global.questionRatings[questionId].thumbsUp++;
        global.questionRatings[questionId].totalScore++;
    } else if (rating === 'down') {
        global.questionRatings[questionId].thumbsDown++;
        global.questionRatings[questionId].totalScore--;
    }
   
    console.log(`Question rating updated:`, global.questionRatings[questionId]);
   
    res.json({
        success: true,
        rating: global.questionRatings[questionId]
    });
});
// Get ratings summary - add this endpoint too
app.get('/api/question/ratings', (req, res) => {
    const ratings = global.questionRatings || {};
    const summary = Object.values(ratings).sort((a, b) => b.totalScore - a.totalScore);
   
    res.json({
        totalRatings: Object.keys(ratings).length,
        topRated: summary.slice(0, 10),
        bottomRated: summary.slice(-10),
        allRatings: summary
    });
});

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Mobile player route
app.get('/:roomCode([A-Z0-9]{6})', (req, res) => {
    const roomCode = req.params.roomCode;
    console.log(`Player trying to join room: ${roomCode}`);
    
    // For mobile players, always send to mobile.html
    // Don't check if room exists to avoid race conditions
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Create room - host only
    socket.on('create-room', (data, callback) => {
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        rooms[roomCode] = {
            hostId: socket.id,
            players: [],
            gameState: {
                currentGame: null,
                currentMode: null,
                currentIntensity: null,
                currentQuestion: null,
                questionCount: 0,
                usedQuestions: []
            },
            customQuestions: []
        };
        
        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by host: ${socket.id}`);
        
        // Send response both ways for compatibility
        if (callback) {
            callback({ success: true, roomCode: roomCode });
        }
        socket.emit('room-created', { roomCode: roomCode });
    });
    
    // Start game - host only
    socket.on('start-game', (config) => {
        const room = Object.values(rooms).find(r => r.hostId === socket.id);
        
        if (!room) {
            socket.emit('error', { message: 'You are not a host' });
            return;
        }
        
        const roomCode = Object.keys(rooms).find(key => rooms[key] === room);
        
        // Update room state
        room.gameState.currentGame = config.game;
        room.gameState.currentMode = config.mode;
        room.gameState.currentIntensity = config.intensity;
        room.gameState.questionCount = 0;
        room.gameState.usedQuestions = [];
        
        console.log(`🎮 Starting game in room ${roomCode}:`);
        console.log(`  Game: ${config.game}`);
        console.log(`  Mode: ${config.mode}`);
        console.log(`  Intensity: ${config.intensity}`);
        console.log(`  Custom Questions: ${room.customQuestions.length}`);
        console.log(`  Players: ${room.players.length}`);
        
        // Game name mapping
        const gameMapping = {
            'wyr': 'would_you_rather',
            'fmk': 'fmk',
            'nhie': 'never_have_i_ever',
            'hottakes': 'hot_takes'
        };
        
        const dbGameName = gameMapping[config.game] || config.game;
        
        console.log(`🔄 Game name mapping: ${config.game} → ${dbGameName}`);
        
        try {
            let question = null;
            
            // Try QuestionManager first
            if (QuestionManager && QuestionManager.getRandomQuestion) {
                console.log(`🎯 Getting question for: ${dbGameName} ${config.intensity}`);
                question = QuestionManager.getRandomQuestion(dbGameName, config.intensity, config.mode);
            }
            
            // Fallback to direct database access
            if (!question && questionsDatabase[dbGameName] && questionsDatabase[dbGameName][config.intensity]) {
                const questions = questionsDatabase[dbGameName][config.intensity];
                if (questions && questions.length > 0) {
                    const randomIndex = Math.floor(Math.random() * questions.length);
                    question = questions[randomIndex];
                }
            }
            
            // Last resort fallback
            if (!question) {
                question = `Sample ${config.game} question for ${config.intensity}`;
            }
            
            console.log(`✅ Question retrieved successfully`);
            
            room.gameState.currentQuestion = question;
            room.gameState.questionCount++;
            room.gameState.usedQuestions.push(question);
            
            // Send to all players in room
            io.to(roomCode).emit('game-started', {
                game: config.game,
                mode: config.mode,
                intensity: config.intensity,
                question: question,
                questionNumber: room.gameState.questionCount
            });
            
            // Also send specifically to host
            socket.emit('new-question', {
                question: question,
                questionNumber: room.gameState.questionCount
            });
            
            console.log(`📤 Question sent successfully`);
            
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', { message: 'Failed to get question' });
        }
    });
    
    // Get next question
    socket.on('next-question', (data) => {
        const room = Object.values(rooms).find(r => r.hostId === socket.id);
        
        if (!room) {
            socket.emit('error', { message: 'You are not a host' });
            return;
        }
        
        const roomCode = Object.keys(rooms).find(key => rooms[key] === room);
        
        try {
            const gameMapping = {
                'wyr': 'would_you_rather',
                'fmk': 'fmk',
                'nhie': 'never_have_i_ever',
                'hottakes': 'hot_takes'
            };
            
            const dbGameName = gameMapping[room.gameState.currentGame] || room.gameState.currentGame;
            
            let question = null;
            
            // Try QuestionManager
            if (QuestionManager && QuestionManager.getRandomQuestion) {
                question = QuestionManager.getRandomQuestion(
                    dbGameName, 
                    room.gameState.currentIntensity, 
                    room.gameState.currentMode
                );
            }
            
            // Fallback to direct database
            if (!question && questionsDatabase[dbGameName] && questionsDatabase[dbGameName][room.gameState.currentIntensity]) {
                const questions = questionsDatabase[dbGameName][room.gameState.currentIntensity];
                const availableQuestions = questions.filter(q => !room.gameState.usedQuestions.includes(q));
                
                if (availableQuestions.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
                    question = availableQuestions[randomIndex];
                } else {
                    // All questions used, reset
                    room.gameState.usedQuestions = [];
                    const randomIndex = Math.floor(Math.random() * questions.length);
                    question = questions[randomIndex];
                }
            }
            
            if (!question) {
                question = `Sample question ${room.gameState.questionCount + 1}`;
            }
            
            room.gameState.currentQuestion = question;
            room.gameState.questionCount++;
            room.gameState.usedQuestions.push(question);
            
            // Send to all in room
            io.to(roomCode).emit('new-question', {
                question: question,
                questionNumber: room.gameState.questionCount
            });
            
            console.log(`Question ${room.gameState.questionCount} sent`);
            
        } catch (error) {
            console.error('Error getting next question:', error);
            socket.emit('error', { message: 'Failed to get question' });
        }
    });
    
    // Get question (for play.html)
    socket.on('get-question', (data) => {
        const { roomCode, game, intensity } = data;
        
        console.log(`Get question request: ${game}/${intensity}`);
        
        try {
            const gameMapping = {
                'wyr': 'would_you_rather',
                'fmk': 'fmk',
                'nhie': 'never_have_i_ever',
                'hottakes': 'hot_takes'
            };
            
            const dbGameName = gameMapping[game] || game;
            
            let question = null;
            
            if (QuestionManager && QuestionManager.getRandomQuestion) {
                question = QuestionManager.getRandomQuestion(dbGameName, intensity, 'offline');
            }
            
            if (!question && questionsDatabase[dbGameName] && questionsDatabase[dbGameName][intensity]) {
                const questions = questionsDatabase[dbGameName][intensity];
                if (questions && questions.length > 0) {
                    const randomIndex = Math.floor(Math.random() * questions.length);
                    question = questions[randomIndex];
                }
            }
            
            if (!question) {
                question = `Sample ${game} question`;
            }
            
            socket.emit('new-question', {
                question: question,
                questionNumber: 1
            });
            
        } catch (error) {
            console.error('Error getting question:', error);
            socket.emit('error', { message: 'Failed to get question' });
        }
    });
    
    // Join room - players
    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        
        console.log(`Player ${playerName} trying to join room ${roomCode}`);
        
        if (!rooms[roomCode]) {
            socket.emit('join-error', { message: 'Room not found' });
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
        
        // Notify everyone
        io.to(rooms[roomCode].hostId).emit('player-joined', player);
        io.to(roomCode).emit('players-updated', rooms[roomCode].players);
        
        socket.emit('join-success', {
            roomCode: roomCode,
            players: rooms[roomCode].players
        });
        
        console.log(`${playerName} joined room ${roomCode}`);
    });
    
    // Add custom question
    socket.on('add-custom-question', (data) => {
        const { roomCode, question, author } = data;
        
        if (rooms[roomCode]) {
            rooms[roomCode].customQuestions.push({
                question: question,
                author: author || 'Anonymous',
                timestamp: Date.now()
            });
            
            console.log(`Custom question added to room ${roomCode}`);
            socket.emit('custom-question-added', { success: true });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Check if host
        const roomCode = Object.keys(rooms).find(code => rooms[code].hostId === socket.id);
        
        if (roomCode) {
            // Host disconnected
            io.to(roomCode).emit('host-disconnected');
            delete rooms[roomCode];
            console.log(`Room ${roomCode} closed - host disconnected`);
        } else {
            // Check if player
            Object.entries(rooms).forEach(([code, room]) => {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);
                    io.to(room.hostId).emit('player-disconnected', {
                        playerName: player.name
                    });
                    io.to(code).emit('players-updated', room.players);
                }
            });
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start hosting!`);
    console.log(`🎮 Host interface: http://localhost:${PORT}/host`);
});