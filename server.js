const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: [
      'https://staging-prayerpath-app.herokuapp.com',
      'http://localhost:3000',
      'https://prayerpath.org'
    ],
    methods: ['GET', 'POST'],
  },
});

const users = {}; // Maintain user presence data

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);

  // Handle user registration
  socket.on('register_user', (user) => {
    users[socket.id] = user;
    console.log('User registered:', user);
  });

  // Join chat room
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log('User', users[socket.id], 'joined room', room);
    io.to(room).emit('update_users', getUsersInRoom(room)); // Emit the updated user list
  });

  // Leave chat room
  socket.on('leave_room', (room) => {
    socket.leave(room);
    console.log('User', users[socket.id], 'left room', room);
    io.to(room).emit('update_users', getUsersInRoom(room)); // Emit the updated user list
  });

  // Send messages to chat room
  socket.on('send_message', (data) => {
    const { room, message } = data;
    io.to(room).emit('receive_message', { user: users[socket.id], message });
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
