javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Генератор кодов комнат
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Хранилище комнат
const rooms = new Map();
const players = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const room = {
            id: roomId,
            code: roomCode,
            owner: socket.id,
            ownerName: data.playerName,
            players: [socket.id],
            playerNames: [data.playerName],
            playerIds: [data.playerId]
        };
        
        rooms.set(roomId, room);
        players.set(socket.id, { roomId, isOwner: true });
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, roomCode });
    });
    
    socket.on('joinRoom', (data) => {
        // Найти комнату по коду
        let targetRoom = null;
        for (const [roomId, room] of rooms.entries()) {
            if (room.code === data.roomCode) {
                targetRoom = room;
                break;
            }
        }
        
        if (!targetRoom) {
            socket.emit('roomNotFound');
            return;
        }
        
        if (targetRoom.players.length >= 2) {
            socket.emit('roomFull');
            return;
        }
        
        // Добавить игрока в комнату
        targetRoom.players.push(socket.id);
        targetRoom.playerNames.push(data.playerName);
        targetRoom.playerIds.push(data.playerId);
        
        players.set(socket.id, { roomId: targetRoom.id, isOwner: false });
        socket.join(targetRoom.id);
        
        // Уведомить всех в комнате
        io.to(targetRoom.id).emit('playerJoined', {
            playerName: data.playerName,
            roomOwner: targetRoom.ownerName
        });
    });
    
    socket.on('makeMove', (data) => {
        socket.to(data.roomId).emit('moveMade', {
            index: data.index,
            player: data.player
        });
    });
    
    socket.on('newGame', (data) => {
        socket.to(data.roomId).emit('newGame');
    });
    
    socket.on('gameOver', (data) => {
        socket.to(data.roomId).emit('gameOver', {
            winner: data.winner
        });
    });
    
    socket.on('leaveRoom', (data) => {
        const playerInfo = players.get(socket.id);
        if (playerInfo) {
            const room = rooms.get(playerInfo.roomId);
            if (room) {
                socket.leave(playerInfo.roomId);
                socket.to(playerInfo.roomId).emit('playerLeft');
                
                // Удалить комнату если пустая
                const playerIndex = room.players.indexOf(socket.id);
                if (playerIndex > -1) {
                    room.players.splice(playerIndex, 1);
                    room.playerNames.splice(playerIndex, 1);
                    room.playerIds.splice(playerIndex, 1);
                }
                
                if (room.players.length === 0) {
                    rooms.delete(playerInfo.roomId);
                }
            }
            players.delete(socket.id);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const playerInfo = players.get(socket.id);
        if (playerInfo) {
            const room = rooms.get(playerInfo.roomId);
            if (room) {
                socket.to(playerInfo.roomId).emit('playerLeft');
                
                // Удалить комнату если пустая
                const playerIndex = room.players.indexOf(socket.id);
                if (playerIndex > -1) {
                    room.players.splice(playerIndex, 1);
                    room.playerNames.splice(playerIndex, 1);
                    room.playerIds.splice(playerIndex, 1);
                }
                
                if (room.players.length === 0) {
                    rooms.delete(playerInfo.roomId);
                }
            }
            players.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
