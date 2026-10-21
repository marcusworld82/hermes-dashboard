/** Keep private test contacts out of prospect promotion and outreach. */
export function isTestContact(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return !!normalized && (process.env.MARCUS_TEST_CONTACT_EMAILS || '')
    .split(',').some(value => value.trim().toLowerCase() === normalized);
}
