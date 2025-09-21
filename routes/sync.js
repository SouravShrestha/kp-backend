const express = require('express');
const router = express.Router();

const { runSync } = require('../services/cloudinarySyncService');

// POST /sync/run - Trigger the sync process
router.post('/run', async (req, res) => {
	try {
		await runSync();
		res.status(200).json({ message: 'Sync process completed successfully.' });
	} catch (error) {
		res.status(500).json({ error: 'Failed to run sync process.', details: error.message });
	}
});

module.exports = router;
