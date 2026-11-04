// Background email worker: leases due jobs from PostgreSQL, sends via the mailer, records sent/retry/failed.
// Retry policy: up to max_attempts total tries (default 4 = first try + 3 retries) with exponential backoff.
const config = require('../config');
const { emailRepo } = require('../data/repositories');
const { sendViaResend } = require('./mailer');

const LEASE_SECONDS = 60;

/** Processes one batch. `send` is injectable for tests. Returns {sent, retried, failed}. */
async function processBatch(send = sendViaResend, batchSize = 10) {
  const result = { sent: 0, retried: 0, failed: 0 };
  const jobs = await emailRepo.claimDue(batchSize, LEASE_SECONDS);
  for (const job of jobs) {
    try {
      const r = await send({ to: job.to_email, subject: job.subject, html: job.html, text: job.text_body });
      await emailRepo.markSent(job.id, r && r.id);
      result.sent++;
    } catch (err) {
      const msg = String(err.message || err).slice(0, 500);
      if (job.attempts >= job.max_attempts) {
        await emailRepo.markFailed(job.id, msg);
        result.failed++;
      } else {
        const delay = Math.round((config.email.retryBaseMs * 2 ** (job.attempts - 1)) / 1000);
        await emailRepo.markRetry(job.id, msg, delay);
        result.retried++;
      }
    }
  }
  return result;
}

let timer = null;
function start(send) {
  if (timer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await processBatch(send); } catch (err) { console.error('[email-worker]', err.message); } finally { busy = false; }
  };
  timer = setInterval(tick, config.email.pollMs);
  timer.unref();
  console.log(`[email-worker] started (poll ${config.email.pollMs}ms, max ${config.email.maxAttempts} attempts)`);
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { processBatch, start, stop };
