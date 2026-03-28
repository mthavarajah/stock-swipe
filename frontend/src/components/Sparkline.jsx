import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

/**
 * Minimal 30-point price sparkline.
 * `data` is expected to be an array of { value } objects — or we generate
 * a plausible fake trend from the stock's momentum_30d if real data isn't passed.
 */
export default function Sparkline({ data, momentum30d = 0 }) {
  // If no real price data is available, synthesise a smooth curve from momentum
  const points = data?.length
    ? data
    : generateFakeSeries(30, momentum30d)

  const isPositive = (points[points.length - 1]?.value ?? 0) >= (points[0]?.value ?? 0)
  const color = isPositive ? '#10b981' : '#f43f5e'  // emerald-500 / rose-500

  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart data={points} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          animationDuration={600}
        />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="bg-white border border-slate-100 shadow rounded px-2 py-1 text-xs text-slate-700">
                {payload[0].value.toFixed(2)}
              </div>
            ) : null
          }
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Generates a plausible random-walk series biased by momentum
function generateFakeSeries(n, momentum) {
  const points = []
  let v = 100
  const drift = momentum / n
  for (let i = 0; i < n; i++) {
    v += drift * v + (Math.random() - 0.48) * 1.5
    points.push({ value: Math.max(v, 1) })
  }
  return points
}
