export const DATE_TIMEFRAMES = [
  'All Time',
  'This Month',
  'Last Month',
  'Last 3 Months',
  'This Year',
];

export function filterReceiptsByDate(receipts, timeframe) {
  if (!receipts || !Array.isArray(receipts)) return [];
  if (!timeframe || timeframe === 'All Time') return receipts;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  return receipts.filter((r) => {
    if (!r.date) return false;
    const parts = String(r.date).split('-');
    let receiptDate;
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      receiptDate = new Date(year, month, day);
    } else {
      receiptDate = new Date(r.date);
    }

    if (isNaN(receiptDate.getTime())) return false;

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
