import React, { useContext, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router'
import toast, {Toaster} from "react-hot-toast"
import Footer from '../components/Footer'
import Header from '../components/Header'
import { UserContext } from '../UserContext'
import PlacesPage from './PlacesPage'
import BookingsPage from './BookingsPage'
import BookingPage from './BookingPage'

const ProfilePage = () => {
  const {user, ready, setUser} = useContext(UserContext);
  // See LoginPage: redirect declaratively so the "not logged in" branch doesn't win.
  const [loggedOut, setLoggedOut] = useState(false)
  let {subpage} =useParams();
  const {actionOrId} =useParams();
  if (subpage === undefined) {
    subpage = "profile"
  }
  //console.log(subpage)
  
  const linkClasses = (type=null) => {
    let classes = "inline-flex gap-4 py-2 px-6 rounded-full mb-4"
    if (type === subpage) {
        classes += " bg-primary text-white"
    } else {
      classes += " bg-gray-200"
    }
    return classes;
  }

  const logoutUser = () => {
    setUser(null)
    localStorage.clear()
    setLoggedOut(true)
    toast.success("Logged out successfully")
  }

  if (loggedOut) {
    return <Navigate to={"/"} />
  }

  if(!ready){
    return "Loading..."
  }

  if (ready && !user) {
    toast.error("You need to Login First!")
    return <Navigate to={"/login"} />
  }
  return (
    <div className='p-4 flex flex-col min-h-screen'>
        <Toaster position="top-center" reverseOrder={false}></Toaster>
        <Header />
        <div className='mt-4 grow flex-col items-center'>
          <nav className="w-full flex-cols md:flex justify-center mt-8 gap-2 md:mb-8">
            <Link className={linkClasses("profile")} to={"/profile"}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              My Profile
            </Link>
            <Link className={linkClasses("bookings")} to={"/profile/bookings"}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              My Bookings
            </Link>
            <Link className={linkClasses("places")} to={"/profile/places"}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              My Accomondations
            </Link>
          </nav>
            {
              subpage === "profile" && (
                <div className="text-center flex-col max-w-lg mx-auto">
                    Logged in as {user.name} ({user.email})
                    <button onClick={logoutUser} className="primary max-w-sm mt-2">Logout</button>
                </div>
            )
            }
            {
              subpage === "places" && (
                <PlacesPage ownerId={user.id} toast={toast}/>
              )
            }
            {
              subpage === "bookings" && !actionOrId && (
                <BookingsPage ownerId={user.id} toast={toast}/>
              )
            }
            {
              subpage === "bookings" && actionOrId && (
                <BookingPage ownerId={user.id} toast={toast}/>
              )
            }
        </div>
        <Footer />
    </div>
  )
}

export default ProfilePage