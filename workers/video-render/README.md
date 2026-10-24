# Studio video render worker

This container runs the Python template engine (`templates_engine/render.py`) and a separate ffmpeg timeline renderer. Vercel functions cannot stay up for a three-minute ffmpeg job, so the site only queues a job. A Cloud Tasks request holds this process until the file is finished.

Nothing in this worker sends email or SMS. It never reads `CLIENT_NOTIFY_LIVE` or `BOOKING_NOTIFY_LIVE`.

Do not deploy it until the owner approves the Google Cloud bill. The commands below are the provision steps. They are not run by this pull request.

## What the owner is approving

| Piece | Setting | Why |
| --- | --- | --- |
| Cloud Run service | 4 vCPU, 8 GiB RAM, request timeout 900s, concurrency 1, min instances 0, no GPU | A 1080×1920 60 fps template is about 3.5× realtime on 8 vCPU (a 40 second reel is a few minutes of CPU). Min instances 0 means idle cost is zero. |
| Cloud Tasks queue | `studio-video` in `us-central1`, dispatch deadline 900s | One retry-able HTTP task per render. The first 1 million operations a month are free on the standard tier. |
| Artifact Registry | one image | Stores the container. |
| Firebase Storage | objects under `studio-video/renders/` | The finished mp4. Pennies per GB at public storage prices. |
| Secret | `VIDEO_WORKER_TOKEN` | Shared by the API and the worker. The worker sends it as `x-video-worker-token` when it reports progress. |

At public Cloud Run list prices, 4 vCPU and 8 GiB for a few minutes is on the order of a few cents per reel. Confirm the current Cloud Run, Cloud Tasks, and Cloud Storage prices in the Google Cloud console before turning this on. There is no GPU and no always-on instance in this design.

## What is already in the image

- `templates_engine/` is the tested renderer. Do not restyle the templates.
- Template JSON is copied from `shared/videoTemplates/`.
- Sacramento, Great Vibes, Pacifico, and Inter are OFL fonts fetched at image build into the paths `vtfx.py` expects.
- Music files are not in git. Put the Mixkit files where the engine looks:

```
heartbeat_mixkit1000.mp3
offmymind_mixkit1210.mp3
```

Either bake them in a private follow-up image or set `VIDEO_MUSIC_DIR` to a mounted directory. The track names and the Mixkit license are in `templates_engine/MUSIC_LICENSE.txt`.

## Environment

Set these on the API (Vercel preview first, production only after review). Leave them blank until the service exists. Production must keep `VIDEO_EDITOR_ENABLED` and `VIDEO_TEMPLATES_ENABLED` unset or `false` until the owner turns the editor on.

| Name | Where | Purpose |
| --- | --- | --- |
| `VIDEO_EDITOR_ENABLED` | API | `true` / `false`. Unset is off in production and on in preview. |
| `VIDEO_TEMPLATES_ENABLED` | API | Same switch for the five templates. |
| `VITE_VIDEO_EDITOR_ENABLED` | Client build | Vite inlines this. The API flag is not visible to the browser. |
| `VITE_VIDEO_TEMPLATES_ENABLED` | Client build | Same, for template mode. |
| `VIDEO_WORKER_URL` | API | Cloud Run URL, no trailing path. |
| `VIDEO_WORKER_AUDIENCE` | API | Optional. Defaults to the worker URL. OIDC audience. |
| `VIDEO_WORKER_TOKEN` | API and worker | Shared progress secret. |
| `VIDEO_TASKS_QUEUE` | API | Queue id, for example `studio-video`. |
| `VIDEO_TASKS_LOCATION` | API | Default `us-central1`. |
| `VIDEO_TASKS_SERVICE_ACCOUNT` | API | Email that Cloud Tasks uses to call Cloud Run. |
| `GOOGLE_CLOUD_PROJECT` | API | Project id. |
| `VIDEO_API_BASE` | Worker | Public origin of this app, so progress can be posted. |
| `VIDEO_MUSIC_DIR` | Worker | Directory with the two Mixkit mp3 files. |
| `VIDEO_TEMPLATE_DIR` | Worker | Default `/opt/video-render/templates` inside the image. |
| `VITE_DROPBOX_APP_KEY` | Client build | Optional. Without it, Dropbox import is a paste-link. |
| `VITE_GOOGLE_PICKER_API_KEY` | Client build | Optional. Without it, Drive import is a paste-link. |
| `VITE_GOOGLE_PICKER_CLIENT_ID` | Client build | Optional, paired with the picker key. |

