package com.voicenav.service;

import com.google.maps.DirectionsApi;
import com.google.maps.GeoApiContext;
import com.google.maps.GeocodingApi;
import com.google.maps.model.*;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.voicenav.model.*;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@Slf4j
public class MapsService {

    private final GeoApiContext geoApiContext;
    private final OkHttpClient httpClient;
    private final Gson gson;
    private final String routingApi;
    private final String apiKey;

    private static final Pattern DURATION_PATTERN = Pattern.compile("^(\\d+)s$");

    public MapsService(
            GeoApiContext geoApiContext,
            @Value("${google.maps.routing.api:directions}") String routingApi,
            @Value("${google.maps.api.key}") String apiKey
    ) {
        this.geoApiContext = geoApiContext;
        this.httpClient = new OkHttpClient();
        this.gson = new Gson();
        this.routingApi = routingApi;
        this.apiKey = apiKey;
    }

    /**
     * Resolve the configured routing API, with validation and fallback
     */
    private String resolveRoutingApi() {
        String api = (routingApi != null ? routingApi : "directions").toLowerCase();
        if (!"directions".equals(api) && !"routes".equals(api)) {
            log.warn("Unknown MAPS_ROUTING_API value \"{}\", falling back to \"directions\"", api);
            return "directions";
        }
        return api;
    }

    /**
     * Build the best geocoding query from structured stop info
     */
    private String buildGeocodingQuery(StopInfo stopInfo) {
        if (stopInfo == null) {
            return "";
        }

        // Use searchQuery if available
        if (stopInfo.getSearchQuery() != null && !stopInfo.getSearchQuery().isEmpty()) {
            return stopInfo.getSearchQuery();
        }

        ParsedAddress parsed = stopInfo.getParsed();
        if (parsed != null) {
            // For landmarks
            if ("landmark".equals(stopInfo.getType()) && parsed.getLandmark() != null) {
                return parsed.getLandmark();
            }

            // For full addresses, build from components
            if ("full_address".equals(stopInfo.getType())) {
                List<String> components = new ArrayList<>();
                if (parsed.getStreetNumber() != null) components.add(parsed.getStreetNumber());
                if (parsed.getStreetName() != null) components.add(parsed.getStreetName());
                if (parsed.getCity() != null) components.add(parsed.getCity());
                if (parsed.getState() != null) components.add(parsed.getState());
                if (parsed.getCountry() != null) components.add(parsed.getCountry());

                if (!components.isEmpty()) {
                    return String.join(", ", components);
                }
            }

            // For business names
            if (parsed.getBusinessName() != null) {
                List<String> parts = new ArrayList<>();
                parts.add(parsed.getBusinessName());
                if (parsed.getCity() != null) parts.add(parsed.getCity());
                if (parsed.getState() != null) parts.add(parsed.getState());
                return String.join(", ", parts);
            }
        }

        // Fallback to original
        return stopInfo.getOriginal() != null ? stopInfo.getOriginal() : "";
    }

    /**
     * Geocode a single stop
     */
    public GeocodedStop geocodeLocation(StopInfo stopInfo) throws Exception {
        String query = buildGeocodingQuery(stopInfo);
        log.info("Geocoding [{}]: \"{}\"", stopInfo.getType(), query);

        GeocodingResult[] results = GeocodingApi.geocode(geoApiContext, query)
                .region("us")
                .language("en")
                .await();

        if (results == null || results.length == 0) {
            throw new RuntimeException("Could not geocode location: " + query);
        }

        GeocodingResult result = results[0];

        return GeocodedStop.builder()
                .name(stopInfo.getOriginal())
                .lat(result.geometry.location.lat)
                .lng(result.geometry.location.lng)
                .formattedAddress(result.formattedAddress)
                .placeId(result.placeId)
                .type(stopInfo.getType())
                .confidence(stopInfo.getConfidence())
                .original(stopInfo.getOriginal())
                .build();
    }

    /**
     * Get route via the legacy Directions API
     */
    private DirectionsResult getRouteViaDirectionsApi(List<StopInfo> stops) throws Exception {
        String origin = buildGeocodingQuery(stops.get(0));
        String destination = buildGeocodingQuery(stops.get(stops.size() - 1));

        DirectionsResult directionsResult;

        if (stops.size() > 2) {
            String[] waypoints = stops.subList(1, stops.size() - 1).stream()
                    .map(this::buildGeocodingQuery)
                    .toArray(String[]::new);
            log.info("Directions API params: origin={}, destination={}, waypoints={}",
                    origin, destination, java.util.Arrays.toString(waypoints));
            directionsResult = DirectionsApi.newRequest(geoApiContext)
                    .origin(origin)
                    .destination(destination)
                    .mode(TravelMode.DRIVING)
                    .waypoints(waypoints)
                    .await();
        } else {
            log.info("Directions API params: origin={}, destination={}, waypoints=[]",
                    origin, destination);
            directionsResult = DirectionsApi.newRequest(geoApiContext)
                    .origin(origin)
                    .destination(destination)
                    .mode(TravelMode.DRIVING)
                    .await();
        }

        if (directionsResult.routes == null || directionsResult.routes.length == 0) {
            throw new RuntimeException("No route found");
        }

        return directionsResult;
    }

    /**
     * Normalize a Directions API response into our RouteResponse model (legs, polyline, bounds, totals)
     */
    private RouteResponse normalizeDirectionsResponse(DirectionsResult directionsResult,
                                                       List<GeocodedStop> geocodedStops,
                                                       List<GeocodedStop> lowConfidenceStops) {
        DirectionsRoute route = directionsResult.routes[0];

        List<RouteLeg> legs = new ArrayList<>();
        long totalDistance = 0;
        long totalDuration = 0;

        for (DirectionsLeg leg : route.legs) {
            List<RouteLeg.RouteStep> steps = new ArrayList<>();
            for (DirectionsStep step : leg.steps) {
                steps.add(RouteLeg.RouteStep.builder()
                        .instruction(step.htmlInstructions.replaceAll("<[^>]*>", ""))
                        .distance(RouteLeg.DistanceInfo.builder()
                                .value(step.distance.inMeters)
                                .text(step.distance.humanReadable)
                                .build())
                        .duration(RouteLeg.DistanceInfo.builder()
                                .value(step.duration.inSeconds)
                                .text(step.duration.humanReadable)
                                .build())
                        .build());
            }

            legs.add(RouteLeg.builder()
                    .startAddress(leg.startAddress)
                    .endAddress(leg.endAddress)
                    .distance(RouteLeg.DistanceInfo.builder()
                            .value(leg.distance.inMeters)
                            .text(leg.distance.humanReadable)
                            .build())
                    .duration(RouteLeg.DistanceInfo.builder()
                            .value(leg.duration.inSeconds)
                            .text(leg.duration.humanReadable)
                            .build())
                    .steps(steps)
                    .build());

            totalDistance += leg.distance.inMeters;
            totalDuration += leg.duration.inSeconds;
        }

        // Build bounds
        Map<String, Object> bounds = new HashMap<>();
        if (route.bounds != null) {
            Map<String, Double> southwest = new HashMap<>();
            southwest.put("lat", route.bounds.southwest.lat);
            southwest.put("lng", route.bounds.southwest.lng);

            Map<String, Double> northeast = new HashMap<>();
            northeast.put("lat", route.bounds.northeast.lat);
            northeast.put("lng", route.bounds.northeast.lng);

            bounds.put("southwest", southwest);
            bounds.put("northeast", northeast);
        }

        // Build warnings
        List<String> warnings = new ArrayList<>();
        if (!lowConfidenceStops.isEmpty()) {
            warnings.add(lowConfidenceStops.size() + " location(s) had low confidence and may be inaccurate");
        }

        return RouteResponse.builder()
                .stops(geocodedStops)
                .legs(legs)
                .overview_polyline(route.overviewPolyline.getEncodedPath())
                .bounds(bounds)
                .totals(RouteResponse.RouteTotals.builder()
                        .distance(RouteLeg.DistanceInfo.builder()
                                .value(totalDistance)
                                .text(String.format("%.1f mi", totalDistance / 1609.34))
                                .build())
                        .duration(RouteLeg.DistanceInfo.builder()
                                .value(totalDuration)
                                .text(formatDuration(totalDuration))
                                .build())
                        .build())
                .warnings(warnings)
                .build();
    }

