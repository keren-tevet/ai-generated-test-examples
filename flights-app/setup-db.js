import pg from 'pg';

function getDbConfig() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  const ssl = process.env.PROJECT_CA_CERT
    ? { ca: Buffer.from(process.env.PROJECT_CA_CERT, 'base64').toString() }
    : { rejectUnauthorized: false };
  return { connectionString: url.toString(), ssl };
}

const pool = new pg.Pool(getDbConfig());

async function setup() {
  console.log('Setting up database...');

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airports (
      id SERIAL PRIMARY KEY,
      code VARCHAR(3) UNIQUE NOT NULL,
      city VARCHAR(100) NOT NULL,
      country VARCHAR(100) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS flights (
      id SERIAL PRIMARY KEY,
      flight_number VARCHAR(10) NOT NULL,
      origin_id INTEGER REFERENCES airports(id),
      destination_id INTEGER REFERENCES airports(id),
      departure_time TIMESTAMPTZ NOT NULL,
      arrival_time TIMESTAMPTZ NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      seats_available INTEGER NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      flight_id INTEGER REFERENCES flights(id),
      passenger_name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      booking_ref VARCHAR(20) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed airports
  await pool.query(`
    INSERT INTO airports (code, city, country) VALUES
      ('JFK', 'New York', 'USA'),
      ('LAX', 'Los Angeles', 'USA'),
      ('LHR', 'London', 'UK'),
      ('CDG', 'Paris', 'France'),
      ('FRA', 'Frankfurt', 'Germany'),
      ('AMS', 'Amsterdam', 'Netherlands'),
      ('SIN', 'Singapore', 'Singapore'),
      ('NRT', 'Tokyo', 'Japan'),
      ('DXB', 'Dubai', 'UAE'),
      ('SYD', 'Sydney', 'Australia')
    ON CONFLICT (code) DO NOTHING
  `);

  // Seed flights for the next 7 days
  const airports = (await pool.query('SELECT id, code FROM airports')).rows;
  const airportMap = Object.fromEntries(airports.map(a => [a.code, a.id]));

  const routes = [
    ['JFK', 'LHR', 420, 7], ['LHR', 'JFK', 420, 8],
    ['JFK', 'CDG', 450, 7.5], ['CDG', 'JFK', 450, 8],
    ['LAX', 'NRT', 890, 11], ['NRT', 'LAX', 890, 10],
    ['LHR', 'FRA', 180, 1.5], ['FRA', 'LHR', 180, 1.5],
    ['AMS', 'CDG', 150, 1.2], ['CDG', 'AMS', 150, 1.2],
    ['DXB', 'SIN', 550, 7], ['SIN', 'DXB', 550, 7],
    ['SYD', 'SIN', 480, 8], ['SIN', 'SYD', 480, 8],
    ['FRA', 'DXB', 420, 6], ['DXB', 'FRA', 420, 6],
  ];

  let flightNum = 100;
  for (let day = 0; day < 7; day++) {
    for (const [from, to, price, hours] of routes) {
      const dep = new Date();
      dep.setDate(dep.getDate() + day);
      dep.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0);

      const arr = new Date(dep.getTime() + hours * 60 * 60 * 1000);

      await pool.query(`
        INSERT INTO flights (flight_number, origin_id, destination_id, departure_time, arrival_time, price, seats_available)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [`FL${flightNum++}`, airportMap[from], airportMap[to], dep, arr, price, 50 + Math.floor(Math.random() * 100)]);
    }
  }

  console.log('Database setup complete!');
  await pool.end();
}

setup().catch(console.error);
