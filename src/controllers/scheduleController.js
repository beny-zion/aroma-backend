const { Device, WorkOrder, Branch } = require('../models');

// Lazy-load @hebcal/core (ESM-only) and cache the module promise
let hebcalPromise = null;
function loadHebcal() {
  if (!hebcalPromise) hebcalPromise = import('@hebcal/core');
  return hebcalPromise;
}

// Returns null on regular days, or { name, type, isWorkBlocked } on holidays
async function getHolidayInfo(date) {
  const { HebrewCalendar, HDate, flags } = await loadHebcal();
  const events = HebrewCalendar.getHolidaysOnDate(new HDate(date), true) || [];
  if (events.length === 0) return null;

  // Pick the most "important" event (chag > erev > chol_hamoed > modern > minor)
  const ranked = events.slice().sort((a, b) => {
    const score = (e) => {
      const f = e.getFlags();
      if (f & flags.CHAG) return 6;
      if (f & flags.MODERN_HOLIDAY) return 5;
      if (f & flags.EREV) return 4;
      if (f & flags.CHOL_HAMOED) return 3;
      if (f & flags.MAJOR_FAST) return 2;
      if (f & flags.MINOR_FAST) return 1;
      return 0;
    };
    return score(b) - score(a);
  });
  const main = ranked[0];
  const f = main.getFlags();

  let type = 'minor';
  let isWorkBlocked = false;

  if (f & flags.CHAG) { type = 'chag'; isWorkBlocked = true; }
  else if (f & flags.MODERN_HOLIDAY) {
    // Yom HaAtzmaut is no-work; Yom HaShoah/HaZikaron are work days
    const desc = main.getDesc();
    if (desc.includes('HaAtzmaut') || desc.includes('Independence')) {
      type = 'modern_holiday';
      isWorkBlocked = true;
    } else {
      type = 'modern';
    }
  }
  else if (f & flags.EREV) type = 'erev_chag';
  else if (f & flags.CHOL_HAMOED) type = 'chol_hamoed';
  else if (f & flags.MAJOR_FAST) type = 'fast_major';
  else if (f & flags.MINOR_FAST) type = 'fast_minor';

  return {
    name: main.render('he'),
    type,
    isWorkBlocked
  };
}

