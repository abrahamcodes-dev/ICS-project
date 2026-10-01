function parseArgs(args) {
  const options = { dryRun: true };
  const keys = { '--project': 'projectId', '--uid': 'uid', '--full-name': 'fullName', '--operator': 'operator' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error('Duplicate argument.');
    seen.add(flag);
    if (flag === '--apply' || flag === '--dry-run') {
      if (seen.has('--apply') && seen.has('--dry-run')) throw new Error('Conflicting modes.');
      options.dryRun = flag !== '--apply';
    } else if (keys[flag] && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[keys[flag]] = args[++i];
    } else throw new Error('Unknown argument or missing value.');
  }
  if (!options.projectId || !options.uid || !options.fullName || !options.operator)
    throw new Error('Required: --project ID --uid UID --full-name NAME --operator OPERATOR; optional --apply or --dry-run.');
  return options;
}
function transactionAdapter(db) {
  return (uid, decide, dryRun, audit) => db.runTransaction(async tx => {
    const ref = db.collection('users').doc(uid);
    const snapshot = await tx.get(ref);
    const plan = decide(snapshot.exists ? snapshot.data() : null);
    if (!dryRun && plan.action === 'create') {
      tx.create(ref, plan.identity);
      tx.create(db.collection('administratorProvisioningAudit').doc(), audit);
    }
    return plan;
  });
}
async function main() {
  const { provisionAdministrator } = require('../lib/auth/adminProvisioning');
  const options = parseArgs(process.argv.slice(2));
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('CLI refuses emulator overrides; use injected tests.');
  const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: options.projectId, credential: applicationDefault() }, 'operator-provisioning');
  try {
    const plan = await provisionAdministrator(options, {
      getUser: uid => getAuth(app).getUser(uid), now: () => new Date().toISOString(),
      transact: transactionAdapter(getFirestore(app)),
    });
    console.log(JSON.stringify({ projectId: options.projectId, uid: options.uid, dryRun: options.dryRun, action: plan.action }));
  } finally { await deleteApp(app); }
}
module.exports = { parseArgs, transactionAdapter };
if (require.main === module) main().catch(() => {
  console.error('Provisioning failed. Check explicit arguments, target account, identity conflicts, and operator IAM credentials. Credential values are not logged.');
  process.exitCode = 1;
});
