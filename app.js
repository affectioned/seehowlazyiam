// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchSessions() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error('Could not load data.json');
  const rows = await res.json();
  return rows.slice().sort((a, b) => b.date.localeCompare(a.date));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(d) {
  // Returns "YYYY-MM-DD" in local time (avoids UTC shift issues)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function countActiveDays(activeDates, from, to) {
  let count = 0;
  const d = new Date(from);
  while (d <= to) {
    if (activeDates.has(toDateStr(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function calcStreak(activeDates) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If today has no session yet, start checking from yesterday
  const startCheck = activeDates.has(toDateStr(today))
    ? new Date(today)
    : (() => { const y = new Date(today); y.setDate(y.getDate() - 1); return y; })();

  let streak = 0;
  const d = new Date(startCheck);
  while (activeDates.has(toDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Data freshness ────────────────────────────────────────────────────────────
function renderFreshness(sessions) {
  if (!sessions.length) return;

  const latest = sessions.reduce((a, b) => a.date > b.date ? a : b).date;
  const [y, m, d] = latest.split('-').map(Number);
  const latestDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - latestDate) / 86400000);

  const wrap = document.getElementById('data-freshness');
  const dot  = document.getElementById('freshness-dot');
  const text = document.getElementById('freshness-text');

  wrap.classList.remove('hidden');

  if (days === 0) {
    text.textContent = 'updated today — not lazy yet';
    dot.className = 'freshness-dot bg-green-500';
    text.className = 'text-green-400';
  } else if (days === 1) {
    text.textContent = 'last updated yesterday';
    dot.className = 'freshness-dot bg-green-500';
    text.className = 'text-green-400';
  } else if (days <= 7) {
    text.textContent = `data is ${days} days old — getting lazy about updating too`;
    dot.className = 'freshness-dot bg-yellow-400';
    text.className = 'text-yellow-400';
  } else {
    text.textContent = `${days} days since last update — too lazy to even export the data`;
    dot.className = 'freshness-dot bg-red-500';
    text.className = 'text-red-400';
  }
}

// ── Stats cards ───────────────────────────────────────────────────────────────
function renderStats(sessions) {
  const activeDates = new Set(sessions.map(s => s.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Week: Monday → today
  const weekStart = new Date(today);
  const dow = today.getDay(); // 0=Sun
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart  = new Date(today.getFullYear(), 0, 1);

  document.getElementById('streak').textContent       = calcStreak(activeDates);
  document.getElementById('week-active').textContent  = countActiveDays(activeDates, weekStart, today);
  document.getElementById('month-active').textContent = countActiveDays(activeDates, monthStart, today);
  document.getElementById('year-active').textContent  = countActiveDays(activeDates, yearStart, today);
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function renderHeatmap(sessions) {
  const heatmap    = document.getElementById('heatmap');
  const monthLabels = document.getElementById('month-labels');

  // Build a map: date string → steps
  const sessionMap = {};
  sessions.forEach(s => { sessionMap[s.date] = s.steps || 0; });

  // Steps thresholds for colour levels (quartiles of non-zero sessions)
  const allSteps = sessions.map(s => s.steps || 0).filter(x => x > 0).sort((a, b) => a - b);
  const q = i => allSteps[Math.floor(allSteps.length * i)] || 1;
  const thresholds = [q(0.25), q(0.5), q(0.75)];

  function stepLevel(steps) {
    if (!steps) return 0;
    if (steps <= thresholds[0]) return 1;
    if (steps <= thresholds[1]) return 2;
    if (steps <= thresholds[2]) return 3;
    return 4;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start of current year, adjusted back to Sunday
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const startDate = new Date(yearStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let currentMonth = -1;
  let weekIndex = 0;
  const monthWeekStart = {}; // month → first weekIndex it appears

  heatmap.innerHTML = '';
  monthLabels.innerHTML = '';

  const cur = new Date(startDate);
  while (cur <= today) {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';

    for (let d = 0; d < 7; d++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'heatmap-day';

      if (cur > today) {
        dayEl.classList.add('future');
      } else if (cur >= yearStart) {
        const ds    = toDateStr(cur);
        const steps = sessionMap[ds] || 0;
        const lvl   = stepLevel(steps);
        if (lvl) dayEl.dataset.level = lvl;

        const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dayEl.dataset.tip = steps
          ? `${label}: ${steps.toLocaleString()} steps`
          : label;
      } else {
        dayEl.classList.add('future'); // before year start
      }

      // Track month label position
      if (cur <= today && cur >= yearStart) {
        const m = cur.getMonth();
        if (m !== currentMonth && d === 0) {
          currentMonth = m;
          monthWeekStart[weekIndex] = MONTHS[m];
        }
      }

      weekEl.appendChild(dayEl);
      cur.setDate(cur.getDate() + 1);
    }

    heatmap.appendChild(weekEl);
    weekIndex++;
  }

  // Build month labels with correct widths
  const cellSize = 17 + 4; // --cell + --gap
  const totalWeeks = weekIndex;
  // Map each week index to a month label if it's the first week of that month
  for (let w = 0; w < totalWeeks; w++) {
    const span = document.createElement('span');
    span.className = 'month-label';
    span.style.width = `${cellSize}px`;
    if (monthWeekStart[w]) span.textContent = monthWeekStart[w];
    monthLabels.appendChild(span);
  }
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: { legend: { display: false }, tooltip: {
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderWidth: 1,
    titleColor: '#a1a1aa',
    bodyColor: '#e4e4e7',
    padding: 8,
    cornerRadius: 6,
  }},
  scales: {
    x: { grid: { color: '#27272a' }, ticks: { color: '#52525b', font: { size: 11 } } },
    y: { grid: { color: '#27272a' }, ticks: { color: '#52525b', font: { size: 11 } }, beginAtZero: true },
  }
};

function makeBar(id, labels, data, color = '#22c55e', label = '') {
  new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: color, borderRadius: 3, borderSkipped: false }]
    },
    options: CHART_DEFAULTS
  });
}

function makeLine(id, labels, data, color = '#22c55e', label = '') {
  new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data,
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: color,
        fill: true,
        tension: 0.3,
      }]
    },
    options: CHART_DEFAULTS
  });
}

