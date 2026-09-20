// OmniCache-Engine Client Controller & LRU Visualizer
const chainScroll = document.getElementById('chainScroll');
const outputPre = document.getElementById('outputPre');

async function refreshCacheUI() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.stats) {
      document.getElementById('mCount').textContent = `${data.stats.itemCount} / ${data.stats.capacity}`;
      document.getElementById('mHitRatio').textContent = `${data.stats.hitRatioPercent}%`;
      document.getElementById('mMemory').textContent = `${data.stats.memoryUsageMB} MB`;
      document.getElementById('mEvictions').textContent = data.stats.evictions;
    }

    renderChain(data.chain || []);
  } catch (e) {
    console.error('Failed to load stats', e);
  }
}

function renderChain(nodes) {
  chainScroll.innerHTML = '';
  if (!nodes || nodes.length === 0) {
    chainScroll.innerHTML = '<div class="empty-state">Cache is currently empty. Insert keys below.</div>';
    return;
  }

  nodes.forEach((node, index) => {
    const isHead = index === 0;
    const isTail = index === nodes.length - 1;

    const box = document.createElement('div');
    box.className = `node-box ${isHead ? 'mru' : ''} ${isTail ? 'lru' : ''}`;
    box.innerHTML = `
      <div class="node-key">${node.key}</div>
      <div class="node-bytes">${node.byteSize} bytes</div>
      <div class="node-ttl">${node.expiresInMs ? 'TTL: ' + Math.ceil(node.expiresInMs / 1000) + 's' : 'Permanent'}</div>
    `;

    box.addEventListener('click', () => {
      document.getElementById('targetKey').value = node.key;
      fetchKey(node.key);
    });

    chainScroll.appendChild(box);

    if (index < nodes.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'chain-arrow';
      arrow.innerHTML = '&lrhar;';
      chainScroll.appendChild(arrow);
    }
  });
}

async function fetchKey(key) {
  try {
    const res = await fetch(`/api/cache/${encodeURIComponent(key)}`);
    const statusHeader = res.headers.get('X-Cache-Status') || 'UNKNOWN';
    const json = await res.json();
    outputPre.textContent = `[${statusHeader}] ${JSON.stringify(json, null, 2)}`;
    refreshCacheUI();
  } catch (err) {
    outputPre.textContent = `Error: ${err.message}`;
  }
}

// SET Form Handler
document.getElementById('setForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('setKey').value;
  const valStr = document.getElementById('setValue').value;
  const ttl = parseInt(document.getElementById('setTTL').value, 10) || 0;

  let value = valStr;
  try {
    value = JSON.parse(valStr);
  } catch (ignore) {}

  try {
    const res = await fetch('/api/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, ttlMs: ttl })
    });
    const json = await res.json();
    outputPre.textContent = JSON.stringify(json, null, 2);
    document.getElementById('setKey').value = '';
    document.getElementById('setValue').value = '';
    refreshCacheUI();
  } catch (err) {
    outputPre.textContent = `Error: ${err.message}`;
  }
});

// GET Form Handler
document.getElementById('getForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const key = document.getElementById('targetKey').value;
  fetchKey(key);
});

// DELETE Button Handler
document.getElementById('btnDelete').addEventListener('click', async () => {
  const key = document.getElementById('targetKey').value;
  if (!key) return;
  try {
    const res = await fetch(`/api/cache/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const json = await res.json();
    outputPre.textContent = JSON.stringify(json, null, 2);
    refreshCacheUI();
  } catch (err) {
    outputPre.textContent = `Error: ${err.message}`;
  }
});

// CLEAR ALL Button Handler
document.getElementById('btnClear').addEventListener('click', async () => {
  if (!confirm('Flush entire cache store?')) return;
  try {
    const res = await fetch('/api/cache/clear', { method: 'POST' });
    const json = await res.json();
    outputPre.textContent = JSON.stringify(json, null, 2);
    refreshCacheUI();
  } catch (err) {
    outputPre.textContent = `Error: ${err.message}`;
  }
});

// Initial load
refreshCacheUI();
setInterval(refreshCacheUI, 3000);
