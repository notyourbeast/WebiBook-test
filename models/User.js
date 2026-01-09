const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: ''
    },
    savedEvents: [{
        eventId: String,
        savedAt: { type: Date, default: Date.now }
    }],
    deviceInfo: {
        userAgent: String,
        deviceType: String,
        browser: String,
        os: String,
        screenResolution: String,
        timezone: String
    },
    location: {
        country: String,
        city: String,
        ipAddress: String
    },
    visitCount: {
        type: Number,
        default: 0
    },
    lastVisit: {
        type: Date,
        default: Date.now
    },
    firstVisit: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('User', userSchema);