import { NextResponse } from 'next/server';
import { query, Flight } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const flights = await query<Flight>(`
      SELECT
        f.flight_id,
        f.flight_number,
        a.name as airline_name,
        a.code as airline_code,
        f.origin as origin_code,
        orig.name as origin_name,
        orig.city as origin_city,
        f.destination as destination_code,
        dest.name as destination_name,
        dest.city as destination_city,
        f.scheduled_departure,
        f.scheduled_arrival,
        f.status,
        f.aircraft_type
      FROM flights f
      JOIN airlines a ON f.airline_id = a.airline_id
      JOIN airports orig ON f.origin = orig.airport_code
      JOIN airports dest ON f.destination = dest.airport_code
      ORDER BY f.scheduled_departure ASC
    `);

    return NextResponse.json({ flights });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flights' },
      { status: 500 }
    );
  }
}
