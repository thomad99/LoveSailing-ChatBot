const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS RegattaNetworkData (
    id SERIAL PRIMARY KEY,
    regatta_name TEXT NOT NULL,
    regatta_date DATE,
    category TEXT,
    position INTEGER,
    sail_number TEXT,
    boat_name TEXT,
    skipper TEXT NOT NULL,
    yacht_club TEXT,
    results TEXT,
    total_points NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const initDb = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to database');
    
    await client.query(createTableQuery);
    console.log('Table RegattaNetworkData created or already exists');
    
    client.release();
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
};

module.exports = {
  pool,
  initDb
}; 