import React, { useContext, useEffect, useState } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'
import toast, {Toaster} from "react-hot-toast"
import {differenceInCalendarDays} from 'date-fns'
import { useParams, useSearchParams } from 'react-router'
import axios from 'axios'
import { useNavigate } from 'react-router'
import { UserContext } from '../UserContext'
import PhotoGrid from '../components/photos/PhotoGrid'
import PhotoTour from '../components/photos/PhotoTour'
import { dayString, readSearch, totalGuests } from '../lib/search'

const PlacePage = () => {
  const {user, ready, setUser} = useContext(UserContext);
  const [place, setPlace] = useState(null);
  const [tourIndex, setTourIndex] = useState(null); // photo tour open at this index
  const {id} = useParams()
  const navigate = useNavigate();

  // Prefilled from the navbar search (?checkin=…&checkout=…&adults=…).
  const [searchParams] = useSearchParams();
  const [trip] = useState(() => readSearch(searchParams));
  const [checkIn, setCheckIn] = useState(trip.checkIn ? dayString(trip.checkIn) : '');
  const [checkOut, setCheckOut] = useState(trip.checkOut ? dayString(trip.checkOut) : '');
  const [numberOfGuests, setNumberOfGuests] = useState(totalGuests(trip) || 1)

  const [name, setName] = useState(user?.name||'');
  const [email, setEmail] = useState(user?.email ||"");
  const [phoneNumber, setPhoneNumber] = useState('');

  let noOfDays  = 0;
  if (checkIn && checkOut){
    noOfDays = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (noOfDays < 0) {
      toast.error("Checkout date cannot be earlier than Checkin date!")
    }
  }

  const getPlace = async() => {
    try {
        const response = await axios.get(`/places/place/${id}`);
        //console.log(response)
        setPlace(response.data)
    } catch (error) {
        toast.error(error.message)
    }
  }

  const saveBooking = async() => {
    if(!user){
      toast.error("You Need to Login First!");
      navigate("/login")
      return;
    }
    if (!place ||!checkIn ||!checkOut ||!name ||!email ||!phoneNumber ||!noOfDays ||!numberOfGuests){
      toast.error("Missing Details! Confirm you have filled all details!")
      return;
    }
    const bookingData ={
      owner:user.id, place:place._id, checkIn, checkOut, name, email, phoneNumber,
      price:noOfDays * numberOfGuests * place.price 
    }
    try {
      const response = await axios.post('/bookings', {bookingData});
      if (response.status === 201){
        const bookingId = response.data._id;
        toast.success("Booking Successful");
        setCheckIn(""); setCheckOut(""); setNumberOfGuests(1);
        navigate(`/profile/bookings/${bookingId}`)
      }
      
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(() => {
    if(!id){return}
    getPlace()
  }, [id])

  return (
    <div className='p-4 flex flex-col min-h-screen'>
      <Toaster position="top-center" reverseOrder={false}></Toaster>
      <Header />
      {
        place && (
          <div className='mt-8 bg-gray-100 -mx-8 px-8 py-8'>
            <h1 className='text-2xl md:text-3xl font-semibold'>{place.title}</h1>
            <a title={`Search ${place.address} on Google Maps`} className='my-2 inline-flex font-semibold gap-2 items-center underline underline-offset-2' href={`https://maps.google.com/?q=${encodeURIComponent(place.address)}`} target="_blank" rel="noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              {place.address}
            </a>
            <div className='mt-4'>
              <PhotoGrid photos={place.photos} title={place.title} onOpen={setTourIndex} />
            </div>
            {
              tourIndex !== null && (
                <PhotoTour photos={place.photos} title={place.title} startIndex={tourIndex} onClose={() => setTourIndex(null)} />
              )
            }
            <div className="my-4 grid grid-cols-1 md:grid-cols-[2fr_1fr] p-4">
                <div className='px-4'>
                    <h2 className="font-semibold text-2xl">Description</h2>
                    {place.description}
                    <div className='m-4'>
                        Check In: {place.checkIn} <br />
                        Check Out: {place.checkOut} <br />
                        Maximum Guests: {place.maxGuests}
                    </div>
                    
                    {
                      place.extraInfo && (
                        <div className="mt-4 text-sm leading-4">
                          <h2 className="font-semibold text-2xl">Additional Information</h2>
                          {place.extraInfo}
                        </div>
                      )
                    }
                   
                </div>
                <div className='p-4'>
                  <div className="bg-white shadow-sm p-4 rounded-2xl">
                    <div className="text-2xl text-center">
                      Price: Kshs. {place.price}
                    </div>
                   <div className="flex-col md:flex">
                    <div className="p-4 rounded-2xl">
                        <label>Check In: </label>
                        <input value={checkIn} onChange={e => setCheckIn(e.target.value)} type="date" />
                        </div>
                        <div className="p-4 rounded-2xl">
                        <label>Check Out: </label>
                        <input value={checkOut} onChange={e => setCheckOut(e.target.value)} type="date" />
                        </div>
                   </div>
                    <div className="p-4 rounded-2xl">
                      <label>Number of Guests: </label>
                      <input value={numberOfGuests} onChange={e => setNumberOfGuests(e.target.value)} type="number" />
                    </div>
                    {
                      noOfDays > 0 && (
                        <div className="py-3 px-4 border-t">
                          <label> Your Full Name</label>
                          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name"/>
                          <label> Your Email</label>
                          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@gmail.com" />
                          <label> Your Phone Number </label>
                          <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+254..." />
                        </div>
                      )
                    }
                    <button onClick={saveBooking} className="mt-4 primary">
                      Book Now 
                      {
                        noOfDays > 0 && (
                          <span className='mx-1'>
                            for Kshs. {noOfDays * numberOfGuests * place.price }
                          </span>
                        )
                      }
                    </button>
                  </div>
                </div>
            </div>
          </div>
        )
      }

      <Footer />      
    </div>
  )
}

export default PlacePage