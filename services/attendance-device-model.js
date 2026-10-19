const mongoose = require('mongoose');
const db = require('../database');
const schema = new mongoose.Schema({
  deviceHash: { type: String, required: true, unique: true },
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const AttendanceDeviceBinding = db.bindModel(mongoose.models.AttendanceDeviceBinding || mongoose.model('AttendanceDeviceBinding', schema));
module.exports = { AttendanceDeviceBinding };
