export function MapComponent() {
  return (
    <html>
      <head>
        <title>Leaflet Map with Hono</title>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
        <style>
          {`
            #map {
              height: 100vh;
            }
          `}
        </style>
      </head>
      <body>
        <div id="map"></div>
      </body>
    </html>
  )
}
