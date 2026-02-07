package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NavigationResponse {
    private boolean success;
    private String transcript;
    private List<StopInfo> extractedStops;
    private RouteResponse route;
    private List<String> warnings;
    private String error;
}
