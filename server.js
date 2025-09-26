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

// Game name mapping - håndterer både store og små bokstaver
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

// Load questions database med bedre error handling
let questionManager = null;
let questionsDatabase = {};

try {
    const questionsModule = require('./questions-database.js');
    questionsDatabase = questionsModule.questionsDatabase;
    const QuestionManagerClass = questionsModule.QuestionManager;
    
    if (QuestionManagerClass) {
        questionManager = new QuestionManagerClass(questionsDatabase);
        console.log('✅ Questions database loaded successfully');
        
        // Vis statistikk
        const stats = questionManager.getStats();
        console.log(`📊 Total questions loaded: ${stats.totalQuestions}`);
        
        // Vis detaljer per kategori
        console.log('📋 Question Database Loaded:');
        for (const [game, intensities] of Object.entries(stats.questionsByCategory)) {
            console.log(`${game}:`);
            for (const [intensity, count] of Object.entries(intensities)) {
                console.log(`  ${intensity}: ${count} questions`);
            }
        }
    }
} catch (error) {
    console.error('⚠️ Questions database error:', error.message);
    console.log('🔧 Running with fallback questions');
}

// Fallback spørsmål hvis database feiler
const fallbackQuestions = {
    never_have_i_ever: {
        medium: [
            "Never have I ever sang in the shower",
            "Never have I ever eaten food that fell on the floor",
            "Never have I ever googled myself",
            "Never have I ever been on TV",
            "Never have I ever met a celebrity"
        ],
        spicy: [
            "Never have I ever had a one night stand",
            "Never have I ever sent a sext to the wrong person",
            "Never have I ever hooked up with someone from work",
            "Never have I ever kissed more than one person in 24 hours",
            "Never have I ever had sex in public"
        ],
        cancelled: [
            "Never have I ever cheated on someone",
            "Never have I ever stolen something worth over $100",
            "Never have I ever lied about my age to get laid",
            "Never have I ever hooked up with a friend's ex",
            "Never have I ever had sex for money or gifts"
        ]
    },
    fmk: {
        medium: [
            { text: "Ryan Gosling, Chris Hemsworth, Michael B. Jordan", type: "celebrity" },
            { text: "Zendaya, Emma Stone, Margot Robbie", type: "celebrity" },
            { text: "Batman, Superman, Spider-Man", type: "fictional" },
            { text: "Rachel, Monica, Phoebe (from Friends)", type: "tv" },
            { text: "Harry Potter, Ron Weasley, Draco Malfoy", type: "fictional" }
        ],
        spicy: [
            { text: "Your boss, your ex, your best friend's partner", type: "spicy" },
            { text: "Someone 20 years older, your cousin's hot friend, your therapist", type: "spicy" },
            { text: "Three people in this room", type: "group" },
            { text: "Your ex, your ex's best friend, your ex's sibling", type: "spicy" },
            { text: "A celebrity crush, your first love, your worst enemy", type: "spicy" }
        ],
        cancelled: [
            { text: "Your sibling's ex, your parent's friend, your professor", type: "cancelled" },
            { text: "Someone for money, someone for revenge, someone for a dare", type: "dark" },
            { text: "Your partner's parent, your partner's sibling, your partner's best friend", type: "taboo" },
            { text: "Your stalker, your bully, someone you hate", type: "dark" },
            { text: "Three coworkers", type: "workplace" }
        ]
    },
    would_you_rather: {
        medium: [
            { optionA: "Never use social media again", optionB: "Never watch TV again" },
            { optionA: "Be able to fly", optionB: "Be invisible" },
            { optionA: "Win the lottery", optionB: "Live twice as long" },
            { optionA: "Be famous", optionB: "Be rich" },
            { optionA: "Travel the world", optionB: "Own your dream home" }
        ],
        spicy: [
            { optionA: "Have sex with lights on always", optionB: "Only in complete darkness" },
            { optionA: "Kiss your ex", optionB: "Kiss your enemy" },
            { optionA: "Give up oral", optionB: "Give up penetrative sex" },
            { optionA: "Be loud in bed", optionB: "Be completely silent" },
            { optionA: "Walk in on your parents", optionB: "Have them walk in on you" }
        ],
        cancelled: [
            { optionA: "Sleep with your boss for a promotion", optionB: "Stay in your dead-end job forever" },
            { optionA: "Cheat and never get caught", optionB: "Be cheated on and know" },
            { optionA: "Have sex with your cousin", optionB: "Have sex with your step-sibling" },
            { optionA: "Eat ass", optionB: "Have your ass eaten" },
            { optionA: "Never have sex again", optionB: "Never masturbate again" }
        ]
    },
    hot_takes: {
        medium: [
            "Pineapple belongs on pizza",
            "The book is always better than the movie",
            "Social media does more harm than good",
            "Money can buy happiness",
            "Breakfast for dinner is better than dinner for breakfast"
        ],
        spicy: [
            "Open relationships are healthier than monogamy",
            "Body count matters in a relationship",
            "It's okay to fake orgasms",
            "Size does matter",
            "Everyone has a price for cheating"
        ],
        cancelled: [
            "Cheating can sometimes save a relationship",
            "Some people deserve to be ghosted",
            "Gold diggers provide a valuable service",
            "It's okay to lie about your body count",
            "Drunk sex is better than sober sex"
        ]
    }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', questions: questionManager ? 'loaded' : 'fallback' });
});

