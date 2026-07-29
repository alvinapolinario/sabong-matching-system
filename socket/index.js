module.exports = function socketHandler(io) {
  io.on('connection', (socket) => {
    socket.on('event:join', (eventId) => {
      if (eventId) socket.join(`event:${eventId}`);
    });

    socket.on('event:leave', (eventId) => {
      if (eventId) socket.leave(`event:${eventId}`);
    });
  });
};
