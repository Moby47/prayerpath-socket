const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: [
      'https://staging-prayerpath-app.herokuapp.com',
      'http://localhost:3000',
      'https://prayerpath.org',
    ],
    methods: ['GET', 'POST'],
  },
});

const rateLimit = require('express-rate-limit');
const throttle = require('lodash.throttle');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use(limiter);

const users = {}; // Maintain user presence data
const typingUsers = {};

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);

  // Handle user registration
  socket.on('register_user', (user) => {
    if (typeof user === 'string' && user.length <= 30) {
      users[socket.id] = user;
      console.log('User registered:', user);
    }
  });

  // Join chat room
  socket.on('join_room', (room) => {
    if (typeof room === 'string' && room.length <= 30) {
      socket.join(room);
      console.log('User', users[socket.id], 'joined room', room);
      io.to(room).emit('update_users', getUsersInRoom(room)); // Emit the updated user list
    }
  });

  // Leave chat room
  socket.on('leave_room', (room) => {
    if (typeof room === 'string' && room.length <= 30) {
      socket.leave(room);
      console.log('User', users[socket.id], 'left room', room);
      io.to(room).emit('update_users', getUsersInRoom(room)); // Emit the updated user list
    }
  });

 // Send messages to chat room
socket.on('send_message', throttle((data) => {
  const { room, message } = data;
  if (
    typeof room === 'string' &&
    room.length <= 30 &&
    typeof message === 'string' &&
    message.length <= 500
  ) {
    io.to(room).emit('receive_message', { user: users[socket.id], message });
  }
}, 1000)); // Throttle messages to 1 per second


    // User typing
    socket.on('user_typing', (user) => {
    if (typeof user === 'string' && user.length <= 30) {
    const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
    if (!typingUsers[room]) {
    typingUsers[room] = [];
    }
    if (!typingUsers[room].includes(user)) {
    typingUsers[room].push(user);
    io.to(room).emit('user_typing', user);
    }
    }
    });
    
    // User stopped typing
    socket.on('user_stop_typing', (user) => {
    if (typeof user === 'string' && user.length <= 30) {
    const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
    if (typingUsers[room]) {
    typingUsers[room] = typingUsers[room].filter((u) => u !== user);
    io.to(room).emit('user_stop_typing', user);
    }
    }
    });
    
    socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);

    // Remove user presence data
delete users[socket.id];
});
});

function getUsersInRoom(room) {
const clientsInRoom = io.sockets.adapter.rooms.get(room);
const usersInRoom = {};
if (clientsInRoom) {
clientsInRoom.forEach((socketId) => {
usersInRoom[socketId] = users[socketId];
});
}
return usersInRoom;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});