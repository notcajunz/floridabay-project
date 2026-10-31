import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from 'discord.js';
import { createBanApproval, reviewRow, reviewedEmbed, REVIEW_PREFIX } from '../src/ban-approval.js';

const RANKS = { low: 100, mid: 500, high: 900, owner: Infinity, nobody: -1 };

function setup(row) {
  const cases = { 1: { id: 1, ban_id: 'FB-123456', guild_id: 'global', action: 'ban', actor_id: 'mid', target_id: 't1', active: 1, approval_status: 'pending', ...row } };
  const calls = { reverted: [], audits: [], edits: [], replies: [], followUps: [] };
  const db = {
    async one(sql, [id]) { return cases[id] || null; },
    async query(sql, args) {
      if (sql.includes("approval_status=? WHERE id=? AND approval_status='pending'")) {
        const c = cases[args[1]];
        if (c.approval_status !== 'pending') return { affectedRows: 0 };
        c.approval_status = args[0];
        return { affectedRows: 1 };
      }
      if (sql.includes('SET approval_status=?,approval_by=?,approval_at=?')) {
        const c = cases[args[3]];
        Object.assign(c, { approval_status: args[0], approval_by: args[1], approval_at: args[2] });
        if (sql.includes('active=FALSE')) c.active = 0;
        return { affectedRows: 1 };
      }
      if (sql.includes("approval_status='pending',log_channel_id")) {
        Object.assign(cases[args[2]], { approval_status: 'pending', log_channel_id: args[0], log_message_id: args[1] });
        return { affectedRows: 1 };
      }
      if (sql.includes("approval_status='pending' WHERE id=?")) { cases[args[0]].approval_status = 'pending'; return { affectedRows: 1 }; }
      if (sql.includes("approval_status='approved',approval_by=?")) { Object.assign(cases[args[2]], { approval_status: 'approved', approval_by: args[0] }); return { affectedRows: 1 }; }
      throw new Error(`unexpected sql ${sql}`);
    },
  };
  let revertError = null;
  const approval = createBanApproval({
    db,
    audit: async (...a) => calls.audits.push(a),
    rankOf: async (id) => RANKS[id] ?? -1,
    revert: async (...a) => { if (revertError) throw revertError; calls.reverted.push(a); return ['✓ unbanned']; },
  });
  const interaction = (action, user) => ({
    customId: `${REVIEW_PREFIX}${action}:1`,
    user: { id: user, tag: `${user}#0` },
    message: { embeds: [new EmbedBuilder().setTitle('FB-123456 · Ban').addFields({ name: 'Status', value: 'Active' }, { name: 'Review', value: 'pending' }).toJSON()], edit: async (body) => { calls.edits.push(body); } },
    reply: async (body) => { calls.replies.push(body.content); },
    deferUpdate: async () => {},
    followUp: async (body) => { calls.followUps.push(body.content); },
  });
  return { cases, calls, approval, interaction, failRevert: (error) => { revertError = error; } };
}

test('log entries get Approve and Deny buttons that carry the case id', () => {
  const row = reviewRow(42).toJSON();
  assert.deepEqual(row.components.map((b) => [b.label, b.custom_id]), [['Approve', 'banreview:approve:42'], ['Deny', 'banreview:deny:42']]);
});

test('bot owners are auto-approved and everyone else gets buttons', async () => {
  const { approval, cases } = setup();
  const owner = await approval.prepare(1, 'owner', { title: 'x', fields: [['Reason', 'r']] });
  assert.equal(owner.entry.components, undefined);
  assert.match(owner.entry.fields.at(-1)[1], /Auto-approved/);
  assert.equal(cases[1].approval_status, 'approved');

  const staff = await approval.prepare(1, 'mid', { title: 'x', fields: [['Reason', 'r']] });
  assert.equal(staff.entry.components.length, 1);
  assert.match(staff.entry.fields.at(-1)[1], /Awaiting approval/);
  await staff.after({ channelId: 'c1', id: 'm1' });
  assert.equal(cases[1].approval_status, 'pending');
  assert.equal(cases[1].log_message_id, 'm1');
});

