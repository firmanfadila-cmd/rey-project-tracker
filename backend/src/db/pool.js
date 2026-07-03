require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool, types } = require('pg');

// Keep DATE columns as raw 'YYYY-MM-DD' strings — the default pg parser
// converts them to JS Date objects at local midnight, which both shifts
// the date across timezones and breaks the frontend's `d+'T00:00:00'` parsing.
types.setTypeParser(1082, val => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
