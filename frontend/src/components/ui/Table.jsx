// src/components/ui/Table.jsx
import React, { useMemo, useState } from 'react'

function cx(...a){ return a.filter(Boolean).join(' ') }

export function TableWrap({ children, className='' }) {
  return (
    <div className={cx(
      'overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white',
      className
    )}>
      {children}
    </div>
  )
}

/**
 * DataTable
 * props:
 * - columns: [{ key, header, align?: 'left'|'right'|'center', render?: (row)=>JSX }]
 * - rows: array of objects
 * - initialSort?: { key, dir: 'asc'|'desc' }
 * - empty?: string
 */
export function DataTable({ columns, rows, initialSort, empty='No data' }) {
  const [sort, setSort] = useState(initialSort || { key: columns?.[0]?.key, dir: 'asc' })

  const sorted = useMemo(()=>{
    if (!sort?.key) return rows || []
    const arr = [...(rows || [])]
    arr.sort((a,b)=>{
      const va = a[sort.key]; const vb = b[sort.key]
      if (va == null && vb == null) return 0
      if (va == null) return sort.dir==='asc' ? -1 : 1
      if (vb == null) return sort.dir==='asc' ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return sort.dir==='asc' ? va - vb : vb - va
      return sort.dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
    return arr
  }, [rows, sort])

  const onSort = (key) => setSort(s => s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir:'asc' })

  return (
    <table className="w-full text-[13px]">
      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
        <tr>
          {columns.map(col => {
            const active = sort?.key === col.key
            return (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                className={cx(
                  'py-3 px-3 select-none',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  'cursor-pointer'
                )}
                title="Sort"
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {active && <span className="text-slate-400">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sorted.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="p-8 text-center text-slate-500">{empty}</td>
          </tr>
        )}
        {sorted.map((row, i) => (
          <tr
            key={row.id || row._id || i}
            className={cx(
              'hover:bg-slate-50 transition-colors',
              i % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
            )}
          >
            {columns.map(col => (
              <td
                key={col.key}
                className={cx('py-3 px-3',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                )}
              >
                {col.render ? col.render(row) : (row[col.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default { TableWrap, DataTable }
