const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    postId: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    comment: {
        type: String,
        required: true,
        maxlength: 2000
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1 });
commentSchema.index({ isDeleted: 1, createdAt: 1 });  // Analytics: comment counts

module.exports = mongoose.model('Comment', commentSchema);
