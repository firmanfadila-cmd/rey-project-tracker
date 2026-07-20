require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const path    = require('path');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'rey-default-secret-please-set-JWT_SECRET-env-var';
  console.warn('WARNING: JWT_SECRET not set — using insecure default. Set it in Railway Variables.');
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend')));

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/projects',    require('./routes/projects'));
app.use('/api/tasks',       require('./routes/tasks'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/revenue',     require('./routes/revenue'));
app.use('/api/users',       require('./routes/users'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`REY Project Tracker running on port ${PORT}`);
});
