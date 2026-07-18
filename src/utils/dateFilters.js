export const DATE_TIMEFRAMES = [
  'All Time',
  'Custom Range',
  'This Month',
  'Last Month',
  'This Year',
];

export function parseAnyDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();
  if (!cleaned) return null;

  // Check if DD/MM/YY or DD/MM/YYYY (contains slash or dot)
  if (cleaned.includes('/') || cleaned.includes('.')) {
    const parts = cleaned.split(/[\/\.]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      let year = parseInt(parts[2], 10);
      if (year < 100) {
        year = year + 2000; // e.g. 26 -> 2026
      }
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Check if YYYY-MM-DD (contains hyphen)
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

export function filterReceiptsByDate(receipts, timeframe, customStart, customEnd) {
  if (!receipts || !Array.isArray(receipts)) return [];
  if (!timeframe || timeframe === 'All Time') return receipts;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  return receipts.filter((r) => {
    if (!r.date) return false;
    const receiptDate = parseAnyDate(r.date);
    if (!receiptDate) return false;

    if (timeframe === 'Custom Range') {
      if (!customStart && !customEnd) return true;
      const start = parseAnyDate(customStart);
      const end = parseAnyDate(customEnd);

      if (start && end) {
        // Set end date to end of day so inclusive of the entire end date
        const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
        return receiptDate >= start && receiptDate <= endOfDay;
      } else if (start) {
        return receiptDate >= start;
      } else if (end) {
        const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
        return receiptDate <= endOfDay;
      }
      return true;
    }

    if (timeframe === 'This Month') {
      return (
        receiptDate.getFullYear() === currentYear &&
        receiptDate.getMonth() === currentMonth
      );
    }

    if (timeframe === 'Last Month') {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      return (
        receiptDate.getFullYear() === lastMonthDate.getFullYear() &&
        receiptDate.getMonth() === lastMonthDate.getMonth()
      );
    }

    if (timeframe === 'Last 3 Months') {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return receiptDate >= threeMonthsAgo && receiptDate <= now;
    }

    if (timeframe === 'This Year') {
      return receiptDate.getFullYear() === currentYear;
    }

    return true;
  });
}
