package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeocodedStop {
    private String name;
    private Double lat;
    private Double lng;
    private String formattedAddress;
    private String placeId;
    private String type;
    private Double confidence;
    private String original;
}
