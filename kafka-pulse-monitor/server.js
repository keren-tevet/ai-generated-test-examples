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

const MAX_EVENTS = 200;
const recentEvents = [];

const stats = {
  totalEvents: 0,
  eventsByTopic: {},
  eventsByType: {},
  throughput: { current: 0, history: [] },
  lastEventTime: null
};

let eventCountThisSecond = 0;
setInterval(() => {
  stats.throughput.current = eventCountThisSecond;
  stats.throughput.history.push({ time: Date.now(), count: eventCountThisSecond });
  if (stats.throughput.history.length > 60) stats.throughput.history.shift();
  eventCountThisSecond = 0;
  broadcast({ type: 'throughput', data: stats.throughput });
}, 1000);

app.use(express.static('public'));
app.use(express.json());

app.get('/api/stats', (req, res) => res.json(stats));
app.get('/api/events', (req, res) => res.json(recentEvents));

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.send(JSON.stringify({ type: 'init', stats, events: recentEvents }));
  ws.on('close', () => console.log('Client disconnected'));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function processEvent(event) {
  stats.totalEvents++;
  eventCountThisSecond++;
  stats.lastEventTime = new Date().toISOString();

  const topic = event.topic || 'unknown';
  const eventType = event.type || 'raw';

  stats.eventsByTopic[topic] = (stats.eventsByTopic[topic] || 0) + 1;
  stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + 1;

  const enrichedEvent = { ...event, receivedAt: stats.lastEventTime };
  recentEvents.unshift(enrichedEvent);
  if (recentEvents.length > MAX_EVENTS) recentEvents.pop();

  broadcast({ type: 'event', event: enrichedEvent, stats });
}

async function startKafkaConsumer() {
  const brokerString = process.env.KAFKA_BOOTSTRAP_SERVER || process.env.KAFKA_BROKERS;
  const brokers = brokerString?.split(',') || [];

  if (!brokers.length) {
    console.log('No Kafka brokers configured. Running in demo mode.');
    console.log('Use POST /api/demo to send test events.');
    return;
  }

  const sslConfig = {};
  if (process.env.KAFKA_CA_CERT) {
    sslConfig.ssl = {
      ca: process.env.KAFKA_CA_CERT,
      cert: process.env.KAFKA_ACCESS_CERT,
      key: process.env.KAFKA_ACCESS_KEY,
    };
  } else if (process.env.KAFKA_SSL_CA && fs.existsSync(process.env.KAFKA_SSL_CA)) {
    sslConfig.ssl = {
      ca: [fs.readFileSync(process.env.KAFKA_SSL_CA, 'utf-8')],
      cert: fs.readFileSync(process.env.KAFKA_SSL_CERT, 'utf-8'),
      key: fs.readFileSync(process.env.KAFKA_SSL_KEY, 'utf-8'),
    };
  }

  const kafka = new Kafka({ clientId: 'pulse-monitor', brokers, ...sslConfig });
  const consumer = kafka.consumer({ groupId: 'pulse-monitor-group' });

  try {
    await consumer.connect();
    console.log('Connected to Kafka');

    const topics = (process.env.KAFKA_TOPICS || 'login-events,order-events,payment-events,shipping-events,user-events,sensor-readings').split(',');
    for (const topic of topics) {
      await consumer.subscribe({ topic: topic.trim(), fromBeginning: false });
      console.log(`Subscribed: ${topic.trim()}`);
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = message.value.toString();
          const event = JSON.parse(value);
          processEvent({ ...event, topic, partition, offset: message.offset });
        } catch {
          processEvent({ type: 'raw', data: message.value.toString(), topic, partition, offset: message.offset });
        }
      }
    });
  } catch (err) {
    console.error('Kafka error:', err.message);
  }
}

app.post('/api/demo', (req, res) => {
  processEvent(req.body);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pulse Monitor running on http://localhost:${PORT}`);
  startKafkaConsumer();
});
