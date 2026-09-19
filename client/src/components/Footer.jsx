import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { UserContext } from '../UserContext'
import { loadDestinations } from '../lib/destinations'
import ThemeSwitcher from './ThemeSwitcher'

const MAX_DESTINATIONS = 12;

// Social profiles shown in the footer. Add entries (e.g. Instagram, X) as
// { label, href, icon } where icon is a 24×24 SVG path.
const SOCIAL_LINKS = [
  {
    label: 'AirBuenas on GitHub',
    href: 'https://github.com/George-Kibe/Mernbnb',
    icon: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z',
  },
];

const FooterLink = ({ to, children }) => (
  <li>
    <Link to={to} className="text-sm text-gray-700 hover:underline">{children}</Link>
  </li>
)

// Airbnb-style footer: destination inspiration, link columns, and a bottom
// bar with copyright, currency, theme switcher and social links. Pages render
// it inside their `p-4` wrapper, so negative margins make it full-bleed.
const Footer = () => {
  const { user } = useContext(UserContext);
  const [destinations, setDestinations] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadDestinations().then((list) => { if (!cancelled) setDestinations(list.slice(0, MAX_DESTINATIONS)); });
    return () => { cancelled = true; };
  }, []);

  const columns = [
    {
      title: 'Support',
      links: user
        ? [['Your trips', '/profile/bookings'], ['Your account', '/profile']]
        : [['Log in', '/login'], ['Create an account', '/register']],
    },
    {
      title: 'Hosting',
      links: user
        ? [['AirBuenas your home', '/profile/places/new'], ['Manage your listings', '/profile/places']]
        : [['AirBuenas your home', '/login'], ['Start hosting', '/register']],
    },
    {
      title: 'AirBuenas',
      links: [['Browse all stays', '/'], ['Stays for families', '/?adults=2&children=2'], ['Pet-friendly stays', '/?adults=1&pets=1']],
    },
  ];

  return (
    <footer className="-mx-4 -mb-4 mt-16 border-t border-gray-200 bg-gray-50 px-4 md:px-6">
      {destinations.length > 0 && (
        <section className="border-b border-gray-200 py-10">
          <h2 className="mb-6 text-2xl font-semibold">Inspiration for future getaways</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
            {destinations.map((destination) => (
              <li key={destination.name}>
                <Link to={`/?location=${encodeURIComponent(destination.name)}`} className="group block">
                  <span className="block truncate text-sm font-semibold group-hover:underline">{destination.name}</span>
                  <span className="block text-sm text-gray-500">
                    {destination.count} {destination.count === 1 ? 'stay' : 'stays'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 border-b border-gray-200 py-10 md:grid-cols-3">
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="mb-3 text-sm font-semibold">{column.title}</h3>
            <ul className="space-y-3">
              {column.links.map(([label, to]) => <FooterLink key={label} to={to}>{label}</FooterLink>)}
            </ul>
          </nav>
        ))}
      </div>

      <div className="flex flex-col gap-4 py-6 text-sm md:flex-row md:items-center md:justify-between">
        <p className="text-gray-600">
          © {new Date().getFullYear()} AirBuenas · Stays across Kenya
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-semibold" title="Prices are shown in Kenyan shillings">
            <span aria-hidden="true">KSh</span> KES
          </span>
          <ThemeSwitcher />
          <ul className="flex items-center gap-3">
            {SOCIAL_LINKS.map(({ label, href, icon }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-full text-gray-700 hover:bg-gray-200 hover:text-gray-900">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d={icon} clipRule="evenodd" /></svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default Footer
