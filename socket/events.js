function eventPayload(eventId) {
  return eventId ? { event_id: Number(eventId) } : {};
}

function emitPoolUpdated(io, eventId) {
  const payload = eventPayload(eventId);
  if (eventId) io.to(`event:${eventId}`).emit('pool:updated', payload);
  else io.emit('pool:updated', payload);
}

function emitMatchCreated(io, eventId, extra = {}) {
  const payload = { ...eventPayload(eventId), ...extra };
  if (eventId) io.to(`event:${eventId}`).emit('match:created', payload);
  else io.emit('match:created', payload);
  emitFightsUpdated(io, eventId);
}

function emitMatchDeleted(io, eventId) {
  const payload = eventPayload(eventId);
  if (eventId) io.to(`event:${eventId}`).emit('match:deleted', payload);
  else io.emit('match:deleted', payload);
  emitFightsUpdated(io, eventId);
  emitPoolUpdated(io, eventId);
}

function emitFightsUpdated(io, eventId) {
  const payload = eventPayload(eventId);
  if (eventId) {
    io.to(`event:${eventId}`).emit('fights:updated', payload);
    io.to(`event:${eventId}`).emit('matches:updated', payload);
  } else {
    io.emit('fights:updated', payload);
    io.emit('matches:updated', payload);
  }
}

function emitTvUpdated(io, eventId) {
  const payload = eventPayload(eventId);
  if (eventId) io.to(`event:${eventId}`).emit('tv:updated', payload);
  else io.emit('tv:updated', payload);
}

module.exports = {
  emitPoolUpdated,
  emitMatchCreated,
  emitMatchDeleted,
  emitFightsUpdated,
  emitTvUpdated
};
