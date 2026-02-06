#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f "../server/.env" ]; then
    export $(cat ../server/.env | grep -v '^#' | xargs)
fi

# Run Spring Boot application
mvn spring-boot:run
