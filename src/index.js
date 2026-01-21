/**
 * Main application entry point
 * Demonstrates Informix database connection usage via JDBC
 */

const db = require('./db/connection');

async function main() {
  try {
    // Initialize the connection
    await db.initialize();
    console.log('Database connection established!\n');

    // Example: Simple query
    console.log('--- Running example queries ---\n');

    // Query system tables to verify connection
    const tables = await db.simpleQuery(
      "SELECT FIRST 5 tabname FROM systables WHERE tabtype = 'T' AND tabid > 99"
    );
    console.log('Sample tables in database:');
    tables.forEach((row) => console.log(`  - ${row.tabname}`));

    // Example: Query with parameters
    // const users = await db.query(
    //   'SELECT * FROM users WHERE status = ?',
    //   ['active']
    // );

    // Example: Get single row
    // const user = await db.queryOne(
    //   'SELECT * FROM users WHERE id = ?',
    //   [1]
    // );

    // Example: Insert data
    // await db.execute(
    //   'INSERT INTO users (name, email) VALUES (?, ?)',
    //   ['John Doe', 'john@example.com']
    // );

    // Example: Transaction
    // await db.transaction(async (conn) => {
    //   await conn.query('UPDATE accounts SET balance = balance - 100 WHERE id = ?', [1]);
    //   await conn.query('UPDATE accounts SET balance = balance + 100 WHERE id = ?', [2]);
    // });

    console.log('\n--- Examples completed successfully ---');

  } catch (error) {
    console.error('Application error:', error.message);
    process.exit(1);
  } finally {
    // Clean up connection pool on exit
    await db.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Closing database connections...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Closing database connections...');
  await db.close();
  process.exit(0);
});

// Run the application
main();
