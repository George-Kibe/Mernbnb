import React from 'react'

// A place's photo as a square thumbnail, or a placeholder when it has none.
const ImageComponent = ({place, index=0, className=''}) => {
  const src = place?.photos?.[index];
  if (!src){
    return <div className={`grid aspect-square w-full place-items-center bg-gray-100 text-sm text-gray-500 ${className}`}>No photo</div>
  }
  return (
    <img className={`aspect-square w-full object-cover ${className}`} src={src} alt={place.title || 'Place photo'} loading="lazy" />
  )
}

export default ImageComponent
