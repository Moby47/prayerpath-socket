require('dotenv').config();

// Add these lines at the top of your server.js file
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const { supabase } = require('./supabase');

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
    users[socket.id] = { username: user, lastActivity: Date.now() };
    console.log('User registered:', user);
  }
});

  // Join chat room
  socket.on('join_room', async (room) => {
    if (typeof room === 'string' && room.length <= 30) {
      socket.join(room);
      console.log('User', users[socket.id], 'joined room', room);
      io.to(room).emit('update_users', getUsersInRoom(room));
  
      // Send the last 15 messages to the user
      const messages = await getLastMessages(room);
      socket.emit('last_messages', messages);
    }
  });
  

 // Leave chat room and remove user from onlineUsers
 socket.on('leave_room', (room) => {
  if (typeof room === 'string' && room.length <= 30) {
    socket.leave(room);
    console.log('User', users[socket.id], 'left room', room);
    delete users[socket.id]; // Remove user from onlineUsers
    io.to(room).emit('update_users', getUsersInRoom(room)); // Emit the updated user list
  }
});

// Send messages to chat room
socket.on(
  'send_message',
  throttle(async (data) => {
    const { room, message } = data;
    if (
      typeof room === 'string' &&
      room.length <= 30 &&
      typeof message === 'string' &&
      message.length <= 500
    ) {
      users[socket.id].lastActivity = Date.now();

      // Save the message to Supabase
      const { error } = await supabase.from('messages').insert([
        {
          room,
          user: users[socket.id].username,
          text: message,
        },
      ]);
      if (error) {
        console.error('Error saving message to Supabase:', error);
        return;
      }

      io.to(room).emit('receive_message', { user: users[socket.id].username, message });
    }
  }, 1000)
);
 // Throttle messages to 1 per second
    
    socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);

   // Find the room the user was in
  const rooms = Array.from(socket.rooms);
  const room = rooms.find((r) => r !== socket.id);

  // Remove user presence data
  delete users[socket.id];

  // Update the online users and count in the corresponding room
  if (room) {
    io.to(room).emit('update_users', getUsersInRoom(room));
  }
});
});

// Add this function to server.js
function disconnectInactiveUsers() {
  const now = Date.now();
  Object.keys(users).forEach((socketId) => {
    const user = users[socketId];
    if (now - user.lastActivity > INACTIVITY_TIMEOUT) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        console.log('Disconnecting inactive user:', user.username);
        socket.disconnect(); // Disconnect the inactive user
      }
    }
  });
}

// Call disconnectInactiveUsers() every minute
setInterval(disconnectInactiveUsers, 60 * 1000);

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

async function getLastMessages(room) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room', room)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
  return data.reverse(); // Return messages in ascending order
}


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});