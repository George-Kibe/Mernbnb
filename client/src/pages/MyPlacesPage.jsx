import axios from 'axios';
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router'


const MyPlacesPage = ({toast, ownerId}) => {
  const [myPlaces, setMyPlaces] = useState([]);

  const getMyPlaces = async() => {
    try {
        const response = await axios.get(`/places/${ownerId}`);
        //console.log(response)
        setMyPlaces(response.data)
    } catch (error) {
        toast.error("Error getting Your Places!")
    }
  }

  useEffect(() => {
    getMyPlaces()
  }, [])
  
  return (
    <div>
      <div className="text-center">
        <Link className="inline-flex gap-1 bg-primary text-on-primary hover:bg-primary-hover py-2 px-6 rounded-full" to={"/profile/places/new"}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add New Place
        </Link>
      </div>
      <div className='mt-4'>
        {
          myPlaces.length > 0 && myPlaces.map(place => (
            <Link to={`/profile/places/${place._id}`} key={place._id} className="md:flex bg-gray-100 gap-4 p-4 rounded-2xl my-4">
              <div className="flex w-32 h-32 shrink-0">
                {
                  place.photos?.[0] && (
                    <img className='w-full object-cover rounded-2xl' src={place.photos[0]} alt={place.title} loading="lazy" />
                  )
                }
              </div>
              <div className='grow-0 shrink'>
                <h2 className="text-xl">{place.title}</h2>
                <p className="text-sm mt-2">{place.description}</p>
              </div>
            </Link>
          ))
        }
      </div>
    </div>
  )
}

export default MyPlacesPage