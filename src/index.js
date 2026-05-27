require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const webhookRoutes       = require('./routes/webhook');
const conversationRoutes  = require('./routes/conversations');
const messageRoutes       = require('./routes/messages');
const notificationRoutes  = require('./routes/notifications');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(morgan('dev'));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/health', (_req, res) => res.json({ 
  status: 'ok', 
  ts: new Date().toISOString() 
}));

app.use('/webhook',       webhookRoutes);
app.use('/conversations', conversationRoutes);
app.use('/messages',      messageRoutes);
app.use('/notifications', notificationRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;