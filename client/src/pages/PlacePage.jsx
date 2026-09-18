import React, { useContext, useEffect, useState } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'
import toast, {Toaster} from "react-hot-toast"
import {differenceInCalendarDays} from 'date-fns'
import { useParams } from 'react-router'
import axios from 'axios'
import { useNavigate } from 'react-router'
import { UserContext } from '../UserContext'

const PlacePage = () => {
  const {user, ready, setUser} = useContext(UserContext);
  const [place, setPlace] = useState(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const {id} = useParams()
  const navigate = useNavigate();

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1)

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

  if (showAllPhotos) {
    return (
      <div className="absolute inset-1 bg-white m-h-screen">
        <div className="p-8 grid gap-4">
          <div>
            <h2 className="text-center text-3xl mr-36">Photos of {place.title}</h2>
            <button onClick={() => setShowAllPhotos(false)} className="fixed shadow-black flex gap-1 py-2 px-4 rounded-2xl right-12 top-8">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Close Photos
            </button>
          </div>
          {
            place?.photos?.length > 0 && place.photos.map (photo => (
              <div key={photo}>
                <img className='rounded-xl' src={photo} alt="" />
              </div>
            ))
          }
        </div>
      </div>
    )
  }
  
  return (
    <div className='p-4 flex flex-col min-h-screen'>
      <Toaster position="top-center" reverseOrder={false}></Toaster>
      <Header />
      {
        place && (
          <div className='mt-8 bg-gray-100 -mx-8 px-8 py-8'>
            <h1 className='text-2-xl'>{place.title}</h1>
            <a title={`Search ${place.address} on Google Maps`} className='my-2 flex font-semibold gap-2 items-center' href={`https://maps.google.com/?q=${place.address}`} target="_blank">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              {place.address}
            </a>
            <div className="grid gap-2 grid-cols-[2fr_1fr] relative overflow-hidden">
                <div>
                    {
                      place.photos?.[0] && (
                        <img className='aspect-square object-cover rounded-xl cursor-pointer' 
                          onClick={() => setShowAllPhotos(true)}
                          src={place.photos[0]} alt="place photo" />
                      )
                    }
                </div>
                <div className='grid'>
                    <div className=''>
                      {
                        place.photos.length > 1 ? (
                          <img className='aspect-square object-cover rounded-xl cursor-pointer' 
                            onClick={() => setShowAllPhotos(true)}
                            src={place.photos[1]} alt="place photo" />
                        )
                        :(
                            <p>No Photo</p>
                        )
                      }
                    </div>
                    <div className='pt-2'>
                      {
                        place.photos.length > 2 ? (
                          <img className='aspect-square object-cover pb-2 rounded-xl cursor-pointer' 
                            onClick={() => setShowAllPhotos(true)}
                            src={place.photos[2]} alt="place photo" />
                        )
                        :(
                            <p className='text-center'>No Photo</p>
                        )
                      }
                    </div>
                </div>
                {
                  place.photos.length > 3 && (
                    <button onClick={() => setShowAllPhotos(true)} className='flex gap-1 absolute right-2 py-3 px-4 bottom-2 rounded-2xl bg-white shadow-md'>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                      Show More Photos
                    </button>
                  )
                }
            </div>
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