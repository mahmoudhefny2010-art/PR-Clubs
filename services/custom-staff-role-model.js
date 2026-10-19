const mongoose = require('mongoose');
const db = require('../database');
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, validate: require('./staff-role-keys').isCustomRole },
  name: { type: String, required: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 300 },
  enabled: { type: Boolean, default: true }, version: { type: Number, default: 1 },
  scope: { type: String, enum: ['global', 'clubs'], required: true },
  requestTypes: { type: [String], default: [] }, permissions: { type: [String], default: [] },
  modules: { type: [String], default: ['requests', 'notifications'] }, updatedBy: { type: String, required: true }
}, { timestamps: true });
const CustomStaffRole = db.bindModel(mongoose.models.CustomStaffRole || mongoose.model('CustomStaffRole', schema));
module.exports = { CustomStaffRole };
