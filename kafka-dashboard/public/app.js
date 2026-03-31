const $ = (sel) => document.querySelector(sel);

const state = {
  topics: [],
  currentTopic: null
};

async function api(path, options = {}) {
  showLoading(true);
  try {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    showError(err.message);
    throw err;
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  $('#loading').classList.toggle('hidden', !show);
}

function showError(msg) {
  const toast = $('#error-toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 5000);
}

async function loadServiceInfo() {
  try {
    const service = await api('/service');

    $('#service-details').innerHTML = `
      <div class="service-stat">
        <div class="label">Status</div>
        <div class="value status-active">Connected</div>
      </div>
      <div class="service-stat">
        <div class="label">Cluster ID</div>
        <div class="value">${service.cluster_id || 'N/A'}</div>
      </div>
      <div class="service-stat">
        <div class="label">Brokers</div>
        <div class="value">${service.nodes || 'N/A'}</div>
      </div>
      <div class="service-stat">
        <div class="label">Bootstrap</div>
        <div class="value" style="font-size: 0.9rem; word-break: break-all">${service.brokers || 'N/A'}</div>
      </div>
    `;
  } catch (err) {
    $('#service-details').innerHTML = `
      <div class="service-stat">
        <div class="label">Status</div>
        <div class="value" style="color: var(--error)">Disconnected</div>
      </div>
      <div class="service-stat">
        <div class="label">Error</div>
        <div class="value" style="font-size: 0.9rem">${err.message}</div>
      </div>
    `;
  }
}

async function loadTopics() {
  try {
    const topics = await api('/topics');
    state.topics = topics;

    $('#topic-count').textContent = topics.length;

    const list = $('#topics-list');
    if (topics.length === 0) {
      list.innerHTML = '<p class="message-empty">No topics found</p>';
    } else {
      list.innerHTML = topics.map(t => `
        <div class="topic-card" data-topic="${t.topic_name}">
          <div class="topic-name">${t.topic_name}</div>
          <div class="topic-meta">
            <span class="status-active">${t.state}</span>
            <span>${t.partitions} partitions</span>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.topic-card').forEach(card => {
        card.addEventListener('click', () => openTopic(card.dataset.topic));
      });
    }
  } catch (err) {
    $('#topics-list').innerHTML = `<p class="message-empty">Failed to load topics: ${err.message}</p>`;
  }
}

async function openTopic(topicName) {
  state.currentTopic = topicName;
  $('#current-topic').textContent = topicName;

  try {
    const details = await api(`/topics/${topicName}`);
    const partitions = details.partitions || [];

    let partitionInfo = '';
    if (partitions.length > 0) {
      partitionInfo = `<div class="partition-info">
        ${partitions.slice(0, 5).map(p =>
          `<span>P${p.partition}: offset ${p.offset}</span>`
        ).join('')}
        ${partitions.length > 5 ? `<span>...and ${partitions.length - 5} more</span>` : ''}
      </div>`;
    }

    $('#messages-list').innerHTML = partitionInfo +
      '<div class="message-empty">Click "Consume Messages" to fetch messages</div>';
  } catch (err) {
    $('#messages-list').innerHTML = '<div class="message-empty">Click "Consume Messages" to fetch messages</div>';
  }

  $('#messages-section').classList.remove('hidden');
  $('#messages-section').scrollIntoView({ behavior: 'smooth' });
}

async function consumeMessages() {
  if (!state.currentTopic) return;

  const partition = $('#partition-input').value;
  const offset = $('#offset-input').value;
  const limit = $('#limit-input').value;

  try {
    const data = await api(`/topics/${state.currentTopic}/consume`, {
      method: 'POST',
      body: JSON.stringify({
        partition: parseInt(partition),
        offset,
        limit: parseInt(limit)
      })
    });

    const list = $('#messages-list');
    const messages = data.messages || [];

    if (messages.length === 0) {
      list.innerHTML = '<div class="message-empty">No messages found at this offset</div>';
    } else {
      list.innerHTML = messages.map((msg) => `
        <div class="message-item">
          <div class="message-meta">
            Partition: ${msg.partition} | Offset: ${msg.offset} |
            ${msg.timestamp ? `Time: ${new Date(parseInt(msg.timestamp)).toLocaleString()}` : ''}
            ${msg.key ? ` | Key: ${escapeHtml(msg.key)}` : ''}
          </div>
          <div class="message-value">${formatValue(msg.value)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    $('#messages-list').innerHTML = `<div class="message-empty">Failed to consume: ${err.message}</div>`;
  }
}

function formatValue(value) {
  if (!value) return '<empty>';

  try {
    const json = JSON.parse(value);
    return escapeHtml(JSON.stringify(json, null, 2));
  } catch {
    return escapeHtml(value);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event listeners
$('#refresh-btn').addEventListener('click', async () => {
  await Promise.all([loadServiceInfo(), loadTopics()]);
});

$('#close-messages').addEventListener('click', () => {
  $('#messages-section').classList.add('hidden');
  state.currentTopic = null;
});

$('#consume-btn').addEventListener('click', consumeMessages);

// Initialize
Promise.all([loadServiceInfo(), loadTopics()]);