test('only a higher rank than the issuer may approve or deny', async () => {
  for (const reviewer of ['low', 'mid', 'nobody']) {
    const { approval, interaction, calls, cases } = setup();
    await approval.component(interaction('deny', reviewer));
    assert.equal(calls.reverted.length, 0, `${reviewer} must not revert`);
    assert.equal(cases[1].approval_status, 'pending');
    assert.match(calls.replies[0], /higher rank|Only staff|cannot review/);
    assert.equal(calls.edits.length, 0);
  }
});

test('approving keeps the punishment and edits the embed', async () => {
  const { approval, interaction, calls, cases } = setup();
  await approval.component(interaction('approve', 'high'));
  assert.equal(cases[1].approval_status, 'approved');
  assert.equal(cases[1].approval_by, 'high');
  assert.equal(cases[1].active, 1);
  assert.equal(calls.reverted.length, 0);
  const edit = calls.edits[0];
  assert.deepEqual(edit.components, []);
  assert.match(edit.embeds[0].data.fields.find((f) => f.name === 'Review').value, /Approved by <@high>/);
  assert.equal(calls.audits[0][1], 'moderation.ban_approved');
});

test('denying reverts the punishment, deactivates it and edits the embed', async () => {
  const { approval, interaction, calls, cases } = setup();
  await approval.component(interaction('deny', 'high'));
  assert.equal(calls.reverted.length, 1);
  assert.equal(calls.reverted[0][0].id, 1);
  assert.equal(cases[1].approval_status, 'denied');
  assert.equal(cases[1].active, 0);
  const fields = calls.edits[0].embeds[0].data.fields;
  assert.match(fields.find((f) => f.name === 'Review').value, /Denied by <@high>.*reverted/);
  assert.equal(fields.find((f) => f.name === 'Status').value, 'Reverted (denied)');
  assert.deepEqual(calls.edits[0].components, []);
  assert.equal(calls.audits[0][1], 'moderation.ban_denied');
});

test('a failed revert leaves the case pending and unchanged', async () => {
  const { approval, interaction, calls, cases, failRevert } = setup();
  failRevert(new Error('FiveM could not lift the linked game ban'));
  await approval.component(interaction('deny', 'high'));
  assert.equal(cases[1].approval_status, 'pending');
  assert.equal(cases[1].active, 1);
  assert.equal(calls.edits.length, 0);
  assert.match(calls.followUps[0], /nothing was changed/);
});

test('an already reviewed case cannot be reviewed again', async () => {
  const { approval, interaction, calls } = setup({ approval_status: 'approved', approval_by: 'high', approval_at: Date.now() });
  await approval.component(interaction('deny', 'owner'));
  assert.equal(calls.reverted.length, 0);
  assert.match(calls.replies[0], /Already approved/);
});

test('reviewedEmbed appends a Review field when none exists', () => {
  const embed = reviewedEmbed(new EmbedBuilder().setTitle('t').addFields({ name: 'Reason', value: 'r' }).toJSON(), 'approved', 'u1', 1700000000000);
  assert.equal(embed.data.fields.at(-1).name, 'Review');
});

test('bans and blacklists are logged for review and the buttons are routed', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../../../server-data/resources/[fbrp]/fbrp_core/migrations/097_ban_review.sql', import.meta.url), 'utf8');
  assert.match(main, /i\.customId\.startsWith\(REVIEW_PREFIX\)/);
  assert.match(main, /logForReview\(i\.guild, modEntry, "bans"/);
  assert.match(main, /logForReview\(ban\.guild, nativeEntry, "bans"/);
  assert.match(main, /if \(review && \["ban", "blacklist"\]\.includes\(action\)\) await logForReview/);
  assert.match(main, /publishGlobalCase\(c, results, gameBanId, true\)/);
  assert.match(main, /publishGlobalCase\(c, results, null, true\)/);
  // Alt bans derived from a ban follow it and carry no buttons of their own.
  assert.doesNotMatch(main, /globalCase\(alt\.discordId, actorId, "ban", why, durationMs, results, gameBanId, true\)/);
  for (const column of ['approval_status', 'approval_by', 'approval_at', 'log_channel_id', 'log_message_id']) assert.match(sql, new RegExp(column));
  // The migration runner splits on semicolons, so comments must not contain any.
  assert.equal([...sql.split('\n').filter((line) => line.startsWith('--'))].filter((line) => line.includes(';')).length, 0);
});
