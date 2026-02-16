import { pool } from '../src/config/database';

/**
 * Seed user accounts for the 3 Google Calendar integrations
 * Creates: Personal, Music (Persephone), and Lyra Work accounts
 */
async function seedAccounts() {
  try {
    console.log('🌱 Seeding user accounts...');
    console.log('');

    const accounts = [
      {
        account_type: 'personal',
        email: 'your.personal@gmail.com', // TODO: Replace with actual email
        display_name: 'Personal',
        is_primary: true,
      },
      {
        account_type: 'music',
        email: 'persephone@example.com', // TODO: Replace with actual email
        display_name: 'Persephone (Music)',
        is_primary: false,
      },
      {
        account_type: 'lyra',
        email: 'work@lyra.com', // TODO: Replace with actual email
        display_name: 'Lyra Work',
        is_primary: false,
      },
    ];

    for (const account of accounts) {
      const result = await pool.query(
        `INSERT INTO user_accounts (account_type, email, display_name, is_primary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           account_type = $1,
           display_name = $3,
           is_primary = $4
         RETURNING *`,
        [account.account_type, account.email, account.display_name, account.is_primary]
      );

      const created = result.rows[0];
      console.log(`✓ ${account.display_name}`);
      console.log(`  ID: ${created.id}`);
      console.log(`  Email: ${created.email}`);
      console.log(`  Type: ${created.account_type}`);
      console.log('');
    }

    console.log('✓ Account seeding complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update scripts/seed-accounts.ts with your actual email addresses');
    console.log('2. Copy the account IDs above and add to your .env file:');
    console.log('   PERSONAL_ACCOUNT_ID=<id from Personal account>');
    console.log('   MUSIC_ACCOUNT_ID=<id from Music account>');
    console.log('   LYRA_ACCOUNT_ID=<id from Lyra account>');
    console.log('3. Run: npm run dev');
    console.log('4. Visit: http://localhost:3000/oauth/authorize?account_id=<PERSONAL_ACCOUNT_ID>');
    console.log('');
  } catch (error) {
    console.error('✗ Account seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedAccounts();
