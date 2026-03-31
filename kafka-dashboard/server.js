import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const AIVEN_TOKEN = process.env.AIVEN_TOKEN;
const AIVEN_API = 'https://api.aiven.io/v1';

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

async function aivenFetch(path) {
  const res = await fetch(`${AIVEN_API}${path}`, {
    headers: {
      'Authorization': `aivenv1 ${AIVEN_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`Aiven API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

app.get('/api/projects', async (req, res) => {
  try {
    const data = await aivenFetch('/project');
    res.json(data.projects || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:project/services', async (req, res) => {
  try {
    const data = await aivenFetch(`/project/${req.params.project}/service`);
    const kafkaServices = (data.services || []).filter(s => s.service_type === 'kafka');
    res.json(kafkaServices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:project/services/:service', async (req, res) => {
  try {
    const data = await aivenFetch(`/project/${req.params.project}/service/${req.params.service}`);
    res.json(data.service || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:project/services/:service/topics', async (req, res) => {
  try {
    const data = await aivenFetch(`/project/${req.params.project}/service/${req.params.service}/topic`);
    res.json(data.topics || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:project/services/:service/topics/:topic', async (req, res) => {
  try {
    const data = await aivenFetch(`/project/${req.params.project}/service/${req.params.service}/topic/${req.params.topic}`);
    res.json(data.topic || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:project/services/:service/topics/:topic/consume', async (req, res) => {
  try {
    const { project, service, topic } = req.params;
    const { partitions, format = 'json', timeout = 5000 } = req.body;

    const response = await fetch(`${AIVEN_API}/project/${project}/service/${service}/kafka/rest/topics/${topic}/consume`, {
      method: 'POST',
      headers: {
        'Authorization': `aivenv1 ${AIVEN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ partitions, format, timeout })
    });

    if (!response.ok) {
      throw new Error(`Failed to consume messages: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  if (!AIVEN_TOKEN) {
    console.warn('Warning: AIVEN_TOKEN not set. API calls will fail.');
    console.warn('Set it with: export AIVEN_TOKEN=your_token');
  }
  console.log(`Kafka Dashboard running at http://localhost:${PORT}`);
});
