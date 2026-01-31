import 'dotenv/config';
import app from './app';
import { Pool } from 'pg';

const port = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: 'myuser',
  host: 'localhost',
  database: 'mydb',
  password: 'mypassword',
  port: 5432, // ✅ update this
});

// Test DB connection
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`DB Time: ${result.rows[0].now}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection failed');
  }
});

app.listen(port, () => {
  console.log(`App is listening on http://localhost:${port}`);
});
