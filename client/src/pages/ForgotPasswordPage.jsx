import React, { useContext, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { api, errorMessage } from '../lib/api'
import { privateSeo, useSeo } from '../lib/seo'
import { UserContext } from '../UserContext'

const MIN_PASSWORD = 8;

// Counts down whole seconds: [secondsLeft, start(seconds)].
const useCountdown = () => {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);
  return [secondsLeft, setSecondsLeft];
};

const Heading = ({ title, children }) => (
  <>
    <h1 className="mb-2 text-center text-2xl font-semibold">{title}</h1>
    <p className="mb-6 text-center text-sm text-gray-600">{children}</p>
  </>
);

const linkButton = 'bg-transparent p-0 font-semibold text-gray-900 underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline';

// Password reset in three steps: email -> 6-digit code from the email -> new
// password. On success the user is logged in.
const ForgotPasswordPage = () => {
  useSeo(privateSeo('Reset your password'));
  const { login } = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'password'
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, startResendCountdown] = useCountdown();

  // Runs `request`; shows its error in the form. Returns true on success.
  const run = async (request) => {
    setSubmitting(true);
    setError('');
    try {
      await request();
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const sendCode = async () => {
    const sent = await run(async () => {
      const { data } = await api.post('/users/password/forgot', { email });
      startResendCountdown(data.resendAfterSeconds ?? 60);
    });
    if (sent) {
      setCode('');
      setStep('code');
    }
    return sent;
  };

  const submitEmail = (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Enter your email address.');
    sendCode();
  };

  const resend = async () => {
    if (await sendCode()) toast.success('We sent you a new code.');
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    const verified = await run(async () => {
      const { data } = await api.post('/users/password/verify', { email, code });
      setResetToken(data.resetToken);
    });
    if (verified) setStep('password');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password !== confirm) return setError('The passwords don’t match.');
    let session;
    const saved = await run(async () => {
      ({ data: session } = await api.post('/users/password/reset', { resetToken, password }));
    });
    if (!saved) return;
    login(session.token);
    toast.success('Password updated. You’re logged in.');
    navigate('/', { replace: true });
  };

  const startOver = () => {
    setStep('email');
    setError('');
    setCode('');
    setPassword('');
    setConfirm('');
  };

  const alert = error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-full max-w-md">
        {step === 'email' && (
          <form className="space-y-3" onSubmit={submitEmail} noValidate>
            <Heading title="Reset your password">Enter the email you signed up with and we’ll send you a 6-digit code.</Heading>
            <div>
              <label htmlFor="reset-email" className="text-sm font-semibold">Email</label>
              <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            {alert}
            <button className="primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send code'}</button>
            <p className="py-2 text-center text-gray-600">
              Remembered it? <Link className="font-semibold text-gray-900 underline" to="/login">Log in</Link>
            </p>
          </form>
        )}

        {step === 'code' && (
          <form className="space-y-3" onSubmit={submitCode} noValidate>
            <Heading title="Check your email">
              If an account exists for <span className="font-semibold text-gray-900">{email}</span>, we’ve sent it a code. It expires in 10 minutes; check your spam folder too.
            </Heading>
            <div>
              <label htmlFor="reset-code" className="text-sm font-semibold">6-digit code</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em]"
                autoFocus
              />
            </div>
            {alert}
            <button className="primary" disabled={submitting}>{submitting ? 'Checking…' : 'Continue'}</button>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <button type="button" className={linkButton} onClick={resend} disabled={submitting || resendIn > 0}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="button" className={linkButton} onClick={startOver}>Use a different email</button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form className="space-y-3" onSubmit={submitPassword} noValidate>
            <Heading title="Choose a new password">Use at least {MIN_PASSWORD} characters. You’ll be logged in afterwards.</Heading>
            <div>
              <label htmlFor="reset-password" className="text-sm font-semibold">New password</label>
              <input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="text-sm font-semibold">Confirm new password</label>
              <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {alert}
            <button className="primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save password'}</button>
            <p className="py-2 text-center text-sm">
              <button type="button" className={linkButton} onClick={startOver}>Start again</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage
