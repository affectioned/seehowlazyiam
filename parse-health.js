// Parse Apple Health XML export and write data.json for the static site.
// Usage: node parse-health.js path/to/export.xml

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const STEP_RE    = /type="HKQuantityTypeIdentifierStepCount"[^/]*startDate="([^"]+)"[^/]*value="(\d+(?:\.\d+)?)"/;
const CALORIE_RE = /type="HKQuantityTypeIdentifierActiveEnergyBurned"[^/]*startDate="([^"]+)"[^/]*value="(\d+(?:\.\d+)?)"/;

function toDate(str) { return str.split(' ')[0]; } // "2024-11-14 08:41:34 +0200" → "2024-11-14"

async function parseXML(filePath) {
  const steps    = {};
  const calories = {};

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  let lines = 0;
  for await (const line of rl) {
    if (++lines % 100000 === 0) process.stdout.write(`  read ${lines.toLocaleString()} lines...\r`);

    let m;
    if ((m = line.match(STEP_RE))) {
      const d = toDate(m[1]);
      steps[d] = (steps[d] || 0) + parseFloat(m[2]);
    } else if ((m = line.match(CALORIE_RE))) {
      const d = toDate(m[1]);
      calories[d] = (calories[d] || 0) + parseFloat(m[2]);
    }
  }
  process.stdout.write('\n');
  return { steps, calories };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node parse-health.js path/to/export.xml');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('Parsing XML...');
  const { steps, calories } = await parseXML(filePath);

  const rows = Object.keys(steps)
    .sort()
    .map(date => ({
      date,
      steps:    Math.round(steps[date]),
      calories: calories[date] ? Math.round(calories[date]) : null
    }));

  console.log(`Found ${rows.length} days with steps.`);

  const outPath = path.join(__dirname, 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Written to ${outPath}`);
  console.log('Now commit and push data.json to update your site.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
