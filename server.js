// server.js — Don't Drink! (functional fix, no design changes)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

let questionsDatabase = {};
let QuestionManager = null;
try {
  ({ questionsDatabase, QuestionManager } = require('./questions-database.js'));
} catch {
  questionsDatabase = {};
  QuestionManager = class { constructor() {} };
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.status(200).json({ status: 'OK' }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/host', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));

app.get('/:roomCode([A-Za-z0-9]{6})', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i=0;i<6;i++) result += chars.charAt(Math.floor(Math.random()*chars.length));
  return result;
}

function emitPlayerList(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const playersArr = Array.from(room.players.entries()).map(([clientId, p]) => ({
    clientId,
    name: p.name,
    avatar: p.avatar,
    connected: !!p.connected
  }));
  io.to(room.host).emit('player-list', { players: playersArr });
}

io.on('connection', (socket) => {

  socket.on('create-room', (_data, callback) => {
    const roomCode = generateRoomCode();
    rooms.set(roomCode, {
      host: socket.id,
      players: new Map(),
      gameSettings: null,
      gameStarted: false,
      currentQuestion: null,
      questionNumber: 0
    });
    socket.join(roomCode);
    if (typeof callback === 'function') callback({ success: true, roomCode });
    socket.emit('room-created', { roomCode });
  });

  socket.on('join-room', (data = {}) => {
    const { roomCode, playerName, avatar, clientId } = data;
    if (!roomCode || !playerName) {
      socket.emit('join-error', { message: 'Missing room or name' });
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found' });
      return;
    }

    const finalClientId = (clientId && String(clientId)) || `c_${Math.random().toString(36).slice(2,10)}${Date.now().toString(36)}`;
    const existing = room.players.get(finalClientId);

    if (existing) {
      existing.name = playerName || existing.name;
      existing.avatar = avatar || existing.avatar;
      existing.socketId = socket.id;
      existing.connected = true;
    } else {
      room.players.set(finalClientId, {
        name: playerName,
        avatar: avatar || '🙂',
        socketId: socket.id,
        connected: true
      });
    }

    socket.join(roomCode);

    socket.emit('player-joined-success', {
      success: true,
      roomCode,
      playerName,
      avatar: avatar || '🙂',
      clientId: finalClientId
    });

    emitPlayerList(roomCode);
  });

  socket.on('leave-room', ({ roomCode, clientId } = {}) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (clientId && room.players.has(clientId)) {
      room.players.delete(clientId);
      emitPlayerList(roomCode);
    }
  });

  socket.on('start-game', ({ roomCode, settings }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.gameSettings = settings || null;
    room.gameStarted = true;
    io.to(roomCode).emit('game-started', { settings: room.gameSettings });
  });

  socket.on('next-question', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.questionNumber = (room.questionNumber || 0) + 1;
    let q = null;
    try {
      const qm = new QuestionManager(questionsDatabase);
      q = qm.next(room.gameSettings);
    } catch {
      q = { text: '🍻 Skål! (placeholder)', type: 'party' };
    }
    room.currentQuestion = q;
    io.to(roomCode).emit('question', { question: q, number: room.questionNumber });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      if (room.host === socket.id) {
        io.to(code).emit('host-disconnected');
        rooms.delete(code);
        break;
      }
      for (const [clientId, p] of room.players.entries()) {
        if (p.socketId === socket.id) {
          p.connected = false;
          emitPlayerList(code);
          break;
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PORT}`);
});
