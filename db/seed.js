// Seed a bootstrap newsroom + admin user for local development.
// Idempotent — safe to re-run. Run via: npm run seed
//
// In production, real newsrooms come from Airtable sync (Step 3 onwards) and
// real users are invited by admins. This seed is for local dev only.

const { pool } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

const TEST_NEWSROOM = {
  airtable_record_id: 'recLOCAL_DEV',
  name: 'Local Dev Newsroom',
  country: 'ZA',
  status: 'pilot',
};

const TEST_ADMIN = {
  email: 'admin@anchor.local',
  password: 'changeme123',
  role: 'admin',
};

async function main() {
  console.log('Seeding local dev newsroom + admin user…\n');

  const nr = await pool.query(
    `INSERT INTO newsrooms (airtable_record_id, name, country, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       name = EXCLUDED.name,
       country = EXCLUDED.country,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING id, name`,
    [
      TEST_NEWSROOM.airtable_record_id,
      TEST_NEWSROOM.name,
      TEST_NEWSROOM.country,
      TEST_NEWSROOM.status,
    ]
  );
  const newsroomId = nr.rows[0].id;
  console.log(`✓ Newsroom: ${nr.rows[0].name} (${newsroomId})`);

  const passwordHash = await hashPassword(TEST_ADMIN.password);
  await pool.query(
    `INSERT INTO users (newsroom_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (newsroom_id, email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = NOW()`,
    [newsroomId, TEST_ADMIN.email, passwordHash, TEST_ADMIN.role]
  );
  console.log(`✓ Admin user: ${TEST_ADMIN.email}\n`);

  console.log('Log in with:');
  console.log(`  POST /api/auth/login`);
  console.log(`  { "email": "${TEST_ADMIN.email}", "password": "${TEST_ADMIN.password}" }`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
