# Voice-Activated Multi-Stop Navigation Route Planner

A web application that accepts voice input, processes it through Google Gemini's multimodal API, and generates a navigation route with multiple stops using Google Maps API.

## Prerequisites

- Node.js 18+
- Google Cloud account with:
  - Gemini API key (from [Google AI Studio](https://aistudio.google.com/))
  - Google Maps API key with these APIs enabled:
    - Maps JavaScript API
    - Directions API
    - Geocoding API

## Setup

1. **Clone and install dependencies:**

```bash
cd voice-nav-app
npm install
```

2. **Configure environment variables:**

Create a `.env` file in the `server/` directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and add your API keys:

```
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
PORT=3001
```

3. **Configure client environment:**

Create a `.env` file in the `client/` directory:

```
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

## Running the Application

**Start both servers concurrently:**

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run client
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Usage

1. Open the app in your browser
2. Click the microphone button to start recording
3. Speak your navigation request, e.g.:
   - "Navigate from San Francisco to Los Angeles with a stop in San Jose"
   - "I want to go from New York to Boston, stopping in Hartford"
4. Click the button again to stop recording
5. Wait for the route to be processed and displayed on the map

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Express API    │────▶│  Google Gemini  │
│  (Voice Input)  │     │    Server       │     │  (Audio → Text) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐             │
        │               │ Google Maps API │◀────────────┘
        │               │  (Directions)   │   (extracted stops)
        │               └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────────────────────────────┐
│         Map Display with Route          │
└─────────────────────────────────────────┘
```

## API Endpoints

### POST /api/process-voice
Process voice input and return navigation route.

**Request:** `multipart/form-data` with `audio` file

**Response:**
```json
{
  "success": true,
  "extractedStops": ["San Francisco", "San Jose", "Los Angeles"],
  "route": {
    "stops": [...],
    "legs": [...],
    "overview_polyline": "...",
    "totals": {
      "distance": { "value": 123456, "text": "76.7 mi" },
      "duration": { "value": 3600, "text": "1 hr 0 min" }
    }
  }
}
```

### POST /api/route
Get route for manually specified stops.

**Request:**
```json
{
  "stops": ["Location A", "Location B", "Location C"]
}
```

## Project Structure

```
voice-nav-app/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceRecorder.jsx
│   │   │   ├── MapDisplay.jsx
│   │   │   └── RouteInfo.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── App.css
│   ├── index.html
│   └── vite.config.js
├── server/                    # Express backend
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   │   └── navigation.js
│   │   └── services/
│   │       ├── gemini.js
│   │       └── maps.js
│   └── .env.example
└── package.json
```

## Troubleshooting

- **Microphone not working:** Ensure you've granted microphone permissions in your browser
- **Map not loading:** Check that your Google Maps API key is valid and has the required APIs enabled
- **Voice not recognized:** Speak clearly and ensure your microphone is working properly
- **CORS errors:** Make sure both servers are running and the Vite proxy is configured correctly
