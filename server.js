const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { questionsDatabase, QuestionManager } = require('./questions-database.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize Question Manager
const questionManager = new QuestionManager();

// Store active rooms
const rooms = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Explicit routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// API endpoint for questions
app.get('/api/question/:game/:intensity', (req, res) => {
    try {
        const { game, intensity } = req.params;
        if (!questionsDatabase[game] || !questionsDatabase[game][intensity]) {
            return res.status(400).json({
                error: 'Invalid game or intensity',
                available: Object.keys(questionsDatabase)
            });
        }
        const questionData = questionManager.getRandomQuestion(game, intensity);
        if (!questionData) {
            return res.status(404).json({ error: 'No questions available' });
        }
        res.json({
            id: questionData.id,
            text: questionData.text,
            isCustom: questionData.isCustom
        });
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Game name mapping
const gameNameMapping = {
    'wyr': 'would_you_rather',
    'fmk': 'fmk',
    'nhie': 'never_have_i_ever',
    'hottakes': 'hot_takes'
};

// Helper function to generate room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    socket.on('create-room', (data) => {
        const { game, mode, intensity } = data;
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { host: socket.id, game, mode, intensity, players: new Map() });
        socket.join(roomCode);
        socket.emit('room-created', { roomCode });
        console.log(`🏠 Room ${roomCode} created by ${socket.id}`);
    });

    socket.on('join-room', ({ roomCode }) => {
        if (rooms.has(roomCode)) {
            socket.join(roomCode);
            const room = rooms.get(roomCode);
            room.players.set(socket.id, { name: `Player${room.players.size + 1}`, avatar: '😀' });
            io.to(roomCode).emit('player-joined', { playerCount: room.players.size });
            console.log(`👤 ${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('submit-vote', ({ roomCode, vote }) => {
        if (rooms.has(roomCode)) {
            io.to(roomCode).emit('vote-submitted', { vote });
        }
    });

    socket.on('start-game', ({ roomCode }) => {
        if (rooms.has(roomCode) && rooms.get(roomCode).host === socket.id) {
            io.to(roomCode).emit('game-started');
        }
    });

    socket.on('get-question', ({ roomCode, game, intensity }) => {
        if (rooms.has(roomCode)) {
            const question = questionManager.getRandomQuestion(game, intensity) || getFallbackQuestion(game, intensity);
            io.to(roomCode).emit('new-question', { text: question });
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        // Clean up rooms where this socket was host
        for (const [roomCode, room] of rooms.entries()) {
            if (room.host === socket.id) {
                console.log('🏠 Room', roomCode, 'closed - host disconnected');
                rooms.delete(roomCode);
            }
        }
    });
});

// Fallback questions
function getFallbackQuestion(game, intensity) {
    const fallbacks = {
        wyr: { medium: "Would you rather have the ability to fly or be invisible?", spicy: "Would you rather accidentally send a flirty text to your boss or your mom?", cancelled: "Would you rather have your browser history made public or your text messages?" },
        fmk: { medium: "Taylor Swift, Beyoncé, Ariana Grande", spicy: "Your attractive neighbor, your ex's best friend, your boss", cancelled: "Your best friend's parent, your teacher, your doctor" },
        nhie: { medium: "Never have I ever stayed up all night binge-watching a TV show.", spicy: "Never have I ever had a crush on a friend's significant other.", cancelled: "Never have I ever hooked up with someone I met online." },
        hottakes: { medium: "Pineapple belongs on pizza and anyone who disagrees has no taste.", spicy: "People who don't tip at restaurants are terrible humans.", cancelled: "Social media has completely ruined dating and relationships." }
    };
    return fallbacks[game]?.[intensity] || "This is a fallback question because the database is not responding.";
}

// Startup stats
console.log('🚀 Don\'t Drink! Server running on port 3000');
console.log('🎮 Visit: http://localhost:3000');
console.log('📋 Question Database Loaded:');
let totalQuestions = 0;
for (const [game, intensities] of Object.entries(questionsDatabase)) {
    console.log(`${game}:`);
    for (const [intensity, questions] of Object.entries(intensities)) {
        console.log(`  ${intensity}: ${questions.length} questions`);
        totalQuestions += questions.length;
    }
}
console.log(`🔥 Total: ${totalQuestions} questions loaded!`);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});