'use client'

// Login del SuperAdmin: POST /api/superadmin/auth escribe cookie httpOnly sa_session.
// Credenciales hardcodeadas en el servidor (USERS en auth/route.ts); no usa tabla admins.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Iconos SVG planos (mismo estilo que el resto del panel, ver Icon en SuperAdmin.tsx) — antes
// esta página usaba emojis (🛡️/👁️/🙈/❌), inconsistente con el resto del dashboard que ya se
// convirtió a iconos planos.
const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function ShieldIcon() {
  return <svg {...iconProps}><path d="M12 3l7 3v6c0 5-3.2 8.5-7 9-3.8-.5-7-4-7-9V6l7-3z" /></svg>
}
function EyeIcon() {
  return <svg {...{ ...iconProps, width: 18, height: 18 }}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
}
function EyeOffIcon() {
  return <svg {...{ ...iconProps, width: 18, height: 18 }}><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0112 5c6 0 10 7 10 7a17.4 17.4 0 01-3.4 4.2M6.3 6.3C3.4 8.2 2 12 2 12s4 7 10 7a9.6 9.6 0 004.6-1.2" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
}
function AlertIcon() {
  return <svg {...{ ...iconProps, width: 16, height: 16 }}><circle cx="12" cy="12" r="8.5" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" /></svg>
}

// Página de login exclusiva del Super Admin.
// Solo Jesus y Eloy pueden acceder; las credenciales se validan en /api/superadmin/auth.
export default function SuperAdminLogin() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/superadmin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (res.ok) {
      const data = await res.json()
      // Guardamos el nombre en localStorage para mostrarlo en el avatar del sidebar.
      localStorage.setItem('sa_user', data.user ?? username.toLowerCase())
      router.push('/superadmin')
      router.refresh()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al iniciar sesión')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '40px 32px', background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#fff' }}><ShieldIcon /></div>
          <h1 style={{ color: '#f1f5f9', fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Super Admin</h1>
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: '6px 0 0' }}>NICHO Platform — Acceso restringido</p>
        </div>

        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Usuario</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="jesus / eloy"
              autoComplete="username"
              required
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                style={{ width: '100%', padding: '12px 44px 12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '1rem' }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertIcon /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ padding: '13px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '4px' }}>
            {loading ? 'Verificando...' : 'Entrar al panel'}
          </button>
        </form>
      </div>
    </div>
  )
}
