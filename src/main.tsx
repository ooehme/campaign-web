import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'
import 'leaflet/dist/leaflet.css'
import { AuthProvider } from './auth/AuthProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error: unknown) => {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number((error as { status?: number }).status)
            : 0

        if ([401, 403, 404, 422].includes(status)) return false
        if (status >= 500) return count < 1
        return count < 2
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
