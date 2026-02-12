# Voice Navigation Route Planner

A full-stack web application that converts spoken navigation requests into multi-stop driving routes. Users speak naturally — "Route from Piscataway to Manhattan via George Washington Bridge" — and the app processes the audio through Google Gemini AI, geocodes each stop, and renders the route on an interactive Google Map.

## Skills & Technologies

### Frontend
- **React.js** — Component-based UI with Context API for state management (AuthContext, HistoryContext, RecentPlacesContext)
- **Web Audio API / MediaRecorder** — Browser-based audio capture and processing
- **Google Maps JavaScript API** — Interactive maps with polyline overlays, custom markers, and route rendering
- **Vite** — Modern frontend build tooling

### Backend
- **Node.js / Express.js** — RESTful API server with 17+ endpoints, middleware architecture
- **SQLite (WAL mode)** — Relational database design with concurrent read optimization (users, history, saved_routes tables)
- **Session-based Authentication** — HTTP-only cookies, secure session management, guest mode support
- **Nodemailer / SMTP** — Programmatic email delivery

### AI / NLP
- **Google Gemini API (2.0 Flash)** — Speech-to-text transcription, natural language understanding, structured data extraction from spoken input
- **Prompt Engineering** — Detailed LLM prompting for intent classification (new_route, add_stop, insert_stop, replace_stop) and entity extraction

### Google Cloud Platform
- **Geocoding API, Places API, Directions API, Address Validation API** — Multi-strategy geocoding pipeline with fallback logic and confidence scoring

### Algorithms & Problem Solving
- **Multi-strategy geocoding** — Automatic strategy selection (places_primary, address, hybrid, geocoding_only) based on input type
- **Text similarity / fuzzy matching** — Levenshtein distance, abbreviation expansion, token-level mismatch detection
- **Weighted scoring algorithm** — Coffee shop ranking by rating, review count, distance, and open-now status
- **Semantic route placement** — Context-aware stop insertion (origin-near, midpoint, one-third mark based on trip duration)

