import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React runtime error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto mt-8 max-w-3xl rounded border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-800">Something went wrong</h1>
          <p className="mt-2 text-sm text-red-700">
            The app hit an unexpected runtime error. Please refresh the page or try again later.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
