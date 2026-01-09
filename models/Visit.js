const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    sessionId: {
        type: String,
        required: true
    },
    isNewUser: {
        type: Boolean,
        default: true
    },
    isReturning: {
        type: Boolean,
        default: false
    },
    deviceInfo: {
        userAgent: String,
        deviceType: String,
        browser: String,
        os: String,
        screenResolution: String,
        language: String,
        timezone: String
    },
    location: {
        ipAddress: String,
        country: String,
        region: String,
        city: String,
        latitude: Number,
        longitude: Number
    },
    referrer: {
        type: String
    },
    visitNumber: {
        type: Number,
        default: 1
    },
    timeOnPage: {
        type: Number, // in seconds
        default: 0
    },
    pageViews: {
        type: Number,
        default: 1
    },
    visitedAt: {
        type: Date,
        default: Date.now
    },
    lastActivityAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Visit', visitSchema);