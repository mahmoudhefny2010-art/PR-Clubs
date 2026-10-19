const mongoose = require('mongoose');
const db = require('../database');
const definitionSchema = new mongoose.Schema({
  type: { type: String, required: true, unique: true }, version: { type: Number, required: true, default: 1 },
  config: { type: mongoose.Schema.Types.Mixed, required: true }, updatedBy: { type: String, required: true },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });
const notificationSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true }, recipientEmail: { type: String, required: true, index: true },
  kind: { type: String, required: true }, requestRef: { type: String, required: true }, title: { type: String, required: true },
  message: { type: String, required: true }, link: { type: String, required: true }, readAt: { type: Date, default: null },
  // Stored in the JSON payload on SQL Server; older workflow notices use both channels.
  delivery: { type: mongoose.Schema.Types.Mixed },
  emailStatus: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'unconfigured'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: { type: Date, default: null },
  leaseId: { type: String, default: '' }, providerMessageId: { type: String, default: '' }, errorCode: { type: String, default: '' }
}, { timestamps: true });
const WorkflowDefinition = db.bindModel(mongoose.models.WorkflowDefinition || mongoose.model('WorkflowDefinition', definitionSchema));
const WorkflowNotification = db.bindModel(mongoose.models.WorkflowNotification || mongoose.model('WorkflowNotification', notificationSchema));
module.exports = { WorkflowDefinition, WorkflowNotification };
