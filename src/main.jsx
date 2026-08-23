import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FitLog from './FitLog.jsx'

function Root() {
  const [route, setRoute] = useState(window.location.hash.replace('#', ''))
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#', ''))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return route === 'fit' ? <FitLog /> : <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
