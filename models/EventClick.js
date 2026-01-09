const mongoose = require('mongoose');

const eventClickSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true
    },
    eventTitle: {
        type: String,
        required: true
    },
    eventTopic: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    sessionId: {
        type: String,
        required: true
    },
    clickedAt: {
        type: Date,
        default: Date.now
    },
    deviceInfo: {
        userAgent: String,
        deviceType: String,
        browser: String
    },
    location: {
        ipAddress: String,
        country: String
    }
});

module.exports = mongoose.model('EventClick', eventClickSchema);