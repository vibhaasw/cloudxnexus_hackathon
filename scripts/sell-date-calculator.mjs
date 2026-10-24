/**
 * Smart Warehouse IoT — Sell-Date Estimation Engine (TRD Section 6)
 *
 * Method:
 * 1. For a product, sort batches oldest first (arrived_at ASC, id ASC).
 * 2. Walk forward through forecast days (ordered by forecast_date ASC),
 *    subtracting daily demand from the oldest batch first (FIFO).
 * 3. A batch's estimated sell date is the day its quantity runs out (p50 demand).
 * 4. If a batch outlasts the forecast horizon, mark it as 'beyond_horizon'.
 * 5. expiry_risk is true when estimated sell date is later than simulated expiry date.
 * 6. Optional range: use p90 demand for earliest date and p10 for latest date.
 * 7. When no forecast rows exist: do not crash, mark status as 'unknown'.
 *
 * NOTE: Conveyor, parcel weights, and expiry dates are SIMULATED and labeled
 * as SIMULATED on all displays and documentation.
 */

/**
 * Calculates sell estimates for an array of batches given daily forecasts.
 *
 * @param {Array<{id: string, quantity: number, simulated_expiry_date: string, arrived_at: string}>} batches
 * @param {Array<{forecast_date: string, p10: number, p50: number, p90: number}>} forecasts
 * @param {{today?: string}} [options]
 * @returns {Map<string, {batch_id: string, estimated_sell_date: string|null, expiry_risk: boolean|null, status: 'calculated'|'beyond_horizon'|'unknown', range_earliest_date: string|null, range_latest_date: string|null, computed_at: string}>}
 */
export function calculateSellEstimates(batches, forecasts, options = {}) {
  const results = new Map();
  const nowIso = new Date().toISOString();

  if (!Array.isArray(batches) || batches.length === 0) {
    return results;
  }

  // 1. Sort batches oldest first (FIFO order)
  const sortedBatches = [...batches].sort((a, b) => {
    const timeA = new Date(a.arrived_at || 0).getTime();
    const timeB = new Date(b.arrived_at || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id).localeCompare(String(b.id));
  });

  // 2. Handle empty or missing forecasts gracefully
  if (!Array.isArray(forecasts) || forecasts.length === 0) {
    for (const b of sortedBatches) {
      results.set(b.id, {
        batch_id: b.id,
        estimated_sell_date: null,
        expiry_risk: null,
        status: 'unknown',
        range_earliest_date: null,
        range_latest_date: null,
        computed_at: nowIso,
      });
    }
    return results;
  }

  // 3. Filter & sort forecast days
  let relevantForecasts = [...forecasts].sort((a, b) =>
    String(a.forecast_date).localeCompare(String(b.forecast_date))
  );

  if (options.today) {
    const filtered = relevantForecasts.filter(f => f.forecast_date >= options.today);
    if (filtered.length > 0) {
      relevantForecasts = filtered;
    }
  }

  const maxForecastDate = relevantForecasts[relevantForecasts.length - 1].forecast_date;

  // 4. Precompute cumulative demand curves for p50 (median), p90 (high demand/earliest), p10 (low demand/latest)
  const cumP50 = [];
  const cumP90 = [];
  const cumP10 = [];
  let runP50 = 0;
  let runP90 = 0;
  let runP10 = 0;

  for (const f of relevantForecasts) {
    runP50 += Math.max(0, Number(f.p50) || 0);
    runP90 += Math.max(0, Number(f.p90) || 0);
    runP10 += Math.max(0, Number(f.p10) || 0);
    cumP50.push({ date: f.forecast_date, cum: runP50 });
    cumP90.push({ date: f.forecast_date, cum: runP90 });
    cumP10.push({ date: f.forecast_date, cum: runP10 });
  }

  // 5. Walk forward through batches and find depletion dates
  let cumBatchQty = 0;

  for (const b of sortedBatches) {
    const qty = Math.max(0, Number(b.quantity) || 0);
    cumBatchQty += qty;

    // Median sell date (p50)
    const p50Hit = cumP50.find(c => c.cum >= cumBatchQty);
    const estimated_sell_date = p50Hit ? p50Hit.date : null;

    // Earliest sell date (p90 demand depletes stock faster)
    const p90Hit = cumP90.find(c => c.cum >= cumBatchQty);
    const range_earliest_date = p90Hit ? p90Hit.date : null;

    // Latest sell date (p10 demand depletes stock slower)
    const p10Hit = cumP10.find(c => c.cum >= cumBatchQty);
    const range_latest_date = p10Hit ? p10Hit.date : null;

    let status = 'calculated';
    let expiry_risk = null;

    if (estimated_sell_date) {
      status = 'calculated';
      // expiry_risk is true when estimated sell date is later than simulated expiry date
      expiry_risk = String(estimated_sell_date) > String(b.simulated_expiry_date);
    } else {
      // Batch outlasts the forecast horizon
      status = 'beyond_horizon';
      // If simulated expiry date is within the forecast horizon, the batch will definitely expire before selling out
      if (b.simulated_expiry_date && String(b.simulated_expiry_date) <= maxForecastDate) {
        expiry_risk = true;
      } else {
        expiry_risk = null;
      }
    }

    results.set(b.id, {
      batch_id: b.id,
      estimated_sell_date,
      expiry_risk,
      status,
      range_earliest_date,
      range_latest_date,
      computed_at: nowIso,
    });
  }

  return results;
}
