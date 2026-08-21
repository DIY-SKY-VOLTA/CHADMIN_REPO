import adminAPI from './adminAPI';

/**
 * EventType collection management — curated taxonomy for event types
 * (the events analog of contest categories). DELETE is a soft archive.
 */
export const adminListEventTypes = () =>
  adminAPI.get('/event-types');

export const createEventType = (data) =>
  adminAPI.post('/event-types', data);

export const updateEventType = (id, data) =>
  adminAPI.put(`/event-types/${id}`, data);

export const archiveEventType = (id) =>
  adminAPI.delete(`/event-types/${id}`);

export const reorderEventTypes = (order) =>
  adminAPI.put('/event-types/reorder', { order });
