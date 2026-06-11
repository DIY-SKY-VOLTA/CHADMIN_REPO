// Contest management controllers reserved for future implementation
// Previously housed toggleFeatured and listFeatured — removed as unused per audit

exports.getInfo = (req, res) => {
  res.json({ success: true, message: 'Contest mgmt API ready for development' });
};
