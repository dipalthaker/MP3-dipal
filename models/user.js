var mongoose = require('mongoose');

var UserSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'name is required'] },
  email: {
    type: String, required: [true, 'email is required'], unique: true,
    match: [/^\S+@\S+\.\S+$/, 'email is invalid']
  },
  pendingTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: [] }],
  dateCreated: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('User', UserSchema);
