// 404 handler for invalid routes
module.exports = (req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
};
