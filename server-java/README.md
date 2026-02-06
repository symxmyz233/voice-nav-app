# Voice Navigation Server (Java/Spring Boot)

This is the Java/Spring Boot backend for the Voice Navigation application.

## Prerequisites

- Java 17+
- Maven 3.8+
- Google Gemini API Key
- Google Maps API Key (with Geocoding and Directions APIs enabled)

## Setup

### 1. Set Environment Variables

Option A: Export environment variables directly:
```bash
export GEMINI_API_KEY=your_gemini_api_key
export GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Option B: Create `src/main/resources/application-local.properties`:
```properties
gemini.api.key=your_gemini_api_key
google.maps.api.key=your_google_maps_api_key
```

Option C: Use the existing Node.js server's `.env` file with the run script:
```bash
./run.sh
```

### 2. Build and Run

```bash
# Using Maven directly
mvn spring-boot:run

# Or with local profile
mvn spring-boot:run -Dspring-boot.run.profiles=local

# Or from the root project directory
npm run server:java
```

The server will start on http://localhost:3001

## API Endpoints

### POST /api/process-voice
Process voice input and return navigation route.

**Request:** `multipart/form-data` with `audio` file

**Response:**
```json
{
  "success": true,
  "extractedStops": [...],
  "route": {
    "stops": [...],
    "legs": [...],
    "overview_polyline": "...",
    "totals": {...}
  },
  "warnings": []
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

### GET /api/test
Test endpoint to verify API is working.

### GET /api/health
Health check endpoint.

## Project Structure

```
server-java/
├── src/main/java/com/voicenav/
│   ├── VoiceNavApplication.java    # Main application entry
│   ├── config/
│   │   └── AppConfig.java          # CORS and beans configuration
│   ├── controller/
│   │   └── NavigationController.java   # REST endpoints
│   ├── service/
│   │   ├── GeminiService.java      # Google Gemini API integration
│   │   └── MapsService.java        # Google Maps API integration
│   └── model/
│       ├── StopInfo.java           # Structured stop information
│       ├── ParsedAddress.java      # Parsed address components
│       ├── GeocodedStop.java       # Geocoded location data
│       ├── RouteLeg.java           # Route leg information
│       ├── RouteResponse.java      # Complete route response
│       ├── NavigationResponse.java # API response wrapper
│       └── GeminiExtractionResult.java
├── src/main/resources/
│   ├── application.properties
│   └── application-local.properties.example
├── pom.xml
├── run.sh
└── README.md
```

## Running with React Frontend

From the root project directory:
```bash
npm run dev:java
```

This will start both the Java backend and React frontend concurrently.
