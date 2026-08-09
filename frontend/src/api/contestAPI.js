import adminAPI from './adminAPI';

/**
 * Contest management API — mirrors the automation pipeline document shape.
 */

export const listContests = (params = {}) =>
  adminAPI.get('/contests', { params });

export const getContest = (id) =>
  adminAPI.get(`/contests/${id}`);

export const createContest = (data) =>
  adminAPI.post('/contests', data);

export const updateContest = (id, data) =>
  adminAPI.put(`/contests/${id}`, data);

export const archiveContest = (id) =>
  adminAPI.delete(`/contests/${id}`);

export const restoreContest = (id) =>
  adminAPI.post(`/contests/${id}/restore`);

export const uploadContestImage = (contestId, file) => {
  const formData = new FormData();
  formData.append('contestId', contestId);
  formData.append('image', file);
  return adminAPI.post('/contests/images/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadContestImageFromUrl = (contestId, imageUrl) =>
  adminAPI.post('/contests/images/upload-url', { contestId, imageUrl });

/**
 * DETAILED GUIDE (contest_details collection) — the "AI-POWERED INSIGHTS"
 * section on the public contest detail page.
 */
export const getContestDetails = (id) =>
  adminAPI.get(`/contests/${id}/details`);

export const saveContestDetails = (id, data) =>
  adminAPI.put(`/contests/${id}/details`, data);

export const deleteContestDetails = (id) =>
  adminAPI.delete(`/contests/${id}/details`);
