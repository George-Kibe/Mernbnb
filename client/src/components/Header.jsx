import React, { useContext } from 'react'
import { Link } from 'react-router'
import { UserContext } from '../UserContext'
import SearchBar from './search/SearchBar'
import UserMenu from './UserMenu'

// Sticky Airbnb-style navbar: logo, search, "AirBuenas your home" and the
// account menu. Pages render it inside their `p-4` wrapper, so the negative
// margins let it span the full width.
const Header = () => {
  const {user} = useContext(UserContext);
  return (
    <header className='sticky top-0 z-40 -mx-4 -mt-4 border-b border-gray-200 bg-white px-4 py-4 md:px-6'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-3'>
        <Link to={"/"} aria-label="AirBuenas home" className='order-1 flex items-center gap-1 text-primary md:flex-1 md:basis-0'>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8 -rotate-90">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <span className='font-bold text-xl'>AirBuenas</span>
        </Link>
        <div className='order-3 w-full md:order-2 md:w-auto'>
          <SearchBar />
        </div>
        <div className='order-2 flex items-center justify-end gap-1 md:order-3 md:flex-1 md:basis-0'>
          <Link
            to={user ? '/profile/places/new' : '/login'}
            className='hidden whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold hover:bg-gray-100 lg:block'
          >
            AirBuenas your home
          </Link>
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

export default Header
