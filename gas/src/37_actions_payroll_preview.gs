(function initPayrollPreviewActions_() {
  const DEFAULT_DAYS = 14;
  const MAX_DAYS = 60;
  const DEFAULT_TZ = 'Europe/Moscow';

  const DEFAULT_SHIFTS = [
    { key: 'shift_1', label: 'Shift 1' },
    { key: 'shift_2', label: 'Shift 2' },
    { key: 'shift_3', label: 'Shift 3' },
  ];

  const DEFAULT_RATES = {
    inventory_moves_qty: 1,
    picking_confirmed_lines: 5,
    batches_created: 50,
    incidents_closed: 10,
    incidents_opened: 0,
    inventory_moves_count: 0,
  };

  Actions_.register_('payroll.preview.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const tz = normalizeTz_(payload.tz);
    const window = normalizeWindow_(payload, tz);
    const shifts = DEFAULT_SHIFTS.slice();

    const rows = safeReadAll_(SHEET.KPI_DAILY);
    const rowsByKey = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const date = normalizeIsoDate_(row.date || row.day || row.day_key || row.business_date);
      const shiftKey = normalizeShiftKey_(row.shift_key || row.shift || row.shiftId);
      if (!date || !shiftKey) continue;
      rowsByKey[date + '|' + shiftKey] = row;
    }

    const tariffInfo = readTariffs_();
    const rateMap = tariffInfo.map;
    const rateItems = Object.keys(rateMap)
      .sort()
      .map((metricKey) => ({ metric_key: metricKey, rub_per_unit: rateMap[metricKey] }));

    const dates = buildDateRange_(window.from_date, window.to_date);
    const series = [];
    let totalPayRub = 0;
    let shiftsWithReports = 0;
    let shiftsMissingReports = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      for (let j = 0; j < shifts.length; j++) {
        const shiftKey = shifts[j].key;
        const source = rowsByKey[date + '|' + shiftKey] || null;
        const reportPresent = !!source;

        if (!reportPresent) {
          shiftsMissingReports += 1;
          series.push({
            date,
            shift_key: shiftKey,
            report_present: false,
            pay_rub: 0,
            reason: 'no_report_no_pay',
            breakdown: {
              items: [],
              total_rub: 0,
            },
          });
          continue;
        }

        shiftsWithReports += 1;
        const metrics = parseMetrics_(source.metrics);
        const breakdownItems = [];
        let shiftTotal = 0;

        const metricKeys = Object.keys(rateMap).sort();
        for (let k = 0; k < metricKeys.length; k++) {
          const metricKey = metricKeys[k];
          const qty = asNumber_(metrics[metricKey], 0);
          const rate = asNumber_(rateMap[metricKey], 0);
          const amount = qty * rate;

          breakdownItems.push({
            metric_key: metricKey,
            qty,
            rate_rub: rate,
            amount_rub: amount,
          });

          shiftTotal += amount;
        }

        totalPayRub += shiftTotal;
        series.push({
          date,
          shift_key: shiftKey,
          report_present: true,
          pay_rub: shiftTotal,
          reason: null,
          metrics,
          breakdown: {
            items: breakdownItems,
            total_rub: shiftTotal,
          },
        });
      }
    }

    return {
      ok: true,
      generated_at: nowIso_(),
      tz,
      window: {
        from_date: window.from_date,
        to_date: window.to_date,
        days: window.days,
      },
      shifts,
      rates: {
        source: tariffInfo.source,
        currency: 'RUB',
        items: rateItems,
      },
      series,
      totals: {
        pay_rub: totalPayRub,
        shifts_with_reports: shiftsWithReports,
        shifts_missing_reports: shiftsMissingReports,
      },
    };
  });

  function readTariffs_() {
    const defaultsMap = cloneMap_(DEFAULT_RATES);
    const rows = safeReadAll_(SHEET.TARIFFS);
    if (!rows.length) {
      return { source: 'defaults', map: defaultsMap };
    }

    const mapped = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const metricKey = asString_(row.metric_key || row.metric || row.key);
      if (!metricKey) continue;

      const rawRate = row.rub_per_unit;
      const rate = Number(rawRate);
      if (!Number.isFinite(rate)) continue;
      mapped[metricKey] = rate;
    }

    if (!Object.keys(mapped).length) {
      return { source: 'defaults', map: defaultsMap };
    }

    const merged = cloneMap_(defaultsMap);
    const keys = Object.keys(mapped);
    for (let i = 0; i < keys.length; i++) {
      merged[keys[i]] = mapped[keys[i]];
    }

    return { source: 'tariffs', map: merged };
  }

  function cloneMap_(input) {
    const out = {};
    const keys = Object.keys(input || {});
    for (let i = 0; i < keys.length; i++) {
      out[keys[i]] = asNumber_(input[keys[i]], 0);
    }
    return out;
  }

  function parseMetrics_(raw) {
    let obj = raw;
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) {
        try {
          obj = JSON.parse(text);
        } catch (_err) {
          obj = {};
        }
      }
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return {};
    }

    const out = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = asNumber_(obj[key], 0);
      out[key] = value;
    }

    return out;
  }

  function normalizeWindow_(payload, tz) {
    const fromDateRaw = asString_(payload.from_date);
    const toDateRaw = asString_(payload.to_date);

    if (fromDateRaw && toDateRaw) {
      const fromDate = normalizeIsoDate_(fromDateRaw);
      const toDate = normalizeIsoDate_(toDateRaw);
      if (fromDate && toDate && fromDate <= toDate) {
        const dates = buildDateRange_(fromDate, toDate);
        const clamped = dates.slice(-MAX_DAYS);
        return {
          from_date: clamped[0] || fromDate,
          to_date: clamped[clamped.length - 1] || toDate,
          days: clamped.length || 1,
        };
      }
    }

    const days = normalizeDays_(payload.days);
    const dayKeys = buildDayKeys_(days, tz);
    const fromDate = dayKeys.length ? dayKeys[0] : formatDay_(new Date(), tz);
    const toDate = dayKeys.length ? dayKeys[dayKeys.length - 1] : fromDate;

    return {
      from_date: fromDate,
      to_date: toDate,
      days,
    };
  }

  function normalizeDays_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
    return Math.min(Math.floor(parsed), MAX_DAYS);
  }

  function normalizeTz_(raw) {
    const text = asString_(raw);
    return text || DEFAULT_TZ;
  }

  function normalizeShiftKey_(raw) {
    const text = asString_(raw).toLowerCase();
    if (text === 'shift_1' || text === 'shift_2' || text === 'shift_3') {
      return text;
    }
    return '';
  }

  function normalizeIsoDate_(raw) {
    const text = asString_(raw);
    if (!text) return '';

    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match && match[1]) {
      return match[1];
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function buildDateRange_(fromIsoDate, toIsoDate) {
    const start = new Date(fromIsoDate + 'T00:00:00.000Z');
    const end = new Date(toIsoDate + 'T00:00:00.000Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      return [];
    }

    const dates = [];
    for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (dates.length >= MAX_DAYS) break;
    }
    return dates;
  }

  function buildDayKeys_(days, tz) {
    const dates = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      dates.push(formatDay_(new Date(now.getTime() - i * 24 * 60 * 60 * 1000), tz));
    }
    return dates;
  }

  function formatDay_(date, tz) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || DEFAULT_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const parts = formatter.formatToParts(date);
      const byType = {};
      for (let i = 0; i < parts.length; i++) {
        byType[parts[i].type] = parts[i].value;
      }
      if (byType.year && byType.month && byType.day) {
        return byType.year + '-' + byType.month + '-' + byType.day;
      }
    } catch (_err) {
      // fallback below
    }

    return date.toISOString().slice(0, 10);
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function asString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function asNumber_(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }
})();
