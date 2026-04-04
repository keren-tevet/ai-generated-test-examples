import express, { Request, Response } from 'express';
import { Client } from '@opensearch-project/opensearch';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Parse OpenSearch URL and create client with CA cert
function createClient(): Client {
  const opensearchUrl = process.env.OPENSEARCH_URL;
  if (!opensearchUrl) {
    throw new Error('OPENSEARCH_URL environment variable is required');
  }

  const caCert = process.env.PROJECT_CA_CERT;
  const ssl = caCert ? { ca: Buffer.from(caCert, 'base64').toString() } : undefined;

  return new Client({
    node: opensearchUrl,
    ssl,
  });
}

const client = createClient();
const INDEX_NAME = 'products';

// Sample product data
const sampleProducts = [
  { id: '1', name: 'Wireless Bluetooth Headphones', category: 'Electronics', price: 79.99, description: 'High-quality wireless headphones with noise cancellation and 30-hour battery life', brand: 'AudioMax', rating: 4.5 },
  { id: '2', name: 'Organic Green Tea', category: 'Food & Beverages', price: 12.99, description: 'Premium organic green tea leaves from Japanese highlands, 100 sachets', brand: 'TeaHaven', rating: 4.8 },
  { id: '3', name: 'Running Shoes Pro', category: 'Sports', price: 129.99, description: 'Lightweight running shoes with advanced cushioning technology for marathon runners', brand: 'SpeedFit', rating: 4.6 },
  { id: '4', name: 'Stainless Steel Water Bottle', category: 'Home & Kitchen', price: 24.99, description: 'Insulated water bottle keeps drinks cold for 24 hours or hot for 12 hours', brand: 'HydroLife', rating: 4.7 },
  { id: '5', name: 'Mechanical Gaming Keyboard', category: 'Electronics', price: 149.99, description: 'RGB mechanical keyboard with cherry switches and programmable macros', brand: 'GameGear', rating: 4.4 },
  { id: '6', name: 'Yoga Mat Premium', category: 'Sports', price: 39.99, description: 'Extra thick eco-friendly yoga mat with alignment lines and carrying strap', brand: 'ZenFlex', rating: 4.9 },
  { id: '7', name: 'Smart Watch Series X', category: 'Electronics', price: 299.99, description: 'Advanced smartwatch with health monitoring, GPS, and 7-day battery life', brand: 'TechTime', rating: 4.3 },
  { id: '8', name: 'Coffee Maker Deluxe', category: 'Home & Kitchen', price: 89.99, description: '12-cup programmable coffee maker with built-in grinder and thermal carafe', brand: 'BrewMaster', rating: 4.5 },
  { id: '9', name: 'Protein Powder Vanilla', category: 'Food & Beverages', price: 34.99, description: 'Plant-based protein powder with 25g protein per serving, vanilla flavor', brand: 'FitFuel', rating: 4.6 },
  { id: '10', name: 'Wireless Charging Pad', category: 'Electronics', price: 29.99, description: 'Fast wireless charging pad compatible with all Qi-enabled devices', brand: 'PowerUp', rating: 4.2 },
  { id: '11', name: 'Hiking Backpack 40L', category: 'Sports', price: 79.99, description: 'Durable hiking backpack with hydration system compatibility and rain cover', brand: 'TrailBlaze', rating: 4.7 },
  { id: '12', name: 'Cast Iron Skillet', category: 'Home & Kitchen', price: 44.99, description: 'Pre-seasoned cast iron skillet perfect for searing, frying, and baking', brand: 'IronChef', rating: 4.8 },
  { id: '13', name: 'Noise Cancelling Earbuds', category: 'Electronics', price: 199.99, description: 'True wireless earbuds with active noise cancellation and transparency mode', brand: 'AudioMax', rating: 4.6 },
  { id: '14', name: 'Resistance Bands Set', category: 'Sports', price: 19.99, description: 'Set of 5 resistance bands with different strengths for home workouts', brand: 'FlexFit', rating: 4.4 },
  { id: '15', name: 'Espresso Machine', category: 'Home & Kitchen', price: 249.99, description: 'Semi-automatic espresso machine with milk frother and 15-bar pressure', brand: 'BrewMaster', rating: 4.5 },
];

