/**
 * Public URL of the API. For production this must be the HTTPS hostname of
 * the named Cloudflare Tunnel running on the PC (for example
 * https://api.example.com), not localhost from a remote device.
 *
 * Vite substitutes VITE_BACKEND_URL when the frontend is built, so set it in
 * the hosting provider's environment variables and redeploy after changing it.
 */
const configuredUrl = import.meta.env.VITE_BACKEND_URL;

if (!configuredUrl) {
  throw new Error('VITE_BACKEND_URL must be set to your Cloudflare Tunnel backend URL.');
}

export const BACKEND_URL = configuredUrl.replace(/\/+$/, '');
