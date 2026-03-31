const { Kafka } = require('kafkajs');
const fs = require('fs');
require('dotenv').config();

const eventTypes = ['page_view', 'click', 'purchase', 'signup', 'error', 'api_call'];
const pages = ['/home', '/products', '/cart', '/checkout', '/profile', '/settings'];
const users = ['user_1', 'user_2', 'user_3', 'user_4', 'user_5'];

function generateEvent() {
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const base = {
    type,
    timestamp: new Date().toISOString(),
    userId: users[Math.floor(Math.random() * users.length)],
    sessionId: `sess_${Math.random().toString(36).substr(2, 9)}`
  };

  switch (type) {
    case 'page_view':
      return { ...base, page: pages[Math.floor(Math.random() * pages.length)] };
    case 'click':
      return { ...base, element: `btn_${Math.random().toString(36).substr(2, 5)}`, page: pages[Math.floor(Math.random() * pages.length)] };
    case 'purchase':
      return { ...base, amount: Math.floor(Math.random() * 500) + 10, currency: 'USD', items: Math.floor(Math.random() * 5) + 1 };
    case 'signup':
      return { ...base, method: ['email', 'google', 'github'][Math.floor(Math.random() * 3)] };
    case 'error':
      return { ...base, code: [400, 404, 500, 503][Math.floor(Math.random() * 4)], message: 'Something went wrong' };
    case 'api_call':
      return { ...base, endpoint: `/api/v1/${['users', 'products', 'orders'][Math.floor(Math.random() * 3)]}`, latency: Math.floor(Math.random() * 500) };
    default:
      return base;
  }
}

async function produceToKafka() {
  const brokers = process.env.KAFKA_BROKERS?.split(',') || [];

  if (!brokers.length || !fs.existsSync(process.env.KAFKA_SSL_CA || '')) {
    console.log('Kafka not configured. Use demo mode instead.');
    console.log('Run: npm start (in another terminal)');
    console.log('Then run: node producer.js --demo');
    process.exit(1);
  }

  const kafka = new Kafka({
    clientId: 'events-producer',
    brokers,
    ssl: {
      ca: [fs.readFileSync(process.env.KAFKA_SSL_CA, 'utf-8')],
      cert: fs.readFileSync(process.env.KAFKA_SSL_CERT, 'utf-8'),
      key: fs.readFileSync(process.env.KAFKA_SSL_KEY, 'utf-8'),
    }
  });

  const producer = kafka.producer();
  await producer.connect();
  console.log('Connected to Kafka. Producing events...');

  const topic = process.env.KAFKA_TOPIC || 'events';

  setInterval(async () => {
    const event = generateEvent();
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(event) }]
    });
    console.log(`Produced: ${event.type}`);
  }, 1000);
}

async function produceDemo() {
  const http = require('http');
  console.log('Running in demo mode. Sending events to local dashboard...');

  setInterval(() => {
    const event = generateEvent();
    const data = JSON.stringify(event);

    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/demo-event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      if (res.statusCode === 200) {
        console.log(`Produced: ${event.type}`);
      }
    });

    req.on('error', (e) => console.error('Error:', e.message));
    req.write(data);
    req.end();
  }, 500);
}

if (process.argv.includes('--demo')) {
  produceDemo();
} else {
  produceToKafka().catch(err => {
    console.error('Failed to connect to Kafka:', err.message);
    console.log('\nTip: Run with --demo flag for local testing without Kafka');
  });
}
