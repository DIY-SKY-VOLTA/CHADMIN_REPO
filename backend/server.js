const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const imageRoutes = require('./routes/imageRoutes');
const userRoutes = require('./routes/userRoutes');
const commentRoutes = require('./routes/commentRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const publishedRoutes = require('./routes/publishedRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const contestRoutes = require('./routes/contestRoutes');
const statsRoutes = require('./routes/statsRoutes');
const activityRoutes = require('./routes/activityRoutes');
const exportRoutes = require('./routes/exportRoutes');
const previewRoutes = require('./routes/previewRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL?.replace(/\/$/, ''),
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Database Connection — with timeouts and pool settings
// Prevents slow queries from exhausting the connection pool
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,   // fail fast if cluster is unresponsive (was default 30000)
  socketTimeoutMS: 45000,            // max 45s per query (was default 0 = no timeout)
  maxPoolSize: 10,                    // limit concurrent connections
  heartbeatFrequencyMS: 10000,        // check cluster health every 10s
})
  .then(() => console.log('✅ Admin Database Connected'))
  .catch(err => console.error('❌ Database Connection Error:', err));

// Routes
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/blogs', blogRoutes);
app.use('/api/admin/images', imageRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/comments', commentRoutes);
app.use('/api/admin/categories', categoryRoutes);
app.use('/api/admin/published', publishedRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin/contests', contestRoutes);
app.use('/api/admin/stats', statsRoutes);
app.use('/api/admin/activity', activityRoutes);
app.use('/api/admin/export', exportRoutes);
app.use('/api/admin/preview', previewRoutes);
app.use('/api/uploads', uploadRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Admin Backend running on port ${PORT}`);
});
