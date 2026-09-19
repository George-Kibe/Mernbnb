import React from 'react'
import { NavLink, Outlet } from 'react-router'

const TABS = [
  { to: '/profile', label: 'Account', end: true, icon: 'M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  { to: '/profile/bookings', label: 'Trips', icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' },
  { to: '/profile/places', label: 'Listings', icon: 'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25' },
];

// Tabs for the signed-in area (account, trips, listings).
const ProfileLayout = () => (
  <div className="mt-6">
    <nav aria-label="Your account" className="mb-8 flex flex-wrap justify-center gap-2">
      {TABS.map(({ to, label, end, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${isActive ? 'bg-primary text-on-primary' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
          {label}
        </NavLink>
      ))}
    </nav>
    <Outlet />
  </div>
)

export default ProfileLayout
