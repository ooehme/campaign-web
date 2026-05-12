import L from 'leaflet'

const posterLocationSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
  <path d="M16 0C7.163 0 0 7.163 0 16c0 11.2 16 32 16 32s16-20.8 16-32C32 7.163 24.837 0 16 0z" fill="#ff1f1f"/>
  <circle cx="16" cy="16" r="6" fill="#ffffff"/>
</svg>`

const campaignBoothLocationSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
  <path d="M16 0C7.163 0 0 7.163 0 16c0 11.2 16 32 16 32s16-20.8 16-32C32 7.163 24.837 0 16 0z" fill="#0f766e"/>
  <path d="M9 15h14l-2-6H11l-2 6z" fill="#ffffff"/>
  <path d="M10 16h12v10H10z" fill="#ffffff"/>
  <path d="M13 19h6v7h-6z" fill="#0f766e"/>
</svg>`

export const posterLocationIcon = L.divIcon({
  className: '',
  html: posterLocationSvg,
  iconSize: [32, 48],
  iconAnchor: [16, 48],
  popupAnchor: [0, -44],
})

export const campaignBoothLocationIcon = L.divIcon({
  className: '',
  html: campaignBoothLocationSvg,
  iconSize: [32, 48],
  iconAnchor: [16, 48],
  popupAnchor: [0, -44],
})
