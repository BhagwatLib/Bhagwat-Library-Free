const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Base Route
app.get('/', (req, res) => {
    res.send('Bhagwat Library Management API - Migrated to Firebase Firestore');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (Firebase Firestore Active)`);
});
