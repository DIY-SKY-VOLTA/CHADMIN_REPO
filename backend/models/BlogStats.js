const mongoose = require('mongoose');

const blogStatsSchema = new mongoose.Schema({
    postId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    likes: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('BlogStats', blogStatsSchema);
