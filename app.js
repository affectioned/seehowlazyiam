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

  const el = document.getElementById('data-freshness');

  if (days === 0) {
    el.textContent = 'Data is up to date';
    el.className = 'freshness fresh';
  } else if (days === 1) {
    el.textContent = 'Last record was yesterday';
    el.className = 'freshness fresh';
  } else if (days <= 7) {
    el.textContent = `Last record was ${days} days ago`;
    el.className = 'freshness aging';
  } else {
    el.textContent = `Last record was ${days} days ago — export a new Health file to update`;
    el.className = 'freshness stale';
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
  const cellSize = 13 + 3; // --cell + --gap
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

// ── Sessions table ────────────────────────────────────────────────────────────
function renderTable(sessions) {
  const tbody = document.getElementById('sessions-body');

  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No sessions yet.</td></tr>';
    return;
  }

  tbody.innerHTML = sessions.slice(0, 30).map(s => {
    const [year, month, day] = s.date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const steps    = s.steps    ? Number(s.steps).toLocaleString()        : '—';
    const calories = s.calories ? Math.round(s.calories).toLocaleString() : '—';
    return `<tr>
      <td>${dateStr}</td>
      <td>${steps}</td>
      <td>${calories}</td>
    </tr>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const sessions = await fetchSessions();
    renderFreshness(sessions);
    renderStats(sessions);
    renderHeatmap(sessions);
    renderTable(sessions);
  } catch (err) {
    console.error(err);
    document.getElementById('sessions-body').innerHTML =
      '<tr><td colspan="3" class="empty">Could not load data. Check your Supabase config.</td></tr>';
  }
}

init();
