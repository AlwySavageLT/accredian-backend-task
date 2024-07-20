module.exports = {
    database: {
      url: process.env.DATABASE_URL,
    },
    email: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    server: {
      port: process.env.PORT || 3001,
    },
    environment: process.env.NODE_ENV || 'development',
  };