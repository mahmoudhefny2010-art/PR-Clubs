# Google Sign-In setup

The student login page uses Google Identity Services to receive an ID token. The server verifies the token with Google's official `google-auth-library`, checks the configured audience, the signed identity claims, the browser-bound nonce, verified email, and the MIU Workspace hosted-domain claim. Only student accounts can use this endpoint.

## Google Cloud

1. In Google Cloud Console, select or create the project used by the portal.
2. Configure the OAuth consent screen for the MIU student audience and complete any verification or Workspace administrator approval Google requires.
3. Create an OAuth client ID with application type **Web application**.
4. Add the exact site origins under **Authorized JavaScript origins**, for example:
   - `https://pr-clubs-ten.vercel.app`
   - `http://localhost:1111` for local development
   Add any custom production domain that students use. Do not add a path or trailing slash.
5. Copy the Web client ID. This Google Identity Services flow does not need a client secret or an OAuth redirect URI.

The server additionally requires Google to assert `email_verified: true` and `hd: miuegypt.edu.eg`. The browser's `hd` option is only a UI hint; the server independently checks the signed claim.

## Environment

Set this server environment variable in local `.env` and in Vercel Project Settings → Environment Variables:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Use the same Web client ID that was configured in Google Cloud. Add it to the Vercel environments where Google sign-in should appear, then redeploy. Never put a client secret in frontend code. The existing `ENABLE_DEMO_STUDENT_LOGIN` variable is unrelated.

## Account policy

- A verified MIU Google identity is matched first by Google's stable `sub` claim.
- A new student account is created only when neither that `sub` nor the verified email already has an account.
- If an account exists under the email but has no linked Google subject, Google sign-in does not link it automatically. The student signs in through the existing email/password method and opens the student sign-in page again; the signed-in page then offers **Continue with Google** to explicitly link the same verified email.
- A Google subject already linked to a different account, a different email, or a different subject already on the account is rejected.
- Google endpoints issue only the existing student session cookie. They never create or modify club, committee, or administrator roles.

## Production verification

Google sign-in is ready to test only after the real client ID is present in the target deployment and its exact production origin has been authorized in Google Cloud. This repository does not contain or invent OAuth credentials.
