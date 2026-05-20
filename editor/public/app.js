const fileList = document.getElementById('file-list');
const detail = document.getElementById('detail');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const summary = document.getElementById('summary');
const status = document.getElementById('status');

let selectedPath = null;

function clearPreview() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'left';
}

function setStatus(message, tone = 'muted') {
  status.textContent = message;
  status.dataset.tone = tone;
}

async function fetchStaging() {
  const res = await fetch('/api/staging');
  if (!res.ok) {
    throw new Error(`Refresh failed (${res.status})`);
  }
  return res.json();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeEntry(entry) {
  const kind = entry.kind || 'text';
  if (entry.action === 'delete') {
    return `${kind} delete${entry.sizeBytes ? ` • ${formatBytes(entry.sizeBytes)}` : ''}`;
  }
  return `${kind}${entry.sizeBytes ? ` • ${formatBytes(entry.sizeBytes)}` : ''}`;
}

function drawLevel(data) {
  clearPreview();
  if (!data?.zones) return;
  const scale = 0.8;
  for (const z of data.zones) {
    ctx.strokeStyle = '#58a6ff';
    ctx.fillStyle = 'rgba(88,166,255,0.15)';
    ctx.fillRect(z.x * scale, z.y * scale, z.w * scale, z.h * scale);
    ctx.strokeRect(z.x * scale, z.y * scale, z.w * scale, z.h * scale);
    ctx.fillStyle = '#e6edf3';
    ctx.font = '12px sans-serif';
    ctx.fillText(z.id, z.x * scale + 4, z.y * scale + 14);
  }
  for (const p of data.paths || []) {
    ctx.strokeStyle = '#3fb950';
    ctx.beginPath();
    (p.points || []).forEach(([x, y], i) => {
      const px = x * scale;
      const py = y * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

function drawAnim(data) {
  clearPreview();
  const states = data?.states || [];
  const cx = 80;
  const cy = canvas.height / 2;
  states.forEach((s, i) => {
    const x = cx + i * 100;
    ctx.fillStyle = '#21262d';
    ctx.strokeStyle = '#f0883e';
    ctx.beginPath();
    ctx.arc(x, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6edf3';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.id, x, cy + 4);
  });
}

function showEntryDetail(path, entry, raw) {
  clearPreview();
  if (!entry) {
    detail.textContent = '';
    return;
  }

  if (entry.action === 'delete') {
    detail.textContent = `Delete staged for ${path}\n${describeEntry(entry)}`;
    return;
  }

  if (entry.kind === 'binary') {
    detail.textContent = `Binary file staged for ${path}\n${describeEntry(entry)}`;
    return;
  }

  try {
    const data = JSON.parse(raw);
    detail.textContent = JSON.stringify(data, null, 2);
    if ((path.includes('/levels/') || path.endsWith('.json')) && data.zones) {
      drawLevel(data);
    } else if (path.includes('/anim/') || data.states) {
      drawAnim(data);
    }
  } catch {
    detail.textContent = raw.slice(0, 4000);
  }
}

function selectFile(path, snap) {
  selectedPath = path;
  document.querySelectorAll('#file-list li[data-path]').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === path);
  });
  const entry = (snap.entries || []).find((item) => item.path === path);
  const raw = snap.files?.[path] || '';
  setStatus(`${path} • ${describeEntry(entry)}`, 'muted');
  showEntryDetail(path, entry, raw);
}

function renderSummary(entries) {
  const counts = { create: 0, modify: 0, delete: 0, binary: 0 };
  for (const entry of entries) {
    counts[entry.action] += 1;
    if (entry.kind === 'binary') counts.binary += 1;
  }
  summary.textContent =
    `${entries.length} staged • ${counts.create} create • ${counts.modify} modify • ${counts.delete} delete`;
}

function renderFileList(snap) {
  fileList.innerHTML = '';
  const entries = [...(snap.entries || [])].sort((a, b) => a.path.localeCompare(b.path));
  renderSummary(entries);
  if (!entries.length) {
    fileList.innerHTML = '<li class="empty">No staged files.</li>';
    setStatus('Nothing staged right now.', 'muted');
    clearPreview();
    detail.textContent = '';
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    li.dataset.path = entry.path;

    const name = document.createElement('span');
    name.className = 'path';
    name.textContent = entry.path;

    const meta = document.createElement('span');
    meta.className = `badge ${entry.action}`;
    meta.textContent = entry.action;

    li.append(name, meta);
    li.title = describeEntry(entry);
    li.onclick = () => selectFile(entry.path, snap);
    fileList.appendChild(li);
  }

  const nextPath = entries.some((entry) => entry.path === selectedPath)
    ? selectedPath
    : entries[0].path;
  selectFile(nextPath, snap);
}

async function refresh() {
  setStatus('Refreshing staged files...', 'muted');
  try {
    const snap = await fetchStaging();
    renderFileList(snap);
  } catch (error) {
    summary.textContent = 'staging unavailable';
    fileList.innerHTML = '<li class="empty">Unable to load staged files.</li>';
    clearPreview();
    detail.textContent = String(error instanceof Error ? error.message : error);
    setStatus('Refresh failed.', 'error');
  }
}

document.getElementById('refresh').onclick = refresh;
clearPreview();
refresh();
