import React, { useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { UserContext } from '../UserContext'
import ThemeSwitcher from './ThemeSwitcher'

// Airbnb's account menu: hamburger + avatar button with a dropdown.
const UserMenu = () => {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Leave the page before clearing the user. Navigations are normally
  // transitions, so clearing it right away would re-render /profile, whose
  // guard redirects to /login with a "Login First" error. flushSync commits
  // the new page before navigate() resolves.
  const logout = async () => {
    setOpen(false);
    await navigate('/', { flushSync: true });
    localStorage.removeItem('token');
    setUser(null);
    toast.success('Logged out successfully');
  };

  const item = 'block w-full bg-transparent px-4 py-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-100';
  const links = user
    ? [
        { to: '/profile/bookings', label: 'Trips', bold: true },
        { divider: true },
        { to: '/profile/places', label: 'Manage listings' },
        { to: '/profile/places/new', label: 'Create a new listing' },
        { to: '/profile', label: 'Account' },
        { divider: true },
        { action: logout, label: 'Log out' },
      ]
    : [
        { to: '/register', label: 'Sign up', bold: true },
        { to: '/login', label: 'Log in' },
        { divider: true },
        { to: '/login', label: 'AirBuenas your home' },
      ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={user ? `Account menu for ${user.name}` : 'Main menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-full border border-gray-300 bg-white py-1.5 pl-3.5 pr-1.5 transition hover:shadow-md"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        {user ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-900 text-sm font-semibold uppercase text-white">
            {user.name?.trim()?.[0] ?? '?'}
          </span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-gray-500">
            <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl bg-white py-2 shadow-[0_2px_16px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:bg-gray-50 dark:ring-white/10">
          {user && <p className="truncate px-4 pb-2 pt-1 text-xs text-gray-500">Signed in as {user.name}</p>}
          {links.map((link, i) =>
            link.divider ? (
              <hr key={`divider-${i}`} className="my-2 border-gray-200" />
            ) : link.action ? (
              <button key={link.label} type="button" role="menuitem" onClick={link.action} className={item}>
                {link.label}
              </button>
            ) : (
              <Link key={link.label} to={link.to} role="menuitem" onClick={() => setOpen(false)} className={`${item} ${link.bold ? 'font-semibold' : ''}`}>
                {link.label}
              </Link>
            )
          )}
          <hr className="my-2 border-gray-200" />
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm">Theme</span>
            <ThemeSwitcher showLabels={false} />
          </div>
        </div>
      )}
    </div>
  )
}

export default UserMenu
