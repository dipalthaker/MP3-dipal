var mongoose = require('mongoose');

var TaskSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'name is required'] },
  description: { type: String, required: [true, 'description is required'] },
  deadline: { type: Date, required: [true, 'deadline (ms epoch) is required'] }, // README/dbFill uses ms epoch
  completed: { type: Boolean, default: false },
  assignedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
  assignedUserName: { type: String, default: 'unassigned' }, 
  dateCreated: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('Task', TaskSchema);
