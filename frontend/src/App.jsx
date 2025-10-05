// src/App.jsx
import React, { useEffect, useState } from 'react'
import Layout from './components/Layout'

// pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import Payments from './pages/Payments'
import Products from './pages/Products'
import Vendors from './pages/Vendors'
import Bills from './pages/Bills'
import MLCategorize from './pages/ml/Categorize'
import MLLatepay from './pages/ml/Latepay'
import MLForecast from './pages/ml/Forecast'
import Profile from './pages/Profile'
import ToastHost from './components/ui/Toast'

function App() {
  const getHash = () =>
    (typeof window !== 'undefined' ? (window.location.hash || '#/') : '#/')

  const [route, setRoute] = useState(getHash())
  const [authed, setAuthed] = useState(() => {
    try { return !!localStorage.getItem('auth') } catch { return false }
  })

  // hash -> state
  useEffect(() => {
    const onHash = () => setRoute(getHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // re-read auth on route change
  useEffect(() => {
    try { setAuthed(!!localStorage.getItem('auth')) } catch {}
  }, [route])

  // guard
  useEffect(() => {
    const isLogin = route.startsWith('#/login')
    if (!authed && !isLogin) window.location.hash = '#/login'
    if (authed && isLogin) window.location.hash = '#/'
  }, [authed, route])

  // choose page
  let page = <Dashboard />
  if (route === '#/' || route === '#') page = <Dashboard />
  else if (route.startsWith('#/login')) page = <Login />
  else if (route.startsWith('#/reports')) page = <Reports />
  else if (route.startsWith('#/invoices')) page = <Invoices />
  else if (route.startsWith('#/payments')) page = <Payments />
  else if (route.startsWith('#/products')) page = <Products />
  else if (route.startsWith('#/customers')) page = <Customers />
  else if (route.startsWith('#/vendors')) page = <Vendors />
  else if (route.startsWith('#/bills')) page = <Bills />
  else if (route.startsWith('#/ml/categorize')) page = <MLCategorize />
  else if (route.startsWith('#/ml/latepay')) page = <MLLatepay />
  else if (route.startsWith('#/ml/forecast')) page = <MLForecast />
  else if (route.startsWith('#/profile')) page = <Profile />

  const isLoginRoute = route.startsWith('#/login')

  return (
    <>
      {isLoginRoute ? (
        <>
          {page}
          <ToastHost />
        </>
      ) : (
        <>
          <Layout>{page}</Layout>
          <ToastHost />
        </>
      )}
    </>
  )
}

export default App