// ── Heatmap tooltip (JS-based, avoids overflow clipping) ─────────────────────
function initTooltip() {
  const tip = document.getElementById('heatmap-tooltip');
  document.getElementById('heatmap').addEventListener('mouseover', e => {
    const day = e.target.closest('.heatmap-day');
    if (!day || !day.dataset.tip) return;
    tip.textContent = day.dataset.tip;
    tip.style.display = 'block';
  });
  document.getElementById('heatmap').addEventListener('mousemove', e => {
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top  = (e.clientY - 32) + 'px';
  });
  document.getElementById('heatmap').addEventListener('mouseleave', () => {
    tip.style.display = 'none';
  });
}

// ── Charts ────────────────────────────────────────────────────────────────────
function renderCharts(sessions) {
  const byDate = {};
  sessions.forEach(s => { byDate[s.date] = s; });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Last 30 days steps (bar) ───────────────────────────────────────────────
  const days30labels = [], days30data = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    days30labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    days30data.push(byDate[ds]?.steps || 0);
  }
  makeBar('chart-30days', days30labels, days30data, '#22c55e', 'Steps');

  // ── Monthly steps this year (bar) ─────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const year = today.getFullYear();
  const monthData = Array(12).fill(0);
  sessions.forEach(s => {
    if (s.date.startsWith(String(year))) {
      const m = parseInt(s.date.split('-')[1], 10) - 1;
      monthData[m] += s.steps || 0;
    }
  });
  const currentMonth = today.getMonth();
  makeBar('chart-monthly', MONTHS.slice(0, currentMonth + 1), monthData.slice(0, currentMonth + 1), '#16a34a', 'Steps');

  // ── Last 30 days calories (bar) ───────────────────────────────────────────
  const cal30data = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    cal30data.push(byDate[toDateStr(d)]?.calories || 0);
  }
  makeBar('chart-calories', days30labels, cal30data, '#f97316', 'Calories');

  // ── Weekly distance last 12 weeks (line) ──────────────────────────────────
  const weekLabels = [], weekDist = [];
  for (let w = 11; w >= 0; w--) {
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    let dist = 0;
    const d = new Date(weekStart);
    while (d <= weekEnd) {
      dist += byDate[toDateStr(d)]?.distance || 0;
      d.setDate(d.getDate() + 1);
    }
    weekLabels.push(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    weekDist.push(Math.round(dist * 100) / 100);
  }
  makeLine('chart-distance', weekLabels, weekDist, '#4ade80', 'km');
}

// ── Sessions table ────────────────────────────────────────────────────────────
function renderTable(sessions) {
  const tbody   = document.getElementById('sessions-body');
  const showBtn = document.getElementById('show-more');
  const PAGE    = 7;
  let showing   = PAGE;

  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-zinc-600 py-6 text-sm">No data yet.</td></tr>';
    return;
  }

  function renderRows() {
    tbody.innerHTML = sessions.slice(0, showing).map(s => {
      const [year, month, day] = s.date.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const dateStr  = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const steps    = s.steps    ? Number(s.steps).toLocaleString()        : '—';
      const distance = s.distance ? `${s.distance.toFixed(2)} km`           : '—';
      const calories = s.calories ? Math.round(s.calories).toLocaleString() : '—';
      return `<tr class="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
        <td class="py-2.5 px-1 text-zinc-300">${dateStr}</td>
        <td class="py-2.5 px-1 text-zinc-100 font-medium">${steps}</td>
        <td class="py-2.5 px-1 text-zinc-400">${distance}</td>
        <td class="py-2.5 px-1 text-zinc-400">${calories}</td>
      </tr>`;
    }).join('');

    if (showing < sessions.length) {
      showBtn.classList.remove('hidden');
      showBtn.textContent = `show more (${sessions.length - showing} remaining)`;
    } else {
      showBtn.classList.add('hidden');
    }
  }

  showBtn.addEventListener('click', () => { showing += PAGE; renderRows(); });
  renderRows();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const sessions = await fetchSessions();
    renderFreshness(sessions);
    renderStats(sessions);
    renderHeatmap(sessions);
    initTooltip();
    renderCharts(sessions);
    renderTable(sessions);
  } catch (err) {
    console.error(err);
    document.getElementById('sessions-body').innerHTML =
      '<tr><td colspan="4" class="text-center text-zinc-600 py-6 text-sm">Could not load data.json</td></tr>';
  }
}

init();
