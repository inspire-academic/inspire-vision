// Unit coverage for the pure grouping/health logic in
// notify-mentor-staleness.js — no live Supabase/Resend connection
// needed, since that logic is extracted into a pure, exported function
// specifically so it can be tested this way (see that file's own
// comment on groupStaleAssignmentsByMentor). This is the only spec in
// this suite that doesn't drive a browser; @playwright/test's own
// test()/expect() work fine for a plain Node assertion like this, so
// there's no need for a second test runner just for one function.
const { test, expect } = require('@playwright/test');
const { groupStaleAssignmentsByMentor } = require('../netlify/functions/notify-mentor-staleness');

const NOW = Date.parse('2026-09-07T12:00:00Z');
const daysAgo = n => new Date(NOW - n * 86400000).toISOString();

test.describe('notify-mentor-staleness — groupStaleAssignmentsByMentor', () => {
  test('excludes a student active within the last 14 days (green)', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Liam Chen' }];
    const checkins = [{ student_id: 's1', created_at: daysAgo(3) }];
    const result = groupStaleAssignmentsByMentor(assignments, [], [], checkins, NOW);
    expect(result.size).toBe(0);
  });

  test('flags a student 15-30 days quiet as amber', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Elisha A' }];
    const messages = [{ student_id: 's1', created_at: daysAgo(18) }];
    const result = groupStaleAssignmentsByMentor(assignments, [], messages, [], NOW);
    expect(result.get('m1')).toEqual([{ name: 'Elisha A', health: 'amber' }]);
  });

  test('flags a student with no activity at all as red, even before any 30-day threshold', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Jordan Reyes' }];
    const result = groupStaleAssignmentsByMentor(assignments, [], [], [], NOW);
    expect(result.get('m1')).toEqual([{ name: 'Jordan Reyes', health: 'red' }]);
  });

  test('flags a student over 30 days quiet as red', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Nathan John' }];
    const messages = [{ student_id: 's1', created_at: daysAgo(40) }];
    const result = groupStaleAssignmentsByMentor(assignments, [], messages, [], NOW);
    expect(result.get('m1')).toEqual([{ name: 'Nathan John', health: 'red' }]);
  });

  test('takes the most recent of session/message/check-in, not just one source', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Amara Okafor' }];
    const sessions = [{ student_id: 's1', scheduled_at: daysAgo(40) }];
    const messages = [{ student_id: 's1', created_at: daysAgo(5) }]; // more recent — should win
    const result = groupStaleAssignmentsByMentor(assignments, sessions, messages, [], NOW);
    expect(result.size).toBe(0); // 5 days -> green -> excluded
  });

  test('groups multiple stale mentees under the same mentor, and only that mentor', () => {
    const assignments = [
      { mentor_id: 'm1', student_id: 's1', student_name: 'Jordan Reyes' }, // no activity -> red
      { mentor_id: 'm1', student_id: 's2', student_name: 'Amara Okafor' }, // 20d -> amber
      { mentor_id: 'm2', student_id: 's3', student_name: 'Liam Chen' },    // 3d -> green, excluded
    ];
    const messages = [{ student_id: 's2', created_at: daysAgo(20) }];
    const checkins = [{ student_id: 's3', created_at: daysAgo(3) }];
    const result = groupStaleAssignmentsByMentor(assignments, [], messages, checkins, NOW);

    expect([...result.keys()]).toEqual(['m1']);
    expect(result.get('m1')).toEqual([
      { name: 'Jordan Reyes', health: 'red' },
      { name: 'Amara Okafor', health: 'amber' },
    ]);
  });

  test('a mentor with zero stale mentees produces no entry at all', () => {
    const assignments = [{ mentor_id: 'm1', student_id: 's1', student_name: 'Liam Chen' }];
    const checkins = [{ student_id: 's1', created_at: daysAgo(1) }];
    const result = groupStaleAssignmentsByMentor(assignments, [], [], checkins, NOW);
    expect(result.has('m1')).toBe(false);
  });
});
