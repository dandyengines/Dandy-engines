// Mirrors the STAGES list in public/jobs.js — kept separately here since
// the frontend file isn't require-able from a Netlify Function. Used to
// validate a user's chosen "alert me when a job moves to..." stage list.
const STAGE_IDS = [
  'notstarted', 'stripped', 'waitingparts', 'machining', 'dummyassembly',
  'readyforassembly', 'assembling', 'readyfordyno', 'awaitingpayment',
  'onhold', 'complete',
];

module.exports = { STAGE_IDS };
