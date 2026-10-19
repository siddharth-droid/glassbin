import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/martian-mono/wdth.css'
import '@fontsource-variable/schibsted-grotesk'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
