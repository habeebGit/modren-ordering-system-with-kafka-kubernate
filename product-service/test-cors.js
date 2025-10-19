const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.get('/test', (req, res) => res.json({ ok: true }));
app.listen(3002, () => console.log('Test CORS server running'));