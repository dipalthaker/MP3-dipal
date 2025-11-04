// routes/index.js
const express = require('express');

module.exports = function (app) {
  // Home
  const homeRouter = express.Router();
  require('./home')(homeRouter);
  app.use('/api', homeRouter);

  // Users
  const usersRouter = express.Router();
  require('./users')(usersRouter);
  app.use('/api/users', usersRouter);

  // Tasks
  const tasksRouter = express.Router();
  require('./tasks')(tasksRouter);
  app.use('/api/tasks', tasksRouter);
};
