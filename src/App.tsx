import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import Navbar from './components/Navbar'
import { CrumbsProvider } from './lib/crumbs'
import ErrorBoundary from './lib/ErrorBoundary'
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
  const { pathname } = useLocation()
  const navigation = useNavigationType()

  // A page opened by a link starts at the top. Going back or forward is left
  // alone, so the browser can return to where the reader was.
  useEffect(() => {
    if (navigation === 'PUSH') window.scrollTo(0, 0)
  }, [pathname, navigation])

  return (
    <CrumbsProvider>
      <Navbar />
      <ErrorBoundary resetKey={pathname}>
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
      </ErrorBoundary>
      {store.mode === 'demo' && <div className="demo-flag">Demo mode: changes aren't saved</div>}
    </CrumbsProvider>
  )
}
