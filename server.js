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
app.use(express.static('public'));
app.use(express.json());

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

// Game name mapping - Frontend names to Database names
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
    console.log('ðŸ”Œ User connected:', socket.id);

    // Handle room creation
    socket.on('create-room', (callback) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            host: socket.id,
            players: [],
            gameStarted: false,
            currentQuestion: null,
            currentQuestionNumber: 0
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        
        console.log('ðŸ  Room created:', roomCode, 'by host', socket.id);
        
        if (callback && typeof callback === 'function') {
            callback({ success: true, roomCode: roomCode });
        }
        
        socket.emit('room-created', { roomCode: roomCode });
    });

    // Handle game start
    socket.on('start-game', async (data) => {
        try {
            console.log('ðŸŽ® Starting game in room:', data.roomCode || 'No room code');
            console.log('Game:', data.game);
            console.log('Mode:', data.mode);  
            console.log('Intensity:', data.intensity);
            console.log('Custom Questions:', data.customQuestions || 0);
            console.log('Players:', data.players || 0);

            // Map frontend game name to database game name
            const frontendGameName = data.game;
            const dbGameName = gameNameMapping[frontendGameName];
            
            if (!dbGameName) {
                console.error('âŒ Unknown game:', frontendGameName);
                socket.emit('game-error', { error: 'Unknown game type' });
                return;
            }
            
            console.log('ðŸ”„ Game name mapping:', frontendGameName, 'â†’', dbGameName);
            
            // Get question from database
            try {
                console.log('ðŸŽ¯ Getting question for:', dbGameName, data.intensity);
                
                const questionData = questionManager.getRandomQuestion(dbGameName, data.intensity);
                
                if (!questionData) {
                    console.error('âŒ No question returned from database');
                    socket.emit('game-error', { error: 'No questions available' });
                    return;
                }
                
                console.log('âœ… Question retrieved successfully:', questionData.question.substring(0, 50) + '...');
                
                // Send question to client
                socket.emit('new-question', {
                    question: questionData.question,
                    questionId: questionData.id,
                    questionNumber: 1,
                    game: frontendGameName,
                    intensity: data.intensity,
                    mode: data.mode
                });
                
                console.log('ðŸ“¤ Question sent successfully');
                
            } catch (questionError) {
                console.error('âŒ Error getting question:', questionError);
                
                // Send fallback question
                const fallbackQuestion = getFallbackQuestion(frontendGameName, data.intensity);
                socket.emit('new-question', {
                    question: fallbackQuestion,
                    questionId: 'fallback-1',
                    questionNumber: 1,
                    game: frontendGameName,
                    intensity: data.intensity,
                    mode: data.mode
                });
            }
            
        } catch (error) {
            console.error('âŒ Error in start-game:', error);
            socket.emit('game-error', { error: 'Failed to start game' });
        }
    });

    // Handle next question request
    socket.on('next-question', async (data) => {
        try {
            const frontendGameName = data.game;
            const dbGameName = gameNameMapping[frontendGameName];
            
            if (!dbGameName) {
                console.error('âŒ Unknown game for next question:', frontendGameName);
                socket.emit('game-error', { error: 'Unknown game type' });
                return;
            }
            
            console.log('âž¡ï¸ Next question requested for:', dbGameName, data.intensity);
            
            const questionData = questionManager.getRandomQuestion(dbGameName, data.intensity);
            
            if (!questionData) {
                console.error('âŒ No more questions available');
                const fallbackQuestion = getFallbackQuestion(frontendGameName, data.intensity);
                socket.emit('new-question', {
                    question: fallbackQuestion,
                    questionId: 'fallback-' + Date.now(),
                    questionNumber: data.questionNumber || 1,
                    game: frontendGameName,
                    intensity: data.intensity,
                    mode: data.mode
                });
                return;
            }
            
            socket.emit('new-question', {
                question: questionData.question,
                questionId: questionData.id,
                questionNumber: data.questionNumber || 1,
                game: frontendGameName,
                intensity: data.intensity,
                mode: data.mode
            });
            
            console.log('âœ… Next question sent successfully');
            
        } catch (error) {
            console.error('âŒ Error getting next question:', error);
            const fallbackQuestion = getFallbackQuestion(data.game, data.intensity);
            socket.emit('new-question', {
                question: fallbackQuestion,
                questionId: 'fallback-error',
                questionNumber: data.questionNumber || 1,
                game: data.game,
                intensity: data.intensity,
                mode: data.mode
            });
        }
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log('ðŸ”Œ User disconnected:', socket.id);
        
        // Clean up rooms where this socket was host
        for (const [roomCode, room] of rooms.entries()) {
            if (room.host === socket.id) {
                console.log('ðŸ  Room', roomCode, 'closed - host disconnected');
                rooms.delete(roomCode);
            }
        }
    });
});

// Fallback questions for when database fails
function getFallbackQuestion(game, intensity) {
    const fallbacks = {
        wyr: {
            medium: "Would you rather have the ability to fly or be invisible?",
            spicy: "Would you rather accidentally send a flirty text to your boss or your mom?",
            cancelled: "Would you rather have your browser history made public or your text messages?"
        },
        fmk: {
            medium: "Taylor Swift, BeyoncÃ©, Ariana Grande",
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
    
    return fallbacks[game]?.[intensity] || "This is a fallback question because the database is not responding.";
}

// Display question database stats on startup
console.log('ðŸš€ Don\\'t Drink! Server running on port 3000');
console.log('ðŸŽ® Visit: http://localhost:3000');
console.log('ðŸ“‹ Question Database Loaded:');

// Show database statistics
let totalQuestions = 0;
for (const [game, intensities] of Object.entries(questionsDatabase)) {
    console.log(`${game}:`);
    for (const [intensity, questions] of Object.entries(intensities)) {
        console.log(`  ${intensity}: ${questions.length} questions`);
        totalQuestions += questions.length;
    }
}
console.log(`ðŸ”¥ Total: ${totalQuestions} questions loaded!`);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
