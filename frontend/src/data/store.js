// src/data/store.js
// Centralized sample data + helpers so Dashboard and pages stay in sync.

export const data = {
  today: new Date(),

  customers: [
    { id: 'C-1001', name: 'Orbit Tech', email: 'ap@orbit.tech',     city: 'Bengaluru' },
    { id: 'C-1002', name: 'LoAdMe',     email: 'accounts@loadme.io', city: 'Chennai'   },
    { id: 'C-1003', name: 'Brill Labs', email: 'finance@brill.ai',   city: 'Pune'      },
    { id: 'C-1004', name: 'Blue Cart',  email: 'ap@bluecart.in',     city: 'Delhi'     },
  ],

  products: [
    { sku: 'P-001', name: 'Pro Plan',      unit: 'license', price: 4999,  tax: 18 },
    { sku: 'P-002', name: 'Support Pack',  unit: 'year',    price: 18000, tax: 18 },
    { sku: 'P-003', name: 'Onboarding',    unit: 'project', price: 35000, tax: 0  },
  ],

  invoices: [
    // dates as ISO (YYYY-MM-DD)
    { id:'INV-1029', number:'INV-1029', customerId:'C-1001', customerName:'Orbit Tech',  date:'2025-10-08', dueDate:'2025-10-28', total:58000,  status:'Paid'    },
    { id:'INV-1028', number:'INV-1028', customerId:'C-1002', customerName:'LoAdMe',      date:'2025-10-07', dueDate:'2025-10-27', total:177000, status:'Open'    },
    { id:'INV-1027', number:'INV-1027', customerId:'C-1004', customerName:'Blue Cart',   date:'2025-10-06', dueDate:'2025-10-26', total:73900,  status:'Paid'    },
    { id:'INV-1026', number:'INV-1026', customerId:'C-1003', customerName:'Brill Labs',  date:'2025-10-02', dueDate:'2025-10-17', total:22400,  status:'Overdue' },
    { id:'INV-1025', number:'INV-1025', customerId:'C-1002', customerName:'LoAdMe',      date:'2025-09-22', dueDate:'2025-10-05', total:89500,  status:'Open'    },
  ],

  payments: [
    { id:'PM-9007', date:'2025-10-08', method:'UPI',  customerId:'C-1001', customer:'Orbit Tech', invoice:'INV-1029', amount:58000 },
    { id:'PM-9006', date:'2025-10-07', method:'Bank', customerId:'C-1002', customer:'LoAdMe',     invoice:'INV-1028', amount:177000 },
    { id:'PM-9005', date:'2025-10-06', method:'Card', customerId:'C-1004', customer:'Blue Cart',  invoice:'INV-1027', amount:73900 },
  ],

  vendors: [
    { id:'V-4001', name:'Stationery Hub',  city:'Mumbai'    },
    { id:'V-4002', name:'Cloud Infra Ltd', city:'Bengaluru' },
    { id:'V-4003', name:'IT Services Co',  city:'Hyderabad' },
  ],

  bills: [
    { id:'B-3019', vendor:'Cloud Infra Ltd', date:'2025-10-03', due:'2025-10-20', amount: 87000, status:'Open'    },
    { id:'B-3018', vendor:'IT Services Co',  date:'2025-10-01', due:'2025-10-15', amount: 56000, status:'Open'    },
    { id:'B-3017', vendor:'Stationery Hub',  date:'2025-09-25', due:'2025-10-05', amount: 12000, status:'Overdue' },
  ],
}

/* ----------------------------- utils/selectors ---------------------------- */
export const inr = (n) => n.toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })
export const dd  = (s) => new Date(s).toLocaleDateString('en-GB')

const daysBetween = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const isWithinDays = (s, days, ref=new Date()) => ( (ref - new Date(s)) / 86400000 ) <= days

export const selectors = {
  counts() {
    return {
      customers: data.customers.length,
      invoices:  data.invoices.length,
      products:  data.products.length,
      vendors:   data.vendors.length,
    }
  },

  // Total value of invoices with status Open/Overdue
  arOpen() {
    return data.invoices
      .filter(i => i.status !== 'Paid')
      .reduce((sum, i) => sum + i.total, 0)
  },

  // Sum of payments in the last 30 days
  collected30d() {
    const now = data.today
    return data.payments
      .filter(p => isWithinDays(p.date, 30, now))
      .reduce((sum,p) => sum + p.amount, 0)
  },

  // Simple DSO approximation: average (due - date) for open/overdue invoices
  dsoDays() {
    const list = data.invoices.filter(i => i.status !== 'Paid')
    if (!list.length) return 0
    const avg = list.reduce((acc, i) => acc + Math.max(0, daysBetween(i.date, i.dueDate)), 0) / list.length
    return Math.round(avg)
  },

  // Aging buckets for AR
  aging() {
    const now = data.today
    const buckets = { current:0, d30:0, d60:0, d90:0, d90p:0 }
    data.invoices.filter(i => i.status !== 'Paid').forEach(i => {
      const overdueDays = Math.max(0, daysBetween(i.dueDate, now))
      if (overdueDays === 0) buckets.current += i.total
      else if (overdueDays <= 30) buckets.d30 += i.total
      else if (overdueDays <= 60) buckets.d60 += i.total
      else if (overdueDays <= 90) buckets.d90 += i.total
      else buckets.d90p += i.total
    })
    return buckets
  },

  // Top customers by billed value (last 60 days)
  topCustomers() {
    const now = data.today
    const map = new Map()
    data.invoices
      .filter(i => isWithinDays(i.date, 60, now))
      .forEach(i => {
        const key = i.customerId
        const v = map.get(key) || { name: i.customerName, invoices: 0, value: 0 }
        v.invoices += 1
        v.value += i.total
        map.set(key, v)
      })
    return Array.from(map.values())
      .sort((a,b) => b.value - a.value)
      .slice(0,5)
  },

  // Recent cross-entity activity (invoices + payments)
  recentActivity(limit=6) {
    const items = []
    data.invoices.forEach(i => items.push({ t:i.date, kind:'invoice', text:`Invoice ${i.number} ${i.status.toLowerCase()}`, who:i.customerName, amt:i.total }))
    data.payments.forEach(p => items.push({ t:p.date, kind:'payment', text:`Payment received`, who:p.customer, amt:p.amount }))
    return items
      .sort((a,b)=> new Date(b.t) - new Date(a.t))
      .slice(0, limit)
  },

  // AP summary (bills)
  apSummary() {
    const open = data.bills.filter(b => b.status !== 'Paid')
    const overdue = open.filter(b => new Date(b.due) < data.today)
    const dueSoon = open.filter(b => {
      const d = daysBetween(data.today, b.due)
      return d >= 0 && d <= 7
    })
    const sum = (arr)=> arr.reduce((s,b)=> s + b.amount, 0)
    return {
      openCount: open.length,
      openValue: sum(open),
      overdueCount: overdue.length,
      overdueValue: sum(overdue),
      dueSoonCount: dueSoon.length,
      dueSoonValue: sum(dueSoon),
    }
  }
}