async function seedData() {
  try {
    // Check if index exists
    const indexExists = await client.indices.exists({ index: INDEX_NAME });

    if (!indexExists.body) {
      // Create index with mappings
      await client.indices.create({
        index: INDEX_NAME,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              name: { type: 'text', analyzer: 'standard' },
              category: { type: 'keyword' },
              price: { type: 'float' },
              description: { type: 'text', analyzer: 'standard' },
              brand: { type: 'keyword' },
              rating: { type: 'float' },
            },
          },
        },
      });
      console.log(`Created index: ${INDEX_NAME}`);

      // Bulk index products
      const body = sampleProducts.flatMap(doc => [
        { index: { _index: INDEX_NAME, _id: doc.id } },
        doc,
      ]);

      await client.bulk({ body, refresh: true });
      console.log(`Indexed ${sampleProducts.length} products`);
    } else {
      console.log(`Index ${INDEX_NAME} already exists, skipping seed`);
    }
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}

app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

// Search products
app.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, category, minPrice, maxPrice, brand } = req.query;

    const must: any[] = [];
    const filter: any[] = [];

    if (q) {
      must.push({
        multi_match: {
          query: q as string,
          fields: ['name^2', 'description', 'brand'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (category) {
      filter.push({ term: { category: category as string } });
    }

    if (brand) {
      filter.push({ term: { brand: brand as string } });
    }

    if (minPrice || maxPrice) {
      const range: any = {};
      if (minPrice) range.gte = parseFloat(minPrice as string);
      if (maxPrice) range.lte = parseFloat(maxPrice as string);
      filter.push({ range: { price: range } });
    }

    const query = must.length || filter.length
      ? { bool: { must: must.length ? must : [{ match_all: {} }], filter } }
      : { match_all: {} };

    const result = await client.search({
      index: INDEX_NAME,
      body: {
        query,
        size: 20,
        sort: [{ _score: 'desc' }, { rating: 'desc' }],
      },
    });

    const hits = result.body.hits.hits.map((hit: any) => ({
      ...hit._source,
      score: hit._score,
    }));

    res.json({
      total: result.body.hits.total.value,
      results: hits,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get product by ID
app.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const result = await client.get({
      index: INDEX_NAME,
      id: req.params.id,
    });
    res.json(result.body._source);
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      res.status(500).json({ error: 'Failed to get product' });
    }
  }
});

// List all categories
app.get('/categories', async (_req: Request, res: Response) => {
  try {
    const result = await client.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          categories: {
            terms: { field: 'category', size: 50 },
          },
        },
      },
    });
    const categories = result.body.aggregations.categories.buckets.map(
      (b: any) => ({ name: b.key, count: b.doc_count })
    );
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// List all brands
app.get('/brands', async (_req: Request, res: Response) => {
  try {
    const result = await client.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          brands: {
            terms: { field: 'brand', size: 50 },
          },
        },
      },
    });
    const brands = result.body.aggregations.brands.buckets.map(
      (b: any) => ({ name: b.key, count: b.doc_count })
    );
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get brands' });
  }
});

async function start() {
  console.log('Connecting to OpenSearch...');

  // Wait for OpenSearch to be ready
  let retries = 0;
  while (retries < 30) {
    try {
      await client.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      console.log('Connected to OpenSearch');
      break;
    } catch (error) {
      retries++;
      console.log(`Waiting for OpenSearch... (${retries}/30)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await seedData();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET /health - Health check');
    console.log('  GET /search?q=query&category=X&brand=Y&minPrice=N&maxPrice=M - Search products');
    console.log('  GET /products/:id - Get product by ID');
    console.log('  GET /categories - List all categories');
    console.log('  GET /brands - List all brands');
  });
}

start().catch(console.error);