// Rooms storage
const rooms = new Map();

// Socket.IO handlers
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Create room
    socket.on('create-room', (callback) => {
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
        
        if (callback) {
            callback({ roomCode });
        } else {
            socket.emit('room-created', { roomCode });
        }
    });

    // Join room
    socket.on('join-room', ({ roomCode, playerName, avatar }, callback) => {
        const code = roomCode ? roomCode.toUpperCase() : '';
        const room = rooms.get(code);

        console.log(`🎮 Join attempt - Room: ${code}, Player: ${playerName}`);

        if (!room) {
            console.log(`⌠ Room ${code} not found`);
            const error = { message: 'Room not found' };
            if (callback) callback(error);
            else socket.emit('join-error', error);
            return;
        }

        // Add or update player
        const existingPlayerIndex = room.players.findIndex(p => p.name === playerName);
        const player = {
            id: socket.id,
            name: playerName,
            avatar: avatar || '😎',
            ready: false,
            connected: true
        };

        if (existingPlayerIndex !== -1) {
            room.players[existingPlayerIndex] = player;
        } else {
            room.players.push(player);
        }

        socket.join(code);
        socket.roomCode = code;
        socket.playerName = playerName;

        console.log(`✅ ${playerName} joined room ${code}. Total: ${room.players.length} players`);

        // Notify everyone
        io.to(code).emit('players-updated', room.players);
        
        if (callback) {
            callback(null, { roomCode: code, playerId: socket.id });
        } else {
            socket.emit('join-success', { roomCode: code, playerId: socket.id });
        }
        
        // Notify host
        io.to(room.host).emit('player-joined', player);
    });

    // Start game
    socket.on('start-game', (config) => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (!room) {
            console.log('⌠ No room found for host:', socket.id);
            socket.emit('error', { message: 'You are not a host' });
            return;
        }

        // Convert game name to lowercase for mapping
        const gameName = config.game ? config.game.toLowerCase() : '';
        const dbGameName = gameNameMapping[gameName] || gameName;
        
        console.log(`🎮 Starting game in room ${room.code}:`);
        console.log(`  Original game: ${config.game}`);
        console.log(`  Converted to: ${gameName}`);
        console.log(`  Database name: ${dbGameName}`);
        console.log(`  Mode: ${config.mode}`);
        console.log(`  Intensity: ${config.intensity}`);
        console.log(`  Players: ${room.players.length}`);
        
        room.currentGame = dbGameName;
        room.currentMode = config.mode;
        room.currentIntensity = config.intensity;
        room.questionNumber = 0;
        room.gameState = 'playing';

        // Get first question
        let firstQuestion = getQuestion(dbGameName, config.intensity);
        
        if (firstQuestion) {
            room.questionNumber = 1;
            room.usedQuestions.push(firstQuestion);
            
            // Send to all clients
            io.to(room.code).emit('game-started', {
                game: config.game,  // Send back original game name
                mode: config.mode,
                intensity: config.intensity,
                question: firstQuestion,
                questionNumber: 1
            });
            
            console.log('✅ Game started successfully');
            console.log('📤 Sent question:', JSON.stringify(firstQuestion).substring(0, 100));
        } else {
            console.error('❌ Failed to get first question');
            socket.emit('error', { message: 'Failed to load questions' });
        }
    });

    // Next question
    socket.on('next-question', () => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (!room || room.gameState !== 'playing') {
            socket.emit('error', { message: 'No active game' });
            return;
        }

        room.questionNumber++;
        const question = getQuestion(room.currentGame, room.currentIntensity);
        
        if (question) {
            room.usedQuestions.push(question);
            
            io.to(room.code).emit('new-question', {
                question,
                questionNumber: room.questionNumber
            });
            
            console.log(`📤 Question ${room.questionNumber} sent to room ${room.code}`);
        } else {
            socket.emit('error', { message: 'No more questions available' });
        }
    });

    // End game
    socket.on('end-game', () => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (room) {
            room.gameState = 'ended';
            io.to(room.code).emit('game-ended');
            console.log(`🏁 Game ended in room ${room.code}`);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        
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
                player.connected = false;
                
                io.to(code).emit('player-disconnected', {
                    playerId: socket.id,
                    playerName: player.name
                });
                
                io.to(code).emit('players-updated', room.players);
                console.log(`👋 ${player.name} disconnected from room ${code}`);
                break;
            }
        }
    });
});

