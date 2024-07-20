require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./logger');
const config = require('./config');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Input validation middleware
const validateReferralInput = (req, res, next) => {
  const { referrerName, referrerEmail, refereeName, refereeEmail, course } = req.body;
  if (!referrerName || !referrerEmail || !refereeName || !refereeEmail || !course) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referrerEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refereeEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  next();
};

// Referral API endpoint
app.post('/api/refer', validateReferralInput, async (req, res) => {
  try {
    const { referrerName, referrerEmail, refereeName, refereeEmail, course } = req.body;

    // Save to database
    const referral = await prisma.referral.create({
      data: {
        referrerName,
        referrerEmail,
        refereeName,
        refereeEmail,
        course,
      },
    });

    logger.info('Referral saved to database', { referralId: referral.id });

    // Send email
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });

    await transporter.sendMail({
      from: config.email.user,
      to: refereeEmail,
      subject: "You've been referred!",
      text: `${referrerName} has referred you for the ${course} course.`,
    });

    logger.info('Referral email sent', { referralId: referral.id, to: refereeEmail });

    res.status(201).json({ 
      message: 'Referral submitted successfully', 
      referral: {
        id: referral.id,
        referrerName: referral.referrerName,
        refereeName: referral.refereeName,
        course: referral.course,
        createdAt: referral.createdAt
      }
    });
  } catch (error) {
    logger.error('Error processing referral', { error: error.message });
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Referral statistics endpoint
app.get('/api/referral-stats', async (req, res) => {
  try {
    const totalReferrals = await prisma.referral.count();
    const recentReferrals = await prisma.referral.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { referrerName: true, course: true, createdAt: true },
    });
    res.json({ totalReferrals, recentReferrals });
  } catch (error) {
    logger.error('Error fetching referral stats', { error: error.message });
    res.status(500).json({ error: 'An error occurred while fetching referral statistics' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = config.server.port;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect();
  });
});