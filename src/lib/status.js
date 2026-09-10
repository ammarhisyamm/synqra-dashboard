export function statusFor(review) {
  if (review.status) return review.status;
  if (review.stage === 'Completed') return 'Resolved';
  if (review.stage === 'Final') return 'Review';
  if (review.stage === 'In Progress') return 'In Progress';
  return 'Open';
}
