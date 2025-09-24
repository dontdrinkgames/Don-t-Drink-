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

// Middleware and routes
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

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

    socket.on('create-room', (data, callback) => {
        const { game, mode, intensity } = data;
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { 
            host: socket.id, 
            game, 
            mode, 
            intensity, 
            players: new Map(),
            currentQuestion: null,
            answers: new Map()
        });
        socket.join(roomCode);
        socket.emit('room-created', { roomCode });
        console.log(`Room ${roomCode} created by ${socket.id}`);
        if (typeof callback === 'function') callback({ roomCode });
    });

    socket.on('join-room', ({ roomCode, playerName, avatar }) => {
        const room = rooms.get(roomCode);
        if (room) {
            room.players.set(socket.id, { name: playerName, avatar, score: 0 });
            socket.join(roomCode);
            io.to(roomCode).emit('player-joined', Array.from(room.players.values()));
            console.log(`Player ${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            io.to(roomCode).emit('game-started');
            console.log(`Game started in room ${roomCode}`);
        }
    });

    socket.on('get-question', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const dbGame = gameNameMapping[room.game] || room.game;
            const question = questionManager.getRandomQuestion(dbGame, room.intensity) || 
                { id: 'fallback', text: getFallbackQuestion(room.game, room.intensity), isCustom: false };
            room.currentQuestion = question;
            io.to(roomCode).emit('new-question', question);
            console.log(`New question sent to room ${roomCode}`);
        }
    });

    socket.on('submit-answer', ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (room) {
            room.answers.set(socket.id, answer);
            if (room.answers.size === room.players.size) {
                io.to(roomCode).emit('all-answers-submitted', Array.from(room.answers.entries()));
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                room.players.delete(socket.id);
                io.to(code).emit('player-left', Array.from(room.players.values()));
            }
            if (room.host === socket.id) {
                io.to(code).emit('host-disconnected');
                rooms.delete(code);
                console.log(`Room ${code} closed - host disconnected`);
            }
        }
    });
});

// Startup logs
console.log('Server running');
console.log('Visit: http://localhost:3000');
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