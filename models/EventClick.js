// models/EventClick.js - CORRECTED
const mongoose = require('mongoose');

const eventClickSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true
    },
    eventTitle: String,
    eventTopic: String,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userEmail: String,
    sessionId: String,
    clickedAt: {
        type: Date,
        default: Date.now
    },
    deviceInfo: {
        userAgent: String,
        browser: String
    },
    location: {
        ipAddress: String,
        country: String
    }
});

module.exports = mongoose.model('EventClick', eventClickSchema);