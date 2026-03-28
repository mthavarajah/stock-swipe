import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'

import Onboard from './pages/Onboard'
import Swipe from './pages/Swipe'
import Portfolio from './pages/Portfolio'
import Index from './pages/Index'
import BottomNav from './components/BottomNav'
import { useSession } from './store/useSession'

function RootRedirect() {
  const userId = useSession(s => s.userId)
  return <Navigate to={userId ? '/swipe' : '/onboard'} replace />
}

// Show BottomNav only on the main app pages (not onboarding)
function AppLayout() {
  const location = useLocation()
  const showNav  = ['/swipe', '/portfolio', '/index'].includes(location.pathname)

  return (
    <>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/swipe" element={<Swipe />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/index" element={<Index />} />
        {/* Legacy redirect */}
        <Route path="/playlist" element={<Navigate to="/portfolio" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  </React.StrictMode>
)
