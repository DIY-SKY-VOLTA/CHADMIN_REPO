import adminAPI from './adminAPI';

/**
 * Review queue — ingest-blocked pipeline records waiting for a human
 * decision. Served from the pipeline's exported worklist file (not Mongo).
 */

export const getReviewQueue = () => adminAPI.get('/review-queue');

export const getReviewQueueItem = (identity) =>
  adminAPI.get(`/review-queue/${encodeURIComponent(identity)}`);
