import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export interface Flight {
  flight_id: number;
  flight_number: string;
  airline_name: string;
  airline_code: string;
  origin_code: string;
  origin_name: string;
  origin_city: string;
  destination_code: string;
  destination_name: string;
  destination_city: string;
  scheduled_departure: string;
  scheduled_arrival: string;
  status: string;
  aircraft_type: string;
}

export interface Airport {
  airport_code: string;
  name: string;
  city: string;
  country: string;
}

export interface Airline {
  airline_id: number;
  name: string;
  code: string;
  country: string;
}
