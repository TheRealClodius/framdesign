import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx tsx scripts/hash-password.ts <password>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log('\nGenerated hash:');
console.log(hash);
console.log('\nSet this as OBSERVABILITY_PASSWORD_HASH in your environment.');
