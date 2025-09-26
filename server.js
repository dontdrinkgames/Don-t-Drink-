const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://dontdrinkgames.com", "https://www.dontdrinkgames.com"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Import questions database
let questionsDatabase = {};
let questionManager = null;

// Try to load questions database
try {
    const questionsModule = require('./questions-database.js');
    questionsDatabase = questionsModule.questionsDatabase || {};
    const QuestionManagerClass = questionsModule.QuestionManager;
    
    // Initialize QuestionManager if class exists
    if (QuestionManagerClass && typeof QuestionManagerClass === 'function') {
        questionManager = new QuestionManagerClass();
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

// Route for anonymous custom question submission
app.get('/add-question/:roomCode', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'add-question.html'));
});

// Dynamic room URL for mobile players
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode;
    // For mobile players, always send to mobile.html
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
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
       
        let question = null;
       
        // Try using QuestionManager (always offline mode for API)
        if (questionManager && questionManager.getRandomQuestion) {
            const result = questionManager.getRandomQuestion(mappedGame, actualIntensity, 'offline', null);
            question = result ? result.text : null;
        }
       
        // Fallback to direct database access
        if (!question && questionsDatabase[mappedGame] && questionsDatabase[mappedGame][actualIntensity]) {
            const questions = questionsDatabase[mappedGame][actualIntensity];
            if (questions && questions.length > 0) {
                const randomIndex = Math.floor(Math.random() * questions.length);
                question = questions[randomIndex];
            }
        }
       
        if (!question) {
            console.log(`No ${actualIntensity} ${mappedGame} questions available`);
            return res.json({ 
                error: true,
                message: `No ${actualIntensity} ${game} questions available`,
                question: null
            });
        }
       
        res.json({
            question: question,
            game: mappedGame,
            intensity: actualIntensity
        });
       
    } catch (error) {
        console.error('Error getting question:', error);
        res.status(500).json({ 
            error: true,
            message: 'Failed to get question' 
        });
    }
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
            customQuestions: [],
            spotlightHistory: [],
            lastSpotlightPlayer: null
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
        
        // Reset question counter for new game
        if (questionManager && questionManager.resetQuestionCount) {
            questionManager.resetQuestionCount(roomCode);
        }
        
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
            let questionData = null;
            
            // Try QuestionManager first with mode parameter for custom questions logic
            if (questionManager && questionManager.getRandomQuestion) {
                console.log(`🎯 Getting question for: ${dbGameName} ${config.intensity} in ${config.mode} mode`);
                questionData = questionManager.getRandomQuestion(dbGameName, config.intensity || 'medium', config.mode, roomCode);
            }
            
            // Fallback to direct database access
            if (!questionData && questionsDatabase[dbGameName] && questionsDatabase[dbGameName][config.intensity]) {
                const questions = questionsDatabase[dbGameName][config.intensity];
                if (questions && questions.length > 0) {
                    const randomIndex = Math.floor(Math.random() * questions.length);
                    questionData = { text: questions[randomIndex], questionNumber: 1 };
                }
            }
            
            // Last resort fallback
            if (!questionData) {
                questionData = { 
                    text: `Sample ${config.game} question for ${config.intensity}`, 
                    questionNumber: 1 
                };
            }
            
            console.log(`✅ Question retrieved successfully`);
            
            room.gameState.currentQuestion = questionData.text;
            room.gameState.questionCount++;
            room.gameState.usedQuestions.push(questionData.text);
            
            // Prepare data for mobile clients
            let mobileData = {
                game: config.game,
                mode: config.mode,
                intensity: config.intensity,
                question: questionData.text,
                questionNumber: questionData.questionNumber,
                isCustom: questionData.isCustom,
                author: questionData.author
            };
            
            // Add options for specific games
            if (config.game === 'fmk' && typeof questionData.text === 'string') {
                mobileData.options = questionData.text.split(',').map(o => o.trim());
            } else if (config.game === 'wyr' && questionData.text.includes(' or ')) {
                const parts = questionData.text.toLowerCase()
                    .replace('would you rather', '')
                    .split(' or ');
                if (parts.length === 2) {
                    mobileData.options = parts.map(p => p.trim());
                }
            }
            
            // Send to all players in room
            io.to(roomCode).emit('game-started', mobileData);
            
            // Also send new-question event to mobile players
            room.players.forEach(player => {
                io.to(player.id).emit('new-question', mobileData);
            });
            
            // Send to host
            socket.emit('new-question', questionData);
            
            console.log(`📤 Question sent successfully`);
            
            // If custom question, announce the author
            if (questionData.isCustom) {
                io.to(roomCode).emit('custom-question-announcement', {
                    author: questionData.author,
                    questionNumber: questionData.questionNumber
                });
            }
            
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
            
            let questionData = null;
            
            // Try QuestionManager with mode and roomCode for custom questions
            if (questionManager && questionManager.getRandomQuestion) {
                questionData = questionManager.getRandomQuestion(
                    dbGameName, 
                    room.gameState.currentIntensity, 
                    room.gameState.currentMode,  // Include mode for custom questions logic
                    roomCode  // Include roomCode for tracking question numbers
                );
            }
            
            // Fallback to direct database
            if (!questionData && questionsDatabase[dbGameName] && questionsDatabase[dbGameName][room.gameState.currentIntensity]) {
                const questions = questionsDatabase[dbGameName][room.gameState.currentIntensity];
                const availableQuestions = questions.filter(q => !room.gameState.usedQuestions.includes(q));
                
                if (availableQuestions.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
                    questionData = { 
                        text: availableQuestions[randomIndex], 
                        questionNumber: room.gameState.questionCount + 1 
                    };
                } else {
                    // All questions used, reset
                    room.gameState.usedQuestions = [];
                    const randomIndex = Math.floor(Math.random() * questions.length);
                    questionData = { 
                        text: questions[randomIndex], 
                        questionNumber: 1 
                    };
                }
            }
            
            if (!questionData) {
                questionData = { 
                    text: `Sample question ${room.gameState.questionCount + 1}`,
                    questionNumber: room.gameState.questionCount + 1
                };
            }
            
            room.gameState.currentQuestion = questionData.text;
            room.gameState.questionCount++;
            room.gameState.usedQuestions.push(questionData.text);
            
            // Prepare data for mobile clients
            let mobileData = {
                question: questionData.text,
                game: room.gameState.currentGame,
                mode: room.gameState.currentMode,
                questionNumber: questionData.questionNumber,
                isCustom: questionData.isCustom,
                author: questionData.author
            };
            
            // Add options for specific games
            if (room.gameState.currentGame === 'fmk' && typeof questionData.text === 'string') {
                mobileData.options = questionData.text.split(',').map(o => o.trim());
            } else if (room.gameState.currentGame === 'wyr' && questionData.text.includes(' or ')) {
                const parts = questionData.text.toLowerCase()
                    .replace('would you rather', '')
                    .split(' or ');
                if (parts.length === 2) {
                    mobileData.options = parts.map(p => p.trim());
                }
            }
            
            // Send to all in room
            io.to(roomCode).emit('new-question', mobileData);
            
            // Send to all mobile players with proper format
            room.players.forEach(player => {
                io.to(player.id).emit('new-question', mobileData);
            });
            
            // If custom question, announce the author
            if (questionData.isCustom) {
                io.to(roomCode).emit('custom-question-announcement', {
                    author: questionData.author,
                    questionNumber: questionData.questionNumber
                });
            }
            
            console.log(`Question ${room.gameState.questionCount} sent`);
            
        } catch (error) {
            console.error('Error getting next question:', error);
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
        const { roomCode, question, author, game, intensity } = data;
        
        const room = rooms[roomCode];
        
        if (room) {
            // Add custom question to room
            if (!room.customQuestions) {
                room.customQuestions = [];
            }
            
            room.customQuestions.push({
                text: question,
                author: author || 'Anonymous',
                game: game,
                intensity: intensity,
                timestamp: Date.now(),
                isCustom: true
            });
            
            console.log(`Custom question added to room ${roomCode}: "${question}" by ${author}`);
            
            // Emit confirmation to the player
            socket.emit('custom-question-added', { success: true });
        }
    });
    
    // Submit answer (for mobile voting)
    socket.on('submit-answer', (data) => {
        const { roomCode, answer, playerId } = data;
        
        console.log(`Answer submitted in room ${roomCode} by ${playerId}: ${JSON.stringify(answer)}`);
        
        // Store answer and notify host
        if (rooms[roomCode]) {
            // You can store answers here if needed
            io.to(rooms[roomCode].hostId).emit('answer-received', {
                playerId: playerId,
                answer: answer
            });
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

// QuestionManager class with custom questions in first 20
class QuestionManager {
    constructor() {
        this.questions = questionsDatabase;
        this.usedQuestions = {};
        this.customQuestions = {};
        this.questionCount = {}; // Track question number per room
    }
    
    getRandomQuestion(game, intensity, mode, roomCode) {
        // If no roomCode provided, use standard logic
        if (!roomCode || !rooms[roomCode]) {
            return this.getStandardQuestion(game, intensity);
        }
        
        const room = rooms[roomCode];
        
        // Initialize question counter for room
        if (!this.questionCount[roomCode]) {
            this.questionCount[roomCode] = 0;
        }
        
        // Increment question count
        this.questionCount[roomCode]++;
        const currentQuestionNumber = this.questionCount[roomCode];
        
        // Only include custom questions in first 20 questions and only in mobile/spotlight modes
        if (currentQuestionNumber <= 20 && 
            (mode === 'mobile' || mode === 'spotlight' || mode === 'mixmaster') && 
            room.customQuestions && 
            room.customQuestions.length > 0) {
            
            // 30% chance to show a custom question (if available)
            if (Math.random() < 0.3) {
                const customQuestion = room.customQuestions.shift(); // Remove and return first custom question
                
                console.log(`🎭 Using custom question #${currentQuestionNumber}: "${customQuestion.text}"`);
                
                return {
                    text: customQuestion.text,
                    isCustom: true,
                    author: customQuestion.author,
                    questionNumber: currentQuestionNumber
                };
            }
        }
        
        // Otherwise return standard question
        return this.getStandardQuestion(game, intensity, currentQuestionNumber);
    }
    
    getStandardQuestion(game, intensity, questionNumber) {
        // Map game names
        const gameMapping = {
            'wyr': 'would_you_rather',
            'fmk': 'fmk', 
            'nhie': 'never_have_i_ever',
            'hot': 'hot_takes',
            'hottakes': 'hot_takes'
        };
        
        const dbGame = gameMapping[game] || game;
        
        // Safety checks
        if (!this.questions[dbGame]) {
            console.error(`Game not found: ${dbGame}`);
            return { text: `No questions available for ${game}`, questionNumber };
        }
        
        if (!this.questions[dbGame][intensity]) {
            console.error(`Intensity not found: ${intensity} for game ${dbGame}`);
            return { text: `No ${intensity} questions available for ${game}`, questionNumber };
        }
        
        const availableQuestions = this.questions[dbGame][intensity];
        
        if (!availableQuestions || availableQuestions.length === 0) {
            return { text: `No questions available`, questionNumber };
        }
        
        // Get random question
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const question = availableQuestions[randomIndex];
        
        return {
            text: question,
            isCustom: false,
            questionNumber: questionNumber || 1
        };
    }
    
    resetQuestionCount(roomCode) {
        this.questionCount[roomCode] = 0;
    }
}

// If QuestionManager wasn't loaded from file, use the built-in one
if (!questionManager) {
    questionManager = new QuestionManager();
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Don't Drink! server running on port ${PORT}`);
    console.log(`🔗 Visit http://localhost:${PORT} to start hosting!`);
    console.log(`🎮 Host interface: http://localhost:${PORT}/host`);
    console.log(`📋 Question database status: ${Object.keys(questionsDatabase).length > 0 ? 'Loaded' : 'Not loaded'}`);
});