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

app.get('/', (req, res) => {
  res.json({
    message: 'Valkey Demo API',
    endpoints: {
      '/products': 'List all products',
      '/products/:id': 'Get product by ID',
      '/categories': 'List all categories',
      '/categories/:name': 'Get products in category'
    }
  });
});

app.get('/products', async (req, res) => {
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
