// Children's Service — one place for the few settings pages share.
window.KIDS_CONFIG = {
  schema: 'children_service',
  base: '/faith/children-service',
  // The first (and for now only) church. Other churches later get their own slug.
  churchSlug: 'inspire',
  // Wording version recorded with every consent. INTERIM copy, not yet
  // legally reviewed — bump this string whenever the wording changes so
  // the audit trail shows which text a parent actually agreed to.
  policyVersion: 'interim-2026-09-19',
  // How many minutes before a class the join link becomes available
  // (mirrors get_join_info() in children_service_schema.sql).
  joinOpensMinutesBefore: 30,
  // ...and how long after a class is due to end it stays reachable (overruns,
  // late families). Mirrors schema v3; 30 minutes was too long.
  joinStaysOpenMinutesAfter: 10
};
