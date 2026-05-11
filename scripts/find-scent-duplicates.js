/**
 * Scan the Scent collection and report likely duplicates so we can decide
 * which to merge. Read-only — does NOT modify anything.
 *
 * Heuristics:
 *  1) Normalized exact match (strip whitespace, lowercase Latin) → same scent
 *  2) One is a substring of the other (e.g., "גרין תה" vs "בבפנים גרין תה")
 *  3) Levenshtein distance <= 2 on normalized form (typos)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Scent, Device } = require('../src/models');

function norm(s) {
  return String(s || '')
    .replace(/[\s"'`׳״]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const scents = await Scent.find({}).lean();
  console.log(`סה"כ ריחות במערכת: ${scents.length}\n`);

  // Count device usage per scent
  const usageAgg = await Device.aggregate([
    { $match: { scentId: { $ne: null } } },
    { $group: { _id: '$scentId', count: { $sum: 1 } } }
  ]);
  const usage = new Map(usageAgg.map(u => [u._id.toString(), u.count]));

  // Bucket 1: same normalized form
  const buckets = new Map();
  for (const s of scents) {
    const k = norm(s.name);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }

  const exactDups = [...buckets.values()].filter(b => b.length > 1);
  if (exactDups.length) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`🟥 כפילויות מדויקות (אותו שם אחרי ניקוי): ${exactDups.length} קבוצות`);
    console.log('═══════════════════════════════════════════════════');
    for (const group of exactDups) {
      console.log('  קבוצה:');
      group.forEach(s => console.log(`    • "${s.name}" (id ${s._id}, שימוש ב-${usage.get(s._id.toString()) || 0} מכשירים)`));
      console.log();
    }
  }

  // Bucket 2: substring matches (one contains the other, neither in exact-dup set)
  const sortedByLen = scents.slice().sort((a, b) => norm(a.name).length - norm(b.name).length);
  const seenInSubstring = new Set();
  const substringDups = [];
  for (let i = 0; i < sortedByLen.length; i++) {
    const shortName = norm(sortedByLen[i].name);
    if (!shortName || shortName.length < 3) continue;
    for (let j = i + 1; j < sortedByLen.length; j++) {
      const longName = norm(sortedByLen[j].name);
      if (longName === shortName) continue; // exact dup
      if (longName.includes(shortName)) {
        const key = `${sortedByLen[i]._id}::${sortedByLen[j]._id}`;
        if (seenInSubstring.has(key)) continue;
        seenInSubstring.add(key);
        substringDups.push([sortedByLen[i], sortedByLen[j]]);
      }
    }
  }
  if (substringDups.length) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`🟧 שם אחד מכיל את השני (אולי גירסה מורחבת): ${substringDups.length} זוגות`);
    console.log('═══════════════════════════════════════════════════');
    for (const [a, b] of substringDups) {
      console.log(`  "${a.name}"  ⊂  "${b.name}"`);
      console.log(`    [${usage.get(a._id.toString()) || 0} מכשירים]  vs  [${usage.get(b._id.toString()) || 0} מכשירים]`);
    }
    console.log();
  }

  // Bucket 3: typos (lev distance 1-2)
  const fuzzyDups = [];
  for (let i = 0; i < scents.length; i++) {
    const a = norm(scents[i].name);
    if (a.length < 4) continue;
    for (let j = i + 1; j < scents.length; j++) {
      const b = norm(scents[j].name);
      if (b.length < 4) continue;
      if (a === b) continue;
      if (a.includes(b) || b.includes(a)) continue; // covered by substring bucket
      const d = lev(a, b);
      // Only report distance 1-2, and skip if the strings are very short
      if (d > 0 && d <= 2 && Math.max(a.length, b.length) >= 5) {
        fuzzyDups.push({ a: scents[i], b: scents[j], d });
      }
    }
  }
  if (fuzzyDups.length) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`🟨 דמיון גבוה (שגיאות כתיב אפשריות, מרחק 1-2 תווים): ${fuzzyDups.length} זוגות`);
    console.log('═══════════════════════════════════════════════════');
    fuzzyDups.sort((x, y) => x.d - y.d);
    for (const { a, b, d } of fuzzyDups) {
      console.log(`  d=${d}  "${a.name}"  ↔  "${b.name}"`);
      console.log(`    [${usage.get(a._id.toString()) || 0} מכשירים]  vs  [${usage.get(b._id.toString()) || 0} מכשירים]`);
    }
    console.log();
  }

  // Bucket 4: scents with zero usage (candidates for cleanup)
  const unused = scents.filter(s => !usage.has(s._id.toString()));
  if (unused.length) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`⚪ ריחות ללא שימוש בכלל (אפשר למחוק): ${unused.length}`);
    console.log('═══════════════════════════════════════════════════');
    unused.forEach(s => console.log(`    • "${s.name}"`));
    console.log();
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('סיכום:');
  console.log(`  סה"כ ריחות:           ${scents.length}`);
  console.log(`  כפילויות מדויקות:    ${exactDups.length} קבוצות`);
  console.log(`  קונטיינר/מוכל:        ${substringDups.length} זוגות`);
  console.log(`  דמיון גבוה:           ${fuzzyDups.length} זוגות`);
  console.log(`  ללא שימוש:            ${unused.length}`);
  console.log('═══════════════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
