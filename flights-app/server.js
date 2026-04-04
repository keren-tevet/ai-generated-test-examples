import express from 'express';
import pg from 'pg';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get all airports
app.get('/api/airports', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM airports ORDER BY city');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search flights
app.get('/api/flights', async (req, res) => {
  const { origin, destination, date } = req.query;
  try {
    let query = `
      SELECT f.*,
        ao.city as origin_city, ao.code as origin_code,
        ad.city as dest_city, ad.code as dest_code
      FROM flights f
      JOIN airports ao ON f.origin_id = ao.id
      JOIN airports ad ON f.destination_id = ad.id
      WHERE 1=1
    `;
    const params = [];

    if (origin) {
      params.push(origin);
      query += ` AND f.origin_id = $${params.length}`;
    }
    if (destination) {
      params.push(destination);
      query += ` AND f.destination_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      query += ` AND DATE(f.departure_time) = $${params.length}`;
    }

    query += ' ORDER BY f.departure_time';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book a flight
app.post('/api/bookings', async (req, res) => {
  const { flight_id, passenger_name, email } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO bookings (flight_id, passenger_name, email, booking_ref)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [flight_id, passenger_name, email, 'BK' + Date.now().toString(36).toUpperCase()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get bookings by email
app.get('/api/bookings', async (req, res) => {
  const { email } = req.query;
  try {
    const result = await pool.query(`
      SELECT b.*, f.flight_number, f.departure_time, f.arrival_time,
        ao.city as origin_city, ad.city as dest_city
      FROM bookings b
      JOIN flights f ON b.flight_id = f.id
      JOIN airports ao ON f.origin_id = ao.id
      JOIN airports ad ON f.destination_id = ad.id
      WHERE b.email = $1
      ORDER BY f.departure_time
    `, [email]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flights app running on http://localhost:${PORT}`));
