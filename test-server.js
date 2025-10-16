const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Hello from test server!');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Test server running' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server running on port ${PORT}`);
});