// Format a Date to YYYY-MM-DD in local time (avoids UTC shift)
function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse YYYY-MM-DD as a local date (not UTC midnight)
function parseLocalDate(s) {
  if (!s) return new Date();
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// @desc    Suggest a weekly schedule grouped into city+region blocks
// @route   POST /api/schedule/suggest
// @access  admin / manager
const suggestSchedule = async (req, res) => {
  try {
    const {
      startDate,
      daysCount = 5,
      daysAhead = 30,
      maxBranchesPerDay = 30
    } = req.body;

    const start = startDate ? parseLocalDate(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + Number(daysAhead));
    const cap = Math.max(1, Number(maxBranchesPerDay));

    // 1. Find devices needing refill
    const devices = await Device.find({
      isActive: true,
      nextScheduledRefill: { $lte: horizon }
    }).populate('branchId', 'branchName city region address contactPerson contactPhone isActive');

    // 2. Group devices by branch
    const branchMap = new Map();
    for (const d of devices) {
      if (!d.branchId || !d.branchId.isActive) continue;
      const id = d.branchId._id.toString();
      if (!branchMap.has(id)) {
        branchMap.set(id, {
          branchId: d.branchId._id,
          branchName: d.branchId.branchName,
          city: (d.branchId.city || '').trim(),
          region: (d.branchId.region || '').trim(),
          address: d.branchId.address || '',
          contactPerson: d.branchId.contactPerson || '',
          contactPhone: d.branchId.contactPhone || '',
          deviceIds: [],
          devicesCount: 0
        });
      }
      const b = branchMap.get(id);
      b.deviceIds.push(d._id);
      b.devicesCount += 1;
    }

    // 3. Find ALL open routine_refill WOs (we'll show them as already-scheduled blocks)
    const branchIds = Array.from(branchMap.keys());
    const openOrders = await WorkOrder.find({
      type: 'routine_refill',
      status: { $in: ['pending', 'assigned', 'in_progress'] }
    })
      .populate('branchId', 'branchName city region address contactPerson contactPhone isActive')
      .populate('assignedTo', 'name')
      .lean();

    // Branches that have an open WO are not in the "needs scheduling" pool
    const branchesWithOpenWO = new Set(openOrders.map(o => o.branchId?._id?.toString()).filter(Boolean));
    for (const id of branchesWithOpenWO) {
      branchMap.delete(id);
    }
    const branches = Array.from(branchMap.values());

    // 4. Group branches into blocks by city+region
    // Block key: city|region. Label: "city - region" or just "city" if no region
    const blockMap = new Map();
    for (const b of branches) {
      const cityKey = b.city || 'ללא עיר';
      const regionKey = b.region || '';
      const key = `${cityKey}|${regionKey}`;
      if (!blockMap.has(key)) {
        const label = regionKey ? `${cityKey} - ${regionKey}` : cityKey;
        blockMap.set(key, {
          id: key,
          label,
          city: cityKey,
          region: regionKey,
          branches: [],
          devicesCount: 0
        });
      }
      const blk = blockMap.get(key);
      blk.branches.push(b);
      blk.devicesCount += b.devicesCount;
    }

    // 5. Auto-split blocks that exceed cap into "label (1)", "label (2)" ...
    let blocks = [];
    for (const blk of blockMap.values()) {
      if (blk.branches.length <= cap) {
        blocks.push(blk);
        continue;
      }
      // Split into chunks of `cap`
      let chunkIdx = 1;
      const totalChunks = Math.ceil(blk.branches.length / cap);
      for (let i = 0; i < blk.branches.length; i += cap) {
        const chunkBranches = blk.branches.slice(i, i + cap);
        blocks.push({
          id: `${blk.id}__split${chunkIdx}`,
          label: `${blk.label} (${chunkIdx}/${totalChunks})`,
          city: blk.city,
          region: blk.region,
          branches: chunkBranches,
          devicesCount: chunkBranches.reduce((s, b) => s + b.devicesCount, 0),
          isPartial: true
        });
        chunkIdx++;
      }
    }

    // 6. Sort blocks: same-city blocks together, then by branch count desc
    blocks.sort((a, b) => {
      if (a.city !== b.city) return a.city.localeCompare(b.city, 'he');
      return b.branches.length - a.branches.length;
    });

    // 7. Build empty days, with Hebrew calendar info per day
    const days = [];
    const dayByDate = new Map();
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const holiday = await getHolidayInfo(d);
      const day = {
        date: toLocalDateString(d),
        dayOfWeek: d.getDay(),
        blocks: [],
        branchesCount: 0,
        assignedTo: null,
        holiday
      };
      days.push(day);
      dayByDate.set(day.date, day);
    }

    // 7a. Place EXISTING open WOs into their current scheduledDate (if within window)
    // Each existing WO becomes a "locked" block with existingWorkOrderId
    const existingByDay = new Map(); // dayDate → list of {wo, block}
    for (const wo of openOrders) {
      if (!wo.branchId || !wo.branchId.isActive) continue;
      const woDateStr = toLocalDateString(new Date(wo.scheduledDate));
      const day = dayByDate.get(woDateStr);
      if (!day) continue; // outside the 5-day window — leave alone

      const cityKey = (wo.branchId.city || '').trim() || 'ללא עיר';
      const regionKey = (wo.branchId.region || '').trim();
      const blockId = `existing:${wo._id}`;
      const label = regionKey ? `${cityKey} - ${regionKey}` : cityKey;
      const block = {
        id: blockId,
        label,
        city: cityKey,
        region: regionKey,
        existingWorkOrderId: wo._id.toString(),
        originalAssignedTo: wo.assignedTo?._id?.toString() || null,
        originalDate: woDateStr,
        branches: [{
          branchId: wo.branchId._id,
          branchName: wo.branchId.branchName,
          city: cityKey,
          region: regionKey,
          address: wo.branchId.address || '',
          contactPerson: wo.branchId.contactPerson || '',
          contactPhone: wo.branchId.contactPhone || '',
          deviceIds: (wo.devices || []).map(d => d.deviceId).filter(Boolean),
          devicesCount: (wo.devices || []).length
        }],
        devicesCount: (wo.devices || []).length
      };
      day.blocks.push(block);
      day.branchesCount += 1;
      if (!existingByDay.has(day.date)) existingByDay.set(day.date, []);
      existingByDay.get(day.date).push(wo);
    }

    // 7b. For each day, derive assignedTo from existing WOs if all share the same tech
    for (const [dateKey, wos] of existingByDay) {
      const techIds = new Set(wos.map(w => w.assignedTo?._id?.toString()).filter(Boolean));
      if (techIds.size === 1) {
        dayByDate.get(dateKey).assignedTo = [...techIds][0];
      }
    }

    // 8. City-level placement: keep all blocks of the same city on the same day when possible.
    // Algorithm:
    //   a. Group blocks by city, compute city totals
    //   b. Sort cities by total branches desc (place biggest cities first)
    //   c. For each city:
    //      - If the whole city fits in a single day → place in the EMPTIEST day with room
    //        (this spreads cities across different days when there's slack)
    //      - Else → distribute blocks across days, preferring days already holding this city
    const overflow = [];
    const cityBlockMap = new Map();
    for (const blk of blocks) {
      if (!cityBlockMap.has(blk.city)) cityBlockMap.set(blk.city, []);
      cityBlockMap.get(blk.city).push(blk);
    }
    const cityTotals = new Map();
    for (const [city, cityBlocks] of cityBlockMap) {
      cityTotals.set(city, cityBlocks.reduce((s, b) => s + b.branches.length, 0));
    }
    const sortedCities = [...cityBlockMap.keys()].sort((a, b) => cityTotals.get(b) - cityTotals.get(a));

    for (const city of sortedCities) {
      const cityBlocks = cityBlockMap.get(city);
      const cityTotal = cityTotals.get(city);

      // Try to place the WHOLE city in one day (prefer emptiest day with room)
      if (cityTotal <= cap) {
        const dayForWholeCity = days
          .filter(d => !d.holiday?.isWorkBlocked && d.branchesCount + cityTotal <= cap)
          .sort((a, b) => a.branchesCount - b.branchesCount)[0];

        if (dayForWholeCity) {
          for (const blk of cityBlocks) {
            dayForWholeCity.blocks.push(blk);
            dayForWholeCity.branchesCount += blk.branches.length;
          }
          continue;
        }
      }

      // City too large for one day, OR no day has room → place block-by-block,
      // preferring days that already hold this city (keeps city consecutive)
      for (const blk of cityBlocks) {
        const sameCityDay = days.find(d =>
          !d.holiday?.isWorkBlocked &&
          d.blocks.some(b => b.city === city) &&
          d.branchesCount + blk.branches.length <= cap
        );
        if (sameCityDay) {
          sameCityDay.blocks.push(blk);
          sameCityDay.branchesCount += blk.branches.length;
          continue;
        }
        const fallback = days
          .filter(d => !d.holiday?.isWorkBlocked && d.branchesCount + blk.branches.length <= cap)
          .sort((a, b) => a.branchesCount - b.branchesCount)[0];
        if (fallback) {
          fallback.blocks.push(blk);
          fallback.branchesCount += blk.branches.length;
        } else {
          overflow.push(blk);
        }
      }
    }

    // 9. Within each day, sort blocks by city for visual stability
    for (const d of days) {
      d.blocks.sort((a, b) => a.city.localeCompare(b.city, 'he'));
    }

    const existingCount = openOrders.filter(o => {
      const dateStr = toLocalDateString(new Date(o.scheduledDate));
      return dayByDate.has(dateStr);
    }).length;

    res.json({
      days,
      overflow,
      summary: {
        totalBranches: branches.length + existingCount,
        totalDevices: branches.reduce((s, b) => s + b.devicesCount, 0),
        totalBlocks: blocks.length + existingCount,
        scheduledBlocks: blocks.length - overflow.length + existingCount,
        existingBlocks: existingCount,
        newBlocks: blocks.length - overflow.length,
        overflowBlocks: overflow.length,
        cap,
        horizonDate: toLocalDateString(horizon)
      }
    });
  } catch (error) {
    console.error('suggestSchedule error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Save schedule → bulk-create work orders
// @route   POST /api/schedule/save
// @access  admin / manager
const saveSchedule = async (req, res) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ message: 'מבנה ימים לא תקין' });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const day of days) {
      // Support both new shape (blocks) and legacy (branches directly)
      const blocksInDay = Array.isArray(day.blocks) ? day.blocks : [];
      const legacyBranches = Array.isArray(day.branches) ? day.branches : [];

      // Existing-WO blocks → UPDATE (date + tech) if changed
      for (const blk of blocksInDay) {
        if (blk.existingWorkOrderId) {
          const wo = await WorkOrder.findById(blk.existingWorkOrderId);
          if (!wo) { skipped++; continue; }

          // Block in_progress from being moved (technician already at work)
          if (wo.status === 'in_progress') { skipped++; continue; }

          const updates = {};
          const newDateStr = day.date;
          const oldDateStr = toLocalDateString(new Date(wo.scheduledDate));
          if (oldDateStr !== newDateStr) {
            updates.scheduledDate = parseLocalDate(newDateStr);
          }
          const newTech = day.assignedTo || null;
          const oldTech = wo.assignedTo?.toString() || null;
          if (newTech !== oldTech) {
            updates.assignedTo = newTech || undefined;
            // Auto-adjust status: if a tech is now assigned and was pending → assigned;
            // if no tech and was assigned → pending
            if (newTech && wo.status === 'pending') updates.status = 'assigned';
            if (!newTech && wo.status === 'assigned') updates.status = 'pending';
          }

          if (Object.keys(updates).length > 0) {
            await WorkOrder.findByIdAndUpdate(wo._id, updates);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // New block → CREATE
        for (const branch of (blk.branches || [])) {
          const existing = await WorkOrder.findOne({
            branchId: branch.branchId,
            type: 'routine_refill',
            status: { $in: ['pending', 'assigned', 'in_progress'] }
          });
          if (existing) { skipped++; continue; }

          const devices = (branch.deviceIds || []).map(deviceId => ({
            deviceId,
            taskDescription: 'מילוי שוטף'
          }));

          await WorkOrder.create({
            branchId: branch.branchId,
            assignedTo: day.assignedTo || undefined,
            createdBy: req.user._id,
            scheduledDate: parseLocalDate(day.date),
            status: day.assignedTo ? 'assigned' : 'pending',
            type: 'routine_refill',
            devices,
            notes: 'נוצר מתוך מסלול שבועי'
          });
          created++;
        }
      }

      // Legacy support (no blocks)
      for (const branch of legacyBranches) {
        const existing = await WorkOrder.findOne({
          branchId: branch.branchId,
          type: 'routine_refill',
          status: { $in: ['pending', 'assigned', 'in_progress'] }
        });
        if (existing) { skipped++; continue; }
        const devices = (branch.deviceIds || []).map(deviceId => ({
          deviceId,
          taskDescription: 'מילוי שוטף'
        }));
        await WorkOrder.create({
          branchId: branch.branchId,
          assignedTo: day.assignedTo || undefined,
          createdBy: req.user._id,
          scheduledDate: parseLocalDate(day.date),
          status: day.assignedTo ? 'assigned' : 'pending',
          type: 'routine_refill',
          devices,
          notes: 'נוצר מתוך מסלול שבועי'
        });
        created++;
      }
    }

    const parts = [];
    if (created > 0) parts.push(`${created} חדשות`);
    if (updated > 0) parts.push(`${updated} עודכנו`);
    res.status(201).json({
      message: parts.length > 0 ? `נשמר: ${parts.join(', ')}` : 'אין שינויים לשמירה',
      count: created + updated,
      created,
      updated,
      skipped
    });
  } catch (error) {
    console.error('saveSchedule error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { suggestSchedule, saveSchedule };
