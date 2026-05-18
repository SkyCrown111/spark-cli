const fileList = document.getElementById('file-list');
const detail = document.getElementById('detail');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');

async function fetchStaging() {
  const res = await fetch('/api/staging');
  return res.json();
}

function drawLevel(data) {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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

async function selectFile(path, files) {
  document.querySelectorAll('#file-list li').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === path);
  });
  const raw = files[path];
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    detail.textContent = JSON.stringify(data, null, 2);
    if (path.includes('/levels/') || path.endsWith('.json') && data.zones) {
      drawLevel(data);
    } else if (path.includes('/anim/') || data.states) {
      drawAnim(data);
    }
  } catch {
    detail.textContent = raw.slice(0, 2000);
  }
}

async function refresh() {
  const snap = await fetchStaging();
  fileList.innerHTML = '';
  const paths = Object.keys(snap.files || {}).sort();
  if (!paths.length) {
    fileList.innerHTML = '<li style="color:#8b949e">No staged files. Run spark-cli level new …</li>';
    return;
  }
  for (const p of paths) {
    const li = document.createElement('li');
    li.textContent = p;
    li.dataset.path = p;
    li.onclick = () => selectFile(p, snap.files);
    fileList.appendChild(li);
  }
  selectFile(paths[0], snap.files);
}

document.getElementById('refresh').onclick = refresh;
refresh();
