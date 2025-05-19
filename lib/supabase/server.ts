/**
 * Creates a Supabase client for use in Next.js Edge Runtime API routes (server-side).
 * It configures the client with cookie-based authentication, using the provided `cookies()`
 * from `next/headers` to manage session information.
 *
 * @param cookieStore The Next.js `RequestCookies` object (from `cookies()`).
 * @returns A Supabase client instance configured for server-side Edge operations.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client instance for use in Next.js Edge Runtime API routes with cookie-based authentication.
 *
 * The client is configured using environment variables for the Supabase URL and anonymous key, and manages authentication cookies via the provided {@link cookieStore}.
 *
 * @param cookieStore - The Next.js {@link RequestCookies} object used for reading and writing authentication cookies.
 * @returns A Supabase client instance configured for server-side operations in Edge Runtime.
 *
 * @throws {Error} If required environment variables are missing or if client creation fails.
 */
export function createEdgeClient(cookieStore: ReturnType<typeof cookies>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  try {
    return createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            // Pass all relevant options for cookie removal (excluding 'expires')
            cookieStore.delete({
              name,
              path: options.path,
              domain: options.domain,
              maxAge: options.maxAge,
              sameSite: options.sameSite,
              secure: options.secure,
              httpOnly: options.httpOnly,
            });
          },
        },
      }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error('Error creating Supabase client:', errMsg);
    throw new Error('Failed to create Supabase client: ' + errMsg);
  }
} 