import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import { CrumbsProvider } from './lib/crumbs'
import { store } from './lib/store'
import NotFoundPage from './pages/NotFoundPage'
import TripPage from './pages/TripPage'
import TripsPage from './pages/TripsPage'

// The admin pages are loaded on demand so readers never download the editor.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminHomePage = lazy(() => import('./pages/admin/AdminHomePage'))
const TripEditorPage = lazy(() => import('./pages/admin/TripEditorPage'))
const DayEditorPage = lazy(() => import('./pages/admin/DayEditorPage'))

const loading = (
  <div className="placeholder">
    <span className="spinner" role="status" aria-label="Loading" />
  </div>
)

export default function App() {
  return (
    <CrumbsProvider>
      <Navbar />
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<TripsPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHomePage />} />
            <Route path="trips/new" element={<TripEditorPage />} />
            <Route path="trips/:tripId" element={<TripEditorPage />} />
            <Route path="trips/:tripId/days/:date" element={<DayEditorPage />} />
          </Route>
          <Route path="/:tripSlug" element={<TripPage />} />
          <Route path="/:tripSlug/:date" element={<TripPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      {store.mode === 'demo' && <div className="demo-flag">Demo mode: changes aren't saved</div>}
    </CrumbsProvider>
  )
}
