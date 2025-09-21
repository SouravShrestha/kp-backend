require('dotenv').config();

const express = require('express');
const cors = require('cors');
const foldersRouter = require('./routes/folders');
const imagesRouter = require('./routes/images');
const emailRouter = require('./routes/email');
const syncRouter = require('./routes/sync');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
  })
);
app.use(express.json());

app.use('/api/folders', foldersRouter);
app.use('/api/images', imagesRouter);
app.use('/api/email', emailRouter);
app.use('/api/sync', syncRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
