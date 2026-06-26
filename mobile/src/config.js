// Central app configuration.
//
// The API base URL is read from the EXPO_PUBLIC_API_URL environment variable so
// the same code can point at different servers without editing source:
//   • Local dev on the shop LAN:  https://192.168.29.187:3000
//   • Production cloud server:     https://api.gopiramsaree.app
//
// To set it, create a `.env` file in the `mobile/` folder:
//   EXPO_PUBLIC_API_URL=https://api.gopiramsaree.app
//
// If the variable is not set, we fall back to the LAN IP used during development
// so nothing breaks for the current setup.

const DEV_FALLBACK = 'https://192.168.29.187:3000';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEV_FALLBACK;

// True when pointing at the local dev server (self-signed cert, LAN IP).
export const IS_DEV_SERVER = API_BASE_URL === DEV_FALLBACK;
