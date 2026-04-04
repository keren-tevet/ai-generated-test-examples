const express = require('express');
const Redis = require('ioredis');

const app = express();
const port = process.env.PORT || 3000;

// Parse REDIS_URL - Aiven injects this via service integration
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('REDIS_URL environment variable is required');
  process.exit(1);
}

const redis = new Redis(redisUrl, {
  tls: { rejectUnauthorized: false }
});

// Sample data to seed
const sampleProducts = [
  { id: '1', name: 'Laptop', price: 999, category: 'Electronics' },
  { id: '2', name: 'Headphones', price: 199, category: 'Electronics' },
  { id: '3', name: 'Coffee Mug', price: 15, category: 'Kitchen' },
  { id: '4', name: 'Notebook', price: 8, category: 'Office' },
  { id: '5', name: 'Desk Lamp', price: 45, category: 'Office' }
];

async function seedData() {
  const exists = await redis.exists('products:seeded');
  if (!exists) {
    console.log('Seeding sample data...');
    for (const product of sampleProducts) {
      await redis.hset(`product:${product.id}`, product);
      await redis.sadd('product:ids', product.id);
      await redis.sadd(`category:${product.category}`, product.id);
    }
    await redis.set('products:seeded', 'true');
    console.log('Sample data seeded successfully');
  } else {
    console.log('Data already seeded');
  }
}

app.get('/', async (req, res) => {
  try {
    const ids = await redis.smembers('product:ids');
    const products = await Promise.all(
      ids.map(id => redis.hgetall(`product:${id}`))
    );
    const categories = [...new Set(products.map(p => p.category))];

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Valkey Product Catalog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #fff;
    }
    .header {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      padding: 1.5rem 2rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 {
      font-size: 1.8rem;
      background: linear-gradient(90deg, #ff6b6b, #feca57);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p { color: #888; margin-top: 0.3rem; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 1.2rem 1.5rem;
      flex: 1;
    }
    .stat-card h3 { font-size: 2rem; color: #feca57; }
    .stat-card p { color: #888; font-size: 0.9rem; }
    .categories {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .category-tag {
      background: rgba(255,107,107,0.2);
      border: 1px solid rgba(255,107,107,0.3);
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      color: #ff6b6b;
    }
    .products {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }
    .product-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 1.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .product-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      border-color: rgba(255,107,107,0.3);
    }
    .product-card h3 { font-size: 1.2rem; margin-bottom: 0.5rem; }
    .product-card .category {
      font-size: 0.75rem;
      color: #feca57;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 1rem;
    }
    .product-card .price {
      font-size: 1.5rem;
      font-weight: 700;
      color: #4ecdc4;
    }
    .product-card .price::before { content: '$'; font-size: 1rem; }
    .footer {
      text-align: center;
      padding: 2rem;
      color: #555;
      font-size: 0.85rem;
    }
    .footer a { color: #ff6b6b; text-decoration: none; }
    .valkey-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(78,205,196,0.1);
      border: 1px solid rgba(78,205,196,0.3);
      padding: 0.3rem 0.8rem;
      border-radius: 6px;
      font-size: 0.8rem;
      color: #4ecdc4;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Product Catalog</h1>
    <p>Powered by Aiven Valkey</p>
    <div class="valkey-badge">Connected to Valkey</div>
  </div>
  <div class="container">
    <div class="stats">
      <div class="stat-card">
        <h3>${products.length}</h3>
        <p>Total Products</p>
      </div>
      <div class="stat-card">
        <h3>${categories.length}</h3>
        <p>Categories</p>
      </div>
      <div class="stat-card">
        <h3>$${products.reduce((sum, p) => sum + parseInt(p.price || 0), 0)}</h3>
        <p>Total Inventory Value</p>
      </div>
    </div>
    <div class="categories">
      ${categories.map(c => `<span class="category-tag">${c}</span>`).join('')}
    </div>
    <div class="products">
      ${products.map(p => `
        <div class="product-card">
          <div class="category">${p.category}</div>
          <h3>${p.name}</h3>
          <div class="price">${p.price}</div>
        </div>
      `).join('')}
    </div>
  </div>
  <div class="footer">
    <p>Data stored in <a href="https://aiven.io/valkey" target="_blank">Aiven Valkey</a> |
    <a href="/api/products">JSON API</a></p>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.status(500).send('Error loading products: ' + err.message);
  }
});

app.get(['/products', '/api/products'], async (req, res) => {
  try {
    const ids = await redis.smembers('product:ids');
    const products = await Promise.all(
      ids.map(id => redis.hgetall(`product:${id}`))
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const product = await redis.hgetall(`product:${req.params.id}`);
    if (!product || Object.keys(product).length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/categories', async (req, res) => {
  try {
    const categories = [...new Set(sampleProducts.map(p => p.category))];
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/categories/:name', async (req, res) => {
  try {
    const ids = await redis.smembers(`category:${req.params.name}`);
    if (ids.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const products = await Promise.all(
      ids.map(id => redis.hgetall(`product:${id}`))
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

redis.on('connect', async () => {
  console.log('Connected to Valkey');
  await seedData();
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
