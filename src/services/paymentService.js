// SIMULATED payments for a student project. There is no bank/card/payment-provider integration.
// No card data is accepted or stored anywhere: only the chosen method and a "paid_simulated" marker.
const { paymentRepo } = require('../data/repositories');

/** Decides the order's payment status for the chosen method (pure). */
function statusFor(method) {
  return method === 'simulated_online' ? 'paid_simulated' : 'unpaid';
}

async function recordSimulatedPayment(orderId, amountCents, client) {
  await paymentRepo.insertSimulated(orderId, amountCents, client);
}

module.exports = { statusFor, recordSimulatedPayment };