// Helper function to get questions
function getQuestion(game, intensity) {
    try {
        // Try database first
        if (questionManager && questionManager.getRandomQuestion) {
            const question = questionManager.getRandomQuestion(game, intensity, 'offline');
            console.log(`📚 Got question from database: ${game}/${intensity}`);
            return question;
        }
    } catch (error) {
        console.log(`⚠️ Database error for ${game}/${intensity}: ${error.message}`);
    }
    
    // Use fallback questions
    const gameQuestions = fallbackQuestions[game];
    if (!gameQuestions) {
        console.error(`❌ No fallback questions for game: ${game}`);
        return { 
            text: `Sample ${game} question for ${intensity} mode`, 
            type: 'text' 
        };
    }
    
    const intensityQuestions = gameQuestions[intensity];
    if (!intensityQuestions || intensityQuestions.length === 0) {
        console.error(`❌ No fallback questions for ${game}/${intensity}`);
        return { 
            text: `Sample ${game} question for ${intensity} mode`, 
            type: 'text' 
        };
    }
    
    const randomIndex = Math.floor(Math.random() * intensityQuestions.length);
    const question = intensityQuestions[randomIndex];
    
    console.log(`💾 Using fallback question for ${game}/${intensity}`);
    
    // Format question based on game type
    if (game === 'never_have_i_ever') {
        return typeof question === 'string' 
            ? { text: question, type: 'text' } 
            : question;
    } else if (game === 'fmk') {
        return typeof question === 'string' 
            ? { text: question, type: 'text' } 
            : question;
    } else if (game === 'would_you_rather') {
        return question;
    } else if (game === 'hot_takes') {
        return typeof question === 'string' 
            ? { text: question, type: 'text' } 
            : question;
    }
    
    return question;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start!`);
    console.log(`🌐 Socket.IO enabled for real-time gameplay`);
});