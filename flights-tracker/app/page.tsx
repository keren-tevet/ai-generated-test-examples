'use client';

import { useEffect, useState } from 'react';

interface Flight {
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

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  SCHEDULED: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Scheduled' },
  BOARDING: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Boarding' },
  IN_AIR: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'In Flight' },
  DELAYED: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Delayed' },
  LANDED: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Landed' },
  CANCELLED: { color: 'text-red-600', bg: 'bg-red-600/20', label: 'Cancelled' },
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function FlightCard({ flight }: { flight: Flight }) {
  const status = statusConfig[flight.status] || statusConfig.SCHEDULED;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{flight.flight_number}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.color}`}>
              {status.label}
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-1">{flight.airline_name} &middot; {flight.aircraft_type}</p>
        </div>
        {flight.status === 'IN_AIR' && (
          <div className="relative">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse-slow" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-3xl font-bold text-white">{flight.origin_code}</p>
          <p className="text-zinc-400 text-sm">{flight.origin_city}</p>
          <p className="text-zinc-500 text-xs mt-1">{formatTime(flight.scheduled_departure)}</p>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="w-full flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-700" />
            <svg className="w-5 h-5 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
            <div className="h-px flex-1 bg-zinc-700" />
          </div>
          <p className="text-zinc-600 text-xs mt-1">{formatDate(flight.scheduled_departure)}</p>
        </div>

        <div className="flex-1 text-right">
          <p className="text-3xl font-bold text-white">{flight.destination_code}</p>
          <p className="text-zinc-400 text-sm">{flight.destination_city}</p>
          <p className="text-zinc-500 text-xs mt-1">{formatTime(flight.scheduled_arrival)}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    async function fetchFlights() {
      try {
        const res = await fetch('/api/flights');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setFlights(data.flights);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flights');
      } finally {
        setLoading(false);
      }
    }

    fetchFlights();
    const interval = setInterval(fetchFlights, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredFlights = filter === 'ALL'
    ? flights
    : flights.filter(f => f.status === filter);

  const statusCounts = flights.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Flight Tracker</h1>
          <p className="text-zinc-500">Real-time flight status from Aiven PostgreSQL</p>
        </header>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'ALL'
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            All ({flights.length})
          </button>
          {Object.entries(statusConfig).map(([key, config]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === key
                    ? `${config.bg} ${config.color} ring-1 ring-current`
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <p className="text-zinc-500 text-sm mt-2">Make sure DATABASE_URL is set in .env.local</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-4">
            {filteredFlights.map(flight => (
              <FlightCard key={flight.flight_id} flight={flight} />
            ))}
            {filteredFlights.length === 0 && (
              <p className="text-zinc-500 text-center py-10">No flights found</p>
            )}
          </div>
        )}

        <footer className="mt-12 text-center text-zinc-600 text-sm">
          <p>Powered by Aiven PostgreSQL</p>
        </footer>
      </div>
    </main>
  );
}
