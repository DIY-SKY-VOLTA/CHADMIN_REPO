import adminAPI from './adminAPI';

/**
 * Events collection management — full CRUD over the shared `events`
 * collection (same data that powers the Phase2 site's /events pages).
 * DELETE is a soft archive unless `{ params: { hard: true } }` is passed.
 */
export const listEvents = (params) =>
  adminAPI.get('/events', { params });

export const getEventStats = () =>
  adminAPI.get('/events/stats');

export const getEvent = (id) =>
  adminAPI.get(`/events/${id}`);

export const createEvent = (data) =>
  adminAPI.post('/events', data);

export const updateEvent = (id, data) =>
  adminAPI.put(`/events/${id}`, data);

export const archiveEvent = (id) =>
  adminAPI.delete(`/events/${id}`);

export const deleteEventHard = (id) =>
  adminAPI.delete(`/events/${id}`, { params: { hard: true } });
