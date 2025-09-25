const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Static files - MUST be before dynamic routes
app.use(express.static('public'));
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Specific routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// Room code routing - MUST be LAST route
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    // Validate room code format (6 alphanumeric characters)
    if (roomCode.match(/^[A-Z0-9]{6}$/)) {
        // Serve the mobile player interface
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        // Invalid room code, redirect to home
        res.redirect('/');
    }
});

// Socket.IO logic
const rooms = new Map();
const playerSockets = new Map();

// Generate room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Host creates room
    socket.on('create-room', (data, callback) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            host: socket.id,
            players: new Map(),
            gameState: null,
            customQuestions: []
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        
        console.log(`Room ${roomCode} created by host ${socket.id}`);
        
        // Support both callback and emit patterns
        if (callback && typeof callback === 'function') {
            callback({ success: true, roomCode });
        } else {
            socket.emit('room-created', { roomCode });
        }
    });

    // Player joins room
    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        const code = roomCode.toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            socket.emit('join-error', { message: 'Room not found' });
            return;
        }

        // Remove any existing player with same name
        for (const [id, player] of room.players) {
            if (player.name === playerName) {
                room.players.delete(id);
                io.to(code).emit('player-left', { playerId: id });
            }
        }

        // Add new player
        const player = {
            id: socket.id,
            name: playerName,
            avatar: avatar || '😎',
            ready: false
        };

        room.players.set(socket.id, player);
        playerSockets.set(socket.id, code);
        socket.join(code);

        console.log(`${playerName} joined room ${code}`);

        // Notify everyone
        socket.emit('join-success', { 
            roomCode: code,
            playerId: socket.id,
            playerName: playerName
        });
        
        io.to(code).emit('player-joined', player);
        io.to(code).emit('players-updated', Array.from(room.players.values()));
    });

    // Handle custom questions
    socket.on('add-custom-question', (data) => {
        const roomCode = playerSockets.get(socket.id);
        const room = rooms.get(roomCode);
        
        if (room && data.question) {
            room.customQuestions.push({
                text: data.question,
                author: socket.id
            });
            
            socket.emit('custom-question-added');
            io.to(room.host).emit('custom-questions-updated', room.customQuestions.length);
        }
    });

    // Start game
    socket.on('start-game', (config) => {
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (room) {
            room.gameState = {
                ...config,
                currentQuestion: 0
            };
            
            io.to(room.code).emit('game-started', config);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const roomCode = playerSockets.get(socket.id);
        
        if (roomCode) {
            const room = rooms.get(roomCode);
            
            if (room) {
                if (room.host === socket.id) {
                    // Host disconnected - end game
                    io.to(roomCode).emit('host-disconnected');
                    rooms.delete(roomCode);
                } else {
                    // Player disconnected
                    const player = room.players.get(socket.id);
                    if (player) {
                        player.connected = false;
                        io.to(roomCode).emit('player-disconnected', {
                            playerId: socket.id,
                            playerName: player.name
                        });
                    }
                }
            }
            
            playerSockets.delete(socket.id);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});