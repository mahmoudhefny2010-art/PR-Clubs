# OneSignal setup

This project uses the OneSignal Web SDK v16. Push updates are available to signed-in students, club accounts, and staff accounts from the account menu. Email updates are student-only and linked to the verified email on the signed-in student account. Push permission is requested only after an explicit click. No real messages are sent unless valid OneSignal credentials are configured and an accepted application or newly published student-facing post exists.

## Dashboard configuration

1. Create a OneSignal app with **Web Push** and **Email** channels and choose **Custom Code** for Web Push.
2. Under **Settings → Push & In-App → Web**, set the site URL to the exact origin being used. Production currently uses `https://pr-clubs-ten.vercel.app`. Create a separate OneSignal app for local development (`http://localhost:1111`) as OneSignal recommends.
3. Keep automatic permission prompting and welcome notifications disabled. Permission is requested by the platform UI only after the student clicks **Turn on notifications**.
4. The app hosts its worker at `/push/onesignal/OneSignalSDKWorker.js` with scope `/push/onesignal/`. This is configured in code. Do not configure the dashboard to register a second worker path for a Typical Site integration.
5. Copy the **App ID** and create/copy the server **REST API Key** from OneSignal's Keys & IDs settings. The App ID is public configuration; the REST key is private.
6. Set up an email sending provider in OneSignal's Email settings, including its required sender/domain verification. Selecting Email during app creation alone does not configure an email sender.

OneSignal setup reference: https://documentation.onesignal.com/docs/en/web-push-custom-code-setup

## Environment variables

Set these in local `.env` and in Vercel Project → Settings → Environment Variables. Do not commit `.env`.

```dotenv
ONESIGNAL_APP_ID=YOUR_ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY=YOUR_PRIVATE_ONESIGNAL_REST_API_KEY
ONESIGNAL_SITE_URL=https://pr-clubs-ten.vercel.app
```

For local development, use the separate local OneSignal app and set:

```dotenv
ONESIGNAL_SITE_URL=http://localhost:1111
```

Redeploy after changing Vercel environment variables. The API key is only read by the Node server; only the public App ID is returned by `/api/notifications/config`.

## Notification triggers and recipients

When a club application changes to **accepted**, the server sends an update to the applicant. When an administrator publishes a university event or announcement, or the Dean publishes a club event, feed post, sponsor, or booth, the server sends an update to the student audience. Private Entry Permits are excluded. Push is delivered only to active opted-in web-push subscriptions. Email is sent only to students who enabled email updates and have a OneSignal email subscription. Email consent is off by default. Published content links to the existing community feed (`/pages/feed.html`); application updates link to the signed-in forms view (`/?myForms=1`). Each event and channel has a unique database dispatch key to prevent duplicate sends. Message content includes only public content titles or a generic status update; it does not include private application details. Provider failures are logged and do not undo content publication. Missing configuration disables dispatch.

The student can turn each channel on or off in the account menu. Email preference is protected by the student session and a same-origin request check. The address comes from the authenticated account, not from a caller-supplied form value. Logging out opts the browser's push subscription out and unlinks its OneSignal web-push identity; an opted-in email subscription remains associated with that verified account so email updates can still arrive. Switching accounts removes the previous email association before identifying the next student.

## Browser support and offline behavior

The app remains usable when push is unsupported, denied, or unavailable. Web Push requires HTTPS (except supported localhost development origins). iOS/iPadOS web push requires iOS/iPadOS 16.4 or later and the site added to the Home Screen; browsers and operating systems can vary. Push itself is not available offline.

OneSignal documents its current browser requirements and iOS setup at https://documentation.onesignal.com/docs/en/web-sdk-setup.
