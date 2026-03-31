const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  project: null,
  service: null,
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

async function loadProjects() {
  try {
    const projects = await api('/projects');
    const select = $('#project-select');
    select.innerHTML = '<option value="">Select a project...</option>';
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.project_name;
      opt.textContent = p.project_name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

async function loadServices(project) {
  const select = $('#service-select');
  select.innerHTML = '<option value="">Loading...</option>';
  select.disabled = true;

  try {
    const services = await api(`/projects/${project}/services`);
    select.innerHTML = '<option value="">Select a service...</option>';

    if (services.length === 0) {
      select.innerHTML = '<option value="">No Kafka services found</option>';
      return;
    }

    services.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.service_name;
      opt.textContent = `${s.service_name} (${s.state})`;
      select.appendChild(opt);
    });
    select.disabled = false;
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load services</option>';
  }
}

async function loadServiceDetails(project, service) {
  try {
    const svc = await api(`/projects/${project}/services/${service}`);

    const details = $('#service-details');
    details.innerHTML = `
      <div class="service-stat">
        <div class="label">Status</div>
        <div class="value ${svc.state === 'RUNNING' ? 'status-active' : ''}">${svc.state}</div>
      </div>
      <div class="service-stat">
        <div class="label">Plan</div>
        <div class="value">${svc.plan}</div>
      </div>
      <div class="service-stat">
        <div class="label">Cloud</div>
        <div class="value">${svc.cloud_name}</div>
      </div>
      <div class="service-stat">
        <div class="label">Nodes</div>
        <div class="value">${svc.node_count || 'N/A'}</div>
      </div>
      <div class="service-stat">
        <div class="label">Version</div>
        <div class="value">${svc.kafka?.version || 'N/A'}</div>
      </div>
      <div class="service-stat">
        <div class="label">Created</div>
        <div class="value">${new Date(svc.create_time).toLocaleDateString()}</div>
      </div>
    `;

    $('#service-info').classList.remove('hidden');
  } catch (err) {
    $('#service-info').classList.add('hidden');
  }
}

async function loadTopics(project, service) {
  try {
    const topics = await api(`/projects/${project}/services/${service}/topics`);
    state.topics = topics;

    $('#topic-count').textContent = topics.length;

    const list = $('#topics-list');
    if (topics.length === 0) {
      list.innerHTML = '<p class="message-empty">No topics found in this service</p>';
    } else {
      list.innerHTML = topics.map(t => `
        <div class="topic-card" data-topic="${t.topic_name}">
          <div class="topic-name">${t.topic_name}</div>
          <div class="topic-meta">
            <span class="${t.state === 'ACTIVE' ? 'status-active' : ''}">
              ${t.state}
            </span>
            <span>${t.partitions} partitions</span>
            <span>${t.replication}x replication</span>
            <span>${formatRetention(t.retention_hours)}</span>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.topic-card').forEach(card => {
        card.addEventListener('click', () => openTopic(card.dataset.topic));
      });
    }

    $('#topics-section').classList.remove('hidden');
  } catch (err) {
    $('#topics-section').classList.add('hidden');
  }
}

function formatRetention(hours) {
  if (hours === -1) return 'Forever';
  if (hours < 24) return `${hours}h retention`;
  return `${Math.round(hours / 24)}d retention`;
}

function openTopic(topicName) {
  state.currentTopic = topicName;
  $('#current-topic').textContent = topicName;
  $('#messages-list').innerHTML = '<div class="message-empty">Click "Consume Messages" to fetch messages</div>';
  $('#messages-section').classList.remove('hidden');
  $('#messages-section').scrollIntoView({ behavior: 'smooth' });
}

async function consumeMessages() {
  if (!state.currentTopic) return;

  const partition = $('#partition-input').value;
  const offset = $('#offset-input').value;
  const format = $('#format-select').value;

  try {
    const data = await api(
      `/projects/${state.project}/services/${state.service}/topics/${state.currentTopic}/consume`,
      {
        method: 'POST',
        body: JSON.stringify({
          partitions: { [partition]: { offset: parseInt(offset) } },
          format,
          timeout: 5000
        })
      }
    );

    const list = $('#messages-list');
    const messages = data.messages || [];

    if (messages.length === 0) {
      list.innerHTML = '<div class="message-empty">No messages found at this offset</div>';
    } else {
      list.innerHTML = messages.map((msg, i) => `
        <div class="message-item">
          <div class="message-meta">
            Partition: ${msg.partition} | Offset: ${msg.offset} |
            ${msg.timestamp ? `Time: ${new Date(msg.timestamp).toLocaleString()}` : ''}
          </div>
          <div class="message-value">${formatValue(msg.value, format)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    $('#messages-list').innerHTML = `<div class="message-empty">Failed to consume: ${err.message}</div>`;
  }
}

function formatValue(value, format) {
  if (!value) return '<empty>';

  if (format === 'binary') {
    try {
      const decoded = atob(value);
      try {
        const json = JSON.parse(decoded);
        return escapeHtml(JSON.stringify(json, null, 2));
      } catch {
        return escapeHtml(decoded);
      }
    } catch {
      return escapeHtml(value);
    }
  }

  if (typeof value === 'object') {
    return escapeHtml(JSON.stringify(value, null, 2));
  }

  return escapeHtml(String(value));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event listeners
$('#project-select').addEventListener('change', async (e) => {
  const project = e.target.value;
  state.project = project;
  state.service = null;

  $('#service-select').innerHTML = '<option value="">Select a service...</option>';
  $('#service-select').disabled = true;
  $('#service-info').classList.add('hidden');
  $('#topics-section').classList.add('hidden');
  $('#messages-section').classList.add('hidden');

  if (project) {
    await loadServices(project);
  }
});

$('#service-select').addEventListener('change', async (e) => {
  const service = e.target.value;
  state.service = service;

  $('#service-info').classList.add('hidden');
  $('#topics-section').classList.add('hidden');
  $('#messages-section').classList.add('hidden');

  if (service && state.project) {
    await Promise.all([
      loadServiceDetails(state.project, service),
      loadTopics(state.project, service)
    ]);
  }
});

$('#refresh-btn').addEventListener('click', async () => {
  if (state.project && state.service) {
    await Promise.all([
      loadServiceDetails(state.project, state.service),
      loadTopics(state.project, state.service)
    ]);
  } else if (state.project) {
    await loadServices(state.project);
  } else {
    await loadProjects();
  }
});

$('#close-messages').addEventListener('click', () => {
  $('#messages-section').classList.add('hidden');
  state.currentTopic = null;
});

$('#consume-btn').addEventListener('click', consumeMessages);

// Initialize
loadProjects();
