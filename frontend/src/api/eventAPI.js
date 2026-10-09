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

/**
 * Set an event's image from an external URL — the server fetches it (SSRF-
 * guarded, size-capped), verifies it is a real image, then pushes it through
 * the same R2 pipeline a file upload uses. Lets an admin repair a run of broken
 * events by pasting URLs instead of downloading and re-uploading files.
 */
export const uploadEventImageFromUrl = (eventId, imageUrl) =>
  adminAPI.post('/events/images/upload-url', { eventId, imageUrl });
