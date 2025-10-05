// src/components/realtime/LiveCard.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { connectRealtime } from '../../lib/realtime'
import { Card, CardHeader, CardBody, DeltaPill } from '../ui/Card'

function Spark({ points = [], width = 200, height = 56, color = 'emerald' }) {
  const max = Math.max(...points, 1), min = Math.min(...points, 0)
  const step = width / Math.max(points.length - 1, 1)
  const line = points.map((v, i) => {
    const x = i * step, y = height - ((v - min) / (max - min || 1)) * height
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const area = `${line} L ${width},${height} L 0,${height} Z`
  const lineCls = color === 'sky' ? 'text-sky-500' : color === 'amber' ? 'text-amber-500' : 'text-emerald-500'
  const fillCls = color === 'sky' ? 'fill-sky-100' : color === 'amber' ? 'fill-amber-100' : 'fill-emerald-100'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} className={fillCls} opacity="0.6" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.2" className={lineCls} />
    </svg>
  )
}

export default function LiveCard({ title, topic, formatter = (v) => v, color = 'emerald', icon = null, subtitle = null }) {
  const [val, setVal] = useState(null)
  const [series, setSeries] = useState([])

  useEffect(() => {
    return connectRealtime({
      onMessage: ({ topic: t, payload }) => {
        if (t === topic) {
          setVal(payload.value)
          setSeries(payload.series || [])
        }
      }
    })
  }, [topic])

  const delta = useMemo(() => {
    if (series.length < 2) return null
    const a = series[series.length - 2], b = series[series.length - 1]
    const diff = b - a
    if (diff === 0) return null
    const pct = a ? Math.round((diff / a) * 100) : 0
    return { text: `${diff > 0 ? '+' : ''}${pct}%`, good: diff >= 0 }
  }, [series])

  return (
    <Card>
      <CardHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actions={delta ? <DeltaPill delta={delta.text} good={delta.good} /> : null}
      />
      <CardBody>
        <div className="flex items-end justify-between gap-4">
          <div className="text-3xl font-semibold text-slate-900">
            {val == null ? '—' : formatter(val)}
          </div>
          <Spark points={series} color={color} />
        </div>
      </CardBody>
    </Card>
  )
}
