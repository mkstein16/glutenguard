-- This creates a table to store restaurant search results
CREATE TABLE restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    search_query VARCHAR(500) NOT NULL,
    safety_score INTEGER CHECK (safety_score >= 0 AND safety_score <= 10),
    analysis_json JSONB NOT NULL,
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(name, location)
);

-- This makes searching faster
CREATE INDEX idx_restaurant_search ON restaurants(name, location);
CREATE INDEX idx_expires_at ON restaurants(expires_at);

-- This creates a table for users (simple version for now)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    search_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- This creates a table to track which restaurants users save
CREATE TABLE saved_restaurants (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX idx_user_saved ON saved_restaurants(user_id);

-- Track search usage for anonymous (non-signed-in) users by IP
CREATE TABLE anonymous_usage (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(45) UNIQUE NOT NULL,
    search_count INTEGER DEFAULT 0,
    first_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Restaurant requests from users who hit the search limit
CREATE TABLE restaurant_requests (
    id SERIAL PRIMARY KEY,
    restaurant_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    user_email VARCHAR(255),
    ip_address VARCHAR(45) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at TIMESTAMP
);

-- Pro waitlist signups
CREATE TABLE waitlist (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    signed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);