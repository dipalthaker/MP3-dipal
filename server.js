// server.js
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (!process.env.MONGO_URI) {
  console.error(' Missing MONGO_URI in .env');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// -------------------- Routes --------------------
const router = express.Router();
require('./routes/index')(app, router);

// Optional health endpoint for sanity checks
app.get('/api', (_req, res) => {
  res.json({ message: 'OK', data: 'API is up' });
});

// -------------------- Start server --------------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
