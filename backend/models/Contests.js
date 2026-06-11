const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  title: { type: String, trim: true },
  status: {
    type: String,
    enum: ['open', 'scheduled', 'closed'],
    default: 'open'
  },
  archivedAt: { type: Date, default: null }
}, { 
  timestamps: true,
  strict: false // Allows querying fields not defined in schema
});

module.exports = mongoose.model('Contests', contestSchema, 'Contests');
