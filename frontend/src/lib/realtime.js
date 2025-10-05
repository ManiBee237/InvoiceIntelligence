// src/lib/realtime.js
// Minimal realtime client with graceful fallback to a local simulator.
//  - If window.__RT_SIM__ is true (default), we simulate live metrics.
//  - If you have a backend, set window.__RT_SIM__ = false and provide URLs below.

const SSE_URL = '/api/realtime/stream';      // <-- your SSE endpoint
const WS_URL  = 'wss://localhost/ws';        // <-- your WebSocket endpoint (optional)

export function connectRealtime({ onMessage, onOpen, onClose } = {}) {
  const useSim = window.__RT_SIM__ ?? true;
  let stop = () => {};

  if (!useSim && 'EventSource' in window) {
    const es = new EventSource(SSE_URL);
    es.onopen = () => onOpen && onOpen();
    es.onerror = () => {/* keep open by default */};
    if (!window.__RT_PAUSE__) onMessage && onMessage({ topic, payload, ts: Date.now() })
    es.onmessage = (ev) => {
      try { onMessage && onMessage(JSON.parse(ev.data)); } catch {}
    };
    stop = () => es.close();
    return stop;
  }

  if (!useSim && 'WebSocket' in window) {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => onOpen && onOpen();
    ws.onclose = () => onClose && onClose();
    ws.onmessage = (ev) => { try { onMessage && onMessage(JSON.parse(ev.data)); } catch {} };
    stop = () => ws.close();
    return stop;
  }

  // ---- SIMULATOR ----
  // emits KPI updates & activity events every 2s; deterministic-ish drift
  let t = 0;
  const rnd = (n=1)=> (Math.sin((t+=0.7))*0.5+0.5)*n;
  const state = {
    invoicesCount: 128,
    collected30d: 480000, // ₹
    dsoDays: 42,
    series: {
      invoices: [9,14,11,16,15,21,20],
      collected: [12,13,15,14,18,22,24],
      dso: [40,39,41,43,42,42,41],
    }
  };

  const tick = () => {
    // gentle drift
    state.invoicesCount += Math.random() > 0.6 ? 1 : 0;
    state.collected30d += Math.floor(rnd(15000));
    state.dsoDays += Math.random() > 0.7 ? (Math.random()>0.5?1:-1) : 0;

    const push = (topic, payload) => onMessage && onMessage({ topic, payload, ts: Date.now() });

    // slide series
    const slide = (arr, next) => { const a=[...arr]; a.shift(); a.push(next); return a; };
    state.series.invoices = slide(state.series.invoices, 10 + Math.floor(rnd(16)));
    state.series.collected = slide(state.series.collected, 12 + Math.floor(rnd(16)));
    state.series.dso = slide(state.series.dso, 38 + Math.floor(rnd(8)));

    // emit KPIs
    push('kpi:invoices',   { value: state.invoicesCount, series: state.series.invoices });
    push('kpi:collected',  { value: state.collected30d,  series: state.series.collected });
    push('kpi:dso',        { value: state.dsoDays,       series: state.series.dso });

    // random activity
    if (Math.random() > 0.6) {
      const events = [
        ['Payment received','Orbit Tech', 58000],
        ['Invoice sent','LoAdMe', 177000],
        ['Invoice overdue','Brill Labs', 22400],
        ['Invoice paid','Blue Cart', 73900],
      ];
      const e = events[Math.floor(Math.random()*events.length)];
      push('feed:event', { when: new Date().toLocaleTimeString(), event: e[0], customer: e[1], amount: e[2] });
    }
  };

  const id = setInterval(tick, 2000);
  setTimeout(tick, 200); // first emit
  stop = () => clearInterval(id);
  onOpen && onOpen();
  return stop;
}
