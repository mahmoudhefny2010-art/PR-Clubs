# Cloudinary image uploads

The site uploads selected images directly from the browser to Cloudinary, so a 10 MB image does not pass through the Vercel Function request-size limit. The server signs each upload and verifies the resulting asset before saving its URL.

In the Cloudinary Console, open **Dashboard** and copy the cloud name, API key, and API secret. Keep the API secret private.

For local development, add the three values to the ignored `.env` file at the project root:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Alternatively, use the `CLOUDINARY_URL` value shown in your Cloudinary dashboard:

```dotenv
CLOUDINARY_URL=cloudinary://your_api_key:your_api_secret@your_cloud_name
```

For the deployed site, add either those three variables or `CLOUDINARY_URL` in **Vercel → Project → Settings → Environment Variables** for the environments you use, then redeploy. Do not put the API secret in frontend code or commit `.env`.

The upload form accepts PNG, JPG, and WebP files up to 10 MiB. Cloudinary account usage limits still apply.
