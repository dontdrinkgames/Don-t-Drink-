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
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Static files
app.use(express.static('public'));
app.use(express.json());

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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

// Room code routing - MUST be last
app.get('/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    
    if (roomCode.match(/^[A-Z0-9]{6}$/)) {
        console.log(`Serving mobile.html for room code: ${roomCode}`);
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.redirect('/');
    }
});

// Game storage
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

// Socket.IO connection handling
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
        }
        socket.emit('room-created', { roomCode });
    });

    // Player joins room
    socket.on('join-room', (data) => {
        const { roomCode, playerName, avatar } = data;
        const code = roomCode ? roomCode.toUpperCase() : '';
        const room = rooms.get(code);

        console.log(`Join attempt - Room: ${code}, Player: ${playerName}, Avatar: ${avatar}`);

        if (!room) {
            console.log(`Room ${code} not found`);
            socket.emit('join-error', { message: 'Room not found' });
            return;
        }

        // Remove any existing player with same socket ID
        if (room.players.has(socket.id)) {
            room.players.delete(socket.id);
        }

        // Add new player
        const player = {
            id: socket.id,
            name: playerName || 'Anonymous',
            avatar: avatar || '😎',
            ready: false,
            connected: true
        };

        room.players.set(socket.id, player);
        playerSockets.set(socket.id, code);
        socket.join(code);

        console.log(`${playerName} successfully joined room ${code}. Total players: ${room.players.size}`);

        // Send success to the joining player
        socket.emit('join-success', { 
            roomCode: code,
            playerId: socket.id,
            playerName: playerName
        });
        
        // Notify host about new player
        io.to(room.host).emit('player-joined', player);
        
        // Update everyone with player list
        const playersList = Array.from(room.players.values());
        io.to(code).emit('players-updated', playersList);
        
        console.log('Sent players-updated event with:', playersList);
    });

    // Player ready status
    socket.on('player-ready', (data) => {
        const roomCode = playerSockets.get(socket.id);
        if (!roomCode) return;
        
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.get(socket.id);
        if (player) {
            player.ready = data.ready || true;
            io.to(roomCode).emit('players-updated', Array.from(room.players.values()));
        }
    });

    // Start game
    socket.on('start-game', (config) => {
        console.log('Start game requested:', config);
        const room = Array.from(rooms.values()).find(r => r.host === socket.id);
        
        if (room) {
            room.gameState = {
                ...config,
                currentQuestion: 0,
                started: true
            };
            
            console.log(`Game starting in room ${room.code} with config:`, config);
            io.to(room.code).emit('game-started', config);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomCode = playerSockets.get(socket.id);
        
        if (roomCode) {
            const room = rooms.get(roomCode);
            
            if (room) {
                if (room.host === socket.id) {
                    // Host disconnected
                    console.log(`Host disconnected from room ${roomCode}`);
                    io.to(roomCode).emit('host-disconnected');
                    
                    // Clean up room
                    rooms.delete(roomCode);
                    
                    // Clean up all players from this room
                    for (const [playerId, playerRoom] of playerSockets.entries()) {
                        if (playerRoom === roomCode) {
                            playerSockets.delete(playerId);
                        }
                    }
                } else {
                    // Player disconnected
                    const player = room.players.get(socket.id);
                    if (player) {
                        console.log(`Player ${player.name} disconnected from room ${roomCode}`);
                        player.connected = false;
                        
                        // Notify others
                        io.to(roomCode).emit('player-disconnected', {
                            playerId: socket.id,
                            playerName: player.name
                        });
                        
                        // Update player list
                        io.to(roomCode).emit('players-updated', Array.from(room.players.values()));
                    }
                }
            }
            
            playerSockets.delete(socket.id);
        }
    });

    // Debug: List all rooms
    socket.on('list-rooms', () => {
        const roomList = Array.from(rooms.keys());
        socket.emit('rooms-list', roomList);
        console.log('Active rooms:', roomList);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Don't Drink! server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to start hosting!`);
});