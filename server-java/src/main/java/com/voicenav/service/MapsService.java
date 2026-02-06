package com.voicenav.service;

import com.google.maps.DirectionsApi;
import com.google.maps.GeoApiContext;
import com.google.maps.GeocodingApi;
import com.google.maps.model.*;
import com.voicenav.model.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class MapsService {

    private final GeoApiContext geoApiContext;

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
     * Get multi-stop route
     */
    public RouteResponse getMultiStopRoute(List<StopInfo> stops) throws Exception {
        if (stops.size() < 2) {
            throw new IllegalArgumentException("At least 2 stops are required for a route");
        }

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

        // Get directions
        String origin = buildGeocodingQuery(stops.get(0));
        String destination = buildGeocodingQuery(stops.get(stops.size() - 1));

        DirectionsResult directionsResult;

        // Add waypoints if there are intermediate stops
        if (stops.size() > 2) {
            String[] waypoints = stops.subList(1, stops.size() - 1).stream()
                    .map(this::buildGeocodingQuery)
                    .toArray(String[]::new);
            directionsResult = DirectionsApi.newRequest(geoApiContext)
                    .origin(origin)
                    .destination(destination)
                    .mode(TravelMode.DRIVING)
                    .waypoints(waypoints)
                    .await();
        } else {
            directionsResult = DirectionsApi.newRequest(geoApiContext)
                    .origin(origin)
                    .destination(destination)
                    .mode(TravelMode.DRIVING)
                    .await();
        }

        if (directionsResult.routes == null || directionsResult.routes.length == 0) {
            throw new RuntimeException("No route found");
        }

        DirectionsRoute route = directionsResult.routes[0];

        // Build legs
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

    private String formatDuration(long seconds) {
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;

        if (hours > 0) {
            return String.format("%d hr %d min", hours, minutes);
        }
        return String.format("%d min", minutes);
    }
}
