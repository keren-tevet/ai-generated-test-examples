const express = require('express');
const { Kafka } = require('kafkajs');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store recent events for new connections
const recentEvents = [];
const MAX_RECENT_EVENTS = 100;

// Event statistics
const stats = {
  totalEvents: 0,
  eventsByType: {},
  eventsPerMinute: [],
  lastMinuteTimestamp: Date.now()
};

app.use(express.static('public'));
app.use(express.json());

// API endpoint for stats
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// API endpoint for recent events
app.get('/api/events', (req, res) => {
  res.json(recentEvents);
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current stats and recent events
  ws.send(JSON.stringify({ type: 'init', stats, events: recentEvents }));

  ws.on('close', () => console.log('Client disconnected'));
});

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

function processEvent(event) {
  stats.totalEvents++;

  const eventType = event.type || 'unknown';
  stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + 1;

  // Track events per minute
  const now = Date.now();
  if (now - stats.lastMinuteTimestamp >= 60000) {
    stats.eventsPerMinute.push({ timestamp: stats.lastMinuteTimestamp, count: 0 });
    stats.lastMinuteTimestamp = now;
    if (stats.eventsPerMinute.length > 60) {
      stats.eventsPerMinute.shift();
    }
  }
  const currentMinute = stats.eventsPerMinute[stats.eventsPerMinute.length - 1];
  if (currentMinute) {
    currentMinute.count++;
  } else {
    stats.eventsPerMinute.push({ timestamp: now, count: 1 });
  }

  // Store event
  recentEvents.unshift({ ...event, receivedAt: new Date().toISOString() });
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }

  broadcast({ type: 'event', event, stats });
}

async function startKafkaConsumer() {
  // Support both Aiven-injected vars (KAFKA_BOOTSTRAP_SERVER) and local dev (KAFKA_BROKERS)
  const brokerString = process.env.KAFKA_BOOTSTRAP_SERVER || process.env.KAFKA_BROKERS;
  const brokers = brokerString?.split(',') || [];

  if (!brokers.length) {
    console.log('No Kafka brokers configured. Running in demo mode.');
    return;
  }

  // Aiven injects certs as raw PEM strings; local dev uses file paths
  const sslConfig = {};
  if (process.env.KAFKA_CA_CERT) {
    // Aiven deployment: certs are raw PEM strings
    sslConfig.ssl = {
      ca: process.env.KAFKA_CA_CERT,
      cert: process.env.KAFKA_ACCESS_CERT,
      key: process.env.KAFKA_ACCESS_KEY,
    };
  } else if (process.env.KAFKA_SSL_CA && fs.existsSync(process.env.KAFKA_SSL_CA)) {
    // Local dev: certs are file paths
    sslConfig.ssl = {
      ca: [fs.readFileSync(process.env.KAFKA_SSL_CA, 'utf-8')],
      cert: fs.readFileSync(process.env.KAFKA_SSL_CERT, 'utf-8'),
      key: fs.readFileSync(process.env.KAFKA_SSL_KEY, 'utf-8'),
    };
  }

  const kafka = new Kafka({
    clientId: 'events-dashboard',
    brokers,
    ...sslConfig
  });

  const consumer = kafka.consumer({ groupId: 'dashboard-group' });

  try {
    await consumer.connect();
    console.log('Connected to Kafka');

    await consumer.subscribe({
      topic: process.env.KAFKA_TOPIC || 'events',
      fromBeginning: false
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = message.value.toString();
          const event = JSON.parse(value);
          event.topic = topic;
          event.partition = partition;
          event.offset = message.offset;
          processEvent(event);
        } catch (e) {
          processEvent({
            type: 'raw',
            data: message.value.toString(),
            topic,
            partition,
            offset: message.offset
          });
        }
      }
    });
  } catch (err) {
    console.error('Kafka connection error:', err.message);
    console.log('Running in demo mode. Use the demo producer to simulate events.');
  }
}

// Demo mode: simulate events for testing without Kafka
app.post('/api/demo-event', (req, res) => {
  const event = req.body;
  processEvent(event);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on port ${PORT}`);
  startKafkaConsumer();
});
