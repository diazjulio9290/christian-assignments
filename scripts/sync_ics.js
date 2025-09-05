// scripts/sync_ics.js
const fs = require('fs');
const https = require('https');
const ical = require('ical');

const ICS_URL = process.env.ICS_URL;
if (!ICS_URL) { console.error('Missing ICS_URL'); process.exit(1); }

https.get(ICS_URL, (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const events = ical.parseICS(raw);

      const today = new Date(); today.setHours(0,0,0,0);
      const startToday = new Date(today);
      const endToday = new Date(today); endToday.setDate(endToday.getDate() + 1);

      const classify = (iso) => {
        if (!iso) return 'no-due';
        const d = new Date(iso);
        if (d >= startToday && d < endToday) return 'urgent';
        if (d < startToday) return 'past-due';
        return 'todo';
      };

      const items = Object.values(events)
        .filter(e => e && e.type === 'VEVENT')
        .map(e => {
          const dueISO = e.start ? new Date(e.start).toISOString() : null;
          let url = e.url || '';
          if (!url && e.description) {
            const m = String(e.description).match(/https?:\/\/\S+/);
            if (m) url = m[0];
          }
          return {
            title: e.summary || 'Untitled',
            course: e.location || '',
            url,
            due_at: dueISO,
            status: classify(dueISO)
          };
        })
        // de-dupe by title+due date
        .reduce((acc, it) => {
          const key = `${it.title}-${it.due_at||'none'}`;
          if (!acc.seen.has(key)) { acc.seen.add(key); acc.out.push(it); }
          return acc;
        }, { seen:new Set(), out:[] }).out
        .sort((a,b) => (a.due_at||'9999').localeCompare(b.due_at||'9999'));

      fs.mkdirSync('docs', { recursive: true });
      fs.writeFileSync('docs/assignments.json', JSON.stringify(items, null, 2));
      console.log(`Wrote ${items.length} → docs/assignments.json`);
    } catch (err) {
      console.error('Parse error:', err);
      process.exit(1);
    }
  });
}).on('error', err => { console.error('HTTP error:', err); process.exit(1); });
