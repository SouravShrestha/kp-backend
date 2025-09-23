require('dotenv').config();

const express = require('express');
const cors = require('cors');
const foldersRouter = require('./routes/folders');
const imagesRouter = require('./routes/images');
const emailRouter = require('./routes/email');
const syncRouter = require('./routes/sync');
const testimonialsRouter = require('./routes/testimonials');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: 'Supabase',
    version: '1.0.0'
  });
});

app.use('/api/folders', foldersRouter);
app.use('/api/images', imagesRouter);
app.use('/api/email', emailRouter);
app.use('/api/sync', syncRouter);
app.use('/api/testimonials', testimonialsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
