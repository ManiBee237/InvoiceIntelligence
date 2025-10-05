// src/components/realtime/LiveFeed.jsx
import React, { useEffect, useRef, useState } from 'react'
import { connectRealtime } from '../../lib/realtime'

const inr = (n)=> (typeof n==='number' ? n.toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}) : n)

export default function LiveFeed() {
  const [items, setItems] = useState([])
  const listRef = useRef(null)

  useEffect(()=>{
    return connectRealtime({
      onMessage: ({ topic, payload, ts }) => {
        if (topic === 'feed:event') {
          setItems(prev => [{...payload, ts}, ...prev].slice(0, 10))
        }
      }
    })
  }, [])

  useEffect(()=>{ // keep recent items visible
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [items])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Live activity</h2>
      </div>
      <div ref={listRef} className="mt-3 max-h-72 overflow-auto">
        {items.length===0 && <div className="text-sm text-slate-500">Waiting for events…</div>}
        <ul className="space-y-2">
          {items.map((r,i)=>(
            <li key={r.ts+'_'+i} className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <div>
                  <div className="text-slate-800">{r.event}</div>
                  <div className="text-slate-500 text-xs">{r.when} • {r.customer}</div>
                </div>
              </div>
              <div className="text-slate-900 font-medium">{inr(r.amount)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
