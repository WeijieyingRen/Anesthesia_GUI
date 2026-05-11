# Google Drive Annotation Sync Setup

This app can save each annotation submission as a JSON file in a Google Drive
folder that you own. Do not use or share your Google account password. Use a
Google Cloud service account and share only one Drive folder with that service
account.

## 1. Create a Google Drive folder

1. Open Google Drive with your own account.
2. Create a folder named `Anesthesia_GUI_Annotations`.
3. Open the folder.
4. Copy the folder ID from the URL.

Example URL:

```text
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
```

The folder ID is:

```text
1AbCdEfGhIjKlMnOpQrStUvWxYz
```

You will use this value as `DRIVE_FOLDER_ID`.

## 2. Create a Google Cloud project

1. Go to Google Cloud Console.
2. Create a project, for example `anesthesia-gui-drive-sync`.
3. In that project, enable the Google Drive API.

Google Drive API path:

```text
APIs & Services -> Library -> Google Drive API -> Enable
```

## 3. Create a service account

1. Go to:

```text
IAM & Admin -> Service Accounts
```

2. Click `Create service account`.
3. Name it something like:

```text
anesthesia-gui-drive-writer
```

4. You do not need to grant broad project roles for this app.
5. Finish creating the account.
6. Copy the service account email. It will look like:

```text
anesthesia-gui-drive-writer@your-project-id.iam.gserviceaccount.com
```

## 4. Share only the Drive folder with the service account

1. Go back to your Google Drive folder `Anesthesia_GUI_Annotations`.
2. Click `Share`.
3. Paste the service account email.
4. Give it `Editor` access.
5. Save.

This is the key safety step. The app can only write into the folder you shared.
It does not get your Google password or full Drive access.

## 5. Create a service account key

1. In Google Cloud, open the service account.
2. Go to `Keys`.
3. Click `Add key`.
4. Choose `Create new key`.
5. Choose `JSON`.
6. Download the JSON file.

Keep this JSON private. Do not commit it to GitHub.

## 6. Configure local development

For local testing, create or update `.env.local`:

```env
DRIVE_ENABLED=true
DRIVE_FOLDER_ID=your_google_drive_folder_id
GOOGLE_APPLICATION_CREDENTIALS=./your-service-account-key.json
```

Put the JSON key file at the path used by `GOOGLE_APPLICATION_CREDENTIALS`.
Make sure the key file is not committed to GitHub.

## 7. Configure Vercel

In Vercel:

```text
Project -> Settings -> Environment Variables
```

Add these variables for `Production`:

```env
DRIVE_ENABLED=true
DRIVE_FOLDER_ID=your_google_drive_folder_id
DRIVE_SERVICE_ACCOUNT_KEY={the entire downloaded JSON file content}
```

Important:

- `DRIVE_SERVICE_ACCOUNT_KEY` is not a path. Paste the full JSON content.
- Do not add your Google password.
- Do not put the JSON key in GitHub.
- After adding environment variables, redeploy the project.

## 8. Optional settings

If you want a failed Drive upload to make the whole submit request fail, add:

```env
DRIVE_REQUIRE_SUCCESS=true
```

If this is not set, the app returns `ok: true` when the annotation save works
elsewhere but includes a Drive warning in the API response.

## 9. Expected Drive folder structure

The app creates folders automatically under your selected Drive folder:

```text
Anesthesia_GUI_Annotations/
  doctorId_accessCode/
    patientId/
      summary/
        summary.json
      abnormality_reasoning/
        selection_overview.json
        episode_1/
          detection/
            detection.json
          mechanism/
            mechanism.json
          intervention/
            intervention.json
      management_reasoning/
        management_reasoning.json
      case_submission/
        final_submission.json
```

Each later save updates the same JSON file instead of creating endless duplicate
files.

## 10. How to test

1. Redeploy Vercel after setting environment variables.
2. Open the app.
3. Complete one annotation step and click save or submit.
4. Open the Drive folder.
5. Confirm a JSON file appears under the expected patient folder.
6. If it does not appear, check Vercel logs for `Drive upload failed`.

Common issues:

- Folder was not shared with the service account email.
- `DRIVE_FOLDER_ID` copied incorrectly.
- `DRIVE_SERVICE_ACCOUNT_KEY` is not valid JSON.
- Google Drive API was not enabled in the Google Cloud project.
- The service account key was disabled or deleted.
