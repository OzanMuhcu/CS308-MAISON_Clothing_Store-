import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import api from "../services/api";

type RevenuePoint = { date: string; revenue: number };
type RevenueResponse = {
  from: string;
  to: string;
  total: number;
  series: RevenuePoint[];
};

// Format a Date as YYYY-MM-DD using UTC components so it matches what
// the backend expects (and what it echoes back).
const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

const defaultRange = () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: toIsoDate(start), to: toIsoDate(today) };
};

export default function RevenueChart() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) {
      setError("'From' date must be on or before 'To' date.");
      return;
    }
    setError(null);
    setLoading(true);
    api
      .get<RevenueResponse>("/orders/revenue", { params: { from, to } })
      .then(({ data }) => setData(data))
      .catch((err) => {
        setError(err?.response?.data?.error || "Failed to load revenue data.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const formattedTotal = data
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(data.total)
    : "—";

  return (
    <div className="max-w-5xl mx-auto px-6 py-14">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-brand-900">Revenue</h1>
          <p className="text-sm text-brand-500 mt-1">
            Daily order revenue for the selected date range.
          </p>
        </div>
        <div className="text-sm">
          <span className="text-brand-500">Total · </span>
          <span className="font-display text-lg font-semibold text-brand-900">{formattedTotal}</span>
        </div>
      </div>

      <div className="border border-brand-200 bg-white p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="input-label" htmlFor="rev-from">From</label>
            <input
              id="rev-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex-1">
            <label className="input-label" htmlFor="rev-to">To</label>
            <input
              id="rev-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
        {error && <p className="input-error mt-4">{error}</p>}
      </div>

      <div className="border border-brand-200 bg-white p-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data || data.series.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-brand-500">No orders in this date range.</p>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b6457" }}
                  tickFormatter={(d: string) =>
                    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  }
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b6457" }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`
                  }
                  width={56}
                />
                <Tooltip
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
                  labelFormatter={(label: any) =>
                    new Date(label as string).toLocaleDateString()
                  }
                  contentStyle={{ fontSize: 12, border: "1px solid #ddd" }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1f1d18"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#1f1d18" }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