    /**
     * Get route via the newer Routes API (routes.googleapis.com)
     * Uses already-geocoded lat/lng so no double-geocoding occurs.
     */
    private JsonObject getRouteViaRoutesApi(List<GeocodedStop> geocodedStops) throws Exception {
        JsonObject body = new JsonObject();

        body.add("origin", buildRoutesWaypoint(geocodedStops.get(0)));
        body.add("destination", buildRoutesWaypoint(geocodedStops.get(geocodedStops.size() - 1)));
        body.addProperty("travelMode", "DRIVE");
        body.addProperty("languageCode", "en-US");
        body.addProperty("units", "IMPERIAL");

        if (geocodedStops.size() > 2) {
            JsonArray intermediates = new JsonArray();
            for (int i = 1; i < geocodedStops.size() - 1; i++) {
                intermediates.add(buildRoutesWaypoint(geocodedStops.get(i)));
            }
            body.add("intermediates", intermediates);
        }

        log.info("Routes API request body: {}", gson.toJson(body));

        String fieldMask = String.join(",",
                "routes.legs.duration",
                "routes.legs.distanceMeters",
                "routes.legs.startLocation",
                "routes.legs.endLocation",
                "routes.legs.steps.navigationInstruction",
                "routes.legs.steps.distanceMeters",
                "routes.legs.steps.staticDuration",
                "routes.legs.localizedValues",
                "routes.polyline",
                "routes.viewport",
                "routes.distanceMeters",
                "routes.duration",
                "routes.localizedValues"
        );

        RequestBody requestBody = RequestBody.create(
                gson.toJson(body),
                okhttp3.MediaType.parse("application/json")
        );

        Request request = new Request.Builder()
                .url("https://routes.googleapis.com/directions/v2:computeRoutes")
                .post(requestBody)
                .addHeader("X-Goog-Api-Key", apiKey)
                .addHeader("X-Goog-FieldMask", fieldMask)
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            String responseBody = response.body() != null ? response.body().string() : "";

            if (!response.isSuccessful()) {
                throw new RuntimeException("Routes API error (" + response.code() + "): " + responseBody);
            }

            JsonObject data = gson.fromJson(responseBody, JsonObject.class);

            if (data == null || !data.has("routes") || data.getAsJsonArray("routes").isEmpty()) {
                throw new RuntimeException("No route found from Routes API");
            }

            return data;
        }
    }

    private JsonObject buildRoutesWaypoint(GeocodedStop stop) {
        JsonObject latLng = new JsonObject();
        latLng.addProperty("latitude", stop.getLat());
        latLng.addProperty("longitude", stop.getLng());

        JsonObject location = new JsonObject();
        location.add("latLng", latLng);

        JsonObject waypoint = new JsonObject();
        waypoint.add("location", location);

        return waypoint;
    }

    /**
     * Parse a Routes API duration string like "300s" into seconds
     */
    private long parseDurationString(String durationStr) {
        if (durationStr == null || durationStr.isEmpty()) return 0;
        Matcher m = DURATION_PATTERN.matcher(durationStr);
        return m.matches() ? Long.parseLong(m.group(1)) : 0;
    }

    /**
     * Normalize a Routes API response into our RouteResponse model
     */
    private RouteResponse normalizeRoutesResponse(JsonObject data,
                                                   List<GeocodedStop> geocodedStops,
                                                   List<GeocodedStop> lowConfidenceStops) {
        JsonObject route = data.getAsJsonArray("routes").get(0).getAsJsonObject();

        // Build legs
        List<RouteLeg> legs = new ArrayList<>();
        JsonArray legsArray = route.has("legs") ? route.getAsJsonArray("legs") : new JsonArray();

        for (int i = 0; i < legsArray.size(); i++) {
            JsonObject leg = legsArray.get(i).getAsJsonObject();

            long distanceMeters = leg.has("distanceMeters") ? leg.get("distanceMeters").getAsLong() : 0;
            long durationSeconds = leg.has("duration") ? parseDurationString(leg.get("duration").getAsString()) : 0;

            // Use localizedValues if available
            String distanceText = String.format("%.1f mi", distanceMeters / 1609.34);
            String durationText = formatDuration(durationSeconds);

            if (leg.has("localizedValues")) {
                JsonObject localized = leg.getAsJsonObject("localizedValues");
                if (localized.has("distance") && localized.getAsJsonObject("distance").has("text")) {
                    distanceText = localized.getAsJsonObject("distance").get("text").getAsString();
                }
                if (localized.has("duration") && localized.getAsJsonObject("duration").has("text")) {
                    durationText = localized.getAsJsonObject("duration").get("text").getAsString();
                }
            }

            // Build steps
            List<RouteLeg.RouteStep> steps = new ArrayList<>();
            JsonArray stepsArray = leg.has("steps") ? leg.getAsJsonArray("steps") : new JsonArray();

            for (JsonElement stepEl : stepsArray) {
                JsonObject step = stepEl.getAsJsonObject();

                long stepDistMeters = step.has("distanceMeters") ? step.get("distanceMeters").getAsLong() : 0;
                long stepDurSeconds = step.has("staticDuration") ? parseDurationString(step.get("staticDuration").getAsString()) : 0;

                String instruction = "";
                if (step.has("navigationInstruction")) {
                    JsonObject navInstr = step.getAsJsonObject("navigationInstruction");
                    if (navInstr.has("instructions")) {
                        instruction = navInstr.get("instructions").getAsString();
                    }
                }

                steps.add(RouteLeg.RouteStep.builder()
                        .instruction(instruction)
                        .distance(RouteLeg.DistanceInfo.builder()
                                .value(stepDistMeters)
                                .text(String.format("%.1f mi", stepDistMeters / 1609.34))
                                .build())
                        .duration(RouteLeg.DistanceInfo.builder()
                                .value(stepDurSeconds)
                                .text(formatDuration(stepDurSeconds))
                                .build())
                        .build());
            }

            String startAddress = (i < geocodedStops.size()) ? geocodedStops.get(i).getFormattedAddress() : "";
            String endAddress = (i + 1 < geocodedStops.size()) ? geocodedStops.get(i + 1).getFormattedAddress() : "";

            legs.add(RouteLeg.builder()
                    .startAddress(startAddress)
                    .endAddress(endAddress)
                    .distance(RouteLeg.DistanceInfo.builder()
                            .value(distanceMeters)
                            .text(distanceText)
                            .build())
                    .duration(RouteLeg.DistanceInfo.builder()
                            .value(durationSeconds)
                            .text(durationText)
                            .build())
                    .steps(steps)
                    .build());
        }

        // Polyline
        String overviewPolyline = "";
        if (route.has("polyline") && route.getAsJsonObject("polyline").has("encodedPolyline")) {
            overviewPolyline = route.getAsJsonObject("polyline").get("encodedPolyline").getAsString();
        }

        // Bounds: viewport.low / viewport.high → southwest / northeast
        Map<String, Object> bounds = new HashMap<>();
        if (route.has("viewport")) {
            JsonObject viewport = route.getAsJsonObject("viewport");

            if (viewport.has("low")) {
                JsonObject low = viewport.getAsJsonObject("low");
                Map<String, Double> southwest = new HashMap<>();
                southwest.put("lat", low.has("latitude") ? low.get("latitude").getAsDouble() : 0.0);
                southwest.put("lng", low.has("longitude") ? low.get("longitude").getAsDouble() : 0.0);
                bounds.put("southwest", southwest);
            }

            if (viewport.has("high")) {
                JsonObject high = viewport.getAsJsonObject("high");
                Map<String, Double> northeast = new HashMap<>();
                northeast.put("lat", high.has("latitude") ? high.get("latitude").getAsDouble() : 0.0);
                northeast.put("lng", high.has("longitude") ? high.get("longitude").getAsDouble() : 0.0);
                bounds.put("northeast", northeast);
            }
        }

        // Totals
        long totalDistance = legs.stream().mapToLong(l -> l.getDistance().getValue()).sum();
        long totalDuration = legs.stream().mapToLong(l -> l.getDuration().getValue()).sum();

        String totalDistanceText = String.format("%.1f mi", totalDistance / 1609.34);
        String totalDurationText = formatDuration(totalDuration);

        if (route.has("localizedValues")) {
            JsonObject localized = route.getAsJsonObject("localizedValues");
            if (localized.has("distance") && localized.getAsJsonObject("distance").has("text")) {
                totalDistanceText = localized.getAsJsonObject("distance").get("text").getAsString();
            }
            if (localized.has("duration") && localized.getAsJsonObject("duration").has("text")) {
                totalDurationText = localized.getAsJsonObject("duration").get("text").getAsString();
            }
        }

        // Warnings
        List<String> warnings = new ArrayList<>();
        if (!lowConfidenceStops.isEmpty()) {
            warnings.add(lowConfidenceStops.size() + " location(s) had low confidence and may be inaccurate");
        }

        return RouteResponse.builder()
                .stops(geocodedStops)
                .legs(legs)
                .overview_polyline(overviewPolyline)
                .bounds(bounds)
                .totals(RouteResponse.RouteTotals.builder()
                        .distance(RouteLeg.DistanceInfo.builder()
                                .value(totalDistance)
                                .text(totalDistanceText)
                                .build())
                        .duration(RouteLeg.DistanceInfo.builder()
                                .value(totalDuration)
                                .text(totalDurationText)
                                .build())
                        .build())
                .warnings(warnings)
                .build();
    }

    /**
     * Get multi-stop route
     */
    public RouteResponse getMultiStopRoute(List<StopInfo> stops) throws Exception {
        if (stops.size() < 2) {
            throw new IllegalArgumentException("At least 2 stops are required for a route");
        }

        String api = resolveRoutingApi();
        log.info("Using routing API: {}", api);

        // Geocode all stops
        List<GeocodedStop> geocodedStops = new ArrayList<>();
        for (StopInfo stop : stops) {
            geocodedStops.add(geocodeLocation(stop));
        }

        // Find low confidence stops
        List<GeocodedStop> lowConfidenceStops = geocodedStops.stream()
                .filter(s -> s.getConfidence() != null && s.getConfidence() < 0.7)
                .collect(Collectors.toList());

        if (!lowConfidenceStops.isEmpty()) {
            log.warn("Low confidence locations: {}",
                    lowConfidenceStops.stream().map(GeocodedStop::getOriginal).collect(Collectors.toList()));
        }

        if ("routes".equals(api)) {
            JsonObject data = getRouteViaRoutesApi(geocodedStops);
            return normalizeRoutesResponse(data, geocodedStops, lowConfidenceStops);
        } else {
            DirectionsResult directionsResult = getRouteViaDirectionsApi(stops);
            return normalizeDirectionsResponse(directionsResult, geocodedStops, lowConfidenceStops);
        }
    }

    private String formatDuration(long seconds) {
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;

        if (hours > 0) {
            return String.format("%d hr %d min", hours, minutes);
        }
        return String.format("%d min", minutes);
    }
}