All four of `VIDEO_WORKER_URL`, `VIDEO_TASKS_QUEUE`, `GOOGLE_CLOUD_PROJECT`, and `VIDEO_TASKS_SERVICE_ACCOUNT` must be set before a job leaves the queue. Otherwise the editor says `Renderer not connected yet`.

## Provision (owner only)

Replace `PROJECT` and `REGION`. Do not run these as part of review.

```bash
gcloud services enable run.googleapis.com cloudtasks.googleapis.com artifactregistry.googleapis.com --project PROJECT

gcloud artifacts repositories create studio-video --repository-format=docker --location=REGION --project PROJECT

gcloud auth configure-docker REGION-docker.pkg.dev

docker build -f workers/video-render/Dockerfile -t REGION-docker.pkg.dev/PROJECT/studio-video/render:draft .
docker push REGION-docker.pkg.dev/PROJECT/studio-video/render:draft

gcloud run deploy studio-video-render \
  --image REGION-docker.pkg.dev/PROJECT/studio-video/render:draft \
  --region REGION \
  --project PROJECT \
  --no-allow-unauthenticated \
  --cpu 4 \
  --memory 8Gi \
  --timeout 900 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars VIDEO_API_BASE=https://PREVIEW_HOST,VIDEO_MUSIC_DIR=/opt/video-render/templates_engine/music

# Create the token in Secret Manager yourself. Then bind it. Do not commit it.
gcloud run services update studio-video-render --region REGION --project PROJECT \
  --update-secrets VIDEO_WORKER_TOKEN=studio-video-worker-token:latest

gcloud tasks queues create studio-video --location=REGION --project PROJECT

gcloud iam service-accounts create studio-video-tasks --project PROJECT
gcloud run services add-iam-policy-binding studio-video-render \
  --region REGION --project PROJECT \
  --member serviceAccount:studio-video-tasks@PROJECT.iam.gserviceaccount.com \
  --role roles/run.invoker
```

The tasks service account also needs `iam.serviceAccounts.actAs` from the API runtime if the API mints tasks with that identity. Grant `roles/cloudtasks.enqueuer` to the Firebase / Vercel service account on the queue.

Firestore rules for `videoJobs` and Storage rules for `studio-video/` are in this pull request. Publishing rules is a Firebase console step. This pull request does not publish them.

## How a job runs

1. Staff render creates `videoJobs/{id}` with status `queued`.
2. If the four worker variables are set, the API signs read URLs for `studio-video/` and `galleries/` clips and a write URL for `studio-video/renders/{id}.mp4`, then creates a Cloud Task.
3. The task POSTs `/render-template` or `/render-timeline` with an OIDC token. Timeout is 900 seconds.
4. Template jobs trim each clip to the staff in/out range, subtract the in-point from the animation point, and call `render.py`. Timeline jobs build a rigid ffmpeg graph (scale, crop, reverse, speed segments, eq/colorbalance, drawtext, drawbox, slide/fade).
5. The worker uploads the mp4 with the signed PUT and POSTs progress to `/api/studio/video/template-jobs/:id/progress`.

`POST /analyze` on the worker needs an https clip URL. The editor's analyze route stays pending until that URL is signed. Template renders still run optical-flow analysis inside `render.py`.

Local blob URLs never leave the browser. Dropbox and Drive paste-links, and files already under `studio-video/uploads/{listingId}/`, are the inputs a worker can fetch.

## Local check

```bash
python3 workers/video-render/prepare_job.py
python3 workers/video-render/timeline_render.py
ffmpeg -y -f lavfi -i testsrc=size=320x568:rate=30:duration=2 -pix_fmt yuv420p /tmp/sample.mp4
```

A full template render needs the Python packages in `requirements.txt`, the music files, and the fonts. The browser preview does not do that render.
