import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Kafka } from 'kafkajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Kafka credentials injected by Aiven integration
const KAFKA_BOOTSTRAP_SERVER = process.env.KAFKA_BOOTSTRAP_SERVER;
const KAFKA_CA_CERT = process.env.KAFKA_CA_CERT;
const KAFKA_ACCESS_CERT = process.env.KAFKA_ACCESS_CERT;
const KAFKA_ACCESS_KEY = process.env.KAFKA_ACCESS_KEY;

let kafka = null;
let admin = null;

function getKafkaClient() {
  if (!kafka && KAFKA_BOOTSTRAP_SERVER) {
    kafka = new Kafka({
      clientId: 'kafka-dashboard',
      brokers: KAFKA_BOOTSTRAP_SERVER.split(','),
      ssl: {
        ca: KAFKA_CA_CERT,
        cert: KAFKA_ACCESS_CERT,
        key: KAFKA_ACCESS_KEY,
      },
    });
  }
  return kafka;
}

async function getAdmin() {
  if (!admin) {
    const client = getKafkaClient();
    if (!client) return null;
    admin = client.admin();
    await admin.connect();
  }
  return admin;
}

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    connected: !!KAFKA_BOOTSTRAP_SERVER,
    brokers: KAFKA_BOOTSTRAP_SERVER || 'not configured'
  });
});

// Get service info
app.get('/api/service', async (req, res) => {
  try {
    const adminClient = await getAdmin();
    if (!adminClient) {
      return res.status(503).json({ error: 'Kafka not configured' });
    }

    const cluster = await adminClient.describeCluster();
    res.json({
      brokers: KAFKA_BOOTSTRAP_SERVER,
      cluster_id: cluster.clusterId,
      controller: cluster.controller,
      nodes: cluster.brokers.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List topics
app.get('/api/topics', async (req, res) => {
  try {
    const adminClient = await getAdmin();
    if (!adminClient) {
      return res.status(503).json({ error: 'Kafka not configured' });
    }

    const topics = await adminClient.listTopics();
    const metadata = await adminClient.fetchTopicMetadata({ topics });

    const topicList = metadata.topics.map(t => ({
      topic_name: t.name,
      partitions: t.partitions.length,
      state: 'ACTIVE'
    }));

    res.json(topicList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get topic details
app.get('/api/topics/:topic', async (req, res) => {
  try {
    const adminClient = await getAdmin();
    if (!adminClient) {
      return res.status(503).json({ error: 'Kafka not configured' });
    }

    const metadata = await adminClient.fetchTopicMetadata({ topics: [req.params.topic] });
    const topic = metadata.topics[0];

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const offsets = await adminClient.fetchTopicOffsets(req.params.topic);

    res.json({
      topic_name: topic.name,
      partitions: topic.partitions.map((p, i) => ({
        partition: p.partitionId,
        leader: p.leader,
        replicas: p.replicas.length,
        offset: offsets[i]?.offset || '0'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consume messages from a topic
app.post('/api/topics/:topic/consume', async (req, res) => {
  try {
    const client = getKafkaClient();
    if (!client) {
      return res.status(503).json({ error: 'Kafka not configured' });
    }

    const { partition = 0, offset = '0', limit = 10 } = req.body;
    const topic = req.params.topic;

    const consumer = client.consumer({
      groupId: `dashboard-${Date.now()}`,
      sessionTimeout: 10000,
    });

    await consumer.connect();

    const messages = [];
    let messageCount = 0;

    await consumer.subscribe({ topic, fromBeginning: false });

    // Seek to specific offset
    consumer.on('consumer.group.join', async () => {
      await consumer.seek({ topic, partition: parseInt(partition), offset });
    });

    const timeout = setTimeout(async () => {
      await consumer.disconnect();
      res.json({ messages });
    }, 5000);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        messages.push({
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          key: message.key?.toString() || null,
          value: message.value?.toString() || null
        });
        messageCount++;

        if (messageCount >= limit) {
          clearTimeout(timeout);
          await consumer.disconnect();
          res.json({ messages });
        }
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (admin) await admin.disconnect();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kafka Dashboard running at http://0.0.0.0:${PORT}`);
  if (!KAFKA_BOOTSTRAP_SERVER) {
    console.warn('Warning: KAFKA_BOOTSTRAP_SERVER not set. Running without Kafka connection.');
  } else {
    console.log(`Connecting to Kafka: ${KAFKA_BOOTSTRAP_SERVER}`);
  }
});
