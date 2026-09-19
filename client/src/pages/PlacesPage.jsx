import axios from 'axios';
import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import Perks from '../components/Perks';
import PhotoUploader from '../components/photos/PhotoUploader';
import MyPlacesPage from './MyPlacesPage';

const PlacesPage = ({toast, ownerId}) => {
  const navigate = useNavigate();
  const {actionOrId} = useParams();
  //states
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [addedPhotos, setAddedPhotos] = useState([])
  const [description, setDescription] = useState('')
  const [perks, setPerks] = useState([])
  const [extraInfo, setExtraInfo] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState("")
  const [maxGuests, setMaxGuests] = useState(1)
  const [price, setPrice] = useState(0)
  const [photosUploading, setPhotosUploading] = useState(false)

  const savePlace = async(e) => {
    e.preventDefault()
    if (photosUploading) {
      toast.error("Wait for your photos to finish uploading.");
      return;
    }
    if (!ownerId || !title || !address || !addedPhotos?.length || !description || 
      !perks || !extraInfo || !checkIn || !checkOut || !maxGuests ||!price){
        toast.error("Missing data. Check all your Input Fields!");
        return;
    }
    const data = {owner:ownerId, title, address, photos:addedPhotos, description, perks, 
      extraInfo, checkIn, checkOut, maxGuests, price }
    const setStatesNull = ()=> {
      setTitle(""); setAddress(""); setAddedPhotos(null); setDescription(""); setPerks(null); setExtraInfo("");
      setCheckIn(""); setCheckOut(""); setMaxGuests(1); setPrice(0)
    }
    //create a new place
    if (actionOrId === "new") {
      toast.success("Creating new place...")
      try {
        const response = await axios.post("/places", data)
        console.log(response);
        if (response.status === 201){
            toast.success("Place created successfully!")
            navigate("/profile/places")
            setStatesNull()
        }        
      } catch (error) {
        toast.error(error.message)
      }
    } else {
      toast.success("updating place...")
      try {
        const response = await axios.put(`/places/${actionOrId}/${ownerId}`, data)
        console.log(response);
        if (response.status === 201){
            toast.success("Place Updated successfully!")
            navigate("/profile/places")
            setStatesNull()
        }        
      } catch (error) {
        toast.error(error.message)
      }
    }
    
  }
  const getPlace = async() => {
    try {
      const response = await axios.get(`places/place/${actionOrId}`);
      const {data} =response;
      setTitle(data.title); setAddress(data.address); setAddedPhotos(data.photos); setDescription(data.description);
      setPerks(data.perks); setExtraInfo(data.extraInfo); setCheckIn(data.checkIn); setCheckOut(data.checkOut); 
      setMaxGuests(data.maxGuests); setPrice(data.price)
    } catch (error) {
      toast.error("Fetching Place error!")
    }
  }

  useEffect(() => {
    if (!actionOrId || actionOrId === "new"){
      setTitle(""); setAddress(""); setAddedPhotos(null); setDescription(""); setPerks(null); 
      setExtraInfo(""); setCheckIn(""); setCheckOut(""); setMaxGuests(1); setPrice(0)
      return
    }
    getPlace()
    
  }, [actionOrId])

  //console.log(addedPhotos)
  return (
    <div>        
        {            
          !actionOrId  && (
           <MyPlacesPage toast={toast} ownerId={ownerId} />
          )
        }
        {
          actionOrId && (
            <div>
              <form action="">
                <h2 className="text-2xl mt-4">Title</h2>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder='title eg: My Lovely Apartment' />
                <h2 className="text-2xl mt-4">Address</h2>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder='address' />
                <h2 className="text-2xl mt-4">Photos</h2>
                <PhotoUploader photos={addedPhotos} onChange={setAddedPhotos} toast={toast} onUploadingChange={setPhotosUploading} />
                <h2 className="text-2xl mt-4">Description</h2>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className='' name="description" id="" rows="5" />
                <h2 className="text-2xl mt-4">Perks</h2>
                <Perks selected={perks} onChange={setPerks} />
                <h2 className="text-2xl mt-4">Extra Information</h2>
                <textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} className='' name="description" id="" rows="5" />
                <h2 className="text-2xl mt-4">Check in&out Times</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <h3 className="m2-2 -mb-1">Check In Time</h3>
                    <input value={checkIn} onChange={e => setCheckIn(e.target.value)} type="time" placeholder='14:00' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Check Out Time</h3>
                    <input value={checkOut} onChange={e => setCheckOut(e.target.value)} type="time" placeholder='14:00' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Maximum Number of Guests</h3>
                    <input value={maxGuests} onChange={e => setMaxGuests(e.target.value)} type="number" placeholder='0' />
                  </div>
                  <div>
                    <h3 className="m2-2 -mb-1">Price</h3>
                    <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder='0' />
                  </div>
                </div>
                <button onClick={savePlace} className="primary my-4">Save Place</button>
             </form>
            </div>
          )
        }           
    </div>
  )
}

export default PlacesPage