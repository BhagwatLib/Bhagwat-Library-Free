/**
 * Public URL of the API.
 * Configured for local development on http://localhost:5000.
 */
const configuredUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const BACKEND_URL = configuredUrl.replace(/\/+$/, '');

