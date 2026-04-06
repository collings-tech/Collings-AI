'use strict';

const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    otpCode: {
      type: String,
      required: true,
    },
    otpExpiry: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-delete documents after otpExpiry (TTL index with a small buffer)
pendingRegistrationSchema.index({ otpExpiry: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
