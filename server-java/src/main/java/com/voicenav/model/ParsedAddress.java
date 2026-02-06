package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParsedAddress {
    private String streetNumber;
    private String streetName;
    private String city;
    private String state;
    private String country;
    private String postalCode;
    private String landmark;
    private String businessName;
}
