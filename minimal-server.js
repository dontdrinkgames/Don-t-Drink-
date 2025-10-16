const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.static('public'));

// Simple routes
app.get('/', (req, res) => {
    res.send('Hello from minimal server!');
});

app.get('/host', (req, res) => {
    res.send('Host page - minimal server');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Minimal server running' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Minimal server running on port ${PORT}`);
});
