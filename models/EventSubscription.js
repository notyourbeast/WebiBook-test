const mongoose = require('mongoose');

const emailSubscriptionSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    source: {
        type: String,
        enum: ['weekly_reminder', 'event_save', 'manual'],
        default: 'weekly_reminder'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    unsubscribedAt: {
        type: Date
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

module.exports = mongoose.model('EmailSubscription', emailSubscriptionSchema);