// models/user.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    // pending tasks must reference Task ids
    pendingTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  },
  {
    timestamps: { createdAt: 'dateCreated', updatedAt: false }
  }
);

module.exports = mongoose.model('User', UserSchema);
