import React, { useContext, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import toast from 'react-hot-toast'
import { api, errorMessage } from '../lib/api'
import { UserContext } from '../UserContext'

// Only redirect back to paths inside this app.
const safeRedirect = (path) => (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/');

const LoginPage = () => {
  const { user, login } = useContext(UserContext);
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/users/login', { email, password });
      login(data.token);
      toast.success(`Welcome back, ${data.user.name}!`);
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Please try again.'));
      setSubmitting(false);
    }
  };

  // Already signed in (or just signed in): go where the user was heading.
  if (user) return <Navigate to={safeRedirect(location.state?.from)} replace />;

  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-2xl font-semibold">Log in</h1>
        {location.state?.reason && <p className="mb-4 text-center text-sm text-gray-600">{location.state.reason}</p>}
        <form className="space-y-3" onSubmit={handleLogin} noValidate>
          <div>
            <label htmlFor="login-email" className="text-sm font-semibold">Email</label>
            <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="login-password" className="text-sm font-semibold">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <button className="primary" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
          <p className="py-2 text-center text-gray-600">
            Don’t have an account yet? <Link className="font-semibold text-gray-900 underline" to="/register" state={location.state}>Register now</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
