import React, { useContext, useState } from 'react'
import { Link, Navigate } from 'react-router'
import toast from 'react-hot-toast'
import { api, errorMessage } from '../lib/api'
import { UserContext } from '../UserContext'
import { privateSeo, useSeo } from '../lib/seo'

const MIN_PASSWORD = 8;

const RegisterPage = () => {
  const { user, login } = useContext(UserContext);
  useSeo(privateSeo('Sign up'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const registerUser = async (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/users/register', { name, email, password });
      // Sign straight in after creating the account.
      const { data } = await api.post('/users/login', { email, password });
      login(data.token);
      toast.success(`Welcome to AirBuenas, ${data.user.name}!`);
    } catch (err) {
      setError(errorMessage(err, 'Registration failed. Please try again.'));
      setSubmitting(false);
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-center text-2xl font-semibold">Create your account</h1>
        <form className="space-y-3" onSubmit={registerUser} noValidate>
          <div>
            <label htmlFor="register-name" className="text-sm font-semibold">Name</label>
            <input id="register-name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label htmlFor="register-email" className="text-sm font-semibold">Email</label>
            <input id="register-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="register-password" className="text-sm font-semibold">Password</label>
            <input id="register-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`} />
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <button className="primary" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
          <p className="py-2 text-center text-gray-600">
            Already a member? <Link className="font-semibold text-gray-900 underline" to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default RegisterPage