### Software Design
- **Full-stack architecture** — End-to-end ownership from UI to database
- **RESTful API design** — Clean endpoint structure with auth levels (required, optional, none)
- **Error handling & disambiguation** — Confidence thresholds, confirmation dialogs, address conflict resolution
- **Monorepo / workspace management** — Coordinated client-server project structure

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Voice Processing Pipeline](#voice-processing-pipeline)
- [Geocoding & Address Resolution](#geocoding--address-resolution)
- [Route Commands & Modification](#route-commands--modification)
- [Coffee Shop & Nearby Search](#coffee-shop--nearby-search)
- [Authentication & User Data](#authentication--user-data)
- [Email Sharing](#email-sharing)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

```
┌──────────────┐    audio    ┌──────────────┐   structured   ┌───────────────┐
│  React App   │────────────▶│  Express API │──────stops────▶│ Google Gemini │
│ (Voice, Map) │◀────route───│   Server     │◀───────────────│  (NLP / STT)  │
└──────────────┘             └──────┬───────┘                └───────────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     ▼              ▼              ▼
              ┌───────────┐ ┌────────────┐ ┌────────────────┐
              │ Geocoding │ │ Directions │ │ Places / Addr  │
              │    API    │ │    API     │ │ Validation API │
              └───────────┘ └────────────┘ └────────────────┘
```

The client captures audio via the Web Audio API and sends it to the Express server. The server forwards the audio to Google Gemini, which transcribes and parses the request into structured stop data (location type, street, city, state, business name, confidence score, command type). Each stop is then geocoded using a strategy selected per stop type, and finally the Google Directions API computes the driving route. The client renders the result on a Google Map with polyline overlay and custom markers.

State is managed through three React context providers: **AuthContext** (session, login/logout), **HistoryContext** (route history, recent destinations), and **RecentPlacesContext** (frequently visited places stored per user in localStorage).

## Voice Processing Pipeline

Audio is recorded in the browser using `MediaRecorder`, producing a WebM blob that is uploaded as `multipart/form-data` to `POST /api/process-voice`. The server passes the raw audio to the Gemini 2.0 Flash model along with a detailed prompt that instructs the model to:

1. Transcribe the spoken input.
2. Extract each stop with fields: `original`, `streetNumber`, `streetName`, `city`, `state`, `businessName`, `landmark`, `type` (full\_address | landmark | partial | relative), `confidence`, and `via` flag.
3. Classify the command type: `new_route`, `add_stop`, `insert_stop`, or `replace_stop`.
4. Detect special intents like `nearestSearch` ("find the closest Starbucks") or coffee shop requests.

When the current route is included in the request body, Gemini uses it as context to understand modification commands ("add a stop at Newark Airport" appended to an existing route).

A **voice buffer** system persists every recording to disk (`/voice_buffer/`) so users can replay or reprocess previous commands from the UI.

## Geocoding & Address Resolution

Each stop extracted by Gemini is geocoded through one of four strategies, chosen automatically based on the stop's type and flags:

| Strategy | When Used | APIs Called |
|---|---|---|
| **places\_primary** | Landmarks and businesses (e.g., "Starbucks", "Empire State Building") | Places Text Search, then Geocoding as fallback |
| **address** | Full street addresses | Address Validation API, then Geocoding as fallback |
| **hybrid** | Partial or relative locations | Geocoding + Places in parallel; flags disagreements > 1 km |
| **geocoding\_only** | Via waypoints (bridges, tunnels, highways) | Geocoding API only |

### Via Waypoints

When a user says "via George Washington Bridge", the stop is marked `via: true` and routed through the **geocoding\_only** strategy. This avoids the Places API, which tends to return nearby businesses (e.g., "GW Bridge Bus Station") instead of the infrastructure itself.

The geocoding-only strategy includes a **name-match verification** step: every significant word in the user's query must appear in the geocoded result. If the Geocoding API returns "Washington Brg" (a different bridge) for "George Washington Bridge", the missing token "george" triggers a confirmation dialog with alternative candidates so the user can select the correct location.

### Address Confirmation

Confirmation is triggered when:

- Geocoding confidence is below 0.9.
- Multiple geocoding candidates disagree by more than 1 km.
- The Address Validation API flags an incomplete address.
- The geocoded result drops significant words from the user's query (name-match failure).
- The result is far from the expected area (distance guard).

The confirmation dialog presents alternative results with source labels (Geocoding, Places, Address Validation) and allows the user to select the correct one, manually edit the text, or re-record voice for that single stop.

### Text Mismatch Detection

An address similarity utility normalizes both the user's input and the geocoded address — expanding abbreviations (`brg` to `bridge`, `nj` to `new jersey`, `gw` to `george washington`), stripping ZIP codes and country names, and removing stop words. Token-level Levenshtein distance detects silent corrections (e.g., "Weekly Ave" resolved to "Wickley Ave") and surfaces them as warnings.

## Route Commands & Modification

The app supports incremental route editing through voice:

- **New Route** — "Route from A to B to C". If no origin is specified, the user's GPS location is prepended automatically.
- **Add Stop** — "Add a stop at Newark Airport". Appends before the destination; duplicate detection prevents adding the same place twice.
- **Insert Stop** — "Add a stop at Princeton after Piscataway". Gemini determines the insertion position from context.
- **Replace Stop** — "Change the second stop to Hoboken". Swaps the stop at the specified index.

Each stop in the route list can also be edited or removed directly in the UI. Editing a stop re-geocodes it and recalculates the entire route. Removing a stop recalculates with the remaining waypoints.

## Coffee Shop & Nearby Search

Two modes of coffee discovery are supported:

**Along-route search** — When a voice command includes a coffee request ("with a coffee stop"), the app uses semantic placement to determine where along the route to search: near the origin for short trips (< 15 min), at the midpoint for medium trips, and at the one-third mark for longer drives. Results are scored by a weighted algorithm (rating 40%, review count 30%, distance 20%, open-now status 10%).

**Standalone nearby search** — "Find the nearest coffee shop" uses the user's GPS position to search within 3 km. Results are sorted by distance and displayed in a card with navigate-to-shop functionality.

Brand detection recognizes Starbucks, Dunkin, Peet's Coffee, Tim Hortons, Blue Bottle, and Philz from transcript text, and filters results accordingly. Type keywords (specialty, espresso, matcha, bakery, study cafe, drive-thru) refine the Places API query. If no coffee shops are found, the app falls back to nearby food/restaurant options.

## Authentication & User Data

The app uses session-based authentication with HTTP-only cookies (30-day expiry, secure in production). Users log in with a username and email — the server creates a new account on first login or matches an existing one by email (case-insensitive).

A **guest mode** is available: users can dismiss the login screen and use all navigation features without an account. Guest users cannot save history or access saved routes.

**History** — Every route action (new route, add/insert/replace stop) is recorded in SQLite with the transcript, extracted stops, and full route data. The `/api/history/recent-destinations` endpoint extracts unique destinations from history for quick re-navigation.

**Saved Routes** — Authenticated users can name and persist routes for later use. Saved routes track a `last_used` timestamp and appear in the Quick Start panel.

**Recent Places** — A client-side list of the last 50 unique destinations, stored per username in localStorage, enables one-tap navigation to frequently visited locations.

The SQLite database uses WAL mode for concurrent read performance and stores three tables: `users`, `history`, and `saved_routes`.

## Email Sharing

Users can email a route as a Google Maps deep link. The server constructs the URL with origin, destination, and waypoints parameters. For via waypoints, coordinates are snapped to the route's overview polyline to ensure Google Maps follows the intended path (e.g., crossing via the bridge rather than a nearby tunnel). The email is sent via Nodemailer using configurable SMTP settings.

## Prerequisites

- Node.js >= 20.17.0
- Google Cloud account with the following APIs enabled:
  - Maps JavaScript API
  - Directions API
  - Geocoding API
  - Places API
  - Address Validation API
- Google Gemini API key (from [Google AI Studio](https://aistudio.google.com/))

## Setup

1. **Install dependencies:**

```bash
cd voice-nav-app
npm install
```

2. **Configure server environment** — create `server/.env`:

```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
PORT=3001
SESSION_SECRET=your_random_secret
CLIENT_URL=http://localhost:5173
```

3. **Configure client environment** — create `client/.env`:

```
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_API_URL=http://localhost:3001/api
```

4. **Optional SMTP configuration** (for email sharing) in `server/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_app_password
SMTP_FROM=your_email
```

## Running the Application

```bash
# Both servers concurrently
npm run dev

# Or separately
npm run server   # Express on :3001
npm run client   # Vite on :5173
```

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/process-voice` | Optional | Process voice audio into a route |
| POST | `/api/route` | Optional | Calculate route from structured stops |
| POST | `/api/reconfirm-stop` | Optional | Re-voice a single stop during confirmation |
| GET | `/api/last-route` | Optional | Retrieve cached last route |
| POST | `/api/send-route-email` | Optional | Email route as Google Maps link |
| POST | `/api/find-coffee-shops` | Optional | Search coffee shops by location or route |
| GET | `/api/voice-buffers` | No | List saved voice recordings |
| GET | `/api/voice-buffers/:file` | No | Download a voice recording |
| DELETE | `/api/voice-buffers/:file` | No | Delete a voice recording |
| POST | `/api/users/login` | No | Login or create account |
| POST | `/api/users/logout` | No | Destroy session |
| GET | `/api/users/current` | No | Check current session |
| GET | `/api/history` | Required | Paginated route history |
| GET | `/api/history/recent-destinations` | Required | Unique recent destinations |
| DELETE | `/api/history/:id` | Required | Delete history entry |
| GET | `/api/saved-routes` | Required | List saved routes |
| POST | `/api/saved-routes` | Required | Save a route |
| GET | `/api/saved-routes/:id` | Required | Retrieve saved route |
| PUT | `/api/saved-routes/:id` | Required | Update saved route |
| DELETE | `/api/saved-routes/:id` | Required | Delete saved route |

## Project Structure

```
voice-nav-app/
├── client/
│   └── src/
│       ├── components/
│       │   ├── VoiceRecorder.jsx       # Audio capture & upload
│       │   ├── MapDisplay.jsx          # Google Map with route overlay
│       │   ├── RouteInfo.jsx           # Route summary & stop list
│       │   ├── AddressConfirmation.jsx # Disambiguation dialog
│       │   ├── LoginScreen.jsx         # Login / guest mode
│       │   ├── UserProfile.jsx         # User info & logout
│       │   ├── CoffeeShopModal.jsx     # Coffee shop recommendations
│       │   ├── NearbyInfoCard.jsx      # Nearby search results
│       │   ├── VoiceBufferList.jsx     # Replay past recordings
│       │   ├── QuickStartPanel.jsx     # Saved routes & quick actions
│       │   ├── RecentPlacesList.jsx    # Frequent destinations
│       │   └── RouteEmailShare.jsx     # Email sharing modal
│       ├── contexts/
│       │   ├── AuthContext.jsx         # Authentication state
│       │   ├── HistoryContext.jsx       # Route history state
│       │   └── RecentPlacesContext.jsx  # Recent places state
│       ├── services/
│       │   ├── coffeeShopService.js    # Coffee shop API calls
│       │   ├── coffeeShopPlacement.js  # Semantic route placement
│       │   └── geolocationService.js   # GPS position utilities
│       ├── config/api.js               # API base URL config
│       ├── App.jsx                     # Root component
│       └── main.jsx                    # Entry point
├── server/
│   └── src/
│       ├── index.js                    # Express app setup
│       ├── routes/
│       │   ├── navigation.js           # Voice, route, coffee endpoints
│       │   ├── users.js                # Auth endpoints
│       │   ├── history.js              # History endpoints
│       │   └── savedRoutes.js          # Saved routes endpoints
│       ├── services/
│       │   ├── gemini.js               # Gemini AI integration
│       │   ├── maps.js                 # Geocoding & routing logic
│       │   └── userService.js          # User CRUD operations
│       ├── middleware/auth.js           # requireAuth / optionalAuth
│       ├── db/database.js              # SQLite initialization
│       └── utils/
│           └── addressSimilarity.js    # Text mismatch detection
└── package.json                        # Workspace root
```

## Troubleshooting

- **Microphone not working** — Grant microphone permissions in the browser. HTTPS is required in production.
- **Map not loading** — Verify the Google Maps API key is valid and the Maps JavaScript API is enabled.
- **Voice not recognized** — Speak clearly. Check the voice buffer list to replay and reprocess recordings.
- **Wrong address resolved** — Use the confirmation dialog to select the correct alternative, or edit the stop text manually.
- **CORS errors** — Ensure both servers are running and `CLIENT_URL` in `server/.env` matches the frontend origin.
- **Session not persisting** — Set a strong `SESSION_SECRET` in the server environment. In production, ensure `NODE_ENV=production` for secure cookies.
