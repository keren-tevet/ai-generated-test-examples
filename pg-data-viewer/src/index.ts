import express from 'express';
import pg from 'pg';

const app = express();
const port = parseInt(process.env.PORT || '3000');

// Configure PostgreSQL connection with proper SSL handling for Aiven
const url = new URL(process.env.DATABASE_URL || '');
url.searchParams.delete('sslmode');

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: process.env.PROJECT_CA_CERT
    ? { ca: Buffer.from(process.env.PROJECT_CA_CERT, 'base64').toString() }
    : undefined,
});

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    const products = result.rows;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Catalog</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 30px;
      font-size: 2.5rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 50px rgba(0,0,0,0.2);
    }
    .card h2 {
      color: #333;
      font-size: 1.4rem;
      margin-bottom: 8px;
    }
    .card .category {
      color: #667eea;
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .card .description {
      color: #666;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .card .price {
      font-size: 1.5rem;
      font-weight: 700;
      color: #333;
    }
    .card .stock {
      color: #888;
      font-size: 0.9rem;
      margin-top: 8px;
    }
    .stock.low { color: #e74c3c; }
    .footer {
      text-align: center;
      color: rgba(255,255,255,0.8);
      margin-top: 40px;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Product Catalog</h1>
    <div class="grid">
      ${products.map(p => `
        <div class="card">
          <div class="category">${p.category}</div>
          <h2>${p.name}</h2>
          <p class="description">${p.description}</p>
          <div class="price">$${parseFloat(p.price).toFixed(2)}</div>
          <div class="stock ${p.stock < 10 ? 'low' : ''}">
            ${p.stock < 10 ? 'Only ' : ''}${p.stock} in stock
          </div>
        </div>
      `).join('')}
    </div>
    <div class="footer">
      Powered by Aiven PostgreSQL
    </div>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Error connecting to database');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
