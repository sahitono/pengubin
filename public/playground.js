import L from "https://esm.run/leaflet"

const map = L.map("map").setView([51.505, -0.09], 13)

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map)

L.marker([51.505, -0.09]).addTo(map)
  .bindPopup("A pretty CSS3 popup.<br> Easily customizable.")
  .openPopup()
