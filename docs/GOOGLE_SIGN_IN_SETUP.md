# Google sign-in for MIU students

Google sign-in is enabled only when `GOOGLE_CLIENT_ID` is set in the server environment. The server accepts verified Google ID tokens only when their audience matches that client ID, the Google hosted domain is `miuegypt.edu.eg`, the email is verified, and the one-time nonce matches the browser session.

## Setup

1. Create an OAuth 2.0 **Web application** client in the Google Cloud project used for the site.
2. Add each site origin under **Authorized JavaScript origins**, including the local origin used for development (for example, `http://localhost:1111`) and the production HTTPS origin.
3. Set `GOOGLE_CLIENT_ID` in the server's environment to the Web application client ID. Do not add a client secret to browser code.
4. Restart the server. The Google button appears on the student sign-in page when the client ID is available.

Google sign-in still requires an MIU Workspace account. The server checks the token signature against Google's signing keys and verifies the token audience, issuer, email, hosted domain, expiration, and nonce before creating a student session. A normal Google account or an unverified email is rejected.

Students can also use the email and password option. Creating that account requires an `@miuegypt.edu.eg` address and working SMTP settings so the server can send its verification code.
